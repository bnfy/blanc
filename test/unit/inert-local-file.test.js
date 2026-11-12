'use strict';

// Option C: a DRM (ECS) build keeps restored local-file tabs as records and
// shows an inert placeholder, never loading the file. Official builds keep
// their existing behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const localFiles = require('../../src/main/local-html-files');
const { localFileTabPlan, keepsLocalFile, placeholderUrl, placeholderTarget } = require('../../src/main/inert-local-file');
const { filterRestoredSession } = require('../../src/main/session-restore');
const { persistableUrl, persistableEntries, sessionTabMeta } = require('../../src/main/session-snapshot');
const { pinnedHomeFor, applyPinnedHomes } = require('../../src/main/pinned-home');
const { buildTabEntry } = require('../../src/main/closed-tabs');
const { captureColumns, normalizeWorkspace } = require('../../src/main/workspaces-model');
const { isForbiddenTopLevelUrl } = require('../../src/main/top-level-url-policy');
const { isUtilityUrl } = require('../../src/main/utility-pages');

const ROOT = path.join(__dirname, '../..');

function withTempDir(run) {
  // Canonicalize the way the app does (native realpath expands Windows 8.3
  // short names such as RUNNER~1), or official-build restore rejects it.
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-inert-local-')));
  try { return run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Run `fn` as a DRM build would (record-only restore), then reset. */
function asDrmBuild(fn) {
  localFiles.setLocalFilesRecordOnly(true);
  try { return fn(); } finally { localFiles.setLocalFilesRecordOnly(false); }
}

// main.js's restore drop rule, shared by session restore and Space switches.
const shouldDrop = (url, _index, localFile) => isUtilityUrl(url)
  || (isForbiddenTopLevelUrl(url) && !(localFile && localFiles.restorableLocalHtmlUrl(url)));

/** The fields createTab derives from its plan, plus the restored title. */
function tabFromPlan(url, { drm, allowLocalFile, title = '', pinned = false, groupId = null } = {}) {
  const plan = localFileTabPlan(url, { drm, allowLocalFile });
  let loaded = plan.url;
  if (isForbiddenTopLevelUrl(loaded) && !plan.admitted) loaded = 'blanc://newtab/';
  return {
    id: `t-${Math.random()}`,
    url: loaded,
    title: title || 'Untitled',
    pinned,
    groupId,
    private: false,
    localFile: plan.localFile,
    inertLocalFileUrl: plan.inertLocalFileUrl,
    localFileUrl: plan.localFileUrl,
    inertLocalFileTitle: plan.inertLocalFileUrl ? title : null,
    pinnedHomeUrl: pinned ? pinnedHomeFor(loaded, { localFile: plan.localFile }) : null,
    plan,
  };
}

/** main.js's session capture for one window, reduced to the columns. */
function saveWindow(tabList, activeIndex = 0) {
  const entries = persistableEntries(tabList);
  const byId = new Map(tabList.map((tab) => [tab.id, tab]));
  return {
    urls: entries.map((e) => e.url),
    groupIds: entries.map((e) => e.groupId),
    pinned: entries.map((e) => e.pinned),
    meta: entries.map((e) => sessionTabMeta(byId.get(e.id))),
    ...(entries.some((e) => byId.get(e.id)?.localFile === true)
      ? { localFiles: entries.map((e) => byId.get(e.id)?.localFile === true) } : {}),
    activeIndex,
  };
}

/** Restore one saved window the way releaseStartup does. */
function restoreWindow(saved, { drm }) {
  const cleaned = filterRestoredSession(applyPinnedHomes(saved), shouldDrop);
  return cleaned.urls.map((url, i) => tabFromPlan(url, {
    drm,
    allowLocalFile: cleaned.localFiles?.[i] === true,
    title: cleaned.meta[i]?.title ?? '',
    pinned: cleaned.pinned[i],
    groupId: cleaned.groupIds[i],
  }));
}

test('the plan: official builds admit a granted file, DRM builds never do', () => withTempDir((dir) => {
  const file = path.join(dir, 'notes.html');
  fs.writeFileSync(file, '<h1>notes</h1>');
  const href = pathToFileURL(file).href;

  const official = localFileTabPlan(href, { drm: false, allowLocalFile: true });
  assert.deepEqual(official, { url: href, localFile: true, inertLocalFileUrl: null, localFileUrl: href, admitted: true });

  const drm = localFileTabPlan(href, { drm: true, allowLocalFile: true });
  assert.equal(drm.admitted, false);
  assert.equal(drm.localFile, true);
  assert.equal(drm.inertLocalFileUrl, href);
  assert.equal(drm.url, placeholderUrl(href));
  assert.ok(drm.url.startsWith('blanc://error/?'));
  assert.equal(isForbiddenTopLevelUrl(drm.url), false, 'the placeholder is an internal page, not a file load');
  assert.equal(persistableUrl(drm.url), href, 'saving unwraps the placeholder back to the file URL');
}));

test('the plan: no grant means no record and no load, on either build', () => {
  const href = pathToFileURL(path.resolve('/tmp/typed.html')).href;
  for (const drm of [false, true]) {
    const plan = localFileTabPlan(href, { drm, allowLocalFile: false });
    assert.equal(plan.admitted, false);
    assert.equal(plan.localFile, false);
    assert.equal(plan.inertLocalFileUrl, null);
    assert.equal(plan.url, href, 'createTab then replaces the forbidden URL with a new tab');
    assert.equal(isForbiddenTopLevelUrl(plan.url), true);
  }
  // allowLocalFile must be exactly true, never truthy.
  assert.equal(localFileTabPlan(href, { drm: true, allowLocalFile: 'yes' }).inertLocalFileUrl, null);
});

test('the plan: non-HTML files, remote file hosts and websites are never kept as records', () => {
  for (const url of [
    pathToFileURL(path.resolve('/tmp/secret.txt')).href,
    'file://fileserver/share/page.html',
    'https://example.com/page.html',
  ]) {
    const plan = localFileTabPlan(url, { drm: true, allowLocalFile: true });
    assert.equal(plan.inertLocalFileUrl, null, url);
    assert.equal(plan.localFile, false, url);
    assert.equal(plan.url, url, url);
  }
});

test('only our own placeholder for an HTML file counts as a record', () => {
  const href = pathToFileURL(path.resolve('/tmp/a.html')).href;
  assert.equal(placeholderTarget(placeholderUrl(href)), href);
  assert.equal(placeholderTarget(`blanc://error/?${new URLSearchParams({ url: href, code: '-105' })}`), null);
  assert.equal(placeholderTarget(`blanc://error/?${new URLSearchParams({ url: 'file:///etc/passwd', code: 'local-file' })}`), null);
  assert.equal(placeholderTarget(`blanc://error/?${new URLSearchParams({ url: 'https://example.com/a.html', code: 'local-file' })}`), null);
  assert.equal(placeholderTarget('https://example.com/'), null);
  assert.equal(placeholderTarget(42), null);
});

test('a commit keeps the record only on its own placeholder or a local file', () => {
  const href = pathToFileURL(path.resolve('/tmp/a.html')).href;
  const other = pathToFileURL(path.resolve('/tmp/b.html')).href;
  const tab = { inertLocalFileUrl: href };
  assert.equal(keepsLocalFile(tab, placeholderUrl(href)), true);
  assert.equal(keepsLocalFile(tab, placeholderUrl(other)), false, 'another file\'s placeholder ends the record');
  assert.equal(keepsLocalFile(tab, 'https://example.com/'), false);
  assert.equal(keepsLocalFile(tab, 'blanc://newtab/'), false);
  assert.equal(keepsLocalFile({ inertLocalFileUrl: null }, placeholderUrl(href)), false, 'a placeholder never mints a record');
  assert.equal(keepsLocalFile({}, href), true, 'official builds keep the existing rule');
});

test('restore: DRM builds keep a missing file\'s record; official builds still drop it', () => withTempDir((dir) => {
  const present = path.join(dir, 'present.html');
  fs.writeFileSync(present, '<p>here</p>');
  const presentHref = pathToFileURL(present).href;
  const missingHref = pathToFileURL(path.join(dir, 'gone.html')).href;
  const saved = {
    urls: [presentHref, missingHref, 'https://example.com/'],
    groupIds: [null, null, null],
    pinned: [false, false, false],
    meta: [{ title: 'Present' }, { title: 'Gone' }, { title: 'Example' }],
    localFiles: [true, true, false],
    activeIndex: 0,
  };

  const official = filterRestoredSession(saved, shouldDrop);
  assert.deepEqual(official.urls, [presentHref, 'https://example.com/'], 'official builds: unchanged');

  const drm = asDrmBuild(() => filterRestoredSession(saved, shouldDrop));
  assert.deepEqual(drm.urls, saved.urls, 'DRM builds keep every saved record');
  assert.deepEqual(drm.localFiles, [true, true, false]);
  assert.equal(fs.existsSync(present), true, 'restore never touches the file');
}));

test('restore: a file record without its grant is still dropped on DRM builds', () => {
  const href = pathToFileURL(path.resolve('/tmp/forged.html')).href;
  const drm = asDrmBuild(() => filterRestoredSession({
    urls: [href, 'file:///etc/passwd'], groupIds: [null, null], pinned: [false, false],
    meta: [{}, {}], localFiles: [false, true], activeIndex: 0,
  }, shouldDrop));
  assert.deepEqual(drm.urls, [], 'no grant, or not HTML: dropped as before');
});

test('repeated save and restart cycles on a DRM build keep URL, title, group, pin and order', () => withTempDir((dir) => {
  const file = path.join(dir, 'report.html');
  fs.writeFileSync(file, '<p>report</p>');
  const href = pathToFileURL(file).href;
  const missingHref = pathToFileURL(path.join(dir, 'missing.html')).href;
  const first = {
    urls: ['https://example.com/', href, missingHref],
    groupIds: [null, 'g1', null],
    pinned: [false, false, true],
    meta: [{ title: 'Example' }, { title: 'Quarterly report' }, { title: 'Old notes' }],
    localFiles: [false, true, true],
    activeIndex: 1,
  };

  asDrmBuild(() => {
    let saved = first;
    for (let restart = 0; restart < 5; restart++) {
      const restored = restoreWindow(saved, { drm: true });
      assert.equal(restored.length, 3, `restart ${restart}`);
      for (const tab of restored.slice(1)) {
        assert.ok(tab.url.startsWith('blanc://error/?'), 'shows the placeholder, never the file');
        assert.equal(tab.plan.admitted, false);
        assert.equal(tab.localFile, true);
      }
      saved = saveWindow(restored, 1);
      assert.deepEqual(saved.urls, first.urls, `restart ${restart}: URLs survive`);
      assert.deepEqual(saved.groupIds, first.groupIds);
      assert.deepEqual(saved.pinned, first.pinned);
      assert.deepEqual(saved.localFiles, first.localFiles);
      assert.deepEqual(saved.meta.map((m) => m.title), ['Example', 'Quarterly report', 'Old notes'],
        'the placeholder\'s own title never replaces the saved one');
    }
  });

  // The file was never read, moved or deleted.
  assert.equal(fs.readFileSync(file, 'utf8'), '<p>report</p>');
  // An official build later restores and loads the present file again.
  const official = restoreWindow(first, { drm: false });
  assert.equal(official[1].url, href);
  assert.equal(official[1].plan.admitted, true);
}));

test('a changed file keeps its record and is still not loaded', () => withTempDir((dir) => {
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, 'v1');
  const href = pathToFileURL(file).href;
  const saved = { urls: [href], groupIds: [null], pinned: [false], meta: [{ title: 'Page' }], localFiles: [true], activeIndex: 0 };
  fs.writeFileSync(file, 'v2 changed');
  const restored = asDrmBuild(() => restoreWindow(saved, { drm: true }));
  assert.equal(restored[0].url, placeholderUrl(href));
  fs.rmSync(file);
  const again = asDrmBuild(() => restoreWindow(saveWindow(restored), { drm: true }));
  assert.equal(again[0].url, placeholderUrl(href), 'deleted afterwards: record kept, placeholder shown');
}));

test('Spaces: capture, normalize and switch keep an inert record on DRM builds', () => withTempDir((dir) => {
  const href = pathToFileURL(path.join(dir, 'space.html')).href; // never created: missing
  asDrmBuild(() => {
    const tab = tabFromPlan(href, { drm: true, allowLocalFile: true, title: 'Space doc', groupId: 'g' });
    const capture = saveWindow([tab, tabFromPlan('https://example.com/', { drm: true, title: 'Ex' })]);
    const record = normalizeWorkspace({ id: 'w1', name: 'Work', profileId: 'default', ...captureColumns(capture) });
    assert.ok(record, 'the Space record is valid');
    assert.deepEqual(record.urls, [href, 'https://example.com/']);
    assert.deepEqual(record.localFiles, [true, false]);
    assert.equal(record.meta[0].title, 'Space doc');
    const cleaned = filterRestoredSession(record, shouldDrop);
    assert.deepEqual(cleaned.urls, record.urls, 'switching to the Space keeps the record');
    const reopened = tabFromPlan(cleaned.urls[0], { drm: true, allowLocalFile: cleaned.localFiles[0] === true });
    assert.equal(reopened.url, placeholderUrl(href));
  });
}));

test('pinned homes: a local-file home survives restore and saves on DRM builds, even when missing', () => withTempDir((dir) => {
  const homeHref = pathToFileURL(path.join(dir, 'home.html')).href; // missing
  asDrmBuild(() => {
    assert.equal(pinnedHomeFor(homeHref, { localFile: true }), homeHref);
    assert.equal(pinnedHomeFor(placeholderUrl(homeHref), { localFile: true }), homeHref, 'from the placeholder');
    assert.equal(pinnedHomeFor(homeHref, { localFile: false }), null, 'no grant, no home');
    const tab = tabFromPlan(homeHref, { drm: true, allowLocalFile: true, title: 'Home', pinned: true });
    assert.equal(tab.pinnedHomeUrl, homeHref);
    const meta = sessionTabMeta(tab);
    assert.equal(meta.pinnedHomeUrl, homeHref);
    assert.equal(meta.title, 'Home');
  });
  assert.equal(pinnedHomeFor(homeHref, { localFile: true }), null, 'official builds: a missing home is dropped as before');
}));

test('Reopen Closed Tab: the entry keeps the record and reopens as the placeholder without history', () => withTempDir((dir) => {
  const href = pathToFileURL(path.join(dir, 'closed.html')).href;
  asDrmBuild(() => {
    const tab = { ...tabFromPlan(href, { drm: true, allowLocalFile: true, title: 'Closed doc', pinned: true }),
      title: 'This local file can’t open in this version of Blanc' };
    const entry = buildTabEntry(tab, { entries: [{ url: href }], index: 0 }, { index: 0 }, 1);
    assert.equal(entry.localFile, true);
    assert.equal(entry.url, placeholderUrl(href));
    assert.equal(entry.title, 'Closed doc', 'Recently closed shows the saved title, not the placeholder\'s');
    assert.equal(entry.pinnedHomeUrl, href);
    const plan = localFileTabPlan(entry.url, { drm: true, allowLocalFile: entry.localFile === true });
    assert.equal(plan.url, placeholderUrl(href));
    assert.equal(plan.inertLocalFileUrl, href);
    assert.equal(plan.admitted, false);
  });
}));

test('createTab wiring: DRM plan first, forbidden URLs never loaded, inert tabs get no history', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  const body = source.match(/function createTab\(url = newTabUrl\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(body);
  const order = [
    'localFileTabPlan(url, { drm: drmSupport.enabled, allowLocalFile })',
    'url = localPlan.url;',
    'if (localPlan.inertLocalFileUrl) restoreHistory = null;',
    'if (isForbiddenTopLevelUrl(url) && !admittedLocalFile) url = NEW_TAB_URL;',
  ].map((needle) => { const at = body.indexOf(needle); assert.ok(at >= 0, needle); return at; });
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(source, /setLocalFilesRecordOnly\(drmSupport\.enabled\)/);
  assert.match(source, /if \(!keepsLocalFile\(tab, url\)\) \{\s*tab\.localFile = false;\s*tab\.localFileUrl = null;\s*tab\.inertLocalFileUrl = null;/);
  assert.match(source, /localFileUrl: localPlan\.localFileUrl,/);
});

test('untrusted file: navigation is still refused in tabs and by the policy', () => {
  for (const url of ['file:///etc/passwd', pathToFileURL(path.resolve('/tmp/page.html')).href, 'FILE:///tmp/x.html']) {
    assert.equal(isForbiddenTopLevelUrl(url), true, url);
  }
  const tabView = fs.readFileSync(path.join(ROOT, 'src/main/tab-view.js'), 'utf8');
  const guard = tabView.match(/wc\.on\('will-navigate'[\s\S]*?\n {2}\}\)\);/)?.[0];
  assert.ok(guard);
  assert.match(guard, /if \(isForbiddenTopLevelUrl\(targetUrl\)\) \{\s*event\.preventDefault\(\);/);
  // A page cannot forge a record: the placeholder never admits a file load.
  const href = pathToFileURL(path.resolve('/tmp/page.html')).href;
  const forged = localFileTabPlan(placeholderUrl(href), { drm: false, allowLocalFile: false });
  assert.equal(forged.admitted, false);
  assert.equal(forged.inertLocalFileUrl, null);
});

function runErrorPage(query) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, { id, hidden: id === 'blockingSettingsLink', textContent: '', href: 'blanc://newtab/', dataset: {} });
    return elements.get(id);
  };
  const sandbox = {
    location: { href: `blanc://error/?${query}` },
    URL,
    blancI18n: { t: (key) => `[${key}]`, formatLocale: () => 'en' },
    document: { getElementById: el, querySelector: () => null, addEventListener() {} },
    window: {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/renderer/pages/error.js'), 'utf8'), sandbox);
  return el;
}

test('the placeholder page explains and offers no way to load the file', () => {
  const href = pathToFileURL(path.resolve('/tmp/page.html')).href;
  const el = runErrorPage(new URL(placeholderUrl(href)).search.slice(1));
  assert.equal(el('errorTitle').textContent, '[error.localFile.title]');
  assert.equal(el('errorDetail').textContent, '[error.localFile.detail]');
  assert.equal(el('errorUrl').textContent, href);
  assert.equal(el('retryLink').hidden, true);
  assert.equal(el('retryLink').href, 'blanc://newtab/', 'never re-linked to the file');

  const failed = runErrorPage(new URLSearchParams({ url: 'https://example.com/', code: '-105' }).toString());
  assert.equal(failed('retryLink').href, 'https://example.com/', 'ordinary failures keep Try again');
  assert.notEqual(failed('retryLink').hidden, true);
});

// ─── Multi-tab close/reopen and quiet wake, driven through main.js's own
// functions with fake views (audit of b5687352f). ──────────────────────────
const { buildGroupEntry, buildSplitEntry, buildBatchEntry, sanitizeSnapshot } = require('../../src/main/closed-tabs');
const { trimSnapshot } = require('../../src/main/tab-sleep');
const { isInertRecord, recordTitle } = require('../../src/main/inert-local-file');

const MAIN_SOURCE = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');

/** One top-level function of main.js, by name. */
function lift(name) {
  const start = MAIN_SOURCE.search(new RegExp(`\\n(async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const end = MAIN_SOURCE.indexOf('\n}\n', start);
  return MAIN_SOURCE.slice(start, end + 2);
}

const PLACEHOLDER_TITLE = 'This local file can’t open in this version of Blanc';

/** A live inert tab as createTab leaves it once its placeholder has loaded. */
function liveInertTab(id, href, savedTitle) {
  const tab = tabFromPlan(href, { drm: true, allowLocalFile: true, title: savedTitle });
  // page-title-updated now keeps the saved title on screen.
  tab.title = recordTitle(tab, PLACEHOLDER_TITLE);
  return { ...tab, id };
}

function fakeNav(urls) {
  return { getAllEntries: () => urls.map((url) => ({ url, title: url })), getActiveIndex: () => urls.length - 1 };
}

test('the placeholder page never replaces an inert tab\'s title on screen', () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const tab = liveInertTab('a', href, 'Quarterly report');
  assert.equal(tab.title, 'Quarterly report');
  assert.equal(recordTitle({ inertLocalFileUrl: null }, PLACEHOLDER_TITLE), PLACEHOLDER_TITLE, 'ordinary tabs take the page title');
  assert.equal(recordTitle({ inertLocalFileUrl: href, inertLocalFileTitle: '' }, PLACEHOLDER_TITLE), PLACEHOLDER_TITLE, 'no saved title: the page\'s');
  const tabView = fs.readFileSync(path.join(ROOT, 'src/main/tab-view.js'), 'utf8');
  assert.match(tabView, /wc\.on\('page-title-updated'[\s\S]*?tab\.title = recordTitle\(tab, title\);/);
});

test('group, split and batch closes keep each inert member\'s saved title', () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const tabs = new Map();
  const inert = liveInertTab('inert', href, 'Quarterly report');
  // The worst case: the placeholder's title reached the record anyway.
  inert.title = PLACEHOLDER_TITLE;
  tabs.set('inert', inert);
  tabs.set('web', { id: 'web', url: 'https://example.com/', title: 'Example', localFile: false, inertLocalFileUrl: null });
  const sandbox = {
    tabs, sleepSnapshots: new Map(),
    liveContents: (tab) => ({ navigationHistory: fakeNav([tab.url]) }),
    trimSnapshot, sanitizeSnapshot, recordTitle,
  };
  vm.runInNewContext(`${lift('closedMemberRecord')}\nthis.capture = closedMemberRecord;`, sandbox);
  const members = ['inert', 'web'].map((id) => sandbox.capture(id));
  assert.equal(members[0].title, 'Quarterly report');
  assert.equal(members[1].title, 'Example');
  const entries = [
    buildGroupEntry({ id: 'g', name: 'Work' }, members, 1),
    buildSplitEntry({ layout: null, focusedIndex: 0, index: 0, groupId: null }, members, 1),
    buildBatchEntry(members, 1),
  ];
  for (const entry of entries) {
    assert.deepEqual(entry.tabs.map((m) => m.title), ['Quarterly report', 'Example'], entry.kind);
    assert.equal(entry.tabs[0].localFile, true, entry.kind);
    assert.equal(entry.tabs[0].url, placeholderUrl(href), entry.kind);
  }
});

/** Run one of main.js's reopen functions against a DRM createTab. */
function reopenThrough(name, entry) {
  const tabs = new Map();
  const created = [];
  let next = 0;
  const runtime = { groups: [], tabOrder: [], splits: [] };
  const sandbox = {
    tabs, sleepSnapshots: new Map(), isInertRecord,
    rt: () => runtime,
    createTab: (url, options) => {
      const id = `t${next++}`;
      const tab = { ...tabFromPlan(url, { drm: true, allowLocalFile: options.allowLocalFile, title: options.title }), id, asleep: options.asleep };
      tabs.set(id, tab);
      created.push({ id, url: tab.url, title: options.title });
      return id;
    },
    sameGroupName: (a, b) => a.toLowerCase() === b.toLowerCase(),
    groupRecord: (g) => ({ id: g.id, name: g.name }),
    itemsOf: () => [], tabLayoutList: () => [], layoutItems: (items) => items,
    setActiveTab() {}, broadcastTabs() {}, scheduleMenuRebuild() {}, syncTabLayout() {},
    createSplitFromTabs() {}, splitForTab: () => null,
  };
  vm.runInNewContext(`${lift(name)}\nthis.reopen = ${name};`, sandbox);
  sandbox.reopen(entry);
  return { tabs, created, snapshots: sandbox.sleepSnapshots };
}

test('group, split and batch reopening never seed history for an inert record', () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const history = { entries: [{ url: href, title: 'Quarterly report' }, { url: 'https://example.com/a' }], index: 0 };
  const members = [
    { url: placeholderUrl(href), localFile: true, title: 'Quarterly report', pinned: false, muted: false, snapshot: history },
    { url: 'https://example.com/', localFile: false, title: 'Example', pinned: false, muted: false,
      snapshot: { entries: [{ url: 'https://example.com/' }], index: 0 } },
  ];
  const routes = {
    reopenGroupEntry: { group: { id: 'g', name: 'Work', index: 0 }, activeMemberIndex: 0, tabs: members },
    reopenSplitEntry: { split: { layout: null, focusedIndex: 0, index: 0, groupId: null }, tabs: members },
    reopenBatchEntry: { tabs: members },
  };
  for (const [name, entry] of Object.entries(routes)) {
    const { tabs, created, snapshots } = reopenThrough(name, entry);
    assert.equal(created.length, 2, name);
    const [inertId, webId] = created.map((c) => c.id);
    assert.equal(tabs.get(inertId).url, placeholderUrl(href), `${name}: placeholder`);
    assert.equal(tabs.get(inertId).inertLocalFileUrl, href, `${name}: still a record`);
    assert.equal(created[0].title, 'Quarterly report', `${name}: saved title`);
    assert.equal(snapshots.has(inertId), false, `${name}: no history for the record`);
    assert.equal(snapshots.has(webId), true, `${name}: ordinary members keep theirs (control)`);
  }
});

/** Run main.js's wakeTab against a fake view and record what it loads. */
async function wakeThrough(tab, stored, options = {}) {
  const calls = [];
  const wc = {
    id: 7,
    isDestroyed: () => false,
    setAudioMuted() {}, setWebRTCIPHandlingPolicy() {},
    loadURL: (url) => { calls.push(['loadURL', url]); return Promise.resolve(); },
    reload: () => { calls.push(['reload']); },
    navigationHistory: {
      restore: (value) => { calls.push(['restore', value]); return Promise.resolve(); },
      goToIndex: (index) => { calls.push(['goToIndex', index]); },
    },
  };
  const tabs = new Map([[tab.id, tab]]);
  const sleepSnapshots = new Map(stored ? [[tab.id, stored]] : []);
  if (stored && options.retained) stored.view = { webContents: wc };
  const sandbox = {
    tabs, sleepSnapshots, isInertRecord,
    windowRuntimes: { runtimeForTab: () => ({}) }, primaryRuntime: {},
    startupNavigationGateActive: false, pendingWakes: new Set(),
    liveContents: () => wc,
    createTabView: () => ({ webContents: wc }),
    primeTabLoadingBackground() {}, wireTabView() {}, rootManagedExtensionView() {},
    watchUblockPopupOutsideContents() {}, tabIdByWebContentsId: new Map(),
    effectiveTabMuted: () => false, webrtcPolicyFor: () => 'default',
    settings: { getSettings: () => ({ webrtcPolicy: 'default' }) },
    waitForRetainedNavigation: (_wc, action) => { action(); return Promise.resolve(); },
    commitWake: () => true, failWake: () => false,
  };
  vm.runInNewContext(`${lift('wakeTab')}\nthis.wake = wakeTab;`, sandbox);
  await sandbox.wake(tab.id, options.atIndex === undefined ? {} : { atIndex: options.atIndex });
  return calls;
}

test('waking an inert record loads only its placeholder, never stored history', async () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const stored = () => ({ view: null, entries: [{ url: href }, { url: 'https://example.com/' }], index: 1 });
  const inert = () => ({ ...tabFromPlan(href, { drm: true, allowLocalFile: true, title: 'Q' }), id: 'i', asleep: true, waking: false, wakeGeneration: 0 });

  assert.deepEqual(await wakeThrough(inert(), stored()), [['loadURL', placeholderUrl(href)]]);
  assert.deepEqual(await wakeThrough(inert(), stored(), { atIndex: 0 }), [['loadURL', placeholderUrl(href)]], 'back/forward too');
  assert.deepEqual(await wakeThrough(inert(), stored(), { retained: true, atIndex: 0 }), [['reload']], 'a retained view only reloads');

  // Control: an ordinary quiet tab still restores its history.
  const web = { id: 'w', url: 'https://example.com/', asleep: true, waking: false, wakeGeneration: 0, inertLocalFileUrl: null };
  const calls = await wakeThrough(web, stored());
  assert.equal(calls[0][0], 'restore');
});

// ─── Single-tab Reopen Closed Tab through main.js's own reopenEntry
// (audit of 064751878). ────────────────────────────────────────────────────
/** Run reopenEntry; createTab models the DRM plan and, when adopting, the
 * adoption block's title line exactly as main.js writes it. */
function reopenSingle(entry, { held = false } = {}) {
  const tabs = new Map();
  const calls = [];
  const placeholderWc = { isDestroyed: () => false, getTitle: () => PLACEHOLDER_TITLE, getURL: () => entry.url };
  if (held) { entry.view = { webContents: placeholderWc }; entry.wcId = 3; }
  const adoptionLine = MAIN_SOURCE.match(/ {4}tab\.title = recordTitle\(tab, wc\.getTitle\(\) \|\| tab\.title\);/)?.[0];
  assert.ok(adoptionLine, 'adoption applies the record title rule');
  const sandbox = {
    tabs, recordTitle, heldWebContents: new Set([3]),
    rt: () => ({ groups: [], profileId: 'default' }),
    restorableUblockTool: () => false,
    removeHeldFirewall() {}, downgradeHeldEntry() {}, finishReopen() {},
    reopenGroupEntry() {}, reopenBatchEntry() {}, reopenSplitEntry() {},
    clearTimeout() {},
    createTab: (url, options) => {
      calls.push(options);
      const tab = { ...tabFromPlan(url, { drm: true, allowLocalFile: options.allowLocalFile, title: options.title ?? '' }), id: 'r' };
      if (!options.title) tab.title = 'Untitled';
      if (options.adoptView) {
        const wc = options.adoptView.webContents;
        vm.runInNewContext(adoptionLine, { tab, wc, recordTitle });
      }
      tabs.set('r', tab);
      return 'r';
    },
  };
  vm.runInNewContext(`${lift('reopenEntry')}\nthis.reopen = reopenEntry;`, sandbox);
  sandbox.reopen(entry);
  return { tab: tabs.get('r'), options: calls[0] };
}

function closedInertEntry(href) {
  const live = liveInertTab('c', href, 'Quarterly report');
  return buildTabEntry(live, { entries: [{ url: href }], index: 0 }, { index: 0 }, 1);
}

test('Reopen Closed Tab after the held view expires keeps the saved title on screen and on save', () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const { tab, options } = reopenSingle(closedInertEntry(href));
  assert.equal(options.title, 'Quarterly report');
  // reopenEntry hands over the snapshot; createTab drops it for a record
  // (pinned by the createTab wiring test above).
  assert.equal(tab.plan.inertLocalFileUrl, href);
  assert.equal(tab.url, placeholderUrl(href));
  assert.equal(tab.title, 'Quarterly report');
  assert.equal(sessionTabMeta(tab).title, 'Quarterly report', 'the next save keeps it');
  assert.equal(persistableUrl(tab.url), href);

  // Control: an ordinary tab still takes its title from its page.
  const web = buildTabEntry({ url: 'https://example.com/', title: 'Example', localFile: false }, null, { index: 0 }, 1);
  assert.equal(reopenSingle(web).options.title, undefined);
});

test('Reopen Closed Tab while the held view survives keeps the saved title on screen', () => {
  const href = pathToFileURL(path.resolve('/tmp/q.html')).href;
  const { tab, options } = reopenSingle(closedInertEntry(href), { held: true });
  assert.ok(options.adoptView, 'the held view is adopted');
  assert.equal(options.title, 'Quarterly report');
  assert.equal(tab.title, 'Quarterly report', 'not the placeholder page\'s title');
  assert.equal(sessionTabMeta(tab).title, 'Quarterly report');

  // Control: an adopted ordinary page shows its own title.
  const plain = { inertLocalFileUrl: null, title: 'Old' };
  vm.runInNewContext('tab.title = recordTitle(tab, wc.getTitle() || tab.title);', { tab: plain, wc: { getTitle: () => 'Fresh' }, recordTitle });
  assert.equal(plain.title, 'Fresh');
});

// ─── A local-file record that is also a page-opened tab (document-policy.js):
// both placeholders apply to the same tab (audit of 714a50145). ──────────────
const documentPolicy = require('../../src/main/document-policy');
const { keepsLocalFile: keeps } = require('../../src/main/inert-local-file');

/** main.js's commit handler, with its non-record side effects stubbed. */
function commitThrough(tab, url) {
  const sandbox = {
    keepsLocalFile: keeps, isSupportedLocalHtmlUrl: localFiles.isSupportedLocalHtmlUrl, URL,
    refreshSiteMute() {}, clearCaptureState() {}, liveContents: () => null, lastMainFrameMethod: new Map(),
  };
  vm.runInNewContext(`${lift('onMainFrameCommit')}\nthis.commit = onMainFrameCommit;`, sandbox);
  tab.url = url; // tab-view's syncNavState runs first, so the old address is gone
  sandbox.commit(tab, { url, httpResponseCode: 200 });
}

/** main.js's wakeTab with a fake view; each load commits through the handler. */
async function wakeAndCommit(tab) {
  const loads = [];
  const wc = {
    id: 9, isDestroyed: () => false, setAudioMuted() {}, setWebRTCIPHandlingPolicy() {},
    loadURL: (url) => { loads.push(url); commitThrough(tab, url); return Promise.resolve(); },
    reload() {}, navigationHistory: { restore: () => { throw new Error('history replay'); }, goToIndex() {} },
  };
  const sandbox = {
    tabs: new Map([[tab.id, tab]]), sleepSnapshots: new Map(), isInertRecord, documentPolicy, persistableUrl,
    windowRuntimes: { runtimeForTab: () => ({}) }, primaryRuntime: {},
    startupNavigationGateActive: false, pendingWakes: new Set(),
    liveContents: () => null, createTabView: () => ({ webContents: wc }),
    primeTabLoadingBackground() {}, wireTabView() {}, rootManagedExtensionView() {},
    watchUblockPopupOutsideContents() {}, tabIdByWebContentsId: new Map(),
    effectiveTabMuted: () => false, webrtcPolicyFor: () => 'default',
    settings: { getSettings: () => ({ webrtcPolicy: 'default' }) },
    waitForRetainedNavigation: (_wc, action) => { action(); return Promise.resolve(); },
    commitWake: () => true, failWake: () => false,
  };
  vm.runInNewContext(`${lift('wakeTab')}\nthis.wake = wakeTab;`, sandbox);
  await sandbox.wake(tab.id);
  return loads;
}

test('a page-opened local-file record survives wake, save and restart under every marker', async () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-inert-policy-')));
  try {
    const file = path.join(dir, 'report.html');
    fs.writeFileSync(file, '<p>report</p>');
    const href = pathToFileURL(file).href;
    for (const drm of [true, false]) {
      for (const marker of [false, null, true]) {
        const label = `${drm ? 'DRM' : 'official'}, marker ${marker}`;
        let saved = {
          urls: [href], groupIds: [null], pinned: [false], meta: [{ title: 'Quarterly report' }],
          localFiles: [true], documentPolicy: 1, inheritsDocumentPolicy: [marker], activeIndex: 0,
        };
        const run = async () => {
          for (let restart = 0; restart < 3; restart++) {
            const cleaned = filterRestoredSession(saved, shouldDrop);
            assert.deepEqual(cleaned.urls, [href], `${label}, restart ${restart}: restored`);
            const tab = {
              ...tabFromPlan(cleaned.urls[0], { drm, allowLocalFile: cleaned.localFiles[0] === true, title: 'Quarterly report' }),
              id: 'p', asleep: true, waking: false, wakeGeneration: 0,
              inheritsDocumentPolicy: documentPolicy.restoredMarker(saved, 0),
            };
            const loads = await wakeAndCommit(tab);
            const marked = marker !== false;
            if (marked) assert.ok(documentPolicy.isInertPageUrl(loads[0]), `${label}: explanation page`);
            assert.ok(loads.every((url) => !url.startsWith('file:') || !drm), `${label}: DRM never loads the file`);
            if (marked) assert.ok(loads.every((url) => !url.startsWith('file:')), `${label}: inert never loads the file`);
            assert.equal(tab.localFile, true, `${label}, restart ${restart}: grant kept`);
            saved = { ...saveWindow([tab]), ...documentPolicy.stampedColumn([tab]) };
            assert.deepEqual(saved.urls, [href], `${label}: file URL saved`);
            assert.deepEqual(saved.localFiles, [true], `${label}: marker for the grant saved`);
            if (drm) assert.equal(saved.meta[0].title, 'Quarterly report', `${label}: saved title`);
          }
        };
        if (drm) await (async () => { localFiles.setLocalFilesRecordOnly(true); try { await run(); } finally { localFiles.setLocalFilesRecordOnly(false); } })();
        else await run();
      }
    }
    assert.equal(fs.readFileSync(file, 'utf8'), '<p>report</p>');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an explanation page for any other address still ends the grant', () => {
  const href = pathToFileURL(path.resolve('/tmp/a.html')).href;
  const other = pathToFileURL(path.resolve('/tmp/b.html')).href;
  for (const base of [{ localFileUrl: href }, { inertLocalFileUrl: href }]) {
    assert.equal(keeps(base, documentPolicy.inertPageUrl(href, 'A')), true);
    assert.equal(keeps(base, documentPolicy.inertPageUrl(other, 'B')), false, 'another file');
    assert.equal(keeps(base, documentPolicy.inertPageUrl('https://example.com/', 'E')), false, 'a website');
    assert.equal(keeps(base, `blanc://error/?${new URLSearchParams({ url: href, code: '-105' })}`), false, 'an ordinary error page');
    assert.equal(keeps(base, `blanc://error@newtab/?kind=inert&url=${encodeURIComponent(href)}`), false, 'a look-alike');
  }
  assert.equal(keeps({ localFileUrl: null }, documentPolicy.inertPageUrl(href, 'A')), false, 'no grant, no record');
  assert.equal(keeps({}, documentPolicy.inertPageUrl(href, 'A')), false);
  // The explanation page is an internal page, never a file load.
  assert.equal(isForbiddenTopLevelUrl(documentPolicy.inertPageUrl(href, 'A')), false);
});
