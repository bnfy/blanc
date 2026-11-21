// Android A7: the notices About opens are local, complete and auditable in the bundle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pages = path.join(root, 'chromium/blanc/android/pages');
const tool = path.join(root, 'chromium/tools/android-notices.mjs');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const expected = [
  {file: 'notices/LICENSE.txt', source: 'LICENSE'},
  {file: 'notices/ASSET-LICENSE.txt', source: 'ASSET-LICENSE.md'},
  {file: 'notices/THIRD-PARTY-NOTICES.txt', source: 'THIRD-PARTY-NOTICES.md'},
  {file: 'notices/CHROMIUM-FORK-NOTICES.txt', source: 'chromium/THIRD_PARTY_NOTICES.md'},
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const api = async () => {
  assert.ok(fs.existsSync(tool), 'the Android notices generator exists');
  return import('./android-notices.mjs');
};
const page = () => {
  assert.ok(fs.existsSync(path.join(pages, 'licenses.html')), 'the licenses page exists');
  return fs.readFileSync(path.join(pages, 'licenses.html'), 'utf8');
};
const run = script => spawnSync(process.execPath, [script, '--check'], {encoding: 'utf8'});

test('noticesAreByteCopies', async () => {
  const {notices} = await api();
  const entries = notices();
  assert.deepEqual(entries.map(({file, source}) => ({file, source})), expected);
  for (const {file, source, sha256} of entries) {
    const original = fs.readFileSync(path.join(root, source));
    assert.deepEqual(fs.readFileSync(path.join(pages, file)), original, file);
    assert.equal(sha256, hash(original), file);
  }
  const result = run(tool);
  assert.equal(result.status, 0, result.stderr);
});

test('checkFailsOnDrift', async t => {
  await api();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'android-notices-'));
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  const fixtureTool = path.join(fixture, 'chromium/tools/android-notices.mjs');
  fs.mkdirSync(path.dirname(fixtureTool), {recursive: true});
  fs.copyFileSync(tool, fixtureTool);
  for (const {source} of expected) {
    fs.mkdirSync(path.dirname(path.join(fixture, source)), {recursive: true});
    fs.copyFileSync(path.join(root, source), path.join(fixture, source));
  }
  fs.mkdirSync(path.join(fixture, 'copy/messages'), {recursive: true});
  for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR'])
    fs.copyFileSync(path.join(root, `copy/messages/${locale}.json`), path.join(fixture, `copy/messages/${locale}.json`));
  const built = spawnSync(process.execPath, [fixtureTool], {encoding: 'utf8'});
  assert.equal(built.status, 0, built.stderr);
  assert.equal(run(fixtureTool).status, 0);
  fs.appendFileSync(path.join(fixture, 'LICENSE'), '\nchanged source\n');
  const result = run(fixtureTool);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /LICENSE\.txt/);
  assert.doesNotMatch(fs.readFileSync(path.join(fixture, 'chromium/blanc/android/pages/notices/LICENSE.txt'), 'utf8'), /changed source/);
});

test('pageListsEveryNotice', () => {
  const html = page();
  for (const {file} of expected) {
    assert.ok(html.includes(`data-notice="${file}"`), file);
    assert.ok(html.includes(`href="${file}"`), `${file} can also be read directly`);
  }
  assert.match(html, /href="ios-pages\.css"/);
  assert.match(html, /data-platform="ios"/);
  assert.match(html, /width=device-width/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
});

test('pageLinksChromiumCredits', () => {
  assert.match(page(), /href="chrome:\/\/credits\/?"/);
});

test('noticesAreBundled', () => {
  const inventory = JSON.parse(read('chromium/blanc/android/pages.json'));
  assert.ok(inventory.local, 'Android-owned page files have an explicit inventory');
  for (const file of ['licenses.html', 'licenses.js', 'licenses.css', 'licenses-strings.js', ...expected.map(n => n.file)])
    assert.ok(inventory.local.includes(file), file);
  const gn = read('chromium/blanc/android/pages_resources/BUILD.gn');
  assert.match(gn, /foreach\(file, pinned\.local\)/);
  const androidGn = read('chromium/blanc/android/BUILD.gn');
  const assets = androidGn.match(/android_assets\("notices_assets"\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(assets, 'the AAB also contains individually auditable notice assets');
  for (const {file} of expected) {
    assert.ok(assets.includes(`"pages/${file}"`), file);
    assert.ok(assets.includes(`"blanc/android/pages/${file}"`), file);
  }
  assert.match(androidGn, /android_library\("settings_chromium_java"\) \{[\s\S]*?deps = \[[^\]]*":notices_assets"/);
});

test('pageUsesCurrentTranslationsInEveryLanguage', () => {
  const html = page();
  assert.match(html, /src="ui-language\.js"[\s\S]*src="licenses-strings\.js"[\s\S]*src="i18n\.js"/);
  const script = fs.readFileSync(path.join(pages, 'licenses-strings.js'), 'utf8');
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  keys.add('android.licenses.loadFailed');
  for (const locale of ['en', 'de', 'es', 'fr', 'it', 'pt-BR']) {
    const window = {__blancUiLanguage: locale};
    vm.runInNewContext(script, {window});
    assert.equal(window.blancStrings.locale, locale);
    const catalog = JSON.parse(read(`copy/messages/${locale}.json`));
    for (const key of keys) {
      assert.ok(key.startsWith('android.licenses.'), key);
      assert.ok(catalog[key]?.message, `${locale}: ${key}`);
      assert.equal(window.blancStrings.messages[key], catalog[key].message, `${locale}: ${key}`);
    }
  }
});

async function loadNotices(fail = false) {
  page();
  const elements = expected.map(({file}) => ({dataset: {notice: file}, textContent: ''}));
  const requested = [];
  const response = text => ({ok: true, text: async () => text});
  vm.runInNewContext(fs.readFileSync(path.join(pages, 'licenses.js'), 'utf8'), {
    document: {querySelectorAll: () => elements},
    blancI18n: {t: key => `translated:${key}`},
    fetch: async file => {
      requested.push(file);
      if (fail) return {ok: false};
      return response(fs.readFileSync(path.join(pages, file), 'utf8'));
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return {elements, requested};
}

test('pageDisplaysTheCompleteNoticeText', async () => {
  const {elements, requested} = await loadNotices();
  assert.deepEqual(requested, expected.map(n => n.file));
  for (const el of elements)
    assert.equal(el.textContent, fs.readFileSync(path.join(pages, el.dataset.notice), 'utf8'));
});

test('pageReportsUnreadableNoticesInItsLanguage', async () => {
  const {elements} = await loadNotices(true);
  for (const el of elements) assert.equal(el.textContent, 'translated:android.licenses.loadFailed');
});

test('translationBootstrapDoesNotReplaceALoadedNotice', async () => {
  const el = {dataset: {notice: expected[0].file, i18n: 'android.licenses.loading'}, textContent: ''};
  const listeners = {};
  const document = {
    readyState: 'loading', documentElement: {style: {}},
    getElementsByTagName: () => [el], querySelectorAll: () => [el],
    addEventListener: (event, callback) => { listeners[event] = callback; },
  };
  const scope = {
    document, blancStrings: {locale: 'en', messages: {'android.licenses.loading': 'Loading notice…'}},
    fetch: async () => ({ok: true, text: async () => 'the complete legal notice'}),
  };
  scope.self = scope;
  vm.runInNewContext(fs.readFileSync(path.join(pages, 'i18n.js'), 'utf8'), scope);
  vm.runInNewContext(fs.readFileSync(path.join(pages, 'licenses.js'), 'utf8'), scope);
  await new Promise(resolve => setImmediate(resolve));
  listeners.DOMContentLoaded();
  assert.equal(el.textContent, 'the complete legal notice');
});

test('aboutOpensBlancNoticesInsideTheApp', () => {
  const host = read('chromium/blanc/android/java/src/org/chromium/blanc/settings/chromium/ChromiumSettingsHost.java');
  const method = host.match(/public void openLicenses\(\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.match(method, /chrome:\/\/blanc\/licenses\.html/);
  assert.match(method, /setClassName\(mActivity\.getPackageName\(\),/);
  assert.match(method, /org\.chromium\.chrome\.browser\.document\.ChromeLauncherActivity/);
  assert.match(method, /IntentUtils\.addTrustedIntentExtras/);
  assert.match(method, /mActivity\.startActivity/);
});

function pagesFixture(t, local) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'android-local-pages-'));
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  const files = {
    'chromium/tools/android-pages.mjs': read('chromium/tools/android-pages.mjs'),
    'chromium/blanc/android/pages.json': JSON.stringify({files: [], local, start: {files: []}}),
    'chromium/blanc/android/pages-adapter/android-pages-adapter.template.js': '',
    'chromium/blanc/android/pages-adapter/android-pages-adapter.js': '',
    'browser-api/bridges.json': JSON.stringify({bowserPages: {members: []}}),
  };
  for (const [rel, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(fixture, rel)), {recursive: true});
    fs.writeFileSync(path.join(fixture, rel), bytes);
  }
  return {fixture, tool: path.join(fixture, 'chromium/tools/android-pages.mjs')};
}

test('localPagePathsCannotEscapePagesDirectory', t => {
  const fixture = pagesFixture(t, ['../outside.txt']);
  const result = spawnSync(process.execPath, [fixture.tool, '--check'], {encoding: 'utf8', timeout: 1000});
  assert.equal(result.status, 1, result.stderr || String(result.error));
  assert.match(result.stderr, /invalid local page path/i);
});

test('missingLocalNoticeDirectoryProducesAClearDiagnostic', t => {
  const fixture = pagesFixture(t, ['notices/LICENSE.txt']);
  const result = run(fixture.tool);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /notices\/LICENSE\.txt is missing/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
