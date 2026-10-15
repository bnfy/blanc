// Custom tab names (F46): the pure rules. No electron require — this is the
// unit-test surface. main.js owns the tab record and only applies verdicts
// from here; session-snapshot.js and closed-tabs.js reuse normalizeTabName
// so every path that stores or restores a name cleans it the same way.

const MAX_TAB_NAME = 100;
// Whitespace, plus NEL (U+0085): a line break JavaScript's \s leaves out.
const SPACE = /[\s\u0085]/gu;
// C0 and C1 controls plus DEL. Whitespace controls are folded to spaces first.
const CONTROL = /\p{Cc}/gu;

/** A typed (or stored) name → the name to keep, or null for "use the page
 * title". Counted by code point so an emoji at the limit is never split. */
function normalizeTabName(raw) {
  if (typeof raw !== 'string') return null;
  const folded = raw.replace(SPACE, ' ').replace(CONTROL, '').replace(/ {2,}/g, ' ').trim();
  if (!folded) return null;
  return Array.from(folded).slice(0, MAX_TAB_NAME).join('').trim() || null;
}

/** What Blanc labels a tab with: the person's name for it, else the page's. */
function displayTitle(tab) {
  if (typeof tab?.customTitle === 'string' && tab.customTitle) return tab.customTitle;
  return typeof tab?.title === 'string' ? tab.title : '';
}

/** What a rename request does: the new customTitle (string, or null for the
 * page title), or undefined when nothing should change. An un-renamed tab
 * submitted with its own page title stays un-renamed — otherwise one stray
 * Enter on the "Rename Tab…" prefill would freeze today's title forever. */
function resolveTabRename(tab, raw) {
  const next = normalizeTabName(raw);
  const current = normalizeTabName(tab?.customTitle);
  if (next !== null && current === null && next === normalizeTabName(tab?.title)) return undefined;
  if (next === current) return undefined;
  return next;
}

module.exports = { MAX_TAB_NAME, normalizeTabName, displayTitle, resolveTabRename };
