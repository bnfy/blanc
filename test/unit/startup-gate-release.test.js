'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const fnSource = mainSource.match(
  /function releaseStartupNavigationGate\(sessions, \{ blockerAttached \}\) \{[\s\S]*?\n\}/
)?.[0];
const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => \{[\s\S]*?\n\};/)?.[0];

test('the gate-release function and liveContents are still liftable', () => {
  assert.ok(fnSource, 'releaseStartupNavigationGate not found — update this test with it');
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
});

/** Run the real function over a controlled tabs map and queue. */
function load({ tabList, queued }) {
  const sandbox = {
    tabs: new Map(tabList.map((tab, index) => [`t${index}`, tab])),
    startupQueuedNavigations: new Map(queued),
    startupNavigationGateActive: true,
  };
  vm.runInNewContext(
    `${liveContentsSource}\n${fnSource}\nthis.__fn = releaseStartupNavigationGate;`,
    sandbox
  );
  sandbox.__fn([], { blockerAttached: true });
}

const liveTab = (wcId, loaded) => ({
  view: {
    webContents: {
      id: wcId,
      isDestroyed: () => false,
      loadURL: (url) => { loaded.push([wcId, url]); return Promise.resolve(); },
    },
  },
});

test('every queued navigation is replayed onto its tab', () => {
  const loaded = [];
  const tabList = [liveTab(11, loaded), liveTab(12, loaded)];
  load({ tabList, queued: [[11, 'https://a.example/'], [12, 'https://b.example/']] });
  assert.deepEqual(loaded.sort(), [[11, 'https://a.example/'], [12, 'https://b.example/']]);
});

test('a tab whose view is gone does not strand the other queued navigations', () => {
  const loaded = [];
  const tabList = [
    { view: null },
    { view: {} },
    { view: { webContents: { id: 13, isDestroyed: () => true } } },
    liveTab(14, loaded),
  ];
  load({ tabList, queued: [[13, 'https://dead.example/'], [14, 'https://live.example/']] });
  assert.deepEqual(loaded, [[14, 'https://live.example/']]);
});
