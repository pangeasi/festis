import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const clientDist = path.resolve(__dirname, 'dist/client');
const serverEntry = path.resolve(__dirname, 'dist/server/entry-server.mjs');
const templatePath = isProduction
  ? path.resolve(clientDist, 'index.html')
  : path.resolve(__dirname, 'index.html');

const app = express();
let vite;

if (!isProduction) {
  const { createServer } = await import('vite');
  vite = await createServer({
    appType: 'custom',
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);
} else {
  app.use(
    '/assets',
    express.static(path.resolve(clientDist, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }),
  );
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
}

function getOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL;

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

async function loadTemplate(reqUrl) {
  const rawTemplate = await fs.readFile(templatePath, 'utf-8');
  return vite ? vite.transformIndexHtml(reqUrl, rawTemplate) : rawTemplate;
}

async function loadRenderer() {
  if (vite) {
    return vite.ssrLoadModule('/src/entry-server.tsx');
  }

  return import(serverEntry);
}

function renderSitemap(entries) {
  const urls = entries
    .map(
      (entry) => `
  <url>
    <loc>${entry.loc}</loc>${entry.lastmod ? `
    <lastmod>${entry.lastmod}</lastmod>` : ''}
  </url>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

app.get('/robots.txt', (req, res) => {
  const origin = getOrigin(req).replace(/\/+$/, '');
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: ${origin}/sitemap.xml
`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const { getSitemapEntries } = await loadRenderer();
    res.type('application/xml').send(renderSitemap(getSitemapEntries(getOrigin(req))));
  } catch (error) {
    next(error);
  }
});

app.use(async (req, res, next) => {
  try {
    const reqUrl = req.originalUrl;
    const template = await loadTemplate(reqUrl);
    const { render, renderHead } = await loadRenderer();
    const result = render(reqUrl, getOrigin(req));
    const html = template
      .replace('<!--app-head-->', renderHead(result.metadata))
      .replace('<!--app-html-->', result.html);

    res.status(result.status).type('text/html').send(html);
  } catch (error) {
    if (vite) vite.ssrFixStacktrace(error);
    next(error);
  }
});

app.listen(port, () => {
  console.log(`Festis SSR server listening on http://localhost:${port}`);
});
