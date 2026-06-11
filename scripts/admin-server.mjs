#!/usr/bin/env node

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFestivalWithLlm,
  loadDotEnv,
  normalizeFestivalForStorage,
  promoteSelectedImageCandidate,
  readJsonFile,
  updateFestivalWithLlm,
  writeJsonFileAtomic,
} from "./festival-llm-utils.mjs";

loadDotEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataFile = path.resolve(rootDir, process.env.ADMIN_DATA_FILE ?? "festivales_modofestival.json");
const imagesDir = path.resolve(rootDir, "public/carteles/llm");
const imageCandidatesDir = path.resolve(rootDir, "public/carteles/llm/candidates");
const imageStorageOptions = {
  imagesDir,
  imageCandidatesDir,
};
const port = Number(process.env.ADMIN_PORT ?? 3001);

const app = express();
const vite = await createViteServer();

app.use(express.json({ limit: "4mb" }));

app.get("/api/admin/festivals", async (_req, res, next) => {
  try {
    const payload = await loadPayload();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/festivals/:slug", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const festival = findFestival(payload, req.params.slug);
    if (!festival) return res.status(404).json({ error: "Festival no encontrado." });
    res.json(festival);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/festivals/llm", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const { query } = req.body ?? {};
    const { festival, normalized } = await createFestivalWithLlm(query, payload.festivals, {
      model: req.body?.model,
      ...imageStorageOptions,
    });
    payload.festivals.unshift(festival);
    refreshCount(payload);
    await savePayload(payload);
    res.status(201).json({ festival, enrichment: normalized });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/festivals", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const festival = normalizeFestivalForStorage(req.body ?? {}, payload.festivals);
    await promoteSelectedImageCandidate(festival, null, imageStorageOptions);
    payload.festivals.unshift(festival);
    refreshCount(payload);
    await savePayload(payload);
    res.status(201).json(festival);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/festivals/:slug/llm", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const festival = findFestival(payload, req.params.slug);
    if (!festival) return res.status(404).json({ error: "Festival no encontrado." });

    const { normalized } = await updateFestivalWithLlm(festival, {
      model: req.body?.model,
      ...imageStorageOptions,
    });
    await savePayload(payload);
    res.json({ festival, enrichment: normalized });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/festivals/:slug/image-candidate", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const festival = findFestival(payload, req.params.slug);
    if (!festival) return res.status(404).json({ error: "Festival no encontrado." });

    const candidateUrl = req.body?.local_url;
    if (typeof candidateUrl !== "string") {
      return res.status(400).json({ error: "local_url es obligatorio." });
    }

    const candidate = (festival.image_candidates ?? []).find(
      (item) => item.local_url === candidateUrl,
    );
    if (!candidate) return res.status(404).json({ error: "Candidata no encontrada." });

    const previous = { ...festival };
    festival.image_url = candidate.local_url;
    festival.image_full_url = candidate.local_url;
    festival.image_alt = candidate.alt || festival.image_alt || festival.name;
    await promoteSelectedImageCandidate(festival, previous, imageStorageOptions);
    await savePayload(payload);
    res.json(festival);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/festivals/:slug", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const index = payload.festivals.findIndex((festival) => festival.slug === req.params.slug);
    if (index < 0) return res.status(404).json({ error: "Festival no encontrado." });

    const existing = payload.festivals[index];
    const otherFestivals = payload.festivals.filter((festival) => festival.slug !== req.params.slug);
    const festival = normalizeFestivalForStorage(
      {
        ...existing,
        ...(req.body ?? {}),
      },
      otherFestivals,
      req.params.slug,
    );
    await promoteSelectedImageCandidate(festival, existing, imageStorageOptions);
    payload.festivals[index] = festival;
    refreshCount(payload);
    await savePayload(payload);
    res.json(festival);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/festivals/:slug", async (req, res, next) => {
  try {
    const payload = await loadPayload();
    const before = payload.festivals.length;
    payload.festivals = payload.festivals.filter((festival) => festival.slug !== req.params.slug);
    if (payload.festivals.length === before) {
      return res.status(404).json({ error: "Festival no encontrado." });
    }
    refreshCount(payload);
    await savePayload(payload);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/admin", serveAdmin);
app.get("/admin/", serveAdmin);
app.use(vite.middlewares);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.statusCode ?? error.status ?? 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: error instanceof Error ? error.message : "Error interno del admin.",
  });
});

app.listen(port, () => {
  console.log(`Festis admin listening on http://localhost:${port}/admin`);
  console.log(`Editing ${dataFile}`);
});

async function createViteServer() {
  const { createServer } = await import("vite");
  return createServer({
    root: rootDir,
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: {
        port: Number(process.env.ADMIN_HMR_PORT ?? 24679),
      },
    },
  });
}

async function serveAdmin(req, res, next) {
  try {
    const templatePath = path.resolve(rootDir, "admin.html");
    const template = await vite.transformIndexHtml(req.originalUrl, await readTemplate(templatePath));
    res.status(200).type("text/html").send(template);
  } catch (error) {
    vite.ssrFixStacktrace(error);
    next(error);
  }
}

async function readTemplate(templatePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(templatePath, "utf8");
}

async function loadPayload() {
  const payload = await readJsonFile(dataFile);
  if (!Array.isArray(payload.festivals)) {
    throw new Error(`El JSON no contiene un array festivals: ${dataFile}`);
  }
  return payload;
}

async function savePayload(payload) {
  refreshCount(payload);
  await writeJsonFileAtomic(dataFile, payload);
}

function findFestival(payload, slug) {
  return payload.festivals.find((festival) => festival.slug === slug) ?? null;
}

function refreshCount(payload) {
  payload.count = Array.isArray(payload.festivals) ? payload.festivals.length : 0;
}
