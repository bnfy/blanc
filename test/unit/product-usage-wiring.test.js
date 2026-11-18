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

// V24 (2026-11-18): the Start Page has one layout, so it no longer reports
// newtab_layout; the Worker still accepts the event from older builds.
test('the internal-page bridge exposes only the one bounded usage event', () => {
  assert.doesNotMatch(preload, /layoutUsed|pages:start:layout-used/);
  assert.doesNotMatch(pages, /pages:start:layout-used/);
  assert.doesNotMatch(preload, /mahjongPlayed: \(\) => invoke\('pages:mahjong:played'\)/);
  assert.match(preload, /mahjong: \{ played: \(\) => invoke\('pages:mahjong:played'\) \}/);
  assert.match(pages, /handleEvent\('pages:mahjong:played', \['mahjong'\]/);
});

test('main applies saved consent and private-tab policy at the trusted boundary', () => {
  assert.match(main, /productUsageAllowed\(\{/);
  assert.match(main, /firstRunComplete: settings\.isFirstRunComplete\(\)/);
  assert.match(main, /usagePing: current\.usagePing/);
  assert.match(main, /privateTab: tab\.private/);
  assert.match(main, /mahjongPlayed: \(wc\)[\s\S]*sendMahjongPlay\(\)/);
  assert.doesNotMatch(main, /newtabLayoutUsed|sendNewtabLayoutUsed/);
});

test('the Start Page reports no layout', () => {
  assert.doesNotMatch(newtab, /layoutUsed/);
  assert.doesNotMatch(onboarding, /layoutUsed/);
  assert.doesNotMatch(newtab, /mahjongFrame|blanc:mahjong-played/);
});

const tabView = source('src/main/tab-view.js');

test('first-day signals start only after the launch report and require saved consent', () => {
  assert.match(main, /launchPingSent = true;\s*sendLaunchPing\(\);\s*dayOneSignals\.start\(\);/);
  assert.match(
    main,
    /canSend: \(\) => app\.isPackaged\s*&& settings\.isFirstRunComplete\(\)\s*&& settings\.getSettings\(\)\.usagePing === true\s*&& launchPingSent/,
  );
  assert.match(main, /defaultBrowserChanged: \(\) => \{\s*noteDefaultBrowser\(\);\s*dayOneSignals\.checkDefault\(\);/);
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
