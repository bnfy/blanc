'use strict';

// #1199: link rules for links opened in a new tab from a page inside Blanc.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('main routes only new-tab links the person opened, never from a private tab', () => {
  const main = read('src/main/main.js');
  const fn = main.match(/function routeInAppLink\(tab, sourceWc, url, disposition, \{ fromMenu = false \} = \{\}\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /if \(settings\.getSettings\(\)\.linkRoutesInApp !== true \|\| tab\?\.private\) return false;/);
  // Popups ('new-window', which OAuth needs with its opener) never route.
  assert.match(fn, /if \(disposition !== 'foreground-tab' && disposition !== 'background-tab'\) return false;/);
  // A native press on that page within the last second; pages can't fake one.
  assert.match(fn, /if \(!fromMenu && !\(Date\.now\(\) - \(nativeGestureAt\.get\(sourceWc\?\.id\) \?\? -Infinity\) <= IN_APP_ROUTE_GESTURE_MS\)\) return false;/);
  assert.match(main, /const IN_APP_ROUTE_GESTURE_MS = 1000;/);
  assert.match(fn, /inAppRouteDestination\(linkRouteDestination\(url\), \{\s*profileId: owner\.profileId, spaceId: owner\.workspaceId \?\? null, private: tab\.private,/);
  assert.match(fn, /setImmediate\(\(\) => externalUrlHandoff\.openRouted\(url, destination, \{ activate: disposition === 'foreground-tab' \}\)\);/);
  assert.match(fn, /stripSurfaces\(owner\)\.send\('chrome:glance-status', inAppRouteAnnouncement\(destination, owner\)\);/);
  // The gesture stamp comes from native input only, per WebContents.
  assert.match(main, /if \(mouse\.type !== 'mouseDown'\) return;\s*handOffToOs\.noteUserGesture\(\);\s*nativeGestureAt\.set\(id, Date\.now\(\)\);/);
  assert.match(main, /wc\.once\('destroyed', \(\) => nativeGestureAt\.delete\(id\)\);/);
});

test('the page\'s window-open handler and context menu ask before opening a tab', () => {
  const view = read('src/main/tab-view.js');
  assert.match(view, /if \(!managedExtension && deps\.routeInAppLink\?\.\(tab, targetWc, targetUrl, disposition\)\) return \{ action: 'deny' \};\s*if \(disposition === 'new-window'\)/);
  assert.match(view, /if \(deps\.routeInAppLink\?\.\(tab, null, targetUrl, 'background-tab', \{ fromMenu: true \}\)\) return;\s*createTab\(targetUrl, \{ private: tab\.private \}\);/);
  assert.match(view, /if \(deps\.routeInAppLink\?\.\(tab, null, targetUrl, 'foreground-tab', \{ fromMenu: true \}\)\) return;/);
});
