import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const DIST_ROOT = path.resolve(DIST);
const SITE_ORIGIN = 'https://blancbrowser.com';
const NO_SOCIAL_ROUTES = new Set(['/privacy', '/terms']);
const OG_ASPECT_RATIO = 1200 / 630;
const VERSIONED_SOCIAL_ASSET = /(?:^|[-_/])v?\d+\.\d+(?:\.\d+)?(?=[-_.\/]|$)/i;
const htmlFiles = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (entry.name.endsWith('.html')) htmlFiles.push(fullPath);
  }
}

const text = (value = '') => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:amp|quot|apos|nbsp|#39);/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const capture = (html, patterns) => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return '';
};

const routeForFile = (file) => {
  const relative = path.relative(DIST, file).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '').replace(/\.html$/, '')}`;
};

await walk(DIST);

const routes = new Set(htmlFiles.map(routeForFile));
const pages = [];
const errors = [];
const warnings = [];
const titles = new Map();
const descriptions = new Map();
const socialImages = new Map();

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const route = routeForFile(file);
  const title = text(capture(html, [/<title>([\s\S]*?)<\/title>/i]));
  const description = text(capture(html, [
    /<meta[^>]+name="description"[^>]+content="([^"]*)"/i,
    /<meta[^>]+content="([^"]*)"[^>]+name="description"/i,
  ]));
  const canonical = capture(html, [
    /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i,
    /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i,
  ]);
  const robots = capture(html, [
    /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i,
    /<meta[^>]+content="([^"]*)"[^>]+name="robots"/i,
  ]);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => text(match[1]));
  const structuredData = [];
  for (const match of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      structuredData.push(JSON.parse(match[1].trim()));
    } catch {
      errors.push(`${route}: invalid JSON-LD`);
    }
  }
  const structuredItems = structuredData.flatMap((item) => item?.['@graph'] ?? [item]);
  const breadcrumbLists = structuredItems.filter((item) => {
    const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
    return types.includes('BreadcrumbList');
  });
  const hasVisibleBreadcrumb = /<nav\b[^>]*class="[^"]*\bbreadcrumb\b[^"]*"/i.test(html);
  const ogTitle = capture(html, [/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i]);
  const ogDescription = capture(html, [/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i]);
  const ogUrl = capture(html, [/<meta[^>]+property="og:url"[^>]+content="([^"]*)"/i]);
  const ogImage = capture(html, [/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i]);
  const ogImageAlt = capture(html, [/<meta[^>]+property="og:image:alt"[^>]+content="([^"]*)"/i]);
  const twitterImage = capture(html, [/<meta[^>]+name="twitter:image"[^>]+content="([^"]*)"/i]);
  const unprotectedEmailHtml = html.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/gi, '');

  if (!title) errors.push(`${route}: missing title`);
  if (!description) errors.push(`${route}: missing meta description`);
  if (h1s.length !== 1) errors.push(`${route}: expected one H1, found ${h1s.length}`);
  if (!canonical) errors.push(`${route}: missing canonical URL`);
  const hasUnprotectedMailto = /href=["']mailto:/i.test(unprotectedEmailHtml);
  const hasUnprotectedVisibleEmail = />[^<]*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}[^<]*</i
    .test(unprotectedEmailHtml);
  if (hasUnprotectedMailto || hasUnprotectedVisibleEmail) {
    errors.push(`${route}: email address is not protected from Cloudflare email-address rewriting`);
  }
  if (!/\bindex\b/i.test(robots) || /\bnoindex\b/i.test(robots)) errors.push(`${route}: page is not indexable`);
  if (!NO_SOCIAL_ROUTES.has(route)) {
    const missingSocialFields = [
      ['og:title', ogTitle],
      ['og:description', ogDescription],
      ['og:url', ogUrl],
      ['og:image', ogImage],
      ['og:image:alt', ogImageAlt],
      ['twitter:image', twitterImage],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missingSocialFields.length) {
      errors.push(`${route}: incomplete social metadata (${missingSocialFields.join(', ')})`);
    }
  }

  if (canonical) {
    const canonicalUrl = new URL(canonical);
    const expectedPath = route === '/' ? '/' : route;
    if (canonicalUrl.origin !== SITE_ORIGIN || canonicalUrl.pathname.replace(/\/$/, '') !== expectedPath.replace(/\/$/, '')) {
      errors.push(`${route}: canonical points to ${canonical}`);
    }
  }

  if (hasVisibleBreadcrumb && !breadcrumbLists.length) {
    errors.push(`${route}: visible breadcrumb has no BreadcrumbList structured data`);
  }
  for (const breadcrumb of breadcrumbLists) {
    const items = breadcrumb.itemListElement;
    if (!Array.isArray(items) || items.length < 2) {
      errors.push(`${route}: BreadcrumbList needs at least two items`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (item?.position !== index + 1 || !item?.name) {
        errors.push(`${route}: BreadcrumbList item ${index + 1} is incomplete or out of order`);
      }
    }
    const currentItem = items.at(-1)?.item;
    if (canonical && currentItem && currentItem !== canonical) {
      errors.push(`${route}: BreadcrumbList current item does not match canonical URL`);
    }
  }

  if (ogUrl && canonical && ogUrl !== canonical) {
    errors.push(`${route}: og:url does not match canonical URL`);
  }

  if (ogImage) {
    let imageUrl;
    try {
      imageUrl = new URL(ogImage);
    } catch {
      errors.push(`${route}: invalid og:image URL ${ogImage}`);
    }
    if (imageUrl) {
      if (imageUrl.origin !== SITE_ORIGIN) errors.push(`${route}: og:image is not hosted on ${SITE_ORIGIN}`);
      if (VERSIONED_SOCIAL_ASSET.test(imageUrl.pathname)) {
        errors.push(`${route}: og:image path is release-specific instead of evergreen (${imageUrl.pathname})`);
      }
      socialImages.set(ogImage, [...(socialImages.get(ogImage) ?? []), route]);
    }
  }

  if (ogImage && twitterImage && ogImage !== twitterImage) {
    errors.push(`${route}: twitter:image does not match og:image`);
  }

  if (title.length > 65) warnings.push(`${route}: title is ${title.length} characters`);
  if (description.length > 170) warnings.push(`${route}: description is ${description.length} characters`);
  if (title.length && title.length < 25) warnings.push(`${route}: title is only ${title.length} characters`);
  if (description.length && description.length < 70) warnings.push(`${route}: description is only ${description.length} characters`);

  titles.set(title, [...(titles.get(title) ?? []), route]);
  descriptions.set(description, [...(descriptions.get(description) ?? []), route]);

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

    let target;
    if (href.startsWith('/')) target = href;
    else if (href.startsWith(SITE_ORIGIN)) target = new URL(href).pathname;
    else continue;

    const clean = target.split(/[?#]/)[0] || '/';
    const normalized = clean.length > 1 ? clean.replace(/\/$/, '') : clean;
    const isAsset = /\.[a-z0-9]+$/i.test(normalized);
    const isDownloadRoute = normalized.startsWith('/dl/');
    if (!isAsset && !isDownloadRoute && !routes.has(normalized)) {
      errors.push(`${route}: internal link points to missing route ${href}`);
    }
  }

  pages.push({ route, title, description, h1: h1s[0] });
}

for (const [title, titleRoutes] of titles) {
  if (title && titleRoutes.length > 1) errors.push(`duplicate title on ${titleRoutes.join(', ')}: ${title}`);
}
for (const [description, descriptionRoutes] of descriptions) {
  if (description && descriptionRoutes.length > 1) errors.push(`duplicate description on ${descriptionRoutes.join(', ')}`);
}

for (const [imageUrl, imageRoutes] of socialImages) {
  const pathname = decodeURIComponent(new URL(imageUrl).pathname);
  const assetFile = path.resolve(DIST_ROOT, `.${pathname}`);
  const routeList = imageRoutes.join(', ');
  if (!assetFile.startsWith(`${DIST_ROOT}${path.sep}`)) {
    errors.push(`${routeList}: og:image escapes the built site (${pathname})`);
    continue;
  }

  try {
    const metadata = await sharp(assetFile).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const ratio = height ? width / height : 0;
    if (width < 1200 || height < 630) {
      errors.push(`${routeList}: og:image is only ${width}×${height}; expected at least 1200×630`);
    }
    if (Math.abs(ratio - OG_ASPECT_RATIO) > 0.01) {
      errors.push(`${routeList}: og:image aspect ratio is ${width}×${height}; expected 1.91:1`);
    }
  } catch {
    errors.push(`${routeList}: og:image file is missing or unreadable (${pathname})`);
  }
}

const sitemap = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
const sitemapRoutes = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname.replace(/\/$/, '') || '/')
);
for (const route of routes) if (!sitemapRoutes.has(route)) errors.push(`${route}: missing from sitemap.xml`);
for (const route of sitemapRoutes) if (!routes.has(route)) errors.push(`sitemap.xml points to missing route ${route}`);

const robots = await readFile(new URL('../dist/robots.txt', import.meta.url), 'utf8');
if (!robots.includes('Sitemap: https://blancbrowser.com/sitemap.xml')) {
  errors.push('robots.txt does not reference the canonical sitemap URL');
}

if (warnings.length) {
  console.warn(`SEO warnings (${warnings.length}):\n- ${warnings.join('\n- ')}`);
}
if (errors.length) {
  console.error(`SEO verification failed (${errors.length}):\n- ${[...new Set(errors)].join('\n- ')}`);
  process.exit(1);
}

console.log(`SEO verification passed for ${pages.length} pages and ${sitemapRoutes.size} sitemap URLs.`);
