// copy/lib/scan-source.mjs — heuristic, line-anchored hard-coded-English scan
// for files i18n-scope.json marks "guarded". The pseudo-locale sweep is the
// runtime backstop for anything this misses.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const LETTER = /\p{L}/u;
const ATTRS = { title: 'data-i18n-title', 'aria-label': 'data-i18n-aria-label', placeholder: 'data-i18n-placeholder', alt: 'data-i18n-alt', 'data-tooltip': 'data-i18n-tooltip' };
const SKIP_CONTENT = new Set(['script', 'style', 'svg']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// One pass, so &amp;lt; decodes to the text "&lt;", never to "<".
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (s) => s.replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name]);
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const collapse = (s) => squash(decode(s)); // HTML text; catalog messages are plain text and only squash

function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

export function scanHtml(html, { en, allow = [] }) {
  const t = createTranslator({ locale: 'en', messages: Object.fromEntries(Object.entries(en).map(([k, v]) => [k, v.message])) });
  const problems = [];
  let scanned = 0;
  const stack = []; // { tag, key, translated, ignored, skip, text }
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  const translatedAncestor = () => stack.some((f) => f.translated || f.ignored || f.skip);
  let m;
  while ((m = tokens.exec(html))) {
    if (m[0].startsWith('<!')) continue;
    if (m[3] !== undefined) {
      // A translated element's inline English is the text it contains, so the
      // comparison never has to strip markup.
      for (const frame of stack) if (frame.translated) frame.text += m[3];
      const text = collapse(m[3]);
      if (!text || !LETTER.test(text)) continue;
      scanned += 1;
      if (!translatedAncestor() && !allow.includes(text)) problems.push(`text "${text}" has no data-i18n`);
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const index = stack.map((f) => f.tag).lastIndexOf(tag);
      if (index === -1) continue;
      const frame = stack[index];
      stack.length = index;
      if (frame.translated && frame.key) {
        const inline = collapse(frame.text);
        if (!t.has(frame.key)) problems.push(`data-i18n="${frame.key}": unknown key`);
        else if (inline !== squash(t(frame.key))) problems.push(`data-i18n="${frame.key}": inline "${inline}" differs from en.json "${t(frame.key)}"`);
      }
      continue;
    }
    const attrs = parseAttrs(m[2]);
    for (const [attr, counterpart] of Object.entries(ATTRS)) {
      if (attrs[attr] === undefined || !LETTER.test(attrs[attr])) continue;
      scanned += 1;
      const exemptAttr = (attrs['data-i18n-ignore'] ?? '').split(/\s+/).includes(attr);
      if (attrs[counterpart] === undefined && !allow.includes(attrs[attr]) && !translatedAncestor() && !exemptAttr) {
        problems.push(`<${tag} ${attr}="${attrs[attr]}"> has no ${counterpart}`);
      } else if (attrs[counterpart] !== undefined && !t.has(attrs[counterpart])) {
        problems.push(`${counterpart}="${attrs[counterpart]}": unknown key`);
      }
    }
    if (VOID.has(tag) || m[0].endsWith('/>')) continue;
    stack.push({
      tag,
      key: attrs['data-i18n'],
      translated: attrs['data-i18n'] !== undefined,
      // data-i18n-ignore="" exempts the subtree; a value names only this
      // element's own attributes (e.g. "title"), checked below.
      ignored: attrs['data-i18n-ignore'] === '',
      skip: SKIP_CONTENT.has(tag),
      text: '',
    });
  }
  return { problems, scanned };
}

const STRING = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\`(?:[^\`\\]|\\.)*\`)`;
const RENDERER_SITES = [
  new RegExp(String.raw`\.(?:textContent|innerText|title|placeholder|ariaLabel)\s*=\s*` + STRING, 'g'),
  new RegExp(String.raw`setAttribute\(\s*['"](?:title|aria-label|placeholder|alt)['"]\s*,\s*` + STRING, 'g'),
];
const MAIN_SITES = [
  new RegExp(String.raw`(?:^|[\s{,])(?:label|message|detail|title|checkboxLabel)\s*:\s*` + STRING, 'gm'),
  new RegExp(String.raw`buttons\s*:\s*\[\s*` + STRING, 'g'),
];
const ANY_SITE = new RegExp(String.raw`\.(?:textContent|innerText|title|placeholder|ariaLabel)\s*=|setAttribute\(\s*['"](?:title|aria-label|placeholder|alt)['"]`, 'g');

function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

// t('k'), t("k"), t(`k`), optional calls (t?.(…)) and .parts(…). A template
// key with ${…} cannot be checked statically, so it fails unless allowlisted;
// keys held in variables are left to strict test runs, which throw on a miss.
const KEY_CALL = /(?:\bt|\.t|\.parts)(?:\?\.)?\(\s*(['"`])((?:(?!\1)[^\\\n])*)\1/g;
const KEY_LITERAL = /^[a-z][A-Za-z0-9]*(?:\.[a-z0-9][A-Za-z0-9]*)+$/;

export function scanJs(js, { allow = [], kind = 'renderer', en = null }) {
  const source = stripComments(js);
  const problems = [];
  if (en) {
    for (const [, quote, key] of source.matchAll(KEY_CALL)) {
      if (quote === '`' && key.includes('${')) {
        if (!allow.includes(key)) problems.push(`dynamic key \`${key}\` cannot be verified`);
      } else if (KEY_LITERAL.test(key) && !Object.hasOwn(en, key)) problems.push(`unknown key '${key}'`);
    }
  }
  const literal = (raw) => raw.slice(1, -1);
  const report = (raw) => {
    const value = literal(raw);
    if (LETTER.test(value.replace(/\$\{[^}]*\}/g, '')) && !allow.includes(value)) problems.push(`literal ${raw}`);
  };
  for (const pattern of RENDERER_SITES) for (const m of source.matchAll(pattern)) report(m[1]);
  if (kind === 'main') for (const pattern of MAIN_SITES) for (const m of source.matchAll(pattern)) report(m[1]);
  let scanned = [...source.matchAll(ANY_SITE)].length;
  if (kind === 'main') for (const pattern of MAIN_SITES) scanned += [...source.matchAll(pattern)].length;
  return { problems, scanned };
}

export function scanFile(relPath, text, { en, allow }) {
  if (relPath.endsWith('.html')) return scanHtml(text, { en, allow });
  return scanJs(text, { allow, en, kind: relPath.startsWith('src/main/') ? 'main' : 'renderer' });
}
