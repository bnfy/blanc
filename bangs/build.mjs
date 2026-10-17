// Bangs catalog build: Kagi's pinned bang list -> src/renderer/pages/bangs-catalog.js,
// the data the Island and the main process share (spec:
// docs/superpowers/specs/2026-10-16-bangs-design.md, "The data").
//
//   node bangs/build.mjs           regenerate the catalog
//   node bangs/build.mjs --check   verify the committed catalog still matches what the
//                                  pinned source produces. Exit 1 on drift. The bangs
//                                  analogue of adblock/build.mjs --check.
//
// Each catalog entry is [code, aliases, name, domain, template, encoding, home]:
//   template  Kagi's `u` with {{{s}}} rewritten to %s, so custom bangs (which
//             people write with %s) and built-ins read the same way.
//   encoding  bit 1: URL-encode the words; bit 2: spaces as `+`. Kagi's README
//             says every fmt flag is on by default and an entry's `fmt` lists the
//             flags it keeps; Kagi's spec/ tests do not exercise the flags, so
//             that reading stands (bangs/README.md). Absent fmt = 3.
//   home      the complete address an empty query opens, as a normalized URL.href:
//             https://<ad>/ for open_snap_domain, the template's origin + '/' for
//             open_base_path, else https://<d>/. Validated here with the custom
//             search address's rule, so the resolver never derives it at run time.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { isValidSearchTemplate } = require('../src/main/search-engine-template.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, 'sources', 'bangs.json');
const PINNED = path.join(ROOT, 'pinned.json');
const EXCLUDED = path.join(ROOT, 'excluded.json');
const OUT = path.join(ROOT, '..', 'src', 'renderer', 'pages', 'bangs-catalog.js');
const OUT_REL = 'src/renderer/pages/bangs-catalog.js';

const BANG_CODE = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const ENCODE = 1;
const PLUS = 2;

function normalizedHome(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Same rule as the search template: https anywhere, http only on the home
  // network; never credentials. The template check needs a %s, so probe with one.
  if (!isValidSearchTemplate(`${url.origin}/?blanc=%s`)) return null;
  return url.href;
}

/**
 * One Kagi entry -> { entry } or { dropped: reason }. Pure; the build and
 * the unit tests call it directly.
 */
export function transformEntry(bang, { excluded }) {
  const code = String(bang.t ?? '').toLowerCase();
  if (bang.x) return { dropped: 'regex template' };
  if (!BANG_CODE.test(code)) return { dropped: `code "${code}" outside the grammar` };
  if (excluded[code]) return { dropped: `excluded: ${excluded[code]}` };
  const template = String(bang.u ?? '');
  if (template.split('{{{s}}}').length !== 2) return { dropped: 'template without exactly one {{{s}}}' };
  const converted = template.replace('{{{s}}}', '%s');
  if (!isValidSearchTemplate(converted)) return { dropped: `template refused: ${converted}` };

  const fmt = Array.isArray(bang.fmt) ? bang.fmt : null;
  const has = (flag) => (fmt ? fmt.includes(flag) : true);
  const encoding = (has('url_encode_placeholder') ? ENCODE : 0) | (has('url_encode_space_to_plus') ? PLUS : 0);

  let home;
  if (has('open_snap_domain') && bang.ad) home = normalizedHome(`https://${bang.ad}`);
  else if (has('open_base_path')) home = normalizedHome(`${new URL(converted.replace('%s', 'x')).origin}/`);
  else home = normalizedHome(`https://${bang.d}`);
  if (!home) return { dropped: 'home address refused' };

  const aliases = [];
  for (const raw of Array.isArray(bang.ts) ? bang.ts : []) {
    const alias = String(raw).toLowerCase();
    if (!BANG_CODE.test(alias) || excluded[alias] || alias === code || aliases.includes(alias)) continue;
    aliases.push(alias);
  }
  return { entry: [code, aliases, String(bang.s ?? ''), String(bang.d ?? ''), converted, encoding, home] };
}

export function generate({ log = () => {} } = {}) {
  const pinned = JSON.parse(fs.readFileSync(PINNED, 'utf8'));
  if (pinned.version !== 1 || typeof pinned.sha256 !== 'string') {
    throw new Error('Invalid bangs source manifest');
  }
  const content = fs.readFileSync(SOURCE, 'utf8');
  const actual = createHash('sha256').update(content).digest('hex');
  if (actual !== pinned.sha256) throw new Error('Pinned hash mismatch for bangs/sources/bangs.json');
  const excluded = JSON.parse(fs.readFileSync(EXCLUDED, 'utf8')).codes ?? {};

  const entries = [];
  const dropped = new Map();
  const seen = new Set();
  for (const bang of JSON.parse(content)) {
    const result = transformEntry(bang, { excluded });
    if (result.dropped) {
      const reason = result.dropped.replace(/[:"].*$/, '');
      dropped.set(reason, (dropped.get(reason) ?? 0) + 1);
      continue;
    }
    // Kagi keeps triggers unique, but a later alias may repeat an earlier
    // code; the first definition wins so lookups stay deterministic.
    const [code, aliases] = result.entry;
    if (seen.has(code)) { dropped.set('duplicate code', (dropped.get('duplicate code') ?? 0) + 1); continue; }
    seen.add(code);
    result.entry[1] = aliases.filter((alias) => !seen.has(alias));
    for (const alias of result.entry[1]) seen.add(alias);
    entries.push(result.entry);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  log({ kept: entries.length, dropped });

  const lines = [
    `/* Generated by bangs/build.mjs from bangs/sources/bangs.json (Kagi bangs, MIT,`,
    ` * commit ${pinned.source.commit}, ${pinned.date}). Do not edit. */`,
    `(function (root) {`,
    `  'use strict';`,
    `  const catalog = [`,
    ...entries.map((entry) => `    ${JSON.stringify(entry)},`),
    `  ];`,
    `  if (typeof module !== 'undefined') module.exports = catalog;`,
    `  else root.BangsCatalog = catalog;`,
    `})(typeof window !== 'undefined' ? window : globalThis);`,
    ``,
  ];
  return lines.join('\n');
}

function report({ kept, dropped }) {
  console.log(`Kept: ${kept}`);
  if (dropped.size) {
    console.log('Dropped:');
    for (const [reason, count] of [...dropped].sort((a, b) => b[1] - a[1])) console.log(`  ${reason}: ${count}`);
  }
}

function build() {
  const text = generate({ log: report });
  fs.writeFileSync(OUT, text);
  console.log(`\nWrote ${OUT_REL}`);
}

function check() {
  const text = generate();
  const onDisk = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (onDisk !== text) {
    console.error(`STALE: ${OUT_REL} — run \`npm run bangs:build\``);
    console.error('\nbangs:check failed.');
    process.exit(1);
  }
  console.log('bangs:check OK — the generated catalog matches the pinned source.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes('--check') ? check() : build();
}
