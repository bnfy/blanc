'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const mainSource = read('src/main/main.js');
const fnSource = mainSource.match(
  /async function sleepBackgroundTabsNow\(\) \{[\s\S]*?\n\}/
)?.[0];

test('the /sleep helper is still present in main.js', () => {
  assert.ok(fnSource, 'sleepBackgroundTabsNow not found — update this test with it');
});

async function run({
  tabList, activeTabId, prompts = [], snapshotCount = 0, candidates = null, refuse = [],
}) {
  const seen = {};
  const slept = [];
  let broadcasts = 0;
  const sandbox = {
    Date, Set, Map, console,
    isQuitting: false,
    sessionPersistenceSuspended: false,
    startupNavigationGateActive: false,
    net: { isOnline: () => true },
    rt: () => ({
      tabOrder: tabList.map((t) => t.id),
      activeTabId,
      permissionPrompts: new Map(prompts.map((p, i) => [`p${i}`, p])),
    }),
    tabs: new Map(tabList.map((t) => [t.id, t])),
    sleepCandidates: (list, options) => {
      seen.list = list;
      seen.options = options;
      return candidates ?? list.filter((t) => t.id !== activeTabId).map((t) => t.id);
    },
    sleepSnapshots: { size: snapshotCount },
    popupChildCounts: new Map([['t9', 1]]),
    sleepTab: async (id) => {
      if (refuse.includes(id)) return false;
      slept.push(id);
      return true;
    },
    broadcastTabs: () => { broadcasts += 1; },
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = sleepBackgroundTabsNow;`, sandbox);
  const returned = await sandbox.__fn();
  return { seen, slept, broadcasts, returned: [...returned] };
}

test('the manual command bypasses the idle threshold and nothing else', async () => {
  const { seen } = await run({
    tabList: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    activeTabId: 't1',
    snapshotCount: 7,
  });
  assert.equal(seen.options.ignoreThreshold, true);
  assert.equal(seen.options.thresholdMs, null);
  assert.equal(seen.options.activeTabId, 't1');
  assert.equal(seen.options.snapshotCount, 7);
  assert.equal(seen.options.popupChildCounts.get('t9'), 1);
  assert.equal(Number.isFinite(seen.options.now), true);
  assert.deepEqual(seen.list.map((t) => t.id), ['t1', 't2', 't3']);
});

test('pending permission prompts are handed over by tab id', async () => {
  const { seen } = await run({
    tabList: [{ id: 't1' }, { id: 't2' }],
    activeTabId: 't1',
    prompts: [{ resolve() {}, tabId: 't2' }, { resolve() {} }],
  });
  assert.deepEqual([...seen.options.permissionPendingTabIds], ['t2']);
});

test('only tabs that actually went quiet are reported, under one broadcast', async () => {
  const result = await run({
    tabList: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    activeTabId: 't1',
    refuse: ['t3'],
  });
  assert.deepEqual(result.slept, ['t2']);
  assert.deepEqual(result.returned, ['t2']);
  assert.equal(result.broadcasts, 1);
  assert.match(fnSource, /sleepTab\(id, \{ broadcast: false \}\)/,
    'the real sleepTab must not broadcast once per tab before the batch receipt');
});

test('quieting nothing broadcasts nothing', async () => {
  const result = await run({
    tabList: [{ id: 't1' }],
    activeTabId: 't1',
    candidates: [],
  });
  assert.deepEqual(result.returned, []);
  assert.equal(result.broadcasts, 0);
});

test('the /sleep bridge and its IPC channel are wired end to end', () => {
  assert.match(
    read('src/main/preload.js'),
    /sleepBackgroundTabs: \(\) => ipcRenderer\.invoke\('chrome:sleep-background-tabs'\)/
  );
  assert.match(
    mainSource,
    /chromeHandle\('chrome:sleep-background-tabs', \(\) => sleepBackgroundTabsNow\(\)\)/
  );
});

test('/sleep sits at the same index in all four hand-synced copies', () => {
  const json = JSON.parse(read('copy/slash-commands.json'));
  const index = json.commands.findIndex((command) => command.command === '/sleep');
  assert.equal(index, 13, '/sleep must follow /mute and precede /group');
  const entry = json.commands[index];
  assert.equal(entry.hint, 'Quiet background tabs and free their memory');
  assert.equal(entry.doc, undefined);
  assert.doesNotMatch(entry.hint, /'/);

  const overlay = read('src/renderer/overlay.js');
  const overlayCommands = [...overlay.matchAll(/^\s*\{\s*cmd: '([^']+)'/gm)].map((m) => m[1]);
  assert.equal(overlayCommands.indexOf('/sleep'), index);

  const tupleIndex = (source) => {
    const block = source.match(/const SLASH_COMMANDS = \[([\s\S]*?)\];/)[1];
    return [...block.matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]).indexOf('/sleep');
  };
  assert.equal(tupleIndex(read('src/renderer/pages/shortcuts.js')), index);
  assert.equal(tupleIndex(mainSource), index);

  const line = overlay.split('\n').find((candidate) => candidate.includes("cmd: '/sleep'"));
  assert.match(line, /hint: 'Quiet background tabs and free their memory'/);
  assert.match(line, /window\.browserAPI\.sleepBackgroundTabs\(\)/);
  assert.match(line, /keepOverlay: true/);
});
