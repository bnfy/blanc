#!/usr/bin/env node
// S1.7 (F14): every shipping settings.js DEFAULTS key at the shipping tag is
// accounted for in chromium/settings-keys.json, and every Blanc preference
// the patches register has shipping's default.
//   node chromium/tools/settings-keys.mjs [--require-built]
// --require-built also fails while an S1.7 key is still to build.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = new Set(['blanc-pref', 'native', 'divergence', 'later', 'pending-decision', 'unassigned']);

// Shipping's DEFAULTS at the tag. A value built from another module's
// constant evaluates to undefined; only literal defaults are compared.
export function shippingDefaults(tag) {
  const source = execFileSync('git', ['show', `${tag}:src/main/settings.js`], {cwd: root, encoding: 'utf8'});
  const match = source.match(/^const DEFAULTS = \{[\s\S]*?^\};/m);
  if (!match) throw Error(`No DEFAULTS in ${tag}:src/main/settings.js`);
  const context = new Proxy({}, {has: () => true, get: (target, name) => name in target ? target[name] : undefined,
    set: (target, name, value) => { target[name] = value; return true; }});
  vm.runInNewContext(match[0].replace('const DEFAULTS =', 'DEFAULTS ='), vm.createContext(context));
  return context.DEFAULTS;
}

// Blanc preferences the patch set registers, with their defaults.
export function registeredPrefs(patchFiles) {
  const prefs = new Map();
  const literal = text => {
    const value = text.trim();
    if (value === 'true' || value === 'false') return value === 'true';
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    const string = value.match(/^"((?:[^"\\]|\\.)*)"$/);
    return string ? JSON.parse(`"${string[1]}"`) : {unparsed: value};
  };
  for (const file of patchFiles) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.startsWith('+')) continue;
      const m = line.match(/Register(Boolean|String|Integer|Double|List|Dictionary)Pref\(\s*"(blanc\.[^"]+)"\s*(?:,\s*([^)]*))?\)/);
      if (!m) continue;
      const [, type, name, value] = m;
      prefs.set(name, {type, default: type === 'List' ? [] : type === 'Dictionary' ? {} : literal(value ?? '')});
    }
  }
  return prefs;
}

export function check(doc, defaults, prefs) {
  const errors = [], toBuild = [];
  const keys = doc.keys.map(entry => entry.key);
  const expected = Object.keys(defaults);
  for (const key of expected) if (!keys.includes(key)) errors.push(`${key}: missing from settings-keys.json`);
  for (const key of keys) if (!expected.includes(key)) errors.push(`${key}: not a ${doc.shippingTag} DEFAULTS key`);
  if (new Set(keys).size !== keys.length) errors.push('a key is listed twice');
  for (const entry of doc.keys) {
    const {key, kind} = entry;
    if (!KINDS.has(kind)) { errors.push(`${key}: unknown kind ${kind}`); continue; }
    if (kind === 'later' && (!entry.slice || !entry.row)) errors.push(`${key}: a later key names its slice and row`);
    if (kind === 'divergence' && !entry.decision) errors.push(`${key}: a divergence names its decision`);
    if ((kind === 'pending-decision' || kind === 'unassigned') && !entry.decision && !entry.note) errors.push(`${key}: say what it waits on`);
    if (kind === 'blanc-pref' || kind === 'native') {
      if (entry.slice !== 'S1.7') errors.push(`${key}: an S1.7 key`);
      if (!['built', 'to-build'].includes(entry.status)) errors.push(`${key}: status is built or to-build`);
      if (entry.status === 'to-build') toBuild.push(key);
    }
    if (kind !== 'blanc-pref') continue;
    if (!/^blanc\./.test(entry.pref ?? '')) { errors.push(`${key}: a Blanc pref is named blanc.*`); continue; }
    const registered = prefs.get(entry.pref);
    if (!registered) {
      if (entry.status === 'built') errors.push(`${key}: ${entry.pref} is not registered`);
      continue;
    }
    const want = defaults[key];
    if (want !== undefined && JSON.stringify(registered.default) !== JSON.stringify(want))
      errors.push(`${key}: ${entry.pref} defaults to ${JSON.stringify(registered.default)}, shipping to ${JSON.stringify(want)}`);
  }
  return {errors, toBuild};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'settings-keys.json'), 'utf8'));
  const patches = [path.join(root, 'patches/baseline/0001-foundation-baseline.patch'),
    ...fs.readdirSync(path.join(root, 'patches')).filter(f => /^\d{4}-.*\.patch$/.test(f)).sort().map(f => path.join(root, 'patches', f))];
  const {errors, toBuild} = check(doc, shippingDefaults(doc.shippingTag), registeredPrefs(patches));
  const counts = {};
  for (const entry of doc.keys) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  console.log(JSON.stringify({keys: doc.keys.length, counts, toBuild}));
  if (process.argv.includes('--require-built') && toBuild.length) errors.push(`still to build: ${toBuild.join(', ')}`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
}
