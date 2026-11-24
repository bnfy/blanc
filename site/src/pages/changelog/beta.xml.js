// The Blanc Beta feed: Mac, Windows and Linux. Every Blanc build's releases come from
// src/lib/changelog-entries.mjs; /changelog.xml stays the desktop feed.
import { allEntries, entryLink, entryTitle, matchesFilter } from '../../lib/changelog-entries.mjs';
import { renderRss } from '../../lib/rss.mjs';
import { SITE_ORIGIN } from '../../lib/site-origin.mjs';

export function GET() {
  const entries = allEntries().filter((entry) => matchesFilter(entry, 'beta'));
  const xml = renderRss(entries, {
    title: 'Blanc Beta Changelog',
    link: `${SITE_ORIGIN}/changelog?product=beta`,
    description: 'Every release of Blanc Beta, the early preview of Blanc built directly on Chromium, for Mac, Windows and Linux.',
    itemTitle: entryTitle,
    itemLink: entryLink,
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
