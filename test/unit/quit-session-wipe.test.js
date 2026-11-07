'use strict';
// F57-15: a Shared Space pass that finishes while Blanc quits, or while the
// last Windows/Linux window is held for its quit, must not rewrite
// session.json. Every window is marked closing by then, so the write saved one
// empty entry over the session, and nothing repaired it before the process
// ended. The macOS primary closed to the Dock keeps its tabs and its place in
// the session through any other window's or set-aside Space's save.
//
// These run main.js's own sharedRuntimeSync wiring and flushWorkspaceSession
// against the real session shape, with no timers or network: the order of
// events is set by hand, exactly as the traces recorded it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../../src/main/shared-spaces-model');
const { createRuntimeSync } = require('../../src/main/shared-spaces-runtime');
const { buildSaveShape, loadWorkspace, PRIMARY_WINDOW_ID } = require('../../src/main/session-workspace');
const { savesSessionEntry } = require('../../src/main/window-state-persistence');
const { createDockReopenLifecycle } = require('../../src/main/dock-reopen');
const { DEFAULT_PROFILE_ID } = require('../../src/main/local-profile-model');

const source = fs.readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
function lift(pattern, what) {
  const found = source.match(pattern)?.[0];
  assert.ok(found, `main.js needs ${what}`);
  return found;
}
const wiring = lift(/const sharedRuntimeSync=createRuntimeSync\(\{[\s\S]*?\n\}\);/, 'its sharedRuntimeSync wiring');
const flushSource = lift(/function flushWorkspaceSession\(\{ excludeRuntime = null \} = \{\}\) \{[\s\S]*?\n\}/, 'flushWorkspaceSession');
const adopt = lift(/function adoptSharedGroupIds\(runtime,bindings\) \{[\s\S]*?\n\}/, 'adoptSharedGroupIds');
// Optional so that, run against code without it, the tests fail on what the
// session holds rather than on a missing name; the wiring needs it if it uses it.
const halted = source.match(/function sharedSpaceWorkHalted\(runtime\) \{[\s\S]*?\n\}/)?.[0] ?? '';

const hex = (n) => n.toString(16).padStart(32, '0');
const sid = hex(99);
const field = (v) => ({ v, c: 100, by: 'peer' });
const record = (n, left = '') => ({
  nav: field({ url: `https://example.test/${n}`, title: `T${n}` }), name: field(null), pinned: field(false),
  groupId: field(null), pos: field(model.keyFor(left, '', hex(n))), deleted: field(false),
});

function harness({ applyRow = () => true, remote = null } = {}) {
  const one = record(1), two = record(2, one.pos.v);
  const blob = { v: 1, spaceId: sid, groups: {}, tabs: { [hex(1)]: one, [hex(2)]: two } };
  // What the Space's download brought: nothing new, unless a test says so.
  const incoming = remote ? model.mergeBlob(blob, remote) : blob;
  const tabs = new Map();
  const runtimes = [];
  const runtime = (id, urls, extra = {}) => {
    const r = { id, profileId: DEFAULT_PROFILE_ID, tabOrder: [], groups: [], activeTabId: null, window: {}, closing: false, ...extra };
    urls.forEach((url, i) => {
      const tab = { id: `${id}-${i}`, url, title: url, groupId: null, sharedTabId: extra.workspaceId ? hex(i + 1) : undefined };
      tabs.set(tab.id, tab); r.tabOrder.push(tab.id);
    });
    r.activeTabId = r.tabOrder[0] ?? null;
    runtimes.push(r);
    return r;
  };
  // The primary holds ordinary tabs; a second window shows the shared Work Space.
  const primary = runtime(PRIMARY_WINDOW_ID, ['https://scratch.test/a', 'https://scratch.test/b']);
  const work = runtime('work-window', [one.nav.v.url, two.nav.v.url], { workspaceId: 'work' });
  const sharedStore = { data: { windows: { [`work-window:${sid}`]: { spaceId: sid, displayed: structuredClone(blob), accepted: [], groupBindings: {} } } } };
  const captureWindowEntry = (r) => ({
    id: r.id, profileId: r.profileId, workspaceId: r.workspaceId ?? null,
    urls: r.tabOrder.map((id) => tabs.get(id).url), groupIds: r.tabOrder.map(() => null),
    pinned: r.tabOrder.map(() => false), meta: r.tabOrder.map((id) => ({ title: tabs.get(id).title, favicon: null })),
    groups: [], activeIndex: 0,
  });
  const session = { data: {}, writes: 0 };
  Object.assign(session.data, buildSaveShape(runtimes.map((r) => captureWindowEntry(r)), {}, { activeWindowId: PRIMARY_WINDOW_ID }));
  const sandbox = {
    createRuntimeSync, sharedSpaceModel: model, tabs, NEW_TAB_URL: 'blanc://newtab/', PRIMARY_WINDOW_ID,
    isQuitting: false, sessionHeldForQuit: false, sessionReadOnly: false, focusedRuntime: primary,
    windowRuntimes: { all: () => [...runtimes] },
    ensureSessionStore: () => ({ updateAndFlush: (fn) => { fn(session.data); session.writes += 1; return true; } }),
    loadWorkspace, buildSaveShape, savesSessionEntry, captureWindowEntry,
    sharedSpaceRuntimeContext: (r) => (r.workspaceId ? {
      spaceId: sid, accountId: 'a', deviceId: 'desktop', blob: incoming,
      window: Object.values(sharedStore.data.windows).find((w) => w.spaceId === sid),
      protectedIds: [], ctx: {},
      store: { data: sharedStore.data, update: (fn) => fn(sharedStore.data), flush: () => true },
    } : null),
    withWindowRuntime: (_r, fn) => fn(),
    workspaceCapture: (r) => ({ ...captureWindowEntry(r), tabIds: r.tabOrder.map((id) => tabs.get(id).sharedTabId ?? null) }),
    namedWorkspaces: { saveCapture: () => ({ ok: true }) },
    persistableEntries: (list) => list.filter(Boolean).map((t) => ({ id: t.id })),
    sharedSpaceState: { noteLocalSpace: () => {} },
    applySharedSpaceRow: applyRow, syncTabLayout: () => {}, createTab: () => null,
    selectSharedLayoutFallback: () => {}, scheduleBroadcastTabs: () => {},
  };
  vm.runInNewContext(`${adopt}\n${halted}\n${flushSource}\n${wiring}\nthis.sync=sharedRuntimeSync;this.flush=flushWorkspaceSession;`, sandbox);
  const saved = () => loadWorkspace(session.data).windows.map((entry) => ({ id: entry.id, urls: entry.urls, workspaceId: entry.workspaceId }));
  // Results cross from the sandbox's realm; compare them as plain data.
  const flush = () => JSON.parse(JSON.stringify(sandbox.flush()));
  return { sandbox, flush, primary, work, runtimes, tabs, session, saved, before: saved() };
}

test('a Shared Space pass that lands during a quit leaves session.json as the quit found it', async () => {
  const h = harness();
  // before-quit sets isQuitting and starts the last sync; then every window
  // closes, and only then does the Space's download return and notify.
  h.sandbox.isQuitting = true;
  for (const r of h.runtimes) r.closing = true;
  const writes = h.session.writes;
  await h.sandbox.sync.apply(h.work);
  assert.deepEqual(h.saved(), h.before, 'every window and its tabs are still saved for the next launch');
  assert.equal(h.session.writes, writes, 'the quit writes nothing to session.json');
});

test('a pass queued before the quit stops at its next step instead of saving', async () => {
  // The pass is already running when the quit begins: its row's native work
  // resolves only after before-quit and the window closes.
  let release;
  const h = harness({
    applyRow: () => new Promise((resolve) => { release = resolve; }),
    remote: { v: 1, spaceId: sid, groups: {}, tabs: { [hex(1)]: { ...record(1), nav: { v: { url: 'https://example.test/remote', title: 'Remote' }, c: 200, by: 'peer' } } } },
  });
  const pass = h.sandbox.sync.apply(h.work, { force: true });
  for (let i = 0; i < 20 && !release; i += 1) await new Promise(setImmediate);
  assert.equal(typeof release, 'function', 'the pass reached a live row before the quit');
  const writes = h.session.writes;
  h.sandbox.isQuitting = true;
  for (const r of h.runtimes) r.closing = true;
  release(true);
  assert.equal(await pass, false, 'the pass gives up rather than finishing during the quit');
  assert.equal(h.session.writes, writes, 'nothing was written after the quit began');
  assert.deepEqual(h.saved(), h.before);
});

test('the last Windows/Linux window held for its quit keeps the session it saved', async () => {
  const h = harness();
  // window-all-closed has not run yet, so isQuitting is still false. The
  // closing window was saved with its tabs and is torn down page by page.
  h.runtimes.splice(h.runtimes.indexOf(h.primary), 1);
  h.sandbox.focusedRuntime = h.work;
  const kept = { windows: [] };
  Object.assign(kept, buildSaveShape([{ id: 'work-window', profileId: DEFAULT_PROFILE_ID, workspaceId: 'work', urls: ['https://example.test/1', 'https://example.test/2'], groupIds: [null, null], pinned: [false, false], meta: [{ title: 'T1', favicon: null }, { title: 'T2', favicon: null }], groups: [], activeIndex: 0 }], {}, { activeWindowId: 'work-window' }));
  Object.assign(h.session.data, kept);
  const before = h.saved();
  h.work.closing = true;
  h.sandbox.sessionHeldForQuit = true;
  // A set-aside Space still in memory takes its own pass then.
  const resident = { id: 'resident', profileId: DEFAULT_PROFILE_ID, resident: true, workspaceId: 'work', tabOrder: [], groups: [], closing: false };
  h.runtimes.push(resident);
  await h.sandbox.sync.apply(resident);
  assert.deepEqual(h.saved(), before, 'the held window is still saved with its tabs');
  assert.deepEqual(h.flush(), { ok: false, error: 'busy' }, 'a direct save refuses too');
  assert.deepEqual(h.saved(), before);
});

test('a primary window closed to the Dock stays saved through another window\'s save', () => {
  const h = harness();
  // A real macOS Dock close: the window's own close lifecycle marks it.
  const lifecycle = createDockReopenLifecycle({
    platform: 'darwin', runtime: h.primary, primaryRuntime: h.primary, window: null, tabs: h.tabs,
    liveContents: () => null, getIsQuitting: () => false,
    sessionCloseEffect: () => 'dock', beforeWindowClose: () => ({ ok: true }),
    createStartTab: () => null, activateTab: () => {}, flushExternalUrls: () => {},
  });
  lifecycle.onWindowClose({ preventDefault() {} });
  h.primary.window = null; // detachWindow: the runtime and its tabs stay for Dock reopen
  assert.equal(h.primary.closing, true);
  // The shared window's pass (or a Space switch, or a set-aside Space's
  // apply) saves the session while the primary is in the Dock.
  assert.deepEqual(h.flush(), { ok: true });
  assert.deepEqual(h.saved(), h.before, 'the Dock-closed primary keeps its tabs in session.json');
});

test('a secondary window that is closing is still left out of the session', () => {
  const h = harness();
  const lifecycle = createDockReopenLifecycle({
    platform: 'darwin', runtime: h.work, primaryRuntime: h.primary, window: null, tabs: h.tabs,
    liveContents: () => null, getIsQuitting: () => false,
    sessionCloseEffect: () => 'remove', beforeWindowClose: () => ({ ok: true }),
    createStartTab: () => null, activateTab: () => {}, flushExternalUrls: () => {},
  });
  lifecycle.onWindowClose({ preventDefault() {} });
  assert.deepEqual(h.flush(), { ok: true });
  assert.deepEqual(h.saved().map((entry) => entry.id), [PRIMARY_WINDOW_ID]);
});

test('a macOS update restart starts the quit before its windows close', () => {
  // Electron's autoUpdater.quitAndInstall closes every window before it emits
  // before-quit, so those closes would otherwise take the ordinary close path.
  const register = lift(/nativeUpdater\.on\('before-quit-for-update', [^\n]+\n/, 'a before-quit-for-update listener');
  assert.match(register, /beginQuit/, 'the update restart runs the same quit start as Quit');
  assert.match(source, /app\.on\('before-quit', beginQuit\);/, 'Quit and the update restart share one quit start');
});
