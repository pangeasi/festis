#!/usr/bin/env node

import path from "node:path";
import {
  DEFAULT_INPUT,
  DEFAULT_MODEL,
  DEFAULT_OUTPUT,
  fileExists,
  loadDotEnv,
  readJsonFile,
  updateFestivalWithLlm,
  writeJsonFileAtomic,
} from "./festival-llm-utils.mjs";

loadDotEnv();

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input ?? DEFAULT_INPUT);
const outputPath = path.resolve(args.output ?? DEFAULT_OUTPUT);
const model = args.model ?? DEFAULT_MODEL;
const limit = args.limit ? Number(args.limit) : Infinity;
const dryRun = Boolean(args.dryRun);
const force = Boolean(args.force);
const listOnly = Boolean(args.list || args.listOnly);
const debugLlm = Boolean(args.debugLlm);
const maxAgentRounds = Math.max(1, Number(args.maxAgentRounds ?? 8));
const maxSearchResults = Math.max(1, Number(args.maxSearchResults ?? 8));
const maxFetchChars = Math.max(1_000, Number(args.maxFetchChars ?? 10_000));
const analyzeImages = !Boolean(args.noAnalyzeImages);
const maxImagesToAnalyze = Math.max(1, Number(args.maxImagesToAnalyze ?? 4));
const maxImageAnalyzeBytes = Math.max(100_000, Number(args.maxImageAnalyzeBytes ?? 4_000_000));
const maxImageCandidatesToPersist = Math.max(
  1,
  Number(args.maxImageCandidatesToPersist ?? 12),
);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const payload = await loadPayload();
  const festivals = Array.isArray(payload.festivals) ? payload.festivals : [];
  if (listOnly) {
    listFestivalsToProcess(festivals);
    return;
  }

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
      const { normalized } = await updateFestivalWithLlm(festival, {
        model,
        debugLlm,
        maxAgentRounds,
        maxSearchResults,
        maxFetchChars,
        downloadImages: !dryRun,
        analyzeImages,
        maxImagesToAnalyze,
        maxImageAnalyzeBytes,
        maxImageCandidatesToPersist,
        imagesDir: path.resolve("public/carteles/llm"),
        imageCandidatesDir: path.resolve("public/carteles/llm/candidates"),
      });
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

function listFestivalsToProcess(festivals) {
  let listed = 0;
  let skipped = 0;

  for (const festival of festivals) {
    if (listed >= limit) break;
    if (!force && festival.official_enriched_at) {
      skipped += 1;
      continue;
    }

    listed += 1;
    const date = festival.date_text ?? festival.start_date ?? "fecha pendiente";
    const place = festival.location ?? festival.city ?? festival.region ?? "lugar pendiente";
    console.log(`${listed}. ${festival.name} | ${date} | ${place}`);
  }

  console.log("\nResumen");
  console.log(`A iterar: ${listed}`);
  console.log(`Omitidos ya enriquecidos: ${skipped}`);
  console.log("List-only: no se lanzo el proceso de actualizacion.");
}

async function loadPayload() {
  const resumeFromOutput =
    outputPath !== inputPath && (await fileExists(outputPath));
  const sourcePath = resumeFromOutput ? outputPath : inputPath;
  const payload = await readJsonFile(sourcePath);
  if (!Array.isArray(payload.festivals)) {
    throw new Error(`El JSON no contiene un array festivals: ${sourcePath}`);
  }
  if (resumeFromOutput) {
    console.log(`Continuando desde salida existente: ${outputPath}`);
  }
  return payload;
}

async function writePayload(payload) {
  await writeJsonFileAtomic(outputPath, payload);
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
