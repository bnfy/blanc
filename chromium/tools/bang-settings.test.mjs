// Bangs (S1.1) must be shipping v1.45.1's: the same grammar and catalog where
// a typed bang is resolved, and shipping's Settings controls inside
// chrome://settings (S1.7; their copy is checked by settings-strings.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '2098dd703c99194a58e5a3e7ec0b39923d2db59b';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the host and Settings resolve with shipping\'s own grammar and catalog', () => {
  for (const file of ['bangs.js', 'bangs-catalog.js'])
    assert.equal(read(`blanc/island/pages/${file}`), show(`src/renderer/pages/${file}`), file);
  const doc = read('blanc/island/host.html');
  assert.ok(doc.indexOf('pages/bangs-catalog.js') < doc.indexOf('pages/bangs.js'));
});

test('Settings has shipping\'s bang controls', () => {
  const patch = read('patches/0022-blanc-settings-lists.patch');
  // Bangs on/off (patch 0021) and Your bangs: the list, its notice, and a
  // code, name and address with Add, as shipping's Settings → Your bangs.
  assert.match(read('patches/0021-blanc-settings-controls.patch'), /\+\s+pref-key="blanc\.bangs\.enabled"/);
  for (const id of ['blancCustomBangList', 'blancBangNotice', 'blancBangCode', 'blancBangName', 'blancBangTemplate', 'blancBangAdd'])
    assert.match(patch, new RegExp(`\\+.*id="${id}"`), id);
  const handler = read('blanc/browser/ui/chromium_settings_handler.inc');
  for (const result of ['"duplicate"', '"invalid"', '"added"']) assert.ok(handler.includes(result), result);
});

test('the native rules keep shipping\'s limits', () => {
  const settings = show('src/main/settings.js');
  const native = read('blanc/browser/ui/browser_api/bangs.cc');
  for (const [js, cc] of [['MAX_CUSTOM_BANGS', 'kMaxCustomBangs'], ['MAX_RECENT_BANGS', 'kMaxRecentBangs'],
    ['MAX_CUSTOM_BANG_NAME', 'kMaxCustomBangName']]) {
    const expected = new RegExp(`const ${js} = (\\d+);`).exec(settings)[1];
    assert.equal(new RegExp(`${cc} = (\\d+);`).exec(native)[1], expected, js);
  }
  assert.match(settings, /bangsEnabled: true,/);
  assert.match(read('patches/0007-bangs-prefs.patch'), /\+  registry->RegisterBooleanPref\("blanc\.bangs\.enabled", true\);/);
});
