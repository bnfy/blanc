// The website's canonical origin. Blanc moved from blancbrowser.com to its
// umbrella domain on October 13, 2026
// (docs/superpowers/specs/2026-10-13-blanc-day-domain-design.md); the old
// origin answers every path with a permanent redirect to the same path here.
// astro.config.mjs, the layout, the sitemap, the feed and the SEO scripts read
// it from this one place.
export const SITE_ORIGIN = 'https://blanc.day';
export const FORMER_SITE_ORIGIN = 'https://blancbrowser.com';
