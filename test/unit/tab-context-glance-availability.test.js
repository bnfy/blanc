'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { buildTabContextMenu } = require('../../src/main/tab-context-menu-model');
const { englishT } = require('../support/english-t');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const contextSource = main.match(/function tabContextData\(tab, owner\) \{[\s\S]*?\n\}/)[0];
const splitSource = main.match(/function visibleSplitOf\(runtime = rt\(\)\) \{[\s\S]*?\n\}/)[0];

test('either pane of a visible two-pane split offers Glance, but unrelated rows do not', () => {
  const owner = { id: 'window', activeTabId: 'main', groups: [], tabOrder: ['main', 'reference'],
    splits: [{ id: 'split', tabIds: ['main', 'reference'] }] };
  const tab = { id: 'reference', runtimeId: owner.id, url: 'https://example.com', splitId: 'split' };
  const sandbox = {
    tabs: new Map([[tab.id, tab]]),
    splitForTab: require('../../src/main/split-model').splitForTab,
    pinnedHomeFor: () => null,
    withLocalProfile: (_profile, fn) => fn(), DEFAULT_PROFILE_ID: 'personal',
    startPagePins: { pinState: () => ({ pinned: false, full: false }) },
    shownMuted: () => false, closableTabIds: () => [], explicitSleepEligible: () => false,
    closableBeside: () => [], hostOf: () => null, splitCandidatesFor: () => [], sendTargetsFor: () => null,
    // Move to Space ▸ (#1060): no spaces, and a tab that can't move.
    spaceMoveTargets: () => [], canMoveTabToSpace: () => false,
  };
  vm.runInNewContext(`${splitSource}\n${contextSource}\nthis.context = tabContextData;`, sandbox);
  const menu = () => buildTabContextMenu({ ...sandbox.context(tab, owner), surface: 'row', t: englishT });
  assert.equal(menu().find((item) => item.id === 'glance').enabled, true);
  owner.activeTabId = tab.id;
  assert.equal(menu().find((item) => item.id === 'glance').enabled, true);
  owner.activeTabId = 'main';
  owner.splits[0].tabIds = ['main', 'unrelated'];
  assert.equal(menu().find((item) => item.id === 'glance').enabled, false);
  owner.activeTabId = 'other';
  assert.equal(menu().find((item) => item.id === 'glance').enabled, true);
});

const actionSource = main.match(/async function openTabMenuGlance\(id\) \{[\s\S]*?\n\}/)[0];

test('invalid or unavailable split panes never mutate the split', async () => {
  for (const issue of ['missing', 'sleeping', 'asleep', 'destroyed', 'other-window', 'larger-split', 'non-member']) {
    const runtime = {};
    const tab = { id: 'reference', sleeping: issue === 'sleeping', asleep: issue === 'asleep' };
    const split = { tabIds: ['main', 'reference'] };
    if (issue === 'larger-split') split.tabIds.push('third');
    if (issue === 'non-member') split.tabIds = ['main', 'other'];
    const sandbox = {
      rt: () => runtime, visibleSplitOf: () => split,
      tabs: new Map(issue === 'missing' ? [] : [[tab.id, tab]]),
      liveContents: () => issue === 'destroyed' ? null : {},
      windowRuntimes: { runtimeForTab: () => issue === 'other-window' ? {} : runtime },
      removeTabFromSplit: () => assert.fail(`${issue}: must not change the split`),
      setGlanceTab: () => assert.fail(`${issue}: must not open Glance`),
    };
    vm.runInNewContext(`${actionSource}\nthis.open = openTabMenuGlance;`, sandbox);
    assert.equal(await sandbox.open(tab.id), false, issue);
  }
});

// Run the actual removal and activation paths: the original bug dissolved the
// split before setActiveTab refused its sleeping survivor, then Glance refused
// the still-active selected tab. Stubbing removal would miss that data loss.
const functionSource = (name) => main.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}\\n`))[0];

test('an unavailable survivor leaves the split, tab order and selection intact', async () => {
  const model = require('../../src/main/split-model');
  for (const issue of ['sleeping', 'asleep', 'destroyed', 'missing', 'other-window']) {
    const split = { id: 'split', tabIds: ['selected', 'survivor'], focusedIndex: 0 };
    const runtime = { activeTabId: 'selected', tabOrder: ['selected', 'survivor'], splits: [split] };
    const selected = { id: 'selected', splitId: split.id };
    const survivor = { id: 'survivor', splitId: split.id, sleeping: issue === 'sleeping', asleep: issue === 'asleep' };
    const tabs = new Map([[selected.id, selected], ...(issue === 'missing' ? [] : [[survivor.id, survivor]])]);
    const before = JSON.stringify({ runtime, tabs: [...tabs] });
    let persisted = 0;
    const sandbox = {
      tabs, rt: () => runtime,
      windowRuntimes: { runtimeForTab: (id) => id === survivor.id && issue === 'other-window' ? {} : runtime },
      splitForTab: model.splitForTab, splitWithout: model.removeFromSplit, placeAfterSplit: model.placeAfterSplit,
      withWindowRuntime: (_runtime, fn) => fn(), hasLiveWindow: () => true,
      liveContents: (tab) => tab && !(tab === survivor && issue === 'destroyed') ? {} : null,
      announceSplit: () => {}, mainI18n: { t: () => '' }, displayTitle: () => '',
      broadcastTabs: () => {}, scheduleMenuRebuild: () => {}, persistSession: () => { persisted++; },
      wakeTab: () => false,
    };
    vm.runInNewContext(['visibleSplitOf', 'setActiveTab', 'removeTabFromSplit', 'setGlanceTab', 'openTabMenuGlance']
      .map(functionSource).join('\n'), sandbox);
    assert.equal(await sandbox.openTabMenuGlance(selected.id), false, issue);
    assert.equal(JSON.stringify({ runtime, tabs: [...tabs] }), before, `${issue}: preserve the complete split state`);
    assert.equal(persisted, 0, `${issue}: do not persist a dissolved split`);
  }
});
