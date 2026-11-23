// The feed of every Blanc build, betas included. Every Blanc build's releases come from
// src/lib/changelog-entries.mjs; /changelog.xml stays the desktop feed.
import { allEntries, entryLink, entryTitle, matchesFilter } from '../../lib/changelog-entries.mjs';
import { renderRss } from '../../lib/rss.mjs';
import { SITE_ORIGIN } from '../../lib/site-origin.mjs';

export function GET() {
  const entries = allEntries().filter((entry) => matchesFilter(entry, 'all'));
  const xml = renderRss(entries, {
    title: 'Blanc Browser Changelog — every build',
    link: `${SITE_ORIGIN}/changelog?product=all`,
    description: 'Every release of Blanc for Mac, Windows and Linux, Blanc for iPhone and iPad, and Blanc Beta.',
    itemTitle: entryTitle,
    itemLink: entryLink,
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
