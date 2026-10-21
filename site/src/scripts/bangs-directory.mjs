// The /bangs directory's rows and search. Its own matcher rather than the
// app's matchBangs(), whose eight-row picker cap is fixed: the directory
// searches every code and alias, then site names and opened hosts. Literal
// matching only, so `c++` or `(` never reach a regular expression.

/** The host a bang's address opens (not Kagi's `d` field, which can differ). */
function openedHost(template) {
  try {
    return new URL(String(template).replace('%s', 'x')).host;
  } catch {
    return '';
  }
}

// One collator for every comparison: building one per call made the sort of
// 10,000 rows take a third of a second.
const byName = new Intl.Collator('en', { sensitivity: 'base', ignorePunctuation: true });

/** One row per bang, sorted by site name, for the directory and its search. */
export function directoryRows(data) {
  const via = data.via ?? {};
  return data.entries
    .map(([code, aliases, name, , template]) => ({
      code,
      aliases,
      name,
      host: openedHost(template),
      via: via[code] ?? null,
    }))
    // Leading punctuation (`_ Blender`, `.NET`, `/r/…`) sorts by the letters.
    .sort((a, b) => byName.compare(a.name, b.name) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * The rows matching `query`: codes or aliases starting with it (shortest
 * matching code first, then by code), then names or hosts containing it.
 * An empty query returns every row in its order.
 */
export function filterBangs(rows, query) {
  const needle = String(query ?? '').trim().toLowerCase().replace(/^!/, '');
  if (!needle) return rows;
  const byCode = [];
  const byText = [];
  for (const row of rows) {
    const codes = [row.code, ...row.aliases].filter((code) => code.startsWith(needle));
    if (codes.length) {
      byCode.push({ row, length: Math.min(...codes.map((code) => code.length)) });
    } else if (row.name.toLowerCase().includes(needle) || row.host.toLowerCase().includes(needle)) {
      byText.push(row);
    }
  }
  byCode.sort((a, b) => a.length - b.length || (a.row.code < b.row.code ? -1 : a.row.code > b.row.code ? 1 : 0));
  return [...byCode.map((entry) => entry.row), ...byText];
}

/**
 * The page's featured cards: the app's own popular bangs (what its ⌘L panel
 * lists for `!`), in its order. Each shows the popular code first, the one
 * people type, then up to two more of the bang's codes.
 */
export function featuredCards(data) {
  return data.popular.map((code) => {
    const [primary, aliases, name, host] = data.entries.find(([own, others]) => own === code || others.includes(code));
    const codes = [code, ...[primary, ...aliases].filter((other) => other !== code)].slice(0, 3);
    return { code, codes, name, host };
  });
}

const TONES = 6;

/**
 * The lettered tile under every icon, which shows while the icon loads and
 * stays when a site has none: the name's first letter or digit, on one of six
 * tones picked by a stable hash (FNV-1a) of the host.
 */
export function iconTile(host, name) {
  const glyph = String(name).match(/[\p{L}\p{N}]/u) ?? String(host).match(/[\p{L}\p{N}]/u);
  let hash = 0x811c9dc5;
  for (const char of String(host)) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0;
  return { letter: glyph ? glyph[0].toUpperCase() : '?', tone: hash % TONES };
}

/** Where the icon server (cloudflare/bang-icons-worker) answers for `host`. */
export function iconUrl(host) {
  return `/bang-icons/${host}`;
}
