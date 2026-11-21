'use strict';

// The iOS app serves the desktop's blanc:// pages from its bundle
// (ios/Blanc/Blanc/BlancSchemeHandler.swift) and builds window.bowserPages
// from the bundled browser-api/bridges.json (ios/Blanc/Blanc/PagesBridge.swift).
// No CI job here can run Swift, so these checks hold the Swift side to the
// desktop sources it mirrors.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SCHEME_HANDLER = read('ios/Blanc/Blanc/BlancSchemeHandler.swift');
const PAGES_BRIDGE = read('ios/Blanc/Blanc/PagesBridge.swift');
const BRIDGES = JSON.parse(read('browser-api/bridges.json'));

test('iOS strings.js catalogs match the selectable interface languages', () => {
  const swift = /static let selectableLocales = \[([^\]]*)\]/.exec(SCHEME_HANDLER);
  assert.ok(swift, 'selectableLocales not found in BlancSchemeHandler.swift');
  const ios = [...swift[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const desktop = JSON.parse(read('src/main/i18n-locales.json'))
    .filter((l) => l.status === 'selectable')
    .map((l) => l.code);
  assert.deepEqual(ios, desktop);
  for (const code of ios) {
    assert.ok(fs.existsSync(path.join(ROOT, 'src/renderer/pages', `strings.${code}.js`)), `strings.${code}.js`);
  }
});

test('iOS serves only hosts the desktop also knows', () => {
  const swift = /static let knownPages: Set<String> = \[([^\]]*)\]/.exec(SCHEME_HANDLER);
  assert.ok(swift, 'knownPages not found in BlancSchemeHandler.swift');
  const ios = [...swift[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const host of ios) {
    assert.ok(fs.existsSync(path.join(ROOT, 'src/renderer/pages', `${host}.html`)), `${host}.html`);
  }
});

function shimFor(host) {
  const template = /userScriptTemplate = #"""\n([\s\S]*?)\n\s*"""#/.exec(PAGES_BRIDGE);
  assert.ok(template, 'userScriptTemplate not found in PagesBridge.swift');
  const members = BRIDGES.bowserPages.members.map(({ name, kind, hosts }) => ({ name, kind, hosts }));
  const source = template[1].replace('__BLANC_MEMBERS__', JSON.stringify(members));
  const posted = [];
  const window = { webkit: { messageHandlers: { blancPages: { postMessage: (m) => posted.push(m) } } } };
  vm.runInNewContext(source, { window, location: { protocol: 'blanc:', host }, console });
  return { api: window.bowserPages, window, posted };
}

const lookup = (api, name) => name.split('.').reduce((obj, key) => obj?.[key], api);

test('the iOS shim exposes every member the contract grants a host, and no others', () => {
  for (const host of ['settings', 'history', 'bookmarks', 'downloads', 'error', 'shortcuts', 'mahjong']) {
    const { api } = shimFor(host);
    for (const member of BRIDGES.bowserPages.members) {
      const fn = lookup(api, member.name);
      if (member.hosts.includes(host)) assert.equal(typeof fn, 'function', `${host}: ${member.name}`);
      else assert.equal(fn, undefined, `${host} must not get ${member.name}`);
    }
  }
});

// The Start Page is the desktop fork's page, which asks native code over its
// own channel (ios/Blanc/Blanc/StartPageBridge.swift, as Android's
// blanc_pages_ui.cc answers it); its adapter builds window.bowserPages itself.
test('the iOS shim leaves the Start Page to the fork page\'s adapter', () => {
  assert.equal(shimFor('newtab').api, undefined);
});

test('the iOS shim posts invokes with positional args and delivers events', async () => {
  const { api, window, posted } = shimFor('history');
  const pending = api.history.remove('https://example.com/', 5);
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ id: 1, group: 'history', method: 'remove', args: ['https://example.com/', 5] }]);
  window.__blancResolve(1, true, null);
  assert.equal(await pending, null);

  const settings = shimFor('settings');
  const seen = [];
  const off = settings.api.settings.onAppearance((v) => seen.push(v));
  settings.window.__blancEmit('settings.onAppearance', true);
  off();
  settings.window.__blancEmit('settings.onAppearance', false);
  assert.deepEqual(seen, [true]);
});

test('the iOS shim stays off non-blanc documents', () => {
  const template = /userScriptTemplate = #"""\n([\s\S]*?)\n\s*"""#/.exec(PAGES_BRIDGE)[1];
  const window = {};
  vm.runInNewContext(template.replace('__BLANC_MEMBERS__', '[]'), { window, location: { protocol: 'https:', host: 'example.com' } });
  assert.equal(window.bowserPages, undefined);
});

test('the iOS shim marks only the utility pages as phone pages', () => {
  const template = /userScriptTemplate = #"""\n([\s\S]*?)\n\s*"""#/.exec(PAGES_BRIDGE)[1];
  for (const host of ['history', 'bookmarks', 'shortcuts', 'downloads', 'newtab', 'settings', 'error', 'mahjong']) {
    const appended = [];
    const root = { dataset: {}, append: (...nodes) => appended.push(...nodes) };
    const document = {
      documentElement: root,
      createElement: (tag) => ({ tag }),
      addEventListener() {},
    };
    const window = { webkit: { messageHandlers: { blancPages: { postMessage() {} } } } };
    vm.runInNewContext(template.replace('__BLANC_MEMBERS__', '[]'),
      { window, document, location: { protocol: 'blanc:', host, hostname: host }, console });
    const phone = ['history', 'bookmarks', 'shortcuts', 'downloads'].includes(host);
    assert.equal(root.dataset.platform, phone ? 'ios' : undefined, host);
    assert.equal(appended.some((n) => n.tag === 'link' && n.href === 'ios-pages.css'), phone, host);
  }
});

test('every phone page rule is scoped to the iOS mark, so none reaches desktop', () => {
  const css = read('src/renderer/pages/ios-pages.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(','));
  assert.ok(selectors.length > 10);
  for (const selector of selectors) assert.match(selector.trim(), /^:root\[data-platform="ios"\]/, selector);
  for (const file of ['pages.css', 'history.html', 'bookmarks.html', 'shortcuts.html']) {
    assert.ok(!read(`src/renderer/pages/${file}`).includes('ios-pages.css'), `${file} must not load it`);
  }
});
