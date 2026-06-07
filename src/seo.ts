import type { SeoMetadata } from './entry-server';

const UMAMI_SCRIPT =
  '<script defer src="https://cloud.umami.is/script.js" data-website-id="07e075a2-1b91-4ce1-8341-c43227cec662"></script>';

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
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    metaTag('description', metadata.description),
    `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}" />`,
    propertyTag('og:locale', 'es_ES'),
    propertyTag('og:type', metadata.type),
    propertyTag('og:title', metadata.title),
    propertyTag('og:description', metadata.description),
    propertyTag('og:image', metadata.imageUrl),
    metadata.imageAlt ? propertyTag('og:image:alt', metadata.imageAlt) : null,
    metadata.imageHeight ? propertyTag('og:image:height', String(metadata.imageHeight)) : null,
    metadata.imageType ? propertyTag('og:image:type', metadata.imageType) : null,
    metadata.imageWidth ? propertyTag('og:image:width', String(metadata.imageWidth)) : null,
    propertyTag('og:url', metadata.url),
    metaTag('twitter:card', metadata.imageWidth === metadata.imageHeight ? 'summary' : 'summary_large_image'),
    metaTag('twitter:title', metadata.title),
    metaTag('twitter:description', metadata.description),
    metaTag('twitter:image', metadata.imageUrl),
    metadata.imageAlt ? metaTag('twitter:image:alt', metadata.imageAlt) : null,
    process.env.NODE_ENV === 'production' ? UMAMI_SCRIPT : null,
  ];

  return tags.filter(Boolean).join('\n    ');
}
