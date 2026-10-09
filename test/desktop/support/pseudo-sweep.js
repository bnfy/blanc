'use strict';
// Pseudo-locale (en-XA) sweep: in en-XA every Blanc-authored string carries
// ⟦ or ⟧, so any visible letter-bearing text without them is unextracted.

const LETTER = /\p{L}/u;

function classifyTextEntries(entries, { allow = [] } = {}) {
  return entries
    .filter(({ text, ignored }) => {
      const value = text.trim();
      if (!value || !LETTER.test(value) || ignored) return false;
      if (value.includes('⟦') || value.includes('⟧')) return false;
      return !allow.includes(value);
    })
    .map(({ text }) => text.trim());
}

// A function body evaluated in the page as page.evaluate(`(() => {${COLLECT}})()`).
const COLLECT = String.raw`
  const out = [];
  const visible = (el) => el && el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false
    && el.getClientRects().length > 0;
  const ignored = (el) => !!el?.closest?.('[data-i18n-ignore], script, style, svg');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!visible(el)) continue;
    out.push({ text: node.data, ignored: ignored(el) });
  }
  for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    if (!visible(el)) continue;
    for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
      const value = el.getAttribute(attr);
      if (value) out.push({ text: value, ignored: ignored(el) });
    }
  }
  out.push({ text: document.title, ignored: false });
  return out;
`;

module.exports = { classifyTextEntries, COLLECT };
