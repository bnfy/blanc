// What the /bangs try-it box shows for typed text: exactly what Blanc's ⌘L
// panel draws for the same text, minus anything that depends on the person
// (recents, their own bangs, open tabs). It mirrors the app's bangResults()
// in src/renderer/overlay.js and calls the pinned copy of the app's bangs.js,
// so the answers are the app's answers. Pure: no DOM, no network.

export const MAX_INPUT = 200;

const SECTION_ORDER = ['popular', 'all'];

// Fill a pinned app message's {placeholders} literally (no `$` patterns).
const fill = (message, values) => message.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));

/**
 * @param {string} text what the visitor typed
 * @param {object} Bangs the pinned bangs.js API (window.Bangs)
 * @param {Array} entries the pinned catalog entries
 * @param {string[]} popular the catalog's popular codes
 * @param {{search: string, open: string, popular: string, all: string}} labels
 *   the app's English hint and section labels at the same ref
 */
export function describeTryIt(text, Bangs, entries, popular, labels) {
  const typed = String(text ?? '').replace(/\s+/g, ' ').slice(0, MAX_INPUT).trim();
  if (!typed) return { kind: 'empty' };
  const parsed = Bangs.parseBang(typed);
  if (!parsed && typed !== '!') return { kind: 'other' };

  const resolved = parsed ? Bangs.resolveBang(typed, entries, []) : null;
  const hint = resolved
    ? {
      code: resolved.code,
      title: resolved.query ? fill(labels.search, { site: resolved.name, query: resolved.query }) : fill(labels.open, { site: resolved.name }),
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
      if (inSection.length) sections.push({ section, label: labels[section], count: inSection.length, rows: inSection });
    }
  }

  if (hint) return { kind: 'bang', hint, sections };
  if (sections.length) return { kind: 'picker', sections };
  return { kind: 'unknown-code' };
}

/**
 * The Island's hint line under the footer for an answer, as overlay.js
 * renderList writes #islandHint: the bang hint while bang input fills the
 * list, else, in a private tab, the private-tab note (the try-it box draws a
 * private tab's panel), else nothing.
 */
export function islandHintFor(answer, labels, { isPrivate = true } = {}) {
  if (answer.kind === 'bang' || answer.kind === 'picker') return labels.hintBang;
  return isPrivate ? labels.hintPrivate : '';
}
