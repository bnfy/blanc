// The phone's Spaces for shipping's Shared Spaces. Every rule stays in shipping's modules: this is
// their `workspaces` store and their window. Java's library is the truth; `rows` is its copy, in
// workspaces.js's shape, null until Java has sent it, so a background run with no window touches
// nothing. What shipping changes goes back as events, and each push says which change it has seen.
const fs = __require('shim:fs');
const VISIBLE_FILE = '/sync/spaces-visible.json';
const ROW_MILLIS = 15000;
const sync = () => __require('src/main/sync.js');
const state = () => __require('src/main/shared-spaces.js');
const model = () => __require('src/main/shared-spaces-model.js');
const ids = () => __require('shim:crypto').randomUUID().replace(/-/g, '');
const emit = (event, value) => __host.emit(event, JSON.stringify(value));

let rows = null, revision = 0, shownId = null, captured = null, protectedIds = [];
let holding = false, applying = 0, nextToken = 0, recoveryFormat = '{name}';
const waiting = new Map();
const window = {id: 'phone'};

function visible() {
  return (rows ?? []).filter(row => row.sharedId && row.sharedLink === 'active').map(row => row.sharedId);
}
function report() {
  revision++;
  try { fs.writeFileSync(VISIBLE_FILE, JSON.stringify(visible())); } catch {}
  emit('spaces-library', {revision, rows});
}

const workspaces = {
  list: () => rows ?? [],
  setSharedLink(id, patch) {
    const row = rows?.find(item => item.id === id);
    if (!row) return {error: 'not-found'};
    Object.assign(row, patch);
    report();
    return {ok: true, workspace: row};
  },
  upsertShared({sharedId, recoveredFrom, name, color, symbol, capture}) {
    if (!rows) return {error: 'not-found'};
    const current = rows.find(row => sharedId ? row.sharedId === sharedId : row.recoveredFrom === recoveredFrom);
    const next = {...current, ...structuredClone(capture), id: current?.id ?? ids(), name, color, symbol,
      ...(sharedId ? {sharedId, sharedLink: 'active'} : {recoveredFrom})};
    if (current && JSON.stringify(current) === JSON.stringify(next)) return {ok: true, workspace: current};
    if (current) rows[rows.indexOf(current)] = next;
    else rows.push(next);
    report();
    return {ok: true, workspace: next};
  },
  remove(id) {
    if (!rows?.some(row => row.id === id)) return {error: 'not-found'};
    rows = rows.filter(row => row.id !== id);
    report();
    return {ok: true};
  },
  reorderShared(order) {
    if (!rows) return;
    const rank = new Map(order.map((id, index) => [id, index]));
    const shared = rows.filter(row => rank.has(row.sharedId)).sort((a, b) => rank.get(a.sharedId) - rank.get(b.sharedId));
    let at = 0;
    const next = rows.map(row => rank.has(row.sharedId) ? shared[at++] : row);
    if (next.some((row, index) => row !== rows[index])) {
      rows = next;
      report();
    }
  },
};

function context() {
  if (!rows || holding || !shownId) return null;
  const row = rows.find(item => item.id === shownId);
  if (!row?.sharedId || !sync().status().enabled) return null;
  const ctx = sync().sharedContext(), store = state().rebind(ctx.accountId), entry = store.data.blobs[row.sharedId];
  if (!entry?.blob) return null;
  const saved = Object.values(store.data.windows).find(item => item?.spaceId === row.sharedId);
  return {spaceId: row.sharedId, accountId: ctx.accountId, deviceId: ctx.deviceId, blob: entry.blob, window: saved,
    protectedIds, ctx, store, workspace: row};
}

// Android has no tab names of its own, so a name set elsewhere rides along unchanged.
function capture() {
  const shown = context()?.window?.displayed, out = structuredClone(captured);
  out.meta = out.meta.map((meta, index) => ({...meta, customTitle: shown?.tabs[out.tabIds[index]]?.name?.v ?? null}));
  return out;
}

function applyRow(_, row) {
  const token = ++nextToken;
  return new Promise(done => {
    const timer = setTimeout(() => { waiting.delete(token); done(false); }, ROW_MILLIS);
    waiting.set(token, ok => { clearTimeout(timer); done(ok); });
    emit('spaces-row', {token, row});
  });
}

let runtimeSync, sharing;
function start() {
  if (runtimeSync) return;
  runtimeSync = __require('src/main/shared-spaces-runtime.js').createRuntimeSync({
    read: context,
    capture,
    ids,
    saveWindow(_, saved) {
      const current = context();
      if (!current) return false;
      current.store.update(data => {
        for (const [key, value] of Object.entries(data.windows)) if (value?.spaceId === saved.spaceId) delete data.windows[key];
        data.windows[`phone:${saved.spaceId}`] = saved;
      });
      return saved.accepted?.length ? current.store.flush() : true;
    },
    writeLocal(_, blob, edits, diff) {
      const current = context();
      if (!current) return;
      state().noteLocalSpace(current.spaceId, blob, edits, current.ctx);
      emit('spaces-bindings', {localIds: captured.localIds, tabIds: diff.tabIds, groupBindings: diff.groupBindings});
    },
    applyRow,
    layout(_, blob) {
      if (!blob) return;
      const m = model();
      emit('spaces-layout', {order: m.orderOf(blob.tabs).filter(id => blob.tabs[id].deleted.v !== true),
        groups: m.orderOf(blob.groups).filter(id => blob.groups[id].deleted.v !== true)});
    },
  });
  sharing = __require('src/main/shared-spaces-service.js').createSharingService({
    sync: sync(), spaces: state(), workspaces, offered: () => true, ids,
    devices: () => sync().pairingDevices(),
    captureLocal: async () => {},
    isOpen: id => id === shownId,
    bind(item) {
      if (!item.blob || item.workspaceId !== shownId) return;
      // The phone already shows this exact snapshot: seed its receipt without replaying creates.
      const ctx = sync().sharedContext(), store = state().rebind(ctx.accountId);
      store.update(data => { data.windows[`phone:${item.spaceId}`] = {spaceId: item.spaceId, displayed: item.blob, accepted: [], groupBindings: {}}; });
      if (!store.flush()) throw new Error('save-failed');
    },
    recoveryName: name => recoveryFormat.replace('{name}', name),
    changed: () => {},
  });
  state().onRemoteChanged(settle);
}

function apply() {
  const current = context();
  if (!current || state().isDormant(current.spaceId, current.ctx) || !state().isEnabled(current.ctx)) return Promise.resolve(false);
  if (current.store.data.index.spaces[current.spaceId]?.deleted?.v === true) {
    emit('spaces-deleted', {id: current.workspace.id});
    return Promise.resolve(false);
  }
  applying++;
  return runtimeSync.apply(window).finally(() => { applying--; });
}

async function settle() {
  if (!rows) return;
  await sharing.reconcile();
  await apply();
}

module.exports = {
  start,
  visible() {
    if (rows) return visible();
    try { return JSON.parse(fs.readFileSync(VISIBLE_FILE, 'utf8')); } catch { return []; }
  },
  accountChanged() {
    if (!rows) return;
    for (const row of rows) { delete row.sharedId; delete row.sharedLink; delete row.tabIds; }
    report();
  },
  // What Java has now. `capture` is the shown tabs, null with no Space on show.
  async push({revision: seen, rows: next, shownId: id, capture: tabs, protectedIds: guarded, recoveryFormat: format}) {
    if (seen < revision) return {stale: true, revision};
    if (applying) return {busy: true, revision};
    start();
    const moved = rows === null || id !== shownId;
    rows = next;
    shownId = id;
    captured = tabs;
    protectedIds = guarded ?? [];
    recoveryFormat = format ?? recoveryFormat;
    holding = false;
    try { fs.writeFileSync(VISIBLE_FILE, JSON.stringify(visible())); } catch {}
    // A Space just shown may be behind its record: remote work first, and the tabs it changed come
    // in the next push. Otherwise these tabs are newer than the receipt, and what waited for the
    // tab on screen or for a switch can land now.
    if (!moved && captured && context()?.window) runtimeSync.local(window);
    await settle();
    await sharing.autoShare();
    return {revision};
  },
  // A switch is moving the tabs: nothing is read from them or done to them until the next push.
  hold() { holding = true; },
  rowDone(token, ok) { waiting.get(token)?.(ok); waiting.delete(token); },
  preview: options => { start(); return sharing.preview(options); },
  apply: payload => { start(); return sharing.apply(payload); },
  metadata: (id, patch) => { start(); return sharing.metadata(rows?.find(row => row.id === id), patch); },
  restored: id => { start(); return sharing.restored(id); },
  reorder: () => { start(); return sharing.reorder(); },
  status() {
    const shared = sync().sharedStatus(), ctx = sync().sharedContext();
    const blobs = Object.values(state().snapshot(ctx).blobs).map(entry => entry?.reason);
    const keys = [];
    if (shared.enabled) {
      if (blobs.some(reason => ['full', 'tabs', 'remote-over-budget', 'required-state-over-budget'].includes(reason))) keys.push('capacity');
      if (blobs.includes('tombstones')) keys.push('tombstones');
      if (shared.backoff) keys.push('busy');
    }
    const each = {};
    for (const row of rows ?? []) if (row.sharedId && row.sharedLink === 'active') each[row.id] = sync().spaceStatus(row.sharedId);
    return {...shared, keys, each};
  },
};
