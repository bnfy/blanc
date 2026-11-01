// Bangs (S1.1) must be shipping v1.45.1's: the same grammar and catalog where
// a typed bang is resolved, and the same Settings controls and copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPING = '85883b1afa11375e1300130914d6f40c5388af21';
const show = file => execFileSync('git', ['show', `${SHIPPING}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = createRequire(import.meta.url)(path.join(root, 'blanc/island/bang-settings.js'));

test('the host and Settings resolve with shipping\'s own grammar and catalog', () => {
  for (const file of ['bangs.js', 'bangs-catalog.js'])
    assert.equal(read(`blanc/island/pages/${file}`), show(`src/renderer/pages/${file}`), file);
  for (const html of ['blanc/island/host.html', 'blanc/island/blocking-settings.html']) {
    const doc = read(html);
    assert.ok(doc.indexOf('pages/bangs-catalog.js') < doc.indexOf('pages/bangs.js'), html);
  }
});

test('copy is shipping\'s, in every language', () => {
  for (const [locale, entries] of Object.entries(page.bangCopy)) {
    const shipping = JSON.parse(show(`copy/messages/${locale}.json`));
    for (const [key, value] of Object.entries(entries)) assert.equal(value, shipping[key].message, `${locale} ${key}`);
    assert.deepEqual(Object.keys(entries), Object.keys(page.bangCopy.en), locale);
  }
});

test('Settings has shipping\'s bang controls with shipping\'s English text', () => {
  const ours = read('blanc/island/blocking-settings.html');
  const shipping = show('src/renderer/pages/settings.html');
  for (const id of ['bangsEnabled', 'customBangsBlock', 'customBangReplaces', 'customBangError', 'customBangList',
    'customBangCode', 'customBangName', 'customBangTemplate', 'customBangAdd']) {
    assert.match(ours, new RegExp(`id="${id}"`), id);
    assert.match(shipping, new RegExp(`id="${id}"`), id);
  }
  for (const key of ['settings.general.bangs.label', 'settings.general.bangs.hint', 'settings.general.customBangs.label',
    'settings.general.customBangs.hint', 'settings.general.customBangs.add'])
    assert(ours.includes(`data-bang-i18n="${key}">${page.bangCopy.en[key]}<`), key);
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
