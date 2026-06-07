import type { SeoMetadata } from './entry-server';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function metaTag(name: string, content: string) {
  return `<meta name="${name}" content="${escapeHtml(content)}" />`;
}

function propertyTag(property: string, content: string) {
  return `<meta property="${property}" content="${escapeHtml(content)}" />`;
}

export function renderHead(metadata: SeoMetadata) {
  return [
    `<title>${escapeHtml(metadata.title)}</title>`,
    metaTag('description', metadata.description),
    `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}" />`,
    propertyTag('og:locale', 'es_ES'),
    propertyTag('og:type', metadata.type),
    propertyTag('og:title', metadata.title),
    propertyTag('og:description', metadata.description),
    propertyTag('og:image', metadata.imageUrl),
    propertyTag('og:url', metadata.url),
    metaTag('twitter:card', 'summary_large_image'),
    metaTag('twitter:title', metadata.title),
    metaTag('twitter:description', metadata.description),
    metaTag('twitter:image', metadata.imageUrl),
  ].join('\n    ');
}
