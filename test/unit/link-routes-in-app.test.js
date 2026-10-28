'use strict';

// #1199: link rules for links opened in a new tab from a page inside Blanc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the switch is device-local, off by default and saved only as a boolean', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /\n  linkRoutesInApp: false,\n/);
  assert.match(settings, /if \(typeof partial\.linkRoutesInApp === 'boolean'\) clean\.linkRoutesInApp = partial\.linkRoutesInApp;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /linkRoutesInApp/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('linkRoutesInApp'));
  const page = read('src/renderer/pages/settings.js');
  assert.match(page, /inApp\.checked = settings\.linkRoutesInApp === true;/);
  assert.match(page, /window\.bowserPages\.settings\.set\(\{ linkRoutesInApp: inApp\.checked \}\)/);
  assert.match(read('src/renderer/pages/settings.html'), /<input id="linkRoutesInApp" type="checkbox"[^>]*aria-describedby="linkRoutesInAppHint"/);
});

// Runs link-route-preload.js against a fake page and returns what it sent.
function runPreload({ isMainFrame = true, protocol = 'https:', origin = 'https://work.test' } = {}) {
  class HTMLAnchorElement { constructor(href) { this.href = href; } }
  class HTMLAreaElement { constructor(href) { this.href = href; } }
  const listeners = {};
  const sent = [];
  const window = {
    location: { protocol },
    origin,
    addEventListener(type, fn, capture) { assert.equal(capture, true); listeners[type] = fn; },
  };
  vm.runInNewContext(read('src/main/link-route-preload.js'), {
    require: (name) => {
      assert.equal(name, 'electron');
      return { ipcRenderer: { send: (channel, value) => sent.push([channel, value]) } };
    },
    process: { isMainFrame },
    window,
    HTMLAnchorElement,
    HTMLAreaElement,
  });
  const fire = (type, { button = type === 'auxclick' ? 1 : 0, isTrusted = true, path = [] } = {}) =>
    listeners[type]?.({ type, button, isTrusted, composedPath: () => path });
  return { sent, fire, listeners, window, HTMLAnchorElement, HTMLAreaElement };
}

test('the preload reports a trusted link activation in a top-level page, and nothing else', () => {
  const page = runPreload();
  const link = new page.HTMLAnchorElement('https://x.test/a');
  const span = {};
  page.fire('click', { path: [span, link] });
  page.fire('auxclick', { path: [link] });
  page.fire('click', { path: [new page.HTMLAreaElement('https://x.test/area')] });
  assert.deepEqual(page.sent, [
    ['link-route:activated', 'https://x.test/a'],
    ['link-route:activated', 'https://x.test/a'],
    ['link-route:activated', 'https://x.test/area'],
  ]);

  page.sent.length = 0;
  page.fire('click', { path: [link], isTrusted: false });
  page.fire('click', { path: [link], button: 2 });
  page.fire('auxclick', { path: [link], button: 2 });
  page.fire('click', { path: [span] });
  page.fire('click', { path: [new page.HTMLAnchorElement('javascript:void 0')] });
  page.fire('click', { path: [new page.HTMLAnchorElement(`https://x.test/${'a'.repeat(9000)}`)] });
  assert.deepEqual(page.sent, [], 'untrusted, other buttons, no link, non-web or oversized');

  // An opaque-origin (sandboxed) document reports nothing.
  page.window.origin = 'null';
  page.fire('click', { path: [link] });
  assert.deepEqual(page.sent, []);
});

test('the preload installs nothing in a subframe or a non-web page', () => {
  assert.deepEqual(runPreload({ isMainFrame: false }).listeners, {});
  assert.deepEqual(runPreload({ protocol: 'blanc:' }).listeners, {});
});

test('main routes only a reported link to exactly this URL, once, from the tab\'s own page', () => {
  const main = read('src/main/main.js');
  const handler = main.match(/ipcMain\.on\(LINK_ROUTE_ACTIVATED_CHANNEL, \(event, url\) => \{[\s\S]*?\n\}\);/)[0];
  assert.match(handler, /if \(!event\.senderFrame \|\| event\.senderFrame\.parent\) return;/);
  assert.match(handler, /if \(!tab \|\| tab\.private \|\| tab\.inheritsDocumentPolicy\) return;/);
  assert.match(main, /const LINK_ROUTE_ACTIVATED_CHANNEL = 'link-route:activated';/);
  assert.match(main, /filePath: path\.join\(__dirname, 'link-route-preload\.js'\),/);

  const fn = main.match(/function routeInAppLink\(tab, sourceWc, url, disposition, \{ fromMenu = false, postBody = null \} = \{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(settings\.getSettings\(\)\.linkRoutesInApp !== true \|\| !tab \|\| tab\.private \|\| tab\.inheritsDocumentPolicy\) return false;/);
  // Popups ('new-window', which OAuth needs with its opener) never route.
  assert.match(fn, /if \(disposition !== 'foreground-tab' && disposition !== 'background-tab'\) return false;/);
  // A form post would lose its body; only web URLs can open elsewhere.
  assert.match(fn, /if \(postBody \|\| typeof url !== 'string' \|\| !\/\^https\?:\\\/\\\/\/i\.test\(url\)\) return false;/);
  assert.match(fn, /const activation = sourceWc && liveContents\(tab\) === sourceWc \? linkActivations\.get\(sourceWc\.id\) : null;\s*if \(!activation \|\| activation\.url !== url \|\| !\(Date\.now\(\) - activation\.at <= IN_APP_ROUTE_ACTIVATION_MS\)\) return false;\s*linkActivations\.delete\(sourceWc\.id\);/);
  assert.match(main, /const IN_APP_ROUTE_ACTIVATION_MS = 1000;/);
  assert.match(fn, /inAppRouteDestination\(linkRouteDestination\(url\), \{ \.\.\.linkRouteHere\(owner\), private: tab\.private \}\)/);
  assert.match(fn, /setImmediate\(\(\) => externalUrlHandoff\.openRouted\(url, destination, \{ activate: disposition === 'foreground-tab' \}\)\);/);
  assert.match(fn, /mainI18n\.t\('linkRoutes\.announce\.opened', \{ destination: where \}\)/);
  // The shield switch and the read-out name a destination the same way.
  assert.match(main, /nameFor: linkRouteDestinationName,/);
  assert.match(main, /wc\.once\('destroyed', \(\) => linkActivations\.delete\(id\)\);/);
});

test('the page\'s window-open handler and context menu ask before opening a tab', () => {
  const view = read('src/main/tab-view.js');
  assert.match(view, /setWindowOpenHandler\(boundToTab\(\(\{ url: targetUrl, disposition, referrer, postBody \}\) => \{/);
  assert.match(view, /if \(!managedExtension && deps\.routeInAppLink\?\.\(tab, targetWc, targetUrl, disposition, \{ postBody \}\)\) return \{ action: 'deny' \};\s*if \(disposition === 'new-window'\)/);
  assert.match(view, /if \(deps\.routeInAppLink\?\.\(tab, null, targetUrl, 'background-tab', \{ fromMenu: true \}\)\) return;\s*createTab\(targetUrl, \{ private: tab\.private \}\);/);
  assert.match(view, /if \(deps\.routeInAppLink\?\.\(tab, null, targetUrl, 'foreground-tab', \{ fromMenu: true \}\)\) return;/);
});

test('a background routed link shows a window it must open without focusing it', () => {
  const main = read('src/main/main.js');
  assert.match(main, /ensureWindow: \(runtime, \{ background = false \} = \{\}\) => createMainWindow\(runtime, \{ ensureStartTab: true, inactive: background \}\),/);
  assert.match(main, /openSpace: \(target\) => openSpaceForRoutedLink\(target, \{ background \}\),\s*openProfileWindow: \(profileId\) => newRoutedProfileRuntime\(profileId, \{ background \}\),/);
  assert.match(main, /createMainWindow\(target, \{ inactive: background \}\);/);
  assert.match(main, /createMainWindow\(runtime, \{ ensureStartTab: false, inactive: background \}\);/);
  assert.match(main, /show: !inactive,/);
  assert.match(main, /if \(inactive\) newWindow\.showInactive\(\);/);
});
