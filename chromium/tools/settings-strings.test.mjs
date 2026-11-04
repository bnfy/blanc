// Blanc's chrome://settings strings must be shipping's, generated per language.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate, STRINGS} from './settings-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the committed header is the generated one', () => {
  assert.equal(fs.readFileSync(path.join(root, 'blanc/common/settings_strings.h'), 'utf8'), generate());
});

test('every name the settings patch reads is generated', () => {
  const patch = ['0021-blanc-settings-controls', '0022-blanc-settings-lists', '0023-blanc-settings-remaining']
    .map(name => fs.readFileSync(path.join(root, `patches/${name}.patch`), 'utf8')).join('\n');
  const used = new Set([...patch.matchAll(/^\+.*?(?:\$i18n\{|getString\('|blancString\(\s*')(blanc[A-Za-z]+)/gm)].map(m => m[1]));
  const names = new Set(STRINGS.map(([name]) => name));
  for (const name of used) assert.ok(names.has(name), name);
  assert.ok(used.size >= 25);
});
