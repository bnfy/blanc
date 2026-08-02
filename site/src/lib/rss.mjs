// RSS 2.0 renderer for the Blanc changelog. Pure: releases in, XML out.
// Consumed by src/pages/changelog.xml.js at build and by
// test/unit/site-changelog.test.js. The template moved verbatim from
// scripts/generate-site-changelog.mjs — keep it byte-identical to the
// pre-Astro output.
const CHANGELOG_URL = 'https://blancbrowser.com/changelog';

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// Feed readers get plain text, so the release's ordered sections flatten back
// to one line per heading, bullet, and paragraph — inline spans concatenate to
// the words they carry, dropping only the markup around them.
export function summarize(release) {
  const lines = [];
  for (const section of release.sections || []) {
    if (section.heading) lines.push(section.heading);
    for (const block of section.blocks) {
      if (block.type === 'list') for (const item of block.items) lines.push(spansToText(item.spans));
      else lines.push(spansToText(block.spans));
    }
  }
  return lines.join('\n');
}

function spansToText(spans = []) {
  return spans.map((span) => span.value).join('');
}

export function renderRss(releases) {
  const newest = releases[0]?.publishedAt;
  const items = releases.slice(0, 20).map((release) => {
    const summary = summarize(release);
    return `    <item>
      <title>${escapeXml(`Blanc ${release.version}`)}</title>
      <link>${escapeXml(release.url)}</link>
      <guid isPermaLink="true">${escapeXml(release.url)}</guid>
      <pubDate>${escapeXml(new Date(release.publishedAt).toUTCString())}</pubDate>
      <description>${escapeXml(summary)}</description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blanc Browser Changelog</title>
    <link>${CHANGELOG_URL}</link>
    <description>New features, fixes, and platform updates in Blanc Browser.</description>
    <language>en-us</language>${newest ? `
    <lastBuildDate>${escapeXml(new Date(newest).toUTCString())}</lastBuildDate>` : ''}
${items}
  </channel>
</rss>
`;
}
