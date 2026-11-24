// The Blanc for iPhone and iPad feed. Every Blanc build's releases come from
// src/lib/changelog-entries.mjs; /changelog.xml stays the desktop feed.
import { allEntries, entryLink, entryTitle, matchesFilter } from '../../lib/changelog-entries.mjs';
import { renderRss } from '../../lib/rss.mjs';
import { SITE_ORIGIN } from '../../lib/site-origin.mjs';

export function GET() {
  const entries = allEntries().filter((entry) => matchesFilter(entry, 'iphone'));
  const xml = renderRss(entries, {
    title: 'Blanc for iPhone and iPad Changelog',
    link: `${SITE_ORIGIN}/changelog?product=iphone`,
    description: 'Every App Store release of Blanc for iPhone and iPad.',
    itemTitle: entryTitle,
    itemLink: entryLink,
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
