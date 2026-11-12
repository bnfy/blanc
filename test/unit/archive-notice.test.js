'use strict';

// F52 spec D5 and D6: the onboarding offer and the one-time first-archive
// notice. The pure rule lives in tab-archive.js; the band is overlay.js's own
// archiveNoticeBand, run in a sandbox (lift() fails closed if it is renamed);
// the main.js and pages.js wiring is checked from source, as the /sleep and
// history-clear wiring tests do.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { nextArchiveNotice, cleanArchiveNotice } = require('../../src/main/tab-archive');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---- The rule ----

test('no notice until at least one tab gets an Archive entry', () => {
  assert.equal(nextArchiveNotice(null, 0), null);
  assert.equal(nextArchiveNotice(undefined, 0), null);
  assert.deepEqual(nextArchiveNotice(null, 3), { state: 'pending', count: 3 });
});

test('a pending notice counts every tab archived before it is seen', () => {
  assert.deepEqual(nextArchiveNotice({ state: 'pending', count: 2 }, 1), { state: 'pending', count: 3 });
  assert.deepEqual(nextArchiveNotice({ state: 'pending', count: 2 }, 0), { state: 'pending', count: 2 });
});

test('once dismissed or acted on, the notice never comes back', () => {
  assert.deepEqual(nextArchiveNotice({ state: 'done' }, 5), { state: 'done' });
});

test('a malformed stored notice reads as none', () => {
  for (const bad of [null, 'x', 7, {}, { state: 'pending' }, { state: 'pending', count: 0 },
    { state: 'pending', count: 1.5 }, { state: 'shown', count: 2 }]) {
    assert.equal(cleanArchiveNotice(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(cleanArchiveNotice({ state: 'pending', count: 2, extra: 1 }), { state: 'pending', count: 2 });
  assert.deepEqual(cleanArchiveNotice({ state: 'done', count: 9 }), { state: 'done' });
});

// ---- The ⌘L band ----

const overlay = read('src/renderer/overlay.js');
const lift = (name) => {
  const source = overlay.match(new RegExp(`\\n  function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))?.[0];
  assert.ok(source, `${name} not found in overlay.js`);
  return source;
};

function fakeElement(tag) {
  const listeners = {};
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    children: [],
    attributes: {},
    classList: { add(name) { el.className = `${el.className} ${name}`.trim(); } },
    append(...nodes) { el.children.push(...nodes); },
    setAttribute(name, value) { el.attributes[name] = value; },
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type) { listeners[type]?.({ stopPropagation() {} }); },
  };
  return el;
}

function bandSandbox() {
  const calls = [];
  const context = {
    document: { createElement: fakeElement },
    ICONS: { close: '<svg/>', archive: '<svg/>' },
    blancI18n: { t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) },
    archiveNotice: { count: 3 },
    renderList: () => calls.push(['render']),
    window: {
      browserAPI: {
        closeOverlay: () => calls.push(['close']),
        archiveNoticeDone: (action) => calls.push(['done', action]),
      },
    },
  };
  vm.runInNewContext(`${lift('archiveNoticeBand')}\nthis.api = { archiveNoticeBand };`, context);
  return { band: context.api.archiveNoticeBand({ count: 3 }), calls, context };
}

const descendants = (el) => el.children.flatMap((child) => [child, ...descendants(child)]);
const byClass = (el, name) => descendants(el).find((child) => child.className.split(' ').includes(name));

test('the band names the count and offers View Archive and Dismiss', () => {
  const { band } = bandSandbox();
  assert.match(band.className, /island-group-band/);
  assert.match(band.className, /archive-notice/);
  assert.equal(band.attributes.role, 'status');
  assert.equal(byClass(band, 'row-title').textContent, 'archive.notice.title:{"count":3}');
  assert.equal(byClass(band, 'archive-notice-view').textContent, 'archive.notice.view');
  assert.equal(byClass(band, 'archive-notice-dismiss').attributes['aria-label'], 'archive.notice.dismiss');
});

test('View Archive closes the panel, then tells main the notice was acted on', () => {
  const { band, calls } = bandSandbox();
  byClass(band, 'archive-notice-view').fire('click');
  assert.deepEqual(plain(calls), [['close'], ['done', 'view']]);
});

test('Dismiss tells main and removes the band at once', () => {
  const { band, calls, context } = bandSandbox();
  byClass(band, 'archive-notice-dismiss').fire('click');
  assert.deepEqual(plain(calls), [['done', 'dismiss'], ['render']]);
  assert.equal(context.archiveNotice, null);
});

test('the band sits at the top of the resting tab list, never over a command notice', () => {
  const renderList = overlay.match(/\n {2}function renderList\(\) \{[\s\S]*?\n {2}\}\n/)?.[0];
  assert.ok(renderList, 'renderList not found');
  assert.match(renderList, /if \(commandNotice\) rows\.push\(commandNoticeRow\(commandNotice\)\);\s*else if \(archiveNotice\) rows\.push\(archiveNoticeBand\(archiveNotice\)\);/);
});

test('the panel fetches the notice each time it opens', () => {
  const refresh = overlay.match(/async function refreshSwitcherData\(\) \{[\s\S]*?\n {2}\}\n/)?.[0];
  assert.ok(refresh, 'refreshSwitcherData not found');
  assert.match(refresh, /window\.browserAPI\.archiveNotice\(\)/);
});

// ---- main.js and pages.js wiring ----

const main = read('src/main/main.js');

test('only a sweep that added Archive entries records the notice', () => {
  const pass = main.match(/async function archiveSweepPass\(runtime\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(pass, 'archiveSweepPass not found');
  assert.match(pass, /if \(archived\.length\) archive\.noteArchived\(archived\.length\);\s*return \{ archived, closed, skippedReason: null \};/);
});

test('a private tab sees no notice; View Archive opens the Archived view', () => {
  const get = main.match(/chromeHandle\('chrome:archive-notice', \(\) => [\s\S]*?\n {2}\)\);/)?.[0];
  assert.ok(get, 'chrome:archive-notice handler not found');
  assert.match(get, /\?\.private \? null : archive\.pendingNotice\(\)/);
  const done = main.match(/chromeHandle\('chrome:archive-notice-done', [\s\S]*?\n {2}\}\);/)?.[0];
  assert.ok(done, 'chrome:archive-notice-done handler not found');
  assert.match(done, /archive\.finishNotice\(\)/);
  assert.match(done, /openInternalPage\('blanc:\/\/history\/\?view=archived'\)/);
});

test('onboarding may set Tab Archive only to 7d or off, and only during first run', () => {
  const pages = read('src/main/pages.js');
  const handler = pages.match(/handle\('pages:start:onboarding-set', 'newtab', \(partial\) => \{[\s\S]*?\n {2}\}\);/)?.[0];
  assert.ok(handler, 'onboarding-set handler not found');
  assert.match(handler, /partial\.tabArchive === '7d' \|\| partial\.tabArchive === 'off'/);
  assert.match(handler, /hooks\.startPage\?\.offerTabArchive\?\.\(partial\.tabArchive\)/);
  const hook = main.match(/offerTabArchive: \(value\) => \{[\s\S]*?\n {6}\},/)?.[0];
  assert.ok(hook, 'offerTabArchive hook not found');
  assert.match(hook, /if \(!firstRunPending\(\)\) return false;/);
  assert.match(hook, /settings\.setSettings\(\{ tabArchive: value \}\)/);
});
