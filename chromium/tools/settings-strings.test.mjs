// Blanc's chrome://settings strings must be shipping's, generated per language.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {generate, STRINGS} from './settings-strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the committed header is the generated one', () => {
  assert.equal(fs.readFileSync(path.join(root, 'blanc/common/settings_strings.h'), 'utf8'), generate());
});

// The Settings strings have their own shipping pin (blanc/settings-strings.json)
// so a string can arrive before a renderer sync; it never trails the
// renderer's pin, which would take strings away from the Island's controls.
test('the strings pin is the renderer pin or a later commit', () => {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const strings = read('blanc/settings-strings.json'), renderer = read('blanc/island-renderer.json');
  assert.match(strings.commit, /^[0-9a-f]{40}$/);
  execFileSync('git', ['merge-base', '--is-ancestor', renderer.commit, strings.commit], {cwd: root});
});

test('every name the settings patch reads is generated', () => {
  const patch = ['0021-blanc-settings-controls', '0022-blanc-settings-lists', '0023-blanc-settings-remaining', '0024-blanc-call-audio', '0063-blanc-tab-archive', '0086-blanc-reuse-new-tab']
    .map(name => fs.readFileSync(path.join(root, `patches/${name}.patch`), 'utf8')).join('\n');
  const used = new Set([...patch.matchAll(/^\+.*?(?:\$i18n\{|getString\('|blancString\(\s*')(blanc[A-Za-z0-9]+)/gm)].map(m => m[1]));
  const names = new Set(STRINGS.map(([name]) => name));
  for (const name of used) assert.ok(names.has(name), name);
  assert.ok(used.size >= 25);
});
