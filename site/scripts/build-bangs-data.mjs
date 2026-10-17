#!/usr/bin/env node

// Pins the bang list the /bangs page shows to one git ref: the bangs merge
// commit while the page is a candidate, the release tag after the release
// ships bangs. Never main's working tree, which runs ahead of the release
// (docs/superpowers/specs/2026-10-17-bangs-page-design.md, "Data").
//
//   node site/scripts/build-bangs-data.mjs --ref <commit-or-tag> [--release <tag>]
//   node site/scripts/build-bangs-data.mjs --check
//
// Writes site/src/data/bangs.json (the catalog verbatim plus the engine-search
// tags) and a byte copy of Kagi's MIT license text (the page redistributes
// the list). Without --ref it reuses the ref already in bangs.json.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..', '..');
const OUT_JSON = path.join(ROOT, 'site', 'src', 'data', 'bangs.json');
const OUT_LICENSE = path.join(ROOT, 'site', 'public', 'licenses', 'kagi-bangs-MIT.txt');
const CATALOG_PATH = 'src/renderer/pages/bangs-catalog.js';
const LICENSE_PATH = 'bangs/sources/kagi-bangs-LICENSE.txt';

// The catalog is about 1.5 MB; Node's default 1 MiB maxBuffer fails with ENOBUFS.
function gitShow(ref, file) {
  return execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 });
}

function resolveCommit(ref) {
  return execFileSync('git', ['rev-parse', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
}

// `site:` limits a search to one site; `-site:` only excludes one.
const SITE_LIMIT = /(?<![-\w])(?:site|inurl)(?::|%3A)/i;
const GOOGLE_SITE_PARAMS = ['cx', 'sitesearch', 'as_sitesearch', 'domains'];

/**
 * The search engine a bang's template sends your words through, when the bang
 * opens an engine's search of one site rather than the site itself: a
 * `site:` or `inurl:` limit, `sites=`, Google's custom search `cx=` and its
 * `sitesearch=`/`domains=`, or a DuckDuckGo `!bang` redirect. Google's own
 * products (Maps, Images), exclusions (`-site:`) and the engines' own bangs
 * (`name` names the engine) are not engine searches of another site.
 */
function engineSearchVia(template, name = '') {
  let url;
  try {
    url = new URL(String(template).replace('%s', 'x'));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const isGoogle = /^(www\.)?google\.[a-z.]+$/.test(host) || host === 'cse.google.com';
  if (isGoogle && /^\/(search|cse|custom)/.test(url.pathname)
    && (SITE_LIMIT.test(template) || GOOGLE_SITE_PARAMS.some((param) => url.searchParams.get(param)))) {
    return 'Google';
  }
  if (/^(www\.)?duckduckgo\.com$/.test(host)) {
    const redirect = /^!/.test(url.searchParams.get('q') ?? '') && !/duckduckgo|\bddg\b/i.test(name);
    if (url.searchParams.has('sites') || SITE_LIMIT.test(template) || redirect) return 'DuckDuckGo';
  }
  if (/(^|\.)bing\.com$/.test(host) && SITE_LIMIT.test(template)) return 'Bing';
  return null;
}

function evaluateCatalog(bytes) {
  const context = { module: { exports: null } };
  vm.runInNewContext(bytes.toString('utf8'), context);
  const catalog = context.module.exports;
  if (!Array.isArray(catalog) || !Array.isArray(catalog.popular)) throw new Error('Unexpected catalog shape');
  return catalog;
}


function renderData({ ref, release, catalogBytes }) {
  const catalog = evaluateCatalog(catalogBytes);
  const entries = JSON.parse(JSON.stringify([...catalog]));
  const via = {};
  for (const entry of entries) {
    const tag = engineSearchVia(entry[4], entry[2]);
    if (tag) via[entry[0]] = tag;
  }
  const head = {
    ref,
    release,
    catalogSha256: crypto.createHash('sha256').update(catalogBytes).digest('hex'),
    count: entries.length,
    popular: [...catalog.popular],
    via,
  };
  // One entry per line so a list update reads as a diff.
  const lines = [
    '{',
    ...Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`),
    '  "entries": [',
    entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n'),
    '  ]',
    '}',
    '',
  ];
  return lines.join('\n');
}

function buildOutputs({ ref, release }) {
  const commit = resolveCommit(ref);
  if (release && resolveCommit(release) !== commit) throw new Error(`--release ${release} is not ${ref}`);
  return [
    [OUT_JSON, Buffer.from(renderData({ ref: commit, release: release ?? null, catalogBytes: gitShow(commit, CATALOG_PATH) }))],
    [OUT_LICENSE, gitShow(commit, LICENSE_PATH)],
  ];
}

function parseArgs(argv) {
  const options = { check: false, ref: null, release: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--ref') options.ref = argv[++i];
    else if (arg === '--release') options.release = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
    if ((arg === '--ref' || arg === '--release') && !argv[i]) throw new Error(`${arg} requires a value`);
  }
  return options;
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const current = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : null;
  const ref = options.ref ?? current?.ref;
  if (!ref) throw new Error('No ref: pass --ref <commit-or-tag>');
  const release = options.ref ? options.release : (options.release ?? current?.release ?? null);
  const outputs = buildOutputs({ ref, release });
  if (options.check) {
    const stale = outputs.filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes));
    if (stale.length) {
      console.error(`Bang data is stale or missing:\n${stale.map(([file]) => `- ${path.relative(ROOT, file)}`).join('\n')}\nRun: npm run site:bangs`);
      return 1;
    }
    console.log(`Bang data is current (${ref}).`);
    return 0;
  }
  for (const [file, bytes] of outputs) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  console.log(`Pinned the bang list at ${outputs[0] && JSON.parse(outputs[0][1]).ref}.`);
  return 0;
}

export { engineSearchVia, renderData, run };

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
