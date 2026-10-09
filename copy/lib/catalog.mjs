// copy/lib/catalog.mjs — pure catalog rules for the interface-string substrate.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseMessage, analyzeMessage, maxLiteralLength, stringifyMessage } =
  require('../../src/renderer/pages/i18n.js');

export const KEY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z0-9][A-Za-z0-9]*)+$/;
const isEntryKey = (key) => !key.startsWith('$');

export function entryHash(enEntry) {
  return 'sha256:' + createHash('sha256').update(`${enEntry.message}\u0000${enEntry.note ?? ''}`).digest('hex');
}

function tryParse(message) {
  try { return { nodes: parseMessage(message) }; } catch (error) { return { error: error.message }; }
}

// Each plural must carry exactly its language's CLDR categories (en/de: one,
// other; pl: one, few, many, other; ja: other). Exact =N branches are rejected:
// iOS and Android plural resources cannot represent them, so a "none" state
// gets its own key instead.
const cldrCategories = (locale) => [...new Intl.PluralRules(locale).resolvedOptions().pluralCategories].sort();

function pluralProblems(key, plurals, locale) {
  const expected = cldrCategories(locale);
  const problems = [];
  for (const [name, selectors] of Object.entries(plurals)) {
    const exact = selectors.filter((s) => s.startsWith('='));
    if (exact.length) problems.push(`${key}: exact plural branches (${exact.join(', ')}) are not supported; mobile catalogs cannot represent them, use a separate key`);
    const named = selectors.filter((s) => !s.startsWith('='));
    const missing = expected.filter((c) => !named.includes(c));
    const extra = named.filter((c) => !expected.includes(c));
    if (missing.length || extra.length) {
      problems.push(`${key}: plural {${name}} in ${locale} needs exactly ${expected.join(', ')}`
        + (missing.length ? ` (missing ${missing.join(', ')})` : '') + (extra.length ? ` (extra ${extra.join(', ')})` : ''));
    }
  }
  return problems;
}

export function validateSource(en) {
  const problems = [];
  for (const [key, entry] of Object.entries(en).filter(([k]) => isEntryKey(k))) {
    if (!KEY_PATTERN.test(key)) problems.push(`${key}: key must be dotted lowerCamel segments`);
    if (typeof entry?.message !== 'string') { problems.push(`${key}: message must be a string`); continue; }
    if (typeof entry.note !== 'string' || !entry.note.trim()) problems.push(`${key}: note is required`);
    const parsed = tryParse(entry.message);
    if (parsed.error) { problems.push(`${key}: ${parsed.error}`); continue; }
    problems.push(...pluralProblems(key, analyzeMessage(parsed.nodes).plurals, 'en'));
    if (entry.maxLength !== undefined) {
      if (!Number.isInteger(entry.maxLength) || entry.maxLength < 1) problems.push(`${key}: maxLength must be a positive integer`);
      else if (maxLiteralLength(parsed.nodes) > entry.maxLength) problems.push(`${key}: English exceeds maxLength ${entry.maxLength}`);
    }
  }
  return problems;
}

const patternsOf = (glossary) => (glossary.fixedPatterns ?? []).map((source) => new RegExp(source, 'gu'));
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function strippedOfExempt(message, glossary) {
  let text = message.replace(/\{[^{}]*\}/g, '').replace(/<\/?\d+>/g, '');
  for (const term of glossary.fixed ?? []) text = text.split(term).join('');
  for (const pattern of patternsOf(glossary)) text = text.replace(pattern, '');
  return text;
}

export function checkTranslation({ key, enEntry, trEntry, glossary, locale }) {
  const problems = [];
  const enParsed = tryParse(enEntry.message);
  const trParsed = tryParse(trEntry.message);
  if (enParsed.error) return [`${key}: English does not parse`];
  if (trParsed.error) return [`${key}: ${trParsed.error}`];
  const a = analyzeMessage(enParsed.nodes);
  const b = analyzeMessage(trParsed.nodes);
  if (a.args.join() !== b.args.join()) problems.push(`${key}: placeholders differ (${a.args} vs ${b.args})`);
  // args counts a plural's argument like a plain placeholder, so compare which
  // arguments are plurals too: a translation may not drop, add or move one.
  const pluralNames = (analysis) => Object.keys(analysis.plurals).sort().join();
  if (pluralNames(a) !== pluralNames(b)) {
    problems.push(`${key}: plural arguments differ (${pluralNames(a) || 'none'} vs ${pluralNames(b) || 'none'})`);
  }
  problems.push(...pluralProblems(key, b.plurals, locale));
  if (a.tags.join() !== b.tags.join()) problems.push(`${key}: tags differ (${a.tags} vs ${b.tags})`);
  for (const term of glossary.fixed ?? []) {
    if (enEntry.message.includes(term) && !trEntry.message.includes(term)) problems.push(`${key}: fixed term "${term}" missing`);
  }
  for (const pattern of patternsOf(glossary)) {
    for (const match of enEntry.message.matchAll(pattern)) {
      if (!trEntry.message.includes(match[0])) problems.push(`${key}: fixed "${match[0]}" missing`);
    }
  }
  for (const [term, perLocale] of Object.entries(glossary.terms ?? {})) {
    const rule = perLocale[locale];
    if (!rule) continue;
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(enEntry.message)
      && !trEntry.message.toLowerCase().includes(rule.stem.toLowerCase())) {
      problems.push(`${key}: glossary term "${term}" needs "${rule.form}" (stem "${rule.stem}")`);
    }
  }
  if (enEntry.maxLength !== undefined && maxLiteralLength(trParsed.nodes) > enEntry.maxLength) {
    problems.push(`${key}: exceeds maxLength ${enEntry.maxLength}`);
  }
  const exempt = (glossary.sameAsSource?.[locale] ?? []).includes(key)
    || !/\p{L}/u.test(strippedOfExempt(enEntry.message, glossary));
  if (!exempt && trEntry.message === enEntry.message) problems.push(`${key}: identical to English`);
  return problems;
}

export function catalogReport({ en, translations, glossary }) {
  const keys = Object.keys(en).filter(isEntryKey);
  const report = { sourceProblems: validateSource(en), locales: {} };
  for (const [code, tr] of Object.entries(translations)) {
    const entry = { status: tr.$meta?.status ?? 'hidden', total: keys.length, covered: 0, missing: [], stale: [], invalid: [], orphans: [] };
    for (const key of keys) {
      const trEntry = tr[key];
      if (!trEntry || typeof trEntry.message !== 'string' || !trEntry.source) { entry.missing.push(key); continue; }
      const problems = checkTranslation({ key, enEntry: en[key], trEntry, glossary, locale: code });
      if (problems.length) { entry.invalid.push(...problems); continue; }
      if (trEntry.source !== entryHash(en[key])) { entry.stale.push(key); continue; }
      entry.covered += 1;
    }
    entry.orphans = Object.keys(tr).filter((key) => isEntryKey(key) && !Object.hasOwn(en, key));
    report.locales[code] = entry;
  }
  return report;
}

export function reportFailures(report) {
  const failures = [...report.sourceProblems];
  const warnings = [];
  for (const [code, r] of Object.entries(report.locales)) {
    failures.push(...r.invalid.map((p) => `${code}: ${p}`));
    failures.push(...r.orphans.map((k) => `${code}: ${k} is not in en.json`));
    const gap = r.missing.length + r.stale.length;
    if (r.status === 'selectable' && gap) {
      failures.push(`${code}: selectable but below 100% (${r.missing.length} missing, ${r.stale.length} stale)`);
    } else if (gap) {
      warnings.push(`${code} (hidden): ${r.covered}/${r.total} current, ${r.missing.length} missing, ${r.stale.length} stale`);
    }
  }
  return { failures, warnings };
}

const ACCENTS = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', n: 'ñ', o: 'ö', p: 'þ',
  r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', w: 'ŵ', y: 'ý', z: 'ž',
  A: 'Å', C: 'Ç', D: 'Ð', E: 'É', G: 'Ĝ', H: 'Ĥ', I: 'Î', L: 'Ļ', N: 'Ñ', O: 'Ö', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', Y: 'Ý', Z: 'Ž',
};
const accent = (text) => text.replace(/[A-Za-z]/g, (ch) => ACCENTS[ch] ?? ch);

function pseudoNodes(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') return { ...node, value: accent(node.value) };
    if (node.type === 'tag') return { ...node, children: [{ type: 'text', value: '⟦' }, ...pseudoNodes(node.children), { type: 'text', value: '⟧' }] };
    if (node.type === 'plural') {
      return { ...node, branches: Object.fromEntries(Object.entries(node.branches).map(([s, b]) => [s, pseudoNodes(b)])) };
    }
    return node;
  });
}

export function pseudoLocalize(message) {
  const nodes = parseMessage(message);
  const padding = '~'.repeat(Math.max(1, Math.ceil(maxLiteralLength(nodes) * 0.4)));
  return `⟦${stringifyMessage(pseudoNodes(nodes))}${padding}⟧`;
}

export function runtimeCatalog({ locale, dir, en, tr }) {
  const messages = {};
  const fallback = {};
  for (const key of Object.keys(en).filter(isEntryKey)) {
    if (tr && typeof tr[key]?.message === 'string' && tr[key].source) messages[key] = tr[key].message;
    else fallback[key] = en[key].message;
  }
  return { locale, dir, messages, fallback };
}
