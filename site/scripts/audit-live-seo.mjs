const SITE_ORIGIN = new URL(process.env.SITE_ORIGIN || 'https://blancbrowser.com').origin;
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'BlancSEOAudit/1.0 (+https://blancbrowser.com/)';

const errors = [];
const warnings = [];

const decodeAttribute = (value = '') => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'");

const capture = (html, patterns) => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeAttribute(match[1]);
  }
  return '';
};

const canonicalKey = (value) => {
  const url = new URL(value, SITE_ORIGIN);
  url.hash = '';
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${url.pathname}${url.search}`;
};

async function request(url) {
  const hops = [];
  let current = new URL(url, SITE_ORIGIN);

  for (let index = 0; index <= MAX_REDIRECTS; index += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const location = response.headers.get('location');
    hops.push({ url: current.href, status: response.status, location });

    if (response.status < 300 || response.status >= 400 || !location) {
      return { response, finalUrl: current, hops };
    }
    current = new URL(location, current);
  }

  throw new Error(`${url}: more than ${MAX_REDIRECTS} redirects`);
}

async function textResponse(url) {
  const result = await request(url);
  return { ...result, body: await result.response.text() };
}

let robots;
let sitemap;
try {
  [robots, sitemap] = await Promise.all([
    textResponse(`${SITE_ORIGIN}/robots.txt`),
    textResponse(SITEMAP_URL),
  ]);
} catch (error) {
  console.error(`Live SEO audit could not start: ${error.message}`);
  process.exit(1);
}

if (robots.response.status !== 200) errors.push(`/robots.txt returned ${robots.response.status}`);
if (!robots.body.includes(`Sitemap: ${SITEMAP_URL}`)) {
  errors.push(`/robots.txt does not reference ${SITEMAP_URL}`);
}
if (sitemap.response.status !== 200) errors.push(`/sitemap.xml returned ${sitemap.response.status}`);

const sitemapUrls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => decodeAttribute(match[1]));
const sitemapKeys = new Set(sitemapUrls.map(canonicalKey));
if (!sitemapUrls.length) errors.push('/sitemap.xml contains no URLs');
if (sitemapKeys.size !== sitemapUrls.length) errors.push('/sitemap.xml contains duplicate URLs');

const pageResults = await Promise.all(sitemapUrls.map(async (url) => {
  try {
    return { url, ...(await textResponse(url)) };
  } catch (error) {
    return { url, error };
  }
}));

const internalLinks = new Map();
for (const page of pageResults) {
  if (page.error) {
    errors.push(`${page.url}: request failed (${page.error.message})`);
    continue;
  }

  if (page.hops.length > 1) {
    errors.push(`${page.url}: sitemap URL redirects (${page.hops.map((hop) => hop.status).join(' → ')})`);
  }
  if (page.response.status !== 200) {
    errors.push(`${page.url}: returned ${page.response.status}`);
    continue;
  }

  const contentType = page.response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    errors.push(`${page.url}: expected HTML, received ${contentType || 'no content type'}`);
    continue;
  }

  if (page.body.includes('/cdn-cgi/l/email-protection')) {
    errors.push(`${page.url}: Cloudflare rewrote an email link into an internal protection URL`);
  }

  const canonical = capture(page.body, [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i,
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i,
  ]);
  if (!canonical) errors.push(`${page.url}: missing canonical URL`);
  else if (canonicalKey(canonical) !== canonicalKey(page.url)) {
    errors.push(`${page.url}: canonical points to ${canonical}`);
  }

  const robotsMeta = capture(page.body, [
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i,
  ]);
  if (/\bnoindex\b/i.test(robotsMeta) || !/\bindex\b/i.test(robotsMeta)) {
    errors.push(`${page.url}: is not explicitly indexable (${robotsMeta || 'missing robots meta'})`);
  }

  for (const match of page.body.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = decodeAttribute(match[1]);
    if (/^(?:#|mailto:|tel:|javascript:)/i.test(href)) continue;

    let target;
    try {
      target = new URL(href, page.finalUrl);
    } catch {
      warnings.push(`${page.url}: cannot parse link ${href}`);
      continue;
    }
    if (target.origin !== SITE_ORIGIN) continue;
    target.hash = '';
    if (target.pathname.startsWith('/dl/')) continue;
    if (/\.[a-z0-9]+$/i.test(target.pathname)) continue;

    const key = canonicalKey(target);
    const sources = internalLinks.get(key) || new Set();
    sources.add(page.url);
    internalLinks.set(key, sources);
  }
}

const linkResults = await Promise.all([...internalLinks.keys()].map(async (url) => {
  try {
    return { url, ...(await request(url)) };
  } catch (error) {
    return { url, error };
  }
}));

for (const link of linkResults) {
  const sources = [...internalLinks.get(link.url)].join(', ');
  if (link.error) {
    errors.push(`${link.url}: internal link request failed; linked from ${sources}`);
    continue;
  }
  if (link.hops.length > 1) {
    errors.push(`${link.url}: internal link redirects to ${link.finalUrl}; linked from ${sources}`);
  } else if (link.response.status !== 200) {
    errors.push(`${link.url}: internal link returned ${link.response.status}; linked from ${sources}`);
  }
  if (!sitemapKeys.has(canonicalKey(link.finalUrl))) {
    warnings.push(`${link.url}: internal HTML destination is not in the sitemap; linked from ${sources}`);
  }
}

if (warnings.length) {
  console.warn(`Live SEO warnings (${warnings.length}):\n- ${warnings.join('\n- ')}`);
}
if (errors.length) {
  console.error(`Live SEO audit failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(
  `Live SEO audit passed for ${sitemapUrls.length} sitemap pages and ${internalLinks.size} internal HTML destinations at ${SITE_ORIGIN}.`
);
