import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { fetch as undiciFetch } from "undici";

export const DEFAULT_MODEL = "gemma4:latest";
export const DEFAULT_INPUT = "festivales_modofestival.json";
export const DEFAULT_OUTPUT = "festivales_modofestival_v2.json";

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

const DEFAULT_TOOLS = [
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

export function loadDotEnv(filePath = path.resolve(".env")) {
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

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJsonFileAtomic(filePath, payload) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

export function createLlmConfig(options = {}) {
  return {
    model: options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
    ollamaApiBase:
      options.ollamaApiBase ??
      process.env.OLLAMA_API_BASE ??
      "http://localhost:11434/api",
    searxngUrl: options.searxngUrl ?? process.env.SEARXNG_URL ?? "http://localhost:8080",
    fetchTimeoutMs: Number(
      options.fetchTimeoutMs ?? process.env.FETCH_TIMEOUT_MS ?? 20_000,
    ),
    fetchUserAgent:
      options.fetchUserAgent ??
      process.env.FETCH_USER_AGENT ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    maxAgentRounds: Math.max(1, Number(options.maxAgentRounds ?? 8)),
    maxSearchResults: Math.max(1, Number(options.maxSearchResults ?? 8)),
    maxFetchChars: Math.max(1_000, Number(options.maxFetchChars ?? 10_000)),
    debugLlm: Boolean(options.debugLlm),
    debugImages: Boolean(options.debugImages ?? parseBooleanEnv(process.env.DEBUG_IMAGES)),
    downloadImages: options.downloadImages ?? true,
    analyzeImages: options.analyzeImages ?? true,
    maxImagesToAnalyze: Math.max(1, Number(options.maxImagesToAnalyze ?? 4)),
    maxImageAnalyzeBytes: Math.max(100_000, Number(options.maxImageAnalyzeBytes ?? 4_000_000)),
    maxImageCandidatesToPersist: Math.max(
      1,
      Number(options.maxImageCandidatesToPersist ?? 12),
    ),
    imagesDir:
      options.imagesDir ??
      process.env.FESTIVAL_IMAGES_DIR ??
      path.resolve("public/carteles/llm"),
    imagesPublicPath: options.imagesPublicPath ?? "/carteles/llm",
    imageCandidatesDir:
      options.imageCandidatesDir ??
      process.env.FESTIVAL_IMAGE_CANDIDATES_DIR ??
      path.resolve("public/carteles/llm/candidates"),
    imageCandidatesPublicPath:
      options.imageCandidatesPublicPath ?? "/carteles/llm/candidates",
    logger: options.logger ?? console,
  };
}

export async function updateFestivalWithLlm(festival, options = {}) {
  const config = createLlmConfig(options);
  const { extraction, context } = await runAgent({
    festival,
    prompt: buildAgentPrompt(festival),
    config,
  });
  await chooseBestImageWithVision(extraction, context, festival, config);
  const normalized = normalizeExtraction(extraction, context, config);
  applyOfficialEnrichment(festival, normalized, config);
  await downloadFestivalImageCandidates(festival, context, config);
  await downloadFestivalImages(festival, config);
  return { festival, normalized, context };
}

export async function createFestivalWithLlm(query, existingFestivals = [], options = {}) {
  const config = createLlmConfig(options);
  const normalizedQuery = normalizeNullableString(query, 500);
  if (!normalizedQuery) throw new Error("La creacion con LLM requiere nombre o URL.");

  const seedUrl = normalizeNullableUrl(normalizedQuery);
  const seedFestival = createEmptyFestival({
    name: seedUrl ? hostLabel(seedUrl) : normalizedQuery,
    official_url: seedUrl,
  });
  const { extraction, context } = await runAgent({
    festival: seedFestival,
    prompt: buildCreatePrompt(normalizedQuery, seedUrl),
    config,
  });
  await chooseBestImageWithVision(extraction, context, seedFestival, config);
  const created = normalizeCreatedFestival(extraction, seedFestival, existingFestivals, config);
  const normalized = normalizeExtraction(extraction, context, config);
  applyOfficialEnrichment(created, normalized, config);
  await downloadFestivalImageCandidates(created, context, config);
  await downloadFestivalImages(created, config);
  return { festival: created, normalized, context };
}

export function createEmptyFestival(values = {}, existingFestivals = []) {
  const name = normalizeNullableString(values.name, 160) ?? "Nuevo festival";
  const slug =
    normalizeSlug(values.slug) ||
    makeUniqueSlug(slugify(name), existingFestivals.map((festival) => festival.slug));

  return {
    name,
    slug,
    festival_url: normalizeNullableUrl(values.festival_url) ?? null,
    ticket_url: normalizeNullableUrl(values.ticket_url) ?? null,
    date_text: normalizeNullableString(values.date_text, 80),
    start_date: normalizeDate(values.start_date),
    end_date: normalizeDate(values.end_date),
    location: normalizeNullableString(values.location, 180),
    city: normalizeNullableString(values.city, 120),
    region: normalizeNullableString(values.region, 120),
    styles: normalizeStringArray(values.styles),
    image_url: normalizeNullableString(values.image_url, 500),
    image_full_url: normalizeNullableString(values.image_full_url, 500),
    image_alt: normalizeNullableString(values.image_alt, 180),
    image_candidates: normalizeImageCandidates(values.image_candidates ?? []),
    edition: normalizeNullableString(values.edition, 80),
    countdown: normalizeNullableString(values.countdown, 80),
    status: normalizeNullableString(values.status, 80),
    description: normalizeNullableString(values.description, 1_000),
    artists: normalizeArtists(values.artists ?? []),
    official_url: normalizeNullableUrl(values.official_url) ?? null,
    social_urls: normalizeSocialUrls(values.social_urls ?? []),
    ticket_prices: normalizeTicketPrices(values.ticket_prices ?? []),
    ticket_price_summary: normalizeNullableString(values.ticket_price_summary, 180),
    program: normalizeProgram(values.program ?? []),
    official_sources: normalizeUrlList(values.official_sources ?? []),
    official_enriched_at: normalizeNullableString(values.official_enriched_at, 80),
    official_enrichment_model: normalizeNullableString(values.official_enrichment_model, 80),
    official_enrichment_confidence: normalizeConfidenceOrNull(
      values.official_enrichment_confidence,
    ),
    lineup_url: normalizeNullableUrl(values.lineup_url) ?? null,
    lineup_source: normalizeLineupSource(values.lineup_source),
    lineup_confidence: normalizeConfidenceOrNull(values.lineup_confidence),
    lineup_extraction_method: normalizeLineupExtractionMethod(values.lineup_extraction_method),
    lineup_model: normalizeNullableString(values.lineup_model, 80),
    lineup_extracted_at: normalizeNullableString(values.lineup_extracted_at, 80),
  };
}

export function normalizeFestivalForStorage(values, existingFestivals = [], currentSlug = null) {
  const normalized = createEmptyFestival(values, []);
  const requestedSlug = normalizeSlug(values.slug) || slugify(normalized.name);
  const reservedSlugs = existingFestivals
    .map((festival) => festival.slug)
    .filter((slug) => slug && slug !== currentSlug);
  normalized.slug = makeUniqueSlug(requestedSlug, reservedSlugs);
  return normalized;
}

export function applyOfficialEnrichment(festival, result, config = createLlmConfig()) {
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
  if (result.image_full_url) {
    festival.image_full_url = result.image_full_url;
    festival.image_url = result.image_url ?? result.image_full_url;
  } else if (result.image_url) {
    festival.image_url = result.image_url;
  }
  if (result.image_alt) festival.image_alt = result.image_alt;
  if (result.artists.length) {
    festival.artists = result.artists;
    festival.lineup_confidence = result.official_enrichment_confidence;
    festival.lineup_source = "official";
    festival.lineup_url = result.official_url ?? result.official_sources[0] ?? null;
    festival.lineup_extraction_method = "llm";
    festival.lineup_model = config.model;
    festival.lineup_extracted_at = result.official_enriched_at;
  }
  if (result.start_date) festival.start_date = result.start_date;
  if (result.end_date) festival.end_date = result.end_date;
  if (result.date_text) festival.date_text = result.date_text;
}

export async function downloadFestivalImages(festival, config = createLlmConfig()) {
  if (!config.downloadImages) return festival;

  const imageFullUrl = normalizeNullableUrl(festival.image_full_url);
  const imageUrl = normalizeNullableUrl(festival.image_url);
  if (!imageFullUrl && !imageUrl) return festival;

  const downloads = new Map();
  if (imageFullUrl) downloads.set("full", imageFullUrl);
  if (imageUrl) downloads.set(imageUrl === imageFullUrl ? "full" : "image", imageUrl);

  const downloaded = new Map();
  for (const [label, sourceUrl] of downloads) {
    try {
      const publicUrl = await downloadImageToCarteles(sourceUrl, festival.slug, label, config);
      downloaded.set(sourceUrl, publicUrl);
      config.logger.log?.(`  imagen descargada ${hostLabel(sourceUrl)} -> ${publicUrl}`);
    } catch (error) {
      config.logger.log?.(`  imagen no descargada ${hostLabel(sourceUrl)}: ${error.message}`);
    }
  }

  if (imageFullUrl && downloaded.has(imageFullUrl)) {
    festival.image_full_url = downloaded.get(imageFullUrl);
  }
  if (imageUrl && downloaded.has(imageUrl)) {
    festival.image_url = downloaded.get(imageUrl);
  } else if (imageFullUrl && downloaded.has(imageFullUrl)) {
    festival.image_url = downloaded.get(imageFullUrl);
  }

  return festival;
}

export async function downloadFestivalImageCandidates(
  festival,
  context,
  config = createLlmConfig(),
) {
  if (!config.downloadImages) return festival;

  const candidates = getBestImageCandidates(context).slice(0, config.maxImageCandidatesToPersist);
  if (!candidates.length) {
    festival.image_candidates = [];
    return festival;
  }

  const downloaded = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const localUrl = await downloadImageToCarteles(
        candidate.url,
        festival.slug,
        `candidate-${index + 1}`,
        {
          ...config,
          imagesDir: config.imageCandidatesDir,
          imagesPublicPath: config.imageCandidatesPublicPath,
        },
      );
      downloaded.push({
        original_url: candidate.url,
        local_url: localUrl,
        alt: normalizeNullableString(candidate.alt, 180),
        width: normalizeInteger(candidate.width),
        height: normalizeInteger(candidate.height),
        source: normalizeNullableString(candidate.source, 80),
        score: imageScore(candidate),
        downloaded_at: new Date().toISOString(),
      });
      config.logger.log?.(`  candidata imagen ${index + 1} descargada -> ${localUrl}`);
    } catch (error) {
      config.logger.log?.(
        `  candidata imagen ${index + 1} no descargada ${hostLabel(candidate.url)}: ${error.message}`,
      );
    }
  }

  festival.image_candidates = downloaded;
  return festival;
}

export async function promoteSelectedImageCandidate(
  festival,
  previousFestival,
  options = {},
) {
  const config = createLlmConfig(options);
  const selectedUrl = getSelectedCandidateUrl(festival, config);
  if (!selectedUrl) return festival;

  const candidate = (festival.image_candidates ?? []).find(
    (item) => item.local_url === selectedUrl,
  );
  const sourcePath = resolveLocalPublicPath(
    selectedUrl,
    config.imageCandidatesPublicPath,
    config.imageCandidatesDir,
  );
  if (!sourcePath) return festival;

  await mkdir(config.imagesDir, { recursive: true });
  const destinationFilename = candidateFilenameToMain(path.basename(sourcePath), festival.slug);
  const destinationPath = path.join(config.imagesDir, destinationFilename);
  const destinationUrl = `${config.imagesPublicPath.replace(/\/$/, "")}/${destinationFilename}`;

  await rename(sourcePath, destinationPath);

  festival.image_url = destinationUrl;
  festival.image_full_url = destinationUrl;
  if (candidate?.alt && !festival.image_alt) festival.image_alt = candidate.alt;
  await removeImageCandidateFiles(festival.image_candidates ?? [], config);
  festival.image_candidates = [];

  await removePreviousMainImages(previousFestival, destinationUrl, config);
  config.logger.log?.(`  candidata promocionada ${selectedUrl} -> ${destinationUrl}`);
  return festival;
}

async function downloadImageToCarteles(sourceUrl, slug, label, config) {
  const response = await undiciFetch(sourceUrl, {
    method: "GET",
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
      "User-Agent": config.fetchUserAgent,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^image\//i.test(contentType)) {
    throw new Error(`contenido no imagen: ${contentType || "desconocido"}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("imagen vacia");

  await mkdir(config.imagesDir, { recursive: true });
  const extension = imageExtension(sourceUrl, contentType);
  const hash = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 10);
  const safeSlug = slugify(slug || "festival");
  const filename = `${safeSlug}-${label}-${hash}.${extension}`;
  await writeFile(path.join(config.imagesDir, filename), bytes);
  return `${config.imagesPublicPath.replace(/\/$/, "")}/${filename}`;
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "festival";
}

export function makeUniqueSlug(baseSlug, existingSlugs = []) {
  const base = normalizeSlug(baseSlug) || "festival";
  const used = new Set(existingSlugs.filter(Boolean));
  if (!used.has(base)) return base;

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("No se pudo generar un slug unico.");
}

export function normalizeNullableUrl(value) {
  if (!isUsableUrl(value)) return null;
  return String(value).trim();
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

function parseBooleanEnv(value) {
  if (value === undefined) return false;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

async function runAgent({ festival, prompt, config }) {
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
      content: prompt,
    },
  ];

  for (let round = 1; round <= config.maxAgentRounds; round += 1) {
    const data = await ollamaChat(messages, DEFAULT_TOOLS, config);
    const message = normalizeAssistantMessage(data.message);
    messages.push(toChatHistoryMessage(message));
    logAgentMessage(round, message, config);

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      return {
        extraction: parseJson(message.content),
        context,
      };
    }

    for (const toolCall of toolCalls) {
      const toolResult = await executeToolCall(toolCall, context, config);
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
  const finalData = await ollamaChat(messages, [], config, { formatJson: true });
  const finalMessage = normalizeAssistantMessage(finalData.message);
  logAgentMessage("final", finalMessage, config);
  if (!finalMessage.content && finalMessage.tool_calls?.length) {
    throw new Error(
      "El modelo intento llamar herramientas despues del limite; aumenta maxAgentRounds.",
    );
  }
  return {
    extraction: parseJson(finalMessage.content),
    context,
  };
}

async function ollamaChat(messages, chatTools, config, options = {}) {
  const body = {
    model: config.model,
    messages,
    stream: false,
    think: options.think ?? "medium",
    options: {
      temperature: 0,
      num_ctx: 32768,
    },
  };
  if (chatTools.length) body.tools = chatTools;
  if (options.formatJson) body.format = "json";

  const response = await fetch(`${config.ollamaApiBase.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Ollama HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 500)}` : ""}`,
    );
  }
  return response.json();
}

async function chooseBestImageWithVision(extraction, context, festival, config) {
  if (!config.analyzeImages) return;

  const candidates = getBestImageCandidates(context).slice(0, config.maxImagesToAnalyze);
  if (!candidates.length) {
    config.logger.log?.("  vision imagenes: sin candidatas para analizar");
    return;
  }

  const downloaded = [];
  config.logger.log?.(`  vision imagenes: analizando hasta ${candidates.length} candidatas`);
  for (const candidate of candidates) {
    try {
      const image = await fetchImageForVision(candidate.url, config);
      downloaded.push({ ...candidate, ...image });
    } catch (error) {
      config.logger.log?.(`  vision imagen omitida ${hostLabel(candidate.url)}: ${error.message}`);
    }
  }

  if (!downloaded.length) {
    config.logger.log?.("  vision imagenes: no se pudo descargar ninguna candidata");
    return;
  }

  const prompt = buildImageSelectionPrompt(extraction, festival, downloaded);
  if (config.debugImages) {
    for (const [index, image] of downloaded.entries()) {
      config.logger.log?.(
        `  vision input ${index + 1}: ${image.originalContentType} ${image.originalBytes} bytes -> ${image.contentType} ${image.bytes.length} bytes, ${image.url}`,
      );
    }
  }
  let data;
  try {
    data = await ollamaChat(
      [
        {
          role: "user",
          content: prompt,
          images: downloaded.map((image) => image.base64),
        },
      ],
      [],
      config,
      { think: "low" },
    );
  } catch (error) {
    config.logger.log?.(`  vision imagenes fallo: ${error.message}`);
    return;
  }
  const message = normalizeAssistantMessage(data.message);
  const selected = parseJson(message.content);
  const selectedUrl = normalizeNullableUrl(selected?.image_url);
  const validUrls = new Set(downloaded.map((image) => image.url));
  if (!selectedUrl || !validUrls.has(selectedUrl)) {
    config.logger.log?.("  vision imagenes: el modelo no eligio una URL valida");
    return;
  }

  extraction.image_url = selectedUrl;
  extraction.image_full_url = selectedUrl;
  extraction.image_alt =
    normalizeNullableString(selected?.image_alt, 180) ??
    normalizeNullableString(extraction.image_alt, 180) ??
    `Cartel de ${extraction.name ?? festival.name ?? "festival"}`;
  config.logger.log?.(`  vision imagen elegida: ${selectedUrl}`);
}

function getBestImageCandidates(context) {
  return uniqueImages(context.sources.flatMap((source) => source.images ?? []))
    .sort(compareImageCandidates)
    .filter((image) => normalizeNullableUrl(image.url));
}

async function fetchImageForVision(url, config) {
  const response = await undiciFetch(url, {
    method: "GET",
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
      "User-Agent": config.fetchUserAgent,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^image\//i.test(contentType)) {
    throw new Error(`contenido no imagen: ${contentType || "desconocido"}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("imagen vacia");
  if (bytes.length > config.maxImageAnalyzeBytes) {
    throw new Error(`imagen demasiado grande: ${bytes.length} bytes`);
  }
  const converted = await convertImageForVision(bytes);

  return {
    originalContentType: contentType,
    originalBytes: bytes.length,
    contentType: "image/jpeg",
    bytes: converted,
    base64: converted.toString("base64"),
  };
}

async function convertImageForVision(bytes) {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    throw new Error(`no se pudo convertir a JPEG: ${error.message}`);
  }
}

function buildImageSelectionPrompt(extraction, festival, candidates) {
  const festivalName = extraction?.name ?? festival?.name ?? "festival";
  const metadata = candidates.map((candidate, index) => ({
    index: index + 1,
    url: candidate.url,
    alt: candidate.alt ?? null,
    width: candidate.width ?? null,
    height: candidate.height ?? null,
    source: candidate.source ?? null,
  }));

  return `Analiza estas imagenes candidatas del festival "${festivalName}" y elige la mejor para usar como cartel o imagen principal.

Las imagenes adjuntas estan en el mismo orden que este JSON:
${JSON.stringify(metadata, null, 2)}

Prioridad:
- cartel oficial, poster, lineup o arte principal del festival;
- imagen Open Graph o banner oficial si representa claramente el festival;
- evita logos pequenos, iconos, fotos genericas, mapas, patrocinadores o capturas ilegibles.

Responde exclusivamente con JSON valido:
{
  "image_url": "URL exacta elegida de la lista",
  "image_alt": "Texto alt breve en espanol",
  "reason": "motivo breve"
}`;
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

function logAgentMessage(round, message, config) {
  if (!config.debugLlm) {
    const toolNames = (message.tool_calls ?? [])
      .map((toolCall) => toolCall.function?.name)
      .filter(Boolean);
    if (toolNames.length) {
      config.logger.log?.(`  ronda ${round}: tools ${toolNames.join(", ")}`);
    }
    return;
  }

  config.logger.log?.(`\n--- AGENT ROUND ${round} ---`);
  if (message.thinking) config.logger.log?.(`thinking chars: ${message.thinking.length}`);
  if (message.tool_calls?.length) {
    config.logger.log?.(JSON.stringify(message.tool_calls, null, 2).slice(0, 12_000));
  }
  if (message.content) config.logger.log?.(message.content.slice(0, 12_000));
  config.logger.log?.("--- END AGENT ROUND ---");
}

function logImageCandidates(result, config) {
  if (!config.debugImages) return;

  const accepted = result.images ?? [];
  const rejected = result.rejected_images ?? [];
  config.logger.log?.(`  image candidates accepted=${accepted.length} rejected=${rejected.length}`);

  for (const image of accepted.slice(0, 12)) {
    const size = image.width && image.height ? ` ${image.width}x${image.height}` : "";
    const alt = image.alt ? ` alt="${image.alt}"` : "";
    config.logger.log?.(`    + [${image.source ?? "image"}${size}] ${image.url}${alt}`);
  }

  for (const image of rejected.slice(0, 12)) {
    const alt = image.alt ? ` alt="${image.alt}"` : "";
    config.logger.log?.(`    - [${image.reason ?? "rechazada"}] ${image.url}${alt}`);
  }
}

async function executeToolCall(toolCall, context, config) {
  const name = toolCall.function?.name;
  const toolArgs = parseToolArguments(toolCall.function?.arguments);
  try {
    if (name === "search") {
      const result = await toolSearch(toolArgs.query, context, config);
      config.logger.log?.(`  search "${toolArgs.query}" -> ${result.results.length}`);
      return { tool_name: name, content: result };
    }
    if (name === "fetch") {
      const result = await toolFetch(toolArgs.url, context, config);
      config.logger.log?.(
        `  fetch ${hostLabel(toolArgs.url)}: ${result.content.length} chars, images=${result.images.length}`,
      );
      logImageCandidates(result, config);
      return { tool_name: name, content: result };
    }
    return {
      tool_name: name ?? "unknown",
      content: { error: `Herramienta no soportada: ${name}` },
    };
  } catch (error) {
    config.logger.log?.(`  ${name ?? "tool"} fallo: ${error.message}`);
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

async function toolSearch(query, context, config) {
  const normalizedQuery = normalizeNullableString(query, 300);
  if (!normalizedQuery) throw new Error("search requiere query");

  const url = new URL("/search", config.searxngUrl);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "es-ES");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": config.fetchUserAgent,
    },
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
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
  ).slice(0, config.maxSearchResults);

  context.searchResults.push(...results);
  context.candidates.push(...results);
  return { query: normalizedQuery, results };
}

async function toolFetch(url, context, config) {
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
      "User-Agent": config.fetchUserAgent,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !/text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(contentType)
  ) {
    throw new Error(`Contenido no textual: ${contentType}`);
  }

  const finalUrl = response.url && isUsableUrl(response.url) ? response.url : normalizedUrl;
  const raw = await response.text();
  const parsed = extractReadableText(raw, finalUrl, contentType);
  const fetched = {
    url: finalUrl,
    title: parsed.title,
    content: parsed.content.slice(0, config.maxFetchChars),
    links: normalizeUrlList(parsed.links).slice(0, 80),
    images: parsed.images.slice(0, 30),
    rejected_images: config.debugImages ? parsed.rejectedImages.slice(0, 30) : undefined,
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
      images: [],
      rejectedImages: [],
    };
  }

  const dom = new JSDOM(raw, { url });
  const document = dom.window.document;
  const links = [...document.querySelectorAll("a[href]")]
    .map((link) => link.href)
    .filter(isUsableUrl);
  const images = extractImageCandidates(document, url);
  const reader = new Readability(document);
  const article = reader.parse();
  if (article?.textContent) {
    return {
      title: normalizeNullableString(article.title, 180),
      content: normalizeWhitespace(article.textContent),
      links,
      images: images.accepted,
      rejectedImages: images.rejected,
    };
  }

  return {
    title: normalizeNullableString(document.title, 180),
    content: normalizeWhitespace(document.body?.textContent ?? stripHtml(raw)),
    links,
    images: images.accepted,
    rejectedImages: images.rejected,
  };
}

function extractImageCandidates(document, pageUrl) {
  const candidates = [];
  const add = (rawUrl, metadata = {}) => {
    const url = resolveImageUrl(rawUrl, pageUrl);
    if (!url) return;
    candidates.push({
      url,
      alt: normalizeNullableString(metadata.alt, 180),
      width: normalizeInteger(metadata.width),
      height: normalizeInteger(metadata.height),
      source: normalizeNullableString(metadata.source, 80),
    });
  };

  for (const selector of [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ]) {
    const node = document.querySelector(selector);
    add(node?.getAttribute("content"), { source: selector.includes("twitter") ? "twitter" : "opengraph" });
  }

  for (const source of document.querySelectorAll("source[srcset], source[data-srcset]")) {
    for (const rawUrl of parseSrcset(source.getAttribute("srcset") ?? source.getAttribute("data-srcset"))) {
      add(rawUrl, { source: "source-srcset" });
    }
  }

  for (const image of document.querySelectorAll("img")) {
    const metadata = {
        alt: image.getAttribute("alt"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
        source: "img",
      };
    for (const attribute of ["src", "data-src", "data-lazy-src", "data-original"]) {
      add(image.getAttribute(attribute), metadata);
    }
    for (const attribute of ["srcset", "data-srcset"]) {
      for (const rawUrl of parseSrcset(image.getAttribute(attribute))) {
        add(rawUrl, { ...metadata, source: "img-srcset" });
      }
    }
  }

  const unique = uniqueImages(candidates);
  const accepted = unique
    .filter((image) => isLikelyFestivalImage(image.url, image.alt))
    .sort(compareImageCandidates);
  const acceptedUrls = new Set(accepted.map((image) => image.url));
  const rejected = unique
    .filter((image) => !acceptedUrls.has(image.url))
    .map((image) => ({
      ...image,
      reason: getImageRejectReason(image.url, image.alt),
    }))
    .slice(0, 80);

  return { accepted, rejected };
}

function parseSrcset(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
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

function buildCreatePrompt(query, seedUrl) {
  return `Crea una ficha oficial de festival musical a partir de esta entrada: ${query}

${seedUrl ? `La entrada es una URL semilla. Empieza haciendo fetch de esta URL: ${seedUrl}` : "La entrada es un nombre o busqueda. Busca su web oficial primero."}

Schema exacto de respuesta final:
{
  "name": "Nombre oficial del festival",
  "festival_url": null,
  "official_url": "https://...",
  "ticket_url": "https://...",
  "social_urls": [{"platform":"instagram","url":"https://..."}],
  "ticket_prices": [{"label":"Abono general","price_text":"desde 45 EUR","amount":45,"currency":"EUR","source_url":"https://..."}],
  "ticket_price_summary": "Abonos desde 45 EUR",
  "artists": ["Artista 1"],
  "program": [{"date":"2026-08-28","time":"20:30","stage":"Escenario principal","artist":"Artista 1","title":"Artista 1","source_url":"https://..."}],
  "start_date": "2026-08-28",
  "end_date": "2026-08-29",
  "date_text": "28/08/2026 - 29/08/2026",
  "location": "Recinto, ciudad",
  "city": "Ciudad",
  "region": "Provincia o comunidad",
  "styles": ["indie"],
  "image_url": null,
  "image_full_url": null,
  "image_alt": null,
  "edition": "2026",
  "status": null,
  "description": "Descripcion breve basada en la web oficial.",
  "official_sources": ["https://..."],
  "confidence": "high"
}

Reglas:
- Usa solo datos presentes en fuentes obtenidas con search/fetch.
- Prioriza web oficial sobre ticketing, redes y agregadores.
- Si un dato no aparece claro, usa null o [].
- No inventes precios, artistas, horarios, fechas ni descripcion.
- Para imagenes, usa preferentemente un cartel oficial o imagen Open Graph de la web oficial. Solo usa URLs encontradas en el campo images devuelto por fetch. No uses logos pequenos, iconos, favicons ni imagenes genericas.
- Fechas en ISO YYYY-MM-DD.
- confidence debe ser high, medium o low.`;
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
  "image_url": "https://...",
  "image_full_url": "https://...",
  "image_alt": "Cartel oficial de Nombre Festival 2026",
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
- Para imagenes, usa preferentemente un cartel oficial o imagen Open Graph de la web oficial. Solo usa URLs encontradas en el campo images devuelto por fetch. No uses logos pequenos, iconos, favicons ni imagenes genericas.
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
    official_url: festival.official_url ?? null,
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

function normalizeCreatedFestival(raw, seedFestival, existingFestivals, config) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("La respuesta del LLM no es un objeto JSON.");
  }

  const name = normalizeNullableString(raw.name, 160) ?? seedFestival.name;
  const festival = createEmptyFestival(
    {
      ...seedFestival,
      ...raw,
      name,
      slug: makeUniqueSlug(slugify(name), existingFestivals.map((item) => item.slug)),
      official_enrichment_model: config.model,
    },
    existingFestivals,
  );
  festival.slug = makeUniqueSlug(slugify(name), existingFestivals.map((item) => item.slug));
  return festival;
}

function normalizeExtraction(raw, context, config) {
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
  const knownImageUrls = new Set(context.sources.flatMap((source) => source.images ?? []).map((image) => image.url));
  const imageFullUrl = normalizeImageUrl(raw.image_full_url, knownImageUrls);
  const imageUrl = normalizeImageUrl(raw.image_url, knownImageUrls) ?? imageFullUrl;
  const trustedDates = confidence === "high" || confidence === "medium";

  return {
    official_url: officialUrl && !isModoFestivalUrl(officialUrl) ? officialUrl : null,
    social_urls: socialUrls,
    ticket_url: ticketUrl && !isModoFestivalUrl(ticketUrl) ? ticketUrl : null,
    ticket_prices: ticketPrices,
    ticket_price_summary: normalizeNullableString(raw.ticket_price_summary, 180),
    artists,
    program,
    image_url: imageUrl,
    image_full_url: imageFullUrl ?? imageUrl,
    image_alt: normalizeNullableString(raw.image_alt, 180),
    start_date: trustedDates ? normalizeDate(raw.start_date) : null,
    end_date: trustedDates ? normalizeDate(raw.end_date) : null,
    date_text: trustedDates ? normalizeNullableString(raw.date_text, 80) : null,
    description: normalizeNullableString(raw.description, 450),
    official_sources: officialSources.length
      ? officialSources
      : normalizeUrlList([...sourceUrls]).filter((url) => !isModoFestivalUrl(url)).slice(0, 8),
    official_enrichment_confidence: confidence,
    official_enrichment_model: config.model,
    official_enriched_at: new Date().toISOString(),
  };
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

function normalizeTicketPrices(items, sourceUrls = new Set()) {
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

function normalizeProgram(items, sourceUrls = new Set()) {
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
  return (Array.isArray(artists) ? artists : String(artists ?? "").split(","))
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

function normalizeStringArray(value) {
  const seen = new Set();
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return items
    .map((item) => normalizeNullableString(item, 80))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase("es-ES");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeImageCandidates(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const originalUrl = normalizeNullableUrl(item?.original_url);
      const localUrl = normalizeNullableString(item?.local_url, 500);
      if (!originalUrl || !localUrl?.startsWith("/carteles/")) return null;
      return {
        original_url: originalUrl,
        local_url: localUrl,
        alt: normalizeNullableString(item?.alt, 180),
        width: normalizeInteger(item?.width),
        height: normalizeInteger(item?.height),
        source: normalizeNullableString(item?.source, 80),
        score: typeof item?.score === "number" && Number.isFinite(item.score) ? item.score : null,
        downloaded_at: normalizeNullableString(item?.downloaded_at, 80),
      };
    })
    .filter(Boolean)
    .slice(0, 40);
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

function normalizeImageUrl(value, knownImageUrls) {
  const url = normalizeNullableUrl(value);
  if (!url || isModoFestivalUrl(url)) return null;
  if (knownImageUrls?.size && !knownImageUrls.has(url)) return null;
  return isLikelyFestivalImage(url, null) ? url : null;
}

function normalizeNullableString(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
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

function normalizeConfidenceOrNull(value) {
  return CONFIDENCE_VALUES.has(value) ? value : null;
}

function normalizeLineupSource(value) {
  const allowed = new Set(["local", "festival", "ticket", "search", "official"]);
  return allowed.has(value) ? value : null;
}

function normalizeLineupExtractionMethod(value) {
  const allowed = new Set(["llm", "heuristic"]);
  return allowed.has(value) ? value : null;
}

function normalizeSlug(value) {
  const slug = slugify(value);
  return slug === "festival" && !String(value ?? "").trim() ? null : slug;
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

function uniqueImages(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.url ?? "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareImageCandidates(a, b) {
  return imageScore(b) - imageScore(a);
}

function imageScore(image) {
  const haystack = `${image.url} ${image.alt ?? ""} ${image.source ?? ""}`.toLowerCase();
  let score = 0;
  if (image.source === "opengraph" || image.source === "twitter") score += 40;
  if (/cartel|poster|lineup|programa|festival|banner|header|cover/.test(haystack)) score += 25;
  if (/logo|favicon|icon|sprite|avatar|placeholder|blank/.test(haystack)) score -= 60;
  if (image.width && image.height) {
    const area = image.width * image.height;
    if (area >= 120_000) score += 15;
    if (area < 20_000) score -= 30;
    const ratio = image.width / image.height;
    if (ratio > 0.45 && ratio < 2.5) score += 8;
  }
  return score;
}

function isLikelyFestivalImage(url, alt) {
  const lower = `${url} ${alt ?? ""}`.toLowerCase();
  if (/favicon|apple-touch-icon|icon-\d|logo|sprite|avatar|placeholder|blank|loader/.test(lower)) {
    return /cartel|poster|lineup|programa/.test(lower);
  }
  if (/\.(?:svg|gif|ico|css|js|json|html?)(?:[?#].*)?$/i.test(url)) return false;
  return true;
}

function getImageRejectReason(url, alt) {
  const lower = `${url} ${alt ?? ""}`.toLowerCase();
  if (/favicon|apple-touch-icon|icon-\d|logo|sprite|avatar|placeholder|blank|loader/.test(lower)) {
    return "parece-logo-icono";
  }
  if (/\.(?:svg|gif|ico|css|js|json|html?)(?:[?#].*)?$/i.test(url)) {
    return "extension-no-cartel";
  }
  return "rechazada";
}

function imageExtension(sourceUrl, contentType) {
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();
  if (byType[normalizedType]) return byType[normalizedType];

  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{3,5})$/);
    if (match && ["jpg", "jpeg", "png", "webp", "avif"].includes(match[1])) {
      return match[1] === "jpeg" ? "jpg" : match[1];
    }
  } catch {
    // Use fallback below.
  }

  return "jpg";
}

function getSelectedCandidateUrl(festival, config) {
  const candidatePrefix = `${config.imageCandidatesPublicPath.replace(/\/$/, "")}/`;
  for (const value of [festival.image_full_url, festival.image_url]) {
    if (typeof value === "string" && value.startsWith(candidatePrefix)) return value;
  }
  return null;
}

function candidateFilenameToMain(filename, slug) {
  const safeName = path.basename(filename);
  const promoted = safeName
    .replace(/-candidate-\d+-/, "-image-")
    .replace(/candidate-\d+-/, "image-")
    .replace(/candidate/g, "image");
  if (promoted !== safeName) return promoted;

  const extension = path.extname(safeName) || ".jpg";
  const stem = path.basename(safeName, extension);
  return `${slugify(slug || "festival")}-image-${stem}${extension}`;
}

async function removePreviousMainImages(previousFestival, keepUrl, config) {
  const urls = new Set([previousFestival?.image_url, previousFestival?.image_full_url]);
  for (const url of urls) {
    if (!url || url === keepUrl) continue;
    const filePath = resolveLocalPublicPath(url, config.imagesPublicPath, config.imagesDir);
    if (!filePath) continue;
    await unlink(filePath).catch((error) => {
      if (error?.code !== "ENOENT") {
        config.logger.warn?.(`  no se pudo borrar imagen anterior ${url}: ${error.message}`);
      }
    });
  }
}

async function removeImageCandidateFiles(candidates, config) {
  const paths = new Set(
    candidates
      .map((candidate) =>
        resolveLocalPublicPath(
          candidate?.local_url,
          config.imageCandidatesPublicPath,
          config.imageCandidatesDir,
        ),
      )
      .filter(Boolean),
  );

  for (const filePath of paths) {
    await unlink(filePath).catch((error) => {
      if (error?.code !== "ENOENT") {
        config.logger.warn?.(`  no se pudo borrar candidata ${filePath}: ${error.message}`);
      }
    });
  }
}

function resolveLocalPublicPath(publicUrl, publicPrefix, directory) {
  if (typeof publicUrl !== "string") return null;
  const normalizedPrefix = `${publicPrefix.replace(/\/$/, "")}/`;
  if (!publicUrl.startsWith(normalizedPrefix)) return null;

  const relative = publicUrl.slice(normalizedPrefix.length);
  if (!relative || relative.includes("..") || path.isAbsolute(relative)) return null;

  const resolved = path.resolve(directory, relative);
  const root = path.resolve(directory);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function resolveImageUrl(value, pageUrl) {
  if (!value || typeof value !== "string") return null;
  const firstUrl = value.trim().split(/\s+/)[0];
  try {
    const resolved = new URL(firstUrl, pageUrl).href;
    return normalizeNullableUrl(resolved);
  } catch {
    return null;
  }
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
    return new URL(value).hostname.replace(/^www\./, "");
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
