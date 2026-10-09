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
  assert.doesNotMatch(preload, /mahjongPlayed: \(\) => invoke\('pages:mahjong:played'\)/);
  assert.match(preload, /mahjong: \{ played: \(\) => invoke\('pages:mahjong:played'\) \}/);
  assert.match(pages, /handleEvent\('pages:start:layout-used', 'newtab'/);
  assert.match(pages, /settings\.NEWTAB_LAYOUTS\.includes\(name\)/);
  assert.match(pages, /handleEvent\('pages:mahjong:played', \['mahjong'\]/);
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
    /function applyLayout\(name\) \{\s*if \(!\['ledger', 'billboard', 'shelf', 'tally'\]\.includes\(name\)\) name = 'billboard';\s*state\.layout = name;\s*document\.body\.dataset\.layout = name;\s*presentPendingMigrationChecklistCompletion\(\);\s*window\.bowserPages\?\.start\?\.layoutUsed\?\.\(name\)/,
  );
  assert.doesNotMatch(newtab, /mahjongFrame|blanc:mahjong-played/);
  const privacySaved = onboarding.indexOf('if (!(await persistPrivacy()))');
  const layoutUsed = onboarding.indexOf('window.bowserPages.start.layoutUsed(document.body.dataset.layout)');
  assert.ok(privacySaved !== -1 && layoutUsed > privacySaved);
});

const tabView = source('src/main/tab-view.js');

test('first-day signals start only after the launch report and require saved consent', () => {
  assert.match(main, /launchPingSent = true;\s*sendLaunchPing\(\);\s*dayOneSignals\.start\(\);/);
  assert.match(
    main,
    /canSend: \(\) => app\.isPackaged\s*&& settings\.isFirstRunComplete\(\)\s*&& settings\.getSettings\(\)\.usagePing === true\s*&& launchPingSent/,
  );
  assert.match(main, /defaultBrowserChanged: \(\) => dayOneSignals\.checkDefault\(\)/);
  assert.match(main, /noteWebPageLoaded: \(url\) => dayOneSignals\.notePageLoaded\(url\)/);
});

test('only history-eligible, non-wake top-level commits count as browsing', () => {
  assert.match(
    tabView,
    /if \(tab\.historyEligible && !noteWakeSuppressed\(tab\)\) \{\s*history\.addVisit\(url, wc\.getTitle\(\)\);\s*deps\.noteWebPageLoaded\?\.\(url\);\s*\}/,
  );
  assert.equal(tabView.match(/noteWebPageLoaded/g).length, 1, 'never from in-page or subframe navigation');
});

test('no renderer or internal-page path can send a first-day signal', () => {
  for (const [label, text] of [['tab-preload', preload], ['pages', pages], ['newtab', newtab], ['onboarding', onboarding]]) {
    assert.doesNotMatch(text, /day1_|sendDayOneSignal|markDayOneSent/, label);
  }
});
