'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');
}

const preload = source('src/main/tab-preload.js');
const pages = source('src/main/pages.js');
const main = source('src/main/main.js');
const newtab = source('src/renderer/pages/newtab.js');
const onboarding = source('src/renderer/pages/onboarding.js');

test('the internal-page bridge exposes only the two bounded usage events', () => {
  assert.match(preload, /layoutUsed: \(name\) => invoke\('pages:start:layout-used', name\)/);
  assert.match(preload, /mahjongPlayed: \(\) => invoke\('pages:mahjong:played'\)/);
  assert.match(preload, /mahjong: \{ played: \(\) => invoke\('pages:mahjong:played'\) \}/);
  assert.match(pages, /handleEvent\('pages:start:layout-used', 'newtab'/);
  assert.match(pages, /settings\.NEWTAB_LAYOUTS\.includes\(name\)/);
  assert.match(pages, /handleEvent\('pages:mahjong:played', \['mahjong', 'newtab'\]/);
});

test('main applies saved consent and private-tab policy at the trusted boundary', () => {
  assert.match(main, /productUsageAllowed\(\{/);
  assert.match(main, /firstRunComplete: settings\.isFirstRunComplete\(\)/);
  assert.match(main, /usagePing: current\.usagePing/);
  assert.match(main, /privateTab: tab\.private/);
  assert.match(main, /mahjongPlayed: \(wc\)[\s\S]*sendMahjongPlay\(\)/);
  assert.match(main, /newtabLayoutUsed: \(wc, layout\)[\s\S]*sendNewtabLayoutUsed\(layout\)/);
});

test('a rendered layout is reported, including the first post-consent render', () => {
  assert.match(
    newtab,
    /function applyLayout\(name\) \{\s*state\.layout = name;\s*document\.body\.dataset\.layout = name;\s*window\.bowserPages\?\.start\?\.layoutUsed\?\.\(name\)/,
  );
  assert.match(newtab, /event\.origin !== 'blanc:\/\/mahjong'/);
  assert.match(newtab, /event\.source !== mahjongFrame\.contentWindow/);
  assert.match(newtab, /event\.data !== 'blanc:mahjong-played'/);
  const privacySaved = onboarding.indexOf('if (!(await persistPrivacy()))');
  const layoutUsed = onboarding.indexOf('window.bowserPages.start.layoutUsed(document.body.dataset.layout)');
  assert.ok(privacySaved !== -1 && layoutUsed > privacySaved);
});
