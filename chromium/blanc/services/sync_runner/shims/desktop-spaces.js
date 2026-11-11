// Desktop-only entry points. The phone facade and its single-window semantics
// remain unchanged. Native owns the library/captures; shipping owns merge rules.
const fs = __require('shim:fs');
const sync = () => __require('src/main/sync.js');
const state = () => __require('src/main/shared-spaces.js');
const model = () => __require('src/main/shared-spaces-model.js');
const ids = () => __require('shim:crypto').randomUUID().replace(/-/g, '');
const emit = (event, value) => __host.emit(`desktop-spaces-${event}`, JSON.stringify(value));
const FILE = '/sync/desktop-spaces-visible.json';
let rows = null, revision = 0, nextToken = 0, applying = 0, persistenceFailed = false;
const windows = new Map(), waiting = new Map();
let runtime, sharing, work = Promise.resolve();
const visible = () => rows === null ? (() => {try {return JSON.parse(fs.readFileSync(FILE, 'utf8'));} catch {return [];}})()
  : rows.filter(row => row.sharedId && row.sharedLink === 'active').map(row => row.sharedId);
function report() {
  revision++;
  fs.writeFileSync(FILE, JSON.stringify(visible()));
  emit('library', {revision, rows});
}
const isOpen = id => [...windows.values()].some(win => win.workspaceId === id);
const workspaces = {
  list: () => rows ?? [],
  setSharedLink(id, patch) {
    const row = rows?.find(item => item.id === id);
    if (!row) return {error: 'not-found'};
    Object.assign(row, structuredClone(patch)); report();
    return {ok: true, workspace: row};
  },
  upsertShared({sharedId, recoveredFrom, name, color, symbol, capture}) {
    if (!rows) return {error: 'not-ready'};
    const current = rows.find(row => sharedId ? row.sharedId === sharedId : row.recoveredFrom === recoveredFrom);
    // Defense in depth: even a future caller cannot replace any open capture.
    const kept = current && isOpen(current.id) ? current : capture;
    const next = {...current, ...structuredClone(kept), id: current?.id ?? ids(), name, color, symbol,
      ...(sharedId ? {sharedId, sharedLink: 'active'} : {recoveredFrom})};
    if (current && JSON.stringify(current) === JSON.stringify(next)) return {ok: true, workspace: current};
    if (current) rows[rows.indexOf(current)] = next; else rows.push(next);
    report(); return {ok: true, workspace: next};
  },
  remove(id) {
    if (isOpen(id)) return {error: 'open'};
    if (!rows?.some(row => row.id === id)) return {error: 'not-found'};
    rows = rows.filter(row => row.id !== id); report(); return {ok: true};
  },
  reorderShared(order) {
    const rank = new Map(order.map((id, at) => [id, at]));
    const sorted = rows.filter(row => rank.has(row.sharedId)).sort((a, b) => rank.get(a.sharedId) - rank.get(b.sharedId));
    let at = 0;
    const next = rows.map(row => rank.has(row.sharedId) ? sorted[at++] : row);
    if (next.some((row, i) => row !== rows[i])) {rows = next; report();}
  },
};
const receiptKey = (win, sid) => `desktop:${win.id}:${sid}`;
function context(win) {
  if (!rows || win.holding || !win.capture || !sync().status().enabled) return null;
  const workspace = rows.find(row => row.id === win.workspaceId);
  if (!workspace?.sharedId) return null;
  const ctx = sync().sharedContext(), store = state().rebind(ctx.accountId), entry = store.data.blobs[workspace.sharedId];
  if (!entry?.blob) return null;
  return {spaceId: workspace.sharedId, accountId: ctx.accountId, deviceId: ctx.deviceId,
    blob: entry.blob, window: store.data.windows[receiptKey(win, workspace.sharedId)],
    protectedIds: win.protectedIds ?? [], ctx, store, workspace};
}
function bindings(win, diff) {
  win.capture.tabIds = [...diff.tabIds];
  emit('bindings', {windowId: win.id, workspaceId: win.workspaceId, localIds: win.capture.localIds,
    tabIds: diff.tabIds, groupBindings: diff.groupBindings});
}
function captureLocal() {
  for (const win of windows.values()) {
    if (win.holding || !win.capture) continue;
    if (context(win)?.window) runtime.local(win);
    const row = rows.find(row => row.id === win.workspaceId);
    if (row) Object.assign(row, structuredClone(win.capture));
  }
}
function start() {
  if (runtime) return;
  sync().setSharedVisibilityProvider(visible);
  sync().onAccountChanged(() => {
    for (const row of rows ?? []) {delete row.sharedId; delete row.sharedLink; delete row.tabIds;}
    for (const win of windows.values()) if (win.capture) win.capture.tabIds = win.capture.urls.map(() => null);
    if (rows) report();
  });
  runtime = __require('src/main/shared-spaces-runtime.js').createRuntimeSync({
    read: context, capture: win => structuredClone(win.capture), ids,
    saveWindow(win, saved) {
      const current = context(win); if (!current) return false;
      // Never discard another window's receipt, even for the same Space.
      current.store.update(data => {data.windows[receiptKey(win, saved.spaceId)] = saved;});
      const savedToDisk = current.store.flush() && fs.__persistDesktop('shared-spaces.json');
      if (!savedToDisk) persistenceFailed = true;
      return savedToDisk;
    },
    writeLocal(win, blob, edits, diff) {
      const current = context(win); if (!current) return;
      // Only locally captured closes enter this device's Recently closed
      // feed. Applying a remote close uses the runtime receipt, not this path.
      for (const [id, edit] of Object.entries(edits.tabs ?? {})) {
        const previous = current.blob.tabs[id];
        if (state().isEnabled(current.ctx) && !state().isDormant(current.spaceId, current.ctx) &&
            edit.deleted?.v === true && previous && !previous.deleted.v)
          __require('src/main/synced-closed.js').addOwnItem(current.ctx, {id,
            ...previous.nav.v, closedAt: Date.now(), spaceId: current.spaceId});
      }
      state().noteLocalSpace(current.spaceId, blob, edits, current.ctx);
      bindings(win, diff);
    },
    applyRow(win, row) {
      const token = ++nextToken, workspaceId = win.workspaceId;
      return new Promise(done => {
        const timer = setTimeout(() => {waiting.delete(token); done(false);}, 15000);
        waiting.set(token, {windowId: win.id, workspaceId, done: ok => {clearTimeout(timer); done(ok);}});
        const affectsLayout = row.kind === 'groups' || row.op === 'create' || ['groupId', 'pos', 'pinned'].includes(row.field);
        let layout;
        if (affectsLayout) {
          const shown = context(win)?.window?.displayed;
          const blob = shown ? structuredClone(shown) : null;
          if (blob) {
            if (row.field) {
              blob[row.kind][row.id] ??= {};
              blob[row.kind][row.id][row.field] = model().mergeField(blob[row.kind][row.id][row.field], row.value, row.field);
            } else blob[row.kind][row.id] = structuredClone(row.record);
            layout = {blob, order: model().orderOf(blob.tabs).filter(id => !blob.tabs[id].deleted.v),
              groups: model().orderOf(blob.groups).filter(id => !blob.groups[id].deleted.v)};
          }
        }
        emit('row', {windowId: win.id, workspaceId, token, row, layout, layoutRequired: affectsLayout});
      });
    },
    layout(win, blob) {
      if (blob) emit('layout', {windowId: win.id, workspaceId: win.workspaceId, blob,
        order: model().orderOf(blob.tabs).filter(id => !blob.tabs[id].deleted.v),
        groups: model().orderOf(blob.groups).filter(id => !blob.groups[id].deleted.v)});
    },
  });
  sharing = __require('src/main/shared-spaces-service.js').createSharingService({
    sync: sync(), spaces: state(), workspaces, offered: () => rows !== null, ids,
    devices: () => sync().pairingDevices(), isOpen, captureLocal,
    bind(item) {
      if (!item.blob) return;
      const ctx = sync().sharedContext(), store = state().rebind(ctx.accountId);
      for (const win of windows.values()) if (win.workspaceId === item.workspaceId && !win.holding && win.capture) {
        bindings(win, item);
        store.update(data => {data.windows[receiptKey(win, item.spaceId)] = {
          spaceId: item.spaceId, displayed: item.blob, accepted: [], groupBindings: item.groupBindings ?? {}};});
      }
      if (!store.flush() || !fs.__persistDesktop('shared-spaces.json')) throw Error('save-failed');
    },
    recoveryName: name => `${name} · kept on this device`,
  });
  state().onRemoteChanged(() => {work = work.then(settle).catch(() => {});});
}
async function settle() {
  if (!rows) return;
  captureLocal();
  await sharing.reconcile();
  for (const win of windows.values()) {
    const current = context(win);
    if (!current || state().isDormant(current.spaceId, current.ctx) || !state().isEnabled(current.ctx)) continue;
    if (current.store.data.index.spaces[current.spaceId]?.deleted?.v) {
      // Native decides how to detach and offer Undo; never remove an open capture.
      emit('deleted', {windowId: win.id, workspaceId: win.workspaceId}); continue;
    }
    applying++;
    try {await runtime.apply(win);} finally {applying--;}
  }
}
module.exports = {
  start, visible,
  snapshotForTest() {
    if (__host.env?.BLANC_TEST !== '1' || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(__host.testEndpoint ?? '')) throw Error('test-snapshot-refused');
    start();
    const ctx = sync().sharedContext();
    return {shared: state().snapshot(ctx), rows, windows: [...windows.values()],
      closed: __require('src/main/synced-closed.js').inbox(ctx),
      context: {accountId: ctx.accountId, deviceId: ctx.deviceId}};
  },
  async push({revision: seen, rows: next, windows: snapshots, restoring}) {
    start();
    if (seen < revision) return {stale: true, revision, rows};
    if (applying) return {busy: true, revision};
    // Validate the complete inventory before changing any state.
    if (!Array.isArray(next) || !Array.isArray(snapshots) || new Set(snapshots.map(w => w.id)).size !== snapshots.length ||
        snapshots.some(w => typeof w.id !== 'string' || !w.id || (w.workspaceId && !next.some(row => row.id === w.workspaceId)))) throw Error('invalid-desktop-inventory');
    persistenceFailed = false;
    rows = structuredClone(next);
    const live = new Set(snapshots.map(w => w.id));
    for (const [id] of windows) if (!live.has(id)) windows.delete(id);
    for (const snap of snapshots) {
      let win = windows.get(snap.id);
      if (!win) {win = {id: snap.id}; windows.set(snap.id, win);}
      Object.assign(win, {holding: false, capture: null, protectedIds: []}, structuredClone(snap));
    }
    const restored = Array.isArray(restoring) ? restoring : restoring ? [restoring] : [];
    for (const id of restored) {
      sharing.restored(id);
      const row = rows.find(row => row.id === id);
      if (row?.sharedLink === 'dormant') {
        delete row.sharedId; delete row.sharedLink;
        row.tabIds = row.urls.map(() => null); report();
      }
    }
    fs.writeFileSync(FILE, JSON.stringify(visible()));
    await settle(); await sharing.autoShare();
    return {revision, rows, restored, durable: !persistenceFailed};
  },
  hold(windowId) {const win = windows.get(windowId); if (win) win.holding = true;},
  rowDone(windowId, workspaceId, token, ok, capture) {
    const pending = waiting.get(token), win = windows.get(windowId);
    if (!pending || pending.windowId !== windowId || pending.workspaceId !== workspaceId || win?.workspaceId !== workspaceId) return false;
    if (ok && capture) win.capture = structuredClone(capture);
    waiting.delete(token); pending.done(ok === true); return true;
  },
  preview: options => {start(); return sharing.preview(options);},
  apply: payload => {start(); return sharing.apply(payload);},
  metadata: (id, patch) => {start(); return sharing.metadata(rows?.find(row => row.id === id), patch);},
  reorder: () => {start(); return sharing.reorder();},
  armPairing: () => {start(); return sharing.armPairing();},
  acknowledge: id => {start(); return sharing.acknowledge(id);},
  status: () => {start(); return {...sync().sharedStatus(), offered: rows !== null, question: sharing.question()};},
};
