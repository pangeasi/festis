#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { fetch as undiciFetch } from "undici";

loadDotEnv();

const DEFAULT_INPUT = "festivales_modofestival.json";
const DEFAULT_OUTPUT = "festivales_modofestival_v2.json";
const DEFAULT_MODEL = "gpt-oss:20b";
const OLLAMA_API_BASE =
  process.env.OLLAMA_API_BASE ?? "http://localhost:11434/api";
const SEARXNG_URL = process.env.SEARXNG_URL ?? "http://localhost:8080";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 20_000);
const FETCH_USER_AGENT =
  process.env.FETCH_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const SOCIAL_HOSTS = new Map([
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["spotify.com", "spotify"],
  ["linktr.ee", "linktree"],
]);

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? DEFAULT_INPUT);
const outputPath = path.resolve(args.output ?? DEFAULT_OUTPUT);
const model = args.model ?? DEFAULT_MODEL;
const limit = args.limit ? Number(args.limit) : Infinity;
const dryRun = Boolean(args.dryRun);
const force = Boolean(args.force);
const debugLlm = Boolean(args.debugLlm);
const maxAgentRounds = Math.max(1, Number(args.maxAgentRounds ?? 8));
const maxSearchResults = Math.max(1, Number(args.maxSearchResults ?? 8));
const maxFetchChars = Math.max(1_000, Number(args.maxFetchChars ?? 10_000));

const tools = [
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Busca en internet y devuelve resultados con titulo, url y snippet.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch",
      description:
        "Lee una URL y devuelve el contenido principal en texto limpio y enlaces relevantes.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
        },
      },
    },
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function loadDotEnv(filePath = path.resolve(".env")) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    process.env[key] = parseDotEnvValue(rawValue);
  }
}

function parseDotEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "");
}

async function main() {
  const payload = await loadPayload();
  const festivals = Array.isArray(payload.festivals) ? payload.festivals : [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const festival of festivals) {
    if (processed >= limit) break;
    if (!force && festival.official_enriched_at) {
      skipped += 1;
      continue;
    }

    processed += 1;
    console.log(`\n[${processed}] ${festival.name}`);

    try {
      const { extraction, context } = await runAgent(festival);
      const normalized = normalizeExtraction(extraction, context);
      applyOfficialEnrichment(festival, normalized);
      updated += 1;

      console.log(
        `  actualizado (${normalized.official_enrichment_confidence}) fuentes=${normalized.official_sources.length} artistas=${normalized.artists.length}`,
      );

      if (!dryRun) {
        await writePayload(payload);
        console.log(`  autoguardado escrito: ${outputPath}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`  fallo: ${error.message}`);
    }
  }

  payload.official_details_enriched = true;
  payload.official_details_extracted_at = new Date().toISOString();
  payload.official_details_model = model;
  payload.official_details_search_backend = "searxng";

  if (!dryRun) {
    await writePayload(payload);
  }

  console.log("\nResumen");
  console.log(`Procesados: ${processed}`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Omitidos: ${skipped}`);
  console.log(`Fallidos: ${failed}`);
  console.log(dryRun ? "Dry-run: no se escribieron cambios." : `Escrito: ${outputPath}`);
}

async function loadPayload() {
  const resumeFromOutput =
    outputPath !== inputPath && (await fileExists(outputPath));
  const sourcePath = resumeFromOutput ? outputPath : inputPath;
  const payload = JSON.parse(await readFile(sourcePath, "utf8"));
  if (!Array.isArray(payload.festivals)) {
    throw new Error(`El JSON no contiene un array festivals: ${sourcePath}`);
  }
  if (resumeFromOutput) {
    console.log(`Continuando desde salida existente: ${outputPath}`);
  }
  return payload;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writePayload(payload) {
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
}

async function runAgent(festival) {
  const context = {
    searchResults: [],
    candidates: [],
    sources: [],
  };
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: buildAgentPrompt(festival),
    },
  ];

  for (let round = 1; round <= maxAgentRounds; round += 1) {
    const data = await ollamaChat(messages, tools);
    const message = normalizeAssistantMessage(data.message);
    messages.push(toChatHistoryMessage(message));
    logAgentMessage(round, message);

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      return {
        extraction: parseJson(message.content),
        context,
      };
    }

    for (const toolCall of toolCalls) {
      const toolResult = await executeToolCall(toolCall, context);
      messages.push({
        role: "tool",
        tool_name: toolResult.tool_name,
        content: JSON.stringify(toolResult.content),
      });
    }
  }

  messages.push({
    role: "user",
    content:
      "Has alcanzado el limite de herramientas. Responde ahora solo con el JSON final usando los datos ya obtenidos.",
  });
  const finalData = await ollamaChat(messages, [], { formatJson: true });
  const finalMessage = normalizeAssistantMessage(finalData.message);
  logAgentMessage("final", finalMessage);
  if (!finalMessage.content && finalMessage.tool_calls?.length) {
    throw new Error(
      "El modelo intento llamar herramientas despues del limite; aumenta --max-agent-rounds.",
    );
  }
  return {
    extraction: parseJson(finalMessage.content),
    context,
  };
}

async function ollamaChat(messages, chatTools, options = {}) {
  const body = {
    model,
    messages,
    stream: false,
    think: "medium",
    options: {
      temperature: 0,
      num_ctx: 32768,
    },
  };
  if (chatTools.length) body.tools = chatTools;
  if (options.formatJson) body.format = "json";

  const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama local HTTP ${response.status}. Comprueba que Ollama esta arrancado.`);
  }
  return response.json();
}

function normalizeAssistantMessage(message) {
  if (!message || typeof message !== "object") {
    return { role: "assistant", content: "" };
  }
  return {
    role: "assistant",
    content: message.content ?? "",
    thinking: message.thinking ?? "",
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
  };
}

function toChatHistoryMessage(message) {
  const historyMessage = {
    role: "assistant",
    content: message.content ?? "",
  };
  if (message.tool_calls?.length) {
    historyMessage.tool_calls = message.tool_calls;
  }
  return historyMessage;
}

function logAgentMessage(round, message) {
  if (!debugLlm) {
    const toolNames = (message.tool_calls ?? [])
      .map((toolCall) => toolCall.function?.name)
      .filter(Boolean);
    if (toolNames.length) {
      console.log(`  ronda ${round}: tools ${toolNames.join(", ")}`);
    }
    return;
  }

  console.log(`\n--- AGENT ROUND ${round} ---`);
  if (message.thinking) console.log(`thinking chars: ${message.thinking.length}`);
  if (message.tool_calls?.length) {
    console.log(JSON.stringify(message.tool_calls, null, 2).slice(0, 12_000));
  }
  if (message.content) console.log(message.content.slice(0, 12_000));
  console.log("--- END AGENT ROUND ---");
}

async function executeToolCall(toolCall, context) {
  const name = toolCall.function?.name;
  const toolArgs = parseToolArguments(toolCall.function?.arguments);
  try {
    if (name === "search") {
      const result = await toolSearch(toolArgs.query, context);
      console.log(`  search "${toolArgs.query}" -> ${result.results.length}`);
      return { tool_name: name, content: result };
    }
    if (name === "fetch") {
      const result = await toolFetch(toolArgs.url, context);
      console.log(`  fetch ${hostLabel(toolArgs.url)}: ${result.content.length} chars`);
      return { tool_name: name, content: result };
    }
    return {
      tool_name: name ?? "unknown",
      content: { error: `Herramienta no soportada: ${name}` },
    };
  } catch (error) {
    console.log(`  ${name ?? "tool"} fallo: ${error.message}`);
    return {
      tool_name: name ?? "unknown",
      content: { error: error.message },
    };
  }
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function toolSearch(query, context) {
  const normalizedQuery = normalizeNullableString(query, 300);
  if (!normalizedQuery) throw new Error("search requiere query");

  const url = new URL("/search", SEARXNG_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "es-ES");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": FETCH_USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`SearXNG HTTP ${response.status}`);

  const data = await response.json();
  const results = uniqueByUrl(
    (Array.isArray(data.results) ? data.results : [])
      .map((result) => ({
        title: normalizeNullableString(result.title, 160),
        url: normalizeNullableUrl(result.url),
        content: normalizeNullableString(result.content, 500),
      }))
      .filter((result) => result.url && !isModoFestivalUrl(result.url)),
  ).slice(0, maxSearchResults);

  context.searchResults.push(...results);
  context.candidates.push(...results);
  return { query: normalizedQuery, results };
}

async function toolFetch(url, context) {
  const normalizedUrl = normalizeNullableUrl(url);
  if (!normalizedUrl) throw new Error("fetch requiere url HTTP/HTTPS valida");
  if (isModoFestivalUrl(normalizedUrl)) {
    throw new Error("ModoFestival no se puede usar como fuente principal");
  }

  const response = await undiciFetch(normalizedUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.6",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
      "User-Agent": FETCH_USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !/text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(
      contentType,
    )
  ) {
    throw new Error(`Contenido no textual: ${contentType}`);
  }

  const finalUrl = response.url && isUsableUrl(response.url) ? response.url : normalizedUrl;
  const raw = await response.text();
  const parsed = extractReadableText(raw, finalUrl, contentType);
  const fetched = {
    url: finalUrl,
    title: parsed.title,
    content: parsed.content.slice(0, maxFetchChars),
    links: normalizeUrlList(parsed.links).slice(0, 80),
  };

  context.sources.push({
    reason: classifyFetchedSource(normalizedUrl),
    ...fetched,
  });
  return fetched;
}

function extractReadableText(raw, url, contentType) {
  if (/text\/plain|application\/json/i.test(contentType)) {
    return {
      title: null,
      content: normalizeWhitespace(raw),
      links: [],
    };
  }

  const dom = new JSDOM(raw, { url });
  const document = dom.window.document;
  const links = [...document.querySelectorAll("a[href]")]
    .map((link) => link.href)
    .filter(isUsableUrl);
  const reader = new Readability(document);
  const article = reader.parse();
  if (article?.textContent) {
    return {
      title: normalizeNullableString(article.title, 180),
      content: normalizeWhitespace(article.textContent),
      links,
    };
  }

  return {
    title: normalizeNullableString(document.title, 180),
    content: normalizeWhitespace(document.body?.textContent ?? stripHtml(raw)),
    links,
  };
}

function classifyFetchedSource(url) {
  const platform = socialPlatform(url);
  if (platform) return platform;
  const lower = url.toLowerCase();
  if (/ticket|entrada|abono|comprar/.test(lower)) return "tickets";
  if (/program|horario|lineup|cartel|artist/.test(lower)) return "program";
  return "official";
}

function buildSystemPrompt() {
  return `Eres un agente de investigacion para actualizar datos oficiales de festivales musicales.

Tienes dos herramientas:
- search({ query }) para buscar resultados web.
- fetch({ url }) para leer paginas y obtener texto limpio.

Debes llamar herramientas cuando necesites fuentes. Prioriza web oficial, redes oficiales y ticketing oficial. No uses ModoFestival como fuente principal. Cuando tengas suficiente evidencia, responde exclusivamente con JSON valido sin texto adicional.`;
}

function buildAgentPrompt(festival) {
  return `Actualiza datos oficiales de este festival musical.

Schema exacto de respuesta final:
{
  "official_url": "https://...",
  "social_urls": [{"platform":"instagram","url":"https://..."}],
  "ticket_url": "https://...",
  "ticket_prices": [{"label":"Abono general","price_text":"desde 45 EUR","amount":45,"currency":"EUR","source_url":"https://..."}],
  "ticket_price_summary": "Abonos desde 45 EUR",
  "artists": ["Artista 1"],
  "program": [{"date":"2026-08-28","time":"20:30","stage":"Escenario principal","artist":"Artista 1","title":"Artista 1","source_url":"https://..."}],
  "start_date": "2026-08-28",
  "end_date": "2026-08-29",
  "date_text": "28/08/2026 - 29/08/2026",
  "description": "Descripcion breve basada en la web oficial.",
  "official_sources": ["https://..."],
  "confidence": "high"
}

Reglas:
- Usa solo datos presentes en fuentes obtenidas con search/fetch.
- Busca web oficial, redes sociales, fechas, precios, artistas, programacion y descripcion.
- Prioriza web oficial sobre ticketing, redes y agregadores.
- Si un dato no aparece claro, usa null o [].
- No inventes precios, artistas, horarios, fechas ni descripcion.
- En ticket_prices, amount debe ser numero y currency codigo ISO 4217 cuando el precio sea claro.
- La descripcion debe ser breve, factual y basada en la web oficial.
- Fechas en ISO YYYY-MM-DD.
- confidence debe ser high, medium o low.

Festival actual:
${JSON.stringify(compactFestival(festival), null, 2)}`;
}

function compactFestival(festival) {
  return {
    name: festival.name ?? null,
    slug: festival.slug ?? null,
    festival_url: festival.festival_url ?? null,
    ticket_url: festival.ticket_url ?? null,
    date_text: festival.date_text ?? null,
    start_date: festival.start_date ?? null,
    end_date: festival.end_date ?? null,
    location: festival.location ?? null,
    city: festival.city ?? null,
    region: festival.region ?? null,
    edition: festival.edition ?? null,
    description: festival.description ?? null,
    artists: Array.isArray(festival.artists) ? festival.artists : [],
  };
}

function normalizeExtraction(raw, context) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("La respuesta del LLM no es un objeto JSON.");
  }

  const confidence = normalizeConfidence(raw.confidence);
  const officialSources = normalizeUrlList(raw.official_sources ?? [])
    .filter((url) => !isModoFestivalUrl(url))
    .slice(0, 12);
  const sourceUrls = new Set([
    ...officialSources,
    ...context.sources.map((source) => source.url),
  ]);

  const officialUrl = normalizeNullableUrl(raw.official_url);
  const ticketUrl = normalizeNullableUrl(raw.ticket_url);
  const socialUrls = normalizeSocialUrls(raw.social_urls ?? []);
  const ticketPrices = normalizeTicketPrices(raw.ticket_prices ?? [], sourceUrls);
  const program = normalizeProgram(raw.program ?? [], sourceUrls);
  const artists = normalizeArtists(raw.artists ?? []);
  const trustedDates = confidence === "high" || confidence === "medium";

  return {
    official_url: officialUrl && !isModoFestivalUrl(officialUrl) ? officialUrl : null,
    social_urls: socialUrls,
    ticket_url: ticketUrl && !isModoFestivalUrl(ticketUrl) ? ticketUrl : null,
    ticket_prices: ticketPrices,
    ticket_price_summary: normalizeNullableString(raw.ticket_price_summary, 180),
    artists,
    program,
    start_date: trustedDates ? normalizeDate(raw.start_date) : null,
    end_date: trustedDates ? normalizeDate(raw.end_date) : null,
    date_text: trustedDates ? normalizeNullableString(raw.date_text, 80) : null,
    description: normalizeNullableString(raw.description, 450),
    official_sources: officialSources.length
      ? officialSources
      : normalizeUrlList([...sourceUrls]).filter((url) => !isModoFestivalUrl(url)).slice(0, 8),
    official_enrichment_confidence: confidence,
    official_enrichment_model: model,
    official_enriched_at: new Date().toISOString(),
  };
}

function applyOfficialEnrichment(festival, result) {
  festival.official_url = result.official_url;
  festival.social_urls = result.social_urls;
  festival.ticket_prices = result.ticket_prices;
  festival.ticket_price_summary = result.ticket_price_summary;
  festival.program = result.program;
  festival.official_sources = result.official_sources;
  festival.official_enriched_at = result.official_enriched_at;
  festival.official_enrichment_model = result.official_enrichment_model;
  festival.official_enrichment_confidence = result.official_enrichment_confidence;

  if (result.ticket_url) festival.ticket_url = result.ticket_url;
  if (result.description) festival.description = result.description;
  if (result.artists.length) {
    festival.artists = result.artists;
    festival.lineup_confidence = result.official_enrichment_confidence;
    festival.lineup_source = "official";
    festival.lineup_url = result.official_url ?? result.official_sources[0] ?? null;
    festival.lineup_extraction_method = "llm";
    festival.lineup_model = model;
    festival.lineup_extracted_at = result.official_enriched_at;
  }
  if (result.start_date) festival.start_date = result.start_date;
  if (result.end_date) festival.end_date = result.end_date;
  if (result.date_text) festival.date_text = result.date_text;
}

function normalizeSocialUrls(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const url = normalizeNullableUrl(item?.url);
      if (!url) return null;
      const platform =
        normalizeNullableString(item?.platform, 40) ?? socialPlatform(url) ?? "web";
      return { platform, url };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = item.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeTicketPrices(items, sourceUrls) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const priceText = normalizeNullableString(item?.price_text, 120);
      const parsedPrice = parsePrice(priceText);
      return {
        label: normalizeNullableString(item?.label, 120),
        price_text: priceText,
        amount: normalizeAmount(item?.amount) ?? parsedPrice.amount,
        currency: normalizeCurrency(item?.currency) ?? parsedPrice.currency,
        source_url: normalizeSourceUrl(item?.source_url, sourceUrls),
      };
    })
    .filter(
      (item) =>
        item.label ||
        item.price_text ||
        item.amount !== null ||
        item.currency ||
        item.source_url,
    )
    .slice(0, 20);
}

function parsePrice(value) {
  const text = String(value ?? "");
  const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  return {
    amount: amountMatch ? Number(amountMatch[1].replace(",", ".")) : null,
    currency: normalizeCurrency(text),
  };
}

function normalizeAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeCurrency(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  if (text.includes("€") || /\bEUR\b|\bEURO(S)?\b/.test(text)) return "EUR";
  if (text.includes("$") || /\bUSD\b|\bDOLAR(ES)?\b|\bDOLLAR(S)?\b/.test(text)) return "USD";
  if (text.includes("£") || /\bGBP\b|\bPOUND(S)?\b/.test(text)) return "GBP";
  const code = text.match(/\b[A-Z]{3}\b/)?.[0];
  return code ?? null;
}

function normalizeProgram(items, sourceUrls) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      date: normalizeDate(item?.date),
      time: normalizeTime(item?.time),
      stage: normalizeNullableString(item?.stage, 120),
      artist: normalizeNullableString(item?.artist, 120),
      title: normalizeNullableString(item?.title, 160),
      source_url: normalizeSourceUrl(item?.source_url, sourceUrls),
    }))
    .filter((item) => item.date || item.time || item.artist || item.title)
    .slice(0, 150);
}

function normalizeArtists(artists) {
  const blocked =
    /^(comprar|entradas?|tickets?|abonos?|vip|camping|cartel|line[ -]?up|artistas?|proximamente|por confirmar|viernes|sabado|domingo|escenario|horarios?|festival|inicio|ver mas|leer mas)$/i;
  const seen = new Set();
  return (Array.isArray(artists) ? artists : [])
    .filter((artist) => typeof artist === "string")
    .flatMap(splitArtistList)
    .map((artist) => artist.replace(/\s+/g, " ").trim())
    .map((artist) => artist.replace(/^(con|a)\s+/i, "").trim())
    .map((artist) => artist.replace(/^[•\-–—.,;:]+|[•\-–—.,;:]+$/g, "").trim())
    .filter((artist) => artist.length >= 2 && artist.length <= 90)
    .filter((artist) => !blocked.test(artist))
    .filter((artist) => {
      const key = artist.toLocaleLowerCase("es-ES");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function splitArtistList(value) {
  return value
    .replace(/\s+\+\s+/g, ", ")
    .replace(/\s+&\s+/g, ", ")
    .split(/\s+(?:e|y)\s+|[,;/|]+/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function normalizeSourceUrl(value) {
  const url = normalizeNullableUrl(value);
  if (!url || isModoFestivalUrl(url)) return null;
  return url;
}

function normalizeUrlList(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values])
    .map(normalizeNullableUrl)
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeNullableUrl(value) {
  if (!isUsableUrl(value)) return null;
  return String(value).trim();
}

function normalizeNullableString(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === text ? text : null;
}

function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeConfidence(value) {
  return CONFIDENCE_VALUES.has(value) ? value : "low";
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2)
    .join("\n");
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function socialPlatform(url) {
  if (!isUsableUrl(url)) return null;
  const host = new URL(url).hostname.replace(/^www\./, "");
  for (const [domain, platform] of SOCIAL_HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url ?? "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isUsableUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isModoFestivalUrl(value) {
  if (!isUsableUrl(value)) return false;
  const host = new URL(value).hostname.replace(/^www\./, "");
  return host === "modofestival.es";
}

function hostLabel(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "pagina";
  }
}

function parseJson(value) {
  const text = String(value ?? "");
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("La respuesta del LLM no contiene JSON.");
    return JSON.parse(match[0]);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg
      .slice(2)
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
