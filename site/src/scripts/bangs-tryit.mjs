// What the /bangs try-it box shows for typed text: exactly what Blanc's ⌘L
// panel draws for the same text, minus anything that depends on the person
// (recents, their own bangs, open tabs). It mirrors the app's bangResults()
// in src/renderer/overlay.js and calls the pinned copy of the app's bangs.js,
// so the answers are the app's answers. Pure: no DOM, no network.

export const MAX_INPUT = 200;

const SECTION_ORDER = ['popular', 'all'];

/**
 * @param {string} text what the visitor typed
 * @param {object} Bangs the pinned bangs.js API (window.Bangs)
 * @param {Array} entries the pinned catalog entries
 * @param {string[]} popular the catalog's popular codes
 */
export function describeTryIt(text, Bangs, entries, popular) {
  const typed = String(text ?? '').replace(/\s+/g, ' ').slice(0, MAX_INPUT).trim();
  if (!typed) return { kind: 'empty' };
  const parsed = Bangs.parseBang(typed);
  if (!parsed && typed !== '!') return { kind: 'other' };

  const resolved = parsed ? Bangs.resolveBang(typed, entries, []) : null;
  const hint = resolved
    ? {
      code: resolved.code,
      title: resolved.query ? `Search ${resolved.name} for “${resolved.query}”` : `Open ${resolved.name}`,
      url: resolved.url,
    }
    : null;

  // The picker lists while only a code (or nothing) follows the `!`.
  const prefix = !parsed ? '' : parsed.query || parsed.position === 'end' ? null : parsed.code;
  const sections = [];
  if (prefix !== null) {
    const rows = Bangs.matchBangs(prefix, entries, [], [], popular);
    for (const section of SECTION_ORDER) {
      const inSection = rows.filter((row) => row.section === section)
        .map(({ code, name, domain }) => ({ code, name, domain }));
      if (inSection.length) sections.push({ section, count: inSection.length, rows: inSection });
    }
  }

  if (hint) return { kind: 'bang', hint, sections };
  if (sections.length) return { kind: 'picker', sections };
  return { kind: 'unknown-code' };
}
