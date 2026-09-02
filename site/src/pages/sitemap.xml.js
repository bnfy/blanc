// Explicit route manifest. Google ignores priority/changefreq and only trusts
// lastmod when it consistently reflects a significant page change, so this
// sitemap deliberately publishes only canonical URLs rather than stamping
// every page with the build date.
const MANIFEST = [
  '/',
  '/download',
  '/features',
  '/features/ad-blocking',
  '/features/island',
  '/features/private-tabs',
  '/features/command-palette',
  '/features/tab-groups',
  '/features/vertical-tabs',
  '/features/quiet-tabs',
  '/features/sync',
  '/features/security',
  '/changelog',
  '/about',
  '/privacy',
  '/terms',
  '/press',
  '/ambassadors',
  '/faq',
];

const SITE = 'https://blancbrowser.com';

export function GET() {
  // Discover the real pages and assert the manifest matches them exactly —
  // adding or removing a page without updating MANIFEST fails the build.
  const unlisted = new Set();
  const discovered = Object.keys(import.meta.glob('./**/*.astro'))
    .map((file) => file
      .replace(/^\.\//, '/')
      .replace(/\.astro$/, '')
      .replace(/\/index$/, '/'))
    .filter((route) => !unlisted.has(route));
  const manifestSet = new Set(MANIFEST);
  const discoveredSet = new Set(discovered);
  const missingFromManifest = discovered.filter((p) => !manifestSet.has(p));
  const missingPages = MANIFEST.filter((path) => !discoveredSet.has(path));
  if (missingFromManifest.length || missingPages.length) {
    throw new Error(
      `sitemap manifest out of sync — add to MANIFEST: [${missingFromManifest}] / no page for: [${missingPages}]`
    );
  }

  const urls = MANIFEST.map((path) => `  <url>
    <loc>${SITE}${path}</loc>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
