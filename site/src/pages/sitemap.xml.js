// Explicit route manifest. Google ignores priority/changefreq and only trusts
// lastmod when it consistently reflects a significant page change, so this
// sitemap deliberately publishes only canonical URLs rather than stamping
// every page with the build date.
import topics from '../data/guide-topics.json';
import { SITE_ORIGIN } from '../lib/site-origin.mjs';
import whatsNew from '../data/whats-new.json';
import releases from '../data/releases.json';
import { publishedPages } from '../lib/whats-new.mjs';

const MANIFEST = ['/', '/download', '/mail', '/mail/pricing', '/mail/download', '/mail/support', '/mail/privacy', '/mail/terms', '/support', '/trust', '/changelog', '/roadmap', '/about', '/privacy', '/terms', '/media', '/ambassadors', '/patron', '/arc-alternative', '/ublock-origin-after-chrome', '/features', '/bangs', ...topics.map(topic => `/features/${topic.id}`)];

// /whats-new only forwards to the newest page; each release's page is listed
// from the data, since the route itself is one dynamic file.
const UNLISTED = new Set(['/404', '/import-tabs', '/[...legacy]', '/whats-new/', '/whats-new/[release]']);
const WHATS_NEW = publishedPages(whatsNew, releases).filter((page) => !page.upcoming).map((page) => `/whats-new/${page.release}`);

const SITE = SITE_ORIGIN;

export function GET() {
  // Discover the real pages and assert the manifest matches them exactly —
  // adding or removing a page without updating MANIFEST fails the build.
  const discovered = Object.keys(import.meta.glob('./**/*.astro'))
    .map((file) => file
      .replace(/^\.\//, '/')
      .replace(/\.astro$/, '')
      .replace(/\/index$/, '/'))
    .filter((route) => !UNLISTED.has(route));
  const manifestSet = new Set(MANIFEST);
  const discoveredSet = new Set(discovered);
  const missingFromManifest = discovered.filter((p) => !manifestSet.has(p));
  const missingPages = MANIFEST.filter((path) => !discoveredSet.has(path));
  if (missingFromManifest.length || missingPages.length) {
    throw new Error(
      `sitemap manifest out of sync — add to MANIFEST: [${missingFromManifest}] / no page for: [${missingPages}]`
    );
  }

  const urls = [...MANIFEST, ...WHATS_NEW].map((path) => `  <url>
    <loc>${SITE}${path}</loc>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
