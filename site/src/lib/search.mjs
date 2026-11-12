// Shared by the build index and browser. Queries and their results stay local.
export function normalize(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const aliases = { passwords: '1password', workspace: 'spaces', workspaces: 'spaces', shortcuts: 'keyboard', adblock: 'blocking', adblocker: 'blocking', mac: 'macos' };
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return 2;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length);
}
export function prepareIndex(documents) {
  return documents.map(doc => ({ ...doc, titleText: normalize(doc.title), bodyText: normalize(doc.text), words: normalize(`${doc.title} ${doc.text}`).split(' ') }));
}
export function search(documents, query, limit = 12) {
  const normalized = normalize(query).slice(0, 160);
  if (!normalized) return [];
  const terms = [...new Set(normalized.split(' ').filter(Boolean))];
  return documents.map(doc => {
    let score = doc.titleText === normalized ? 120 : doc.titleText.includes(normalized) ? 55 : 0;
    for (const term of terms) {
      const alternatives = [term, aliases[term]].filter(Boolean);
      if (alternatives.some(word => doc.titleText.split(' ').includes(word))) score += 25;
      else if (alternatives.some(word => doc.titleText.includes(word))) score += 15;
      else if (alternatives.some(word => doc.bodyText.includes(word))) score += 4;
      else if (term.length >= 4 && doc.words.some(word => distance(term, word) <= 1)) score += 1;
      else return null;
    }
    // Current feature documentation comes before historical release notes.
    if (doc.category === 'Features') score += 4;
    return { ...doc, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

export function snippet(text, query, length = 180) {
  const terms = normalize(query).split(' ').filter(Boolean);
  const lower = text.toLowerCase();
  const matches = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  let start = matches.length ? Math.max(0, Math.min(...matches) - 55) : 0;
  if (start) { const space = text.indexOf(' ', start); if (space >= 0) start = space + 1; }
  const excerpt = text.slice(start, start + length);
  return `${start ? '…' : ''}${excerpt}${start + length < text.length ? '…' : ''}`;
}
