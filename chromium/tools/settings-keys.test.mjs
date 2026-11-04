// The S1.7 key check: every shipping DEFAULTS key is accounted for, and Blanc
// prefs carry shipping's defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {check, registeredPrefs, shippingDefaults} from './settings-keys.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'settings-keys.json'), 'utf8'));
const patches = [path.join(root, 'patches/baseline/0001-foundation-baseline.patch'),
  ...fs.readdirSync(path.join(root, 'patches')).filter(f => /^\d{4}-.*\.patch$/.test(f)).sort().map(f => path.join(root, 'patches', f))];

test('every shipping key is classified and registered defaults match', () => {
  const defaults = shippingDefaults(doc.shippingTag);
  assert.equal(Object.keys(defaults).length, 83);
  assert.deepEqual(check(doc, defaults, registeredPrefs(patches)).errors, []);
});

test('a missing key, a wrong default and an unregistered built pref fail', () => {
  const defaults = {a: true, b: 'x', c: false};
  const entries = {keys: [
    {key: 'a', kind: 'blanc-pref', slice: 'S1.7', status: 'built', pref: 'blanc.a'},
    {key: 'c', kind: 'blanc-pref', slice: 'S1.7', status: 'built', pref: 'blanc.c'},
  ], shippingTag: 'test'};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-keys-'));
  const patch = path.join(dir, 'p.patch');
  fs.writeFileSync(patch, '+  registry->RegisterBooleanPref("blanc.a", false);\n');
  const {errors} = check(entries, defaults, registeredPrefs([patch]));
  fs.rmSync(dir, {recursive: true, force: true});
  assert.deepEqual(errors, ['b: missing from settings-keys.json',
    'a: blanc.a defaults to false, shipping to true', 'c: blanc.c is not registered']);
});
