import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { festivals, payload } from "./data";
import { renderHead } from "./seo";
import type { Festival } from "./types";
import { formatFestivalDate } from "./utils/festival";

export { renderHead };

export type SeoMetadata = {
  canonicalUrl: string;
  description: string;
  imageAlt?: string;
  imageHeight?: number;
  imageType?: string;
  imageUrl: string;
  imageWidth?: number;
  title: string;
  type: "website" | "article";
  url: string;
};

export type RenderResult = {
  html: string;
  metadata: SeoMetadata;
  status: number;
};

const DEFAULT_TITLE = "Directorio de festivales";
const DEFAULT_DESCRIPTION =
  "Agenda de festivales en España con fechas, ubicaciones, carteles, artistas, entradas, precios y enlaces oficiales actualizados.";
const DEFAULT_IMAGE = "/opengraph.png";
const DEFAULT_IMAGE_ALT = "Directorio de festivales";
const DEFAULT_IMAGE_HEIGHT = 315;
const DEFAULT_IMAGE_TYPE = "image/png";
const DEFAULT_IMAGE_WIDTH = 600;

function getBaseUrl(origin: string) {
  return origin.replace(/\/+$/, "");
}

function toAbsoluteUrl(value: string | null | undefined, origin: string) {
  const baseUrl = getBaseUrl(origin);

  if (!value) return `${baseUrl}${DEFAULT_IMAGE}`;

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return `${baseUrl}${DEFAULT_IMAGE}`;
  }
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function getFestivalDescription(festival: Festival) {
  const parts = [
    festival.description,
    formatFestivalDate(festival),
    festival.location || festival.city || festival.region,
    festival.artists.length
      ? `Cartel: ${festival.artists.slice(0, 6).join(", ")}`
      : null,
  ].filter(Boolean);

  return truncate(parts.join(" | "), 180);
}

function findFestivalSlug(url: string) {
  const pathname = new URL(url, "http://localhost").pathname;
  const match = pathname.match(/^\/festival\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getMetadata(
  url: string,
  origin: string,
  festival: Festival | null,
): SeoMetadata {
  const baseUrl = getBaseUrl(origin);
  const pathname = new URL(url, baseUrl).pathname;

  if (!festival) {
    return {
      canonicalUrl: `${baseUrl}${pathname === "/" ? "/" : pathname}`,
      description: DEFAULT_DESCRIPTION,
      imageAlt: DEFAULT_IMAGE_ALT,
      imageHeight: DEFAULT_IMAGE_HEIGHT,
      imageType: DEFAULT_IMAGE_TYPE,
      imageUrl: toAbsoluteUrl(DEFAULT_IMAGE, baseUrl),
      imageWidth: DEFAULT_IMAGE_WIDTH,
      title: DEFAULT_TITLE,
      type: "website",
      url: `${baseUrl}${pathname}`,
    };
  }

  const canonicalUrl = `${baseUrl}/festival/${festival.slug}`;

  return {
    canonicalUrl,
    description: getFestivalDescription(festival),
    imageUrl: toAbsoluteUrl(
      festival.image_full_url || festival.image_url,
      baseUrl,
    ),
    title: `${festival.name} | Fechas, cartel y entradas`,
    type: "article",
    url: canonicalUrl,
  };
}

export function render(url: string, origin: string): RenderResult {
  const festivalSlug = findFestivalSlug(url);
  const festival = festivalSlug
    ? (festivals.find((candidate) => candidate.slug === festivalSlug) ?? null)
    : null;
  const status = festivalSlug && !festival ? 404 : 200;
  const metadata =
    status === 404
      ? {
          ...getMetadata(url, origin, null),
          description:
            "La ficha de festival solicitada no existe o ha cambiado de dirección.",
          title: "Festival no encontrado | Directorio de festivales",
        }
      : getMetadata(url, origin, festival);

  const html = renderToString(
    <StrictMode>
      <App initialUrl={url} />
    </StrictMode>,
  );

  return { html, metadata, status };
}

export function getSitemapEntries(origin: string) {
  const baseUrl = getBaseUrl(origin);
  const lastmod = payload.extracted_at
    ? payload.extracted_at.slice(0, 10)
    : undefined;

  return [
    { lastmod, loc: `${baseUrl}/` },
    ...festivals.map((festival) => ({
      lastmod,
      loc: `${baseUrl}/festival/${festival.slug}`,
    })),
  ];
}
