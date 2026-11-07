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
let holding = false, applying = 0, nextToken = 0, recoveryFormat = '{name}', work = Promise.resolve(), bound = null;
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

// Java keeps a tab's title and nothing else of its meta, so nothing else counts as a change.
const plain = row => JSON.stringify({...row, meta: row.meta?.map(meta => meta?.title ?? '')});

// Shipping's reconcile rebuilds the columns it knows and carries the rest over, so this phone's ids
// would slip onto other tabs. They follow their records; a tab with none yet follows its address.
function alignLocalIds(previous, next) {
  if (!previous?.localIds) return;
  const byRecord = new Map(), loose = [];
  previous.urls.forEach((url, index) => {
    const id = previous.tabIds?.[index];
    if (id) byRecord.set(id, previous.localIds[index]);
    else loose.push({url, local: previous.localIds[index]});
  });
  next.localIds = next.urls.map((url, index) => {
    const id = next.tabIds?.[index];
    if (id && byRecord.has(id)) return byRecord.get(id);
    const at = loose.findIndex(item => item.url === url);
    return at < 0 ? null : loose.splice(at, 1)[0].local;
  });
}

const workspaces = {
  list: () => rows ?? [],
  setSharedLink(id, patch) {
    const row = rows?.find(item => item.id === id);
    if (!row) return {error: 'not-found'};
    const groups = row.groups;
    Object.assign(row, patch);
    report();
    // A share gives the shown Space's groups their records, in the order they were sent.
    if (id === shownId && patch.groups) {
      const groupBindings = Object.fromEntries((groups ?? []).map((group, index) => [group.id, patch.groups[index]?.id]));
      emit('spaces-bindings', {localIds: [], tabIds: [], groupBindings});
    }
    return {ok: true, workspace: row};
  },
  upsertShared({sharedId, recoveredFrom, name, color, symbol, capture}) {
    if (!rows) return {error: 'not-found'};
    const current = rows.find(row => sharedId ? row.sharedId === sharedId : row.recoveredFrom === recoveredFrom);
    const next = {...current, ...structuredClone(capture), id: current?.id ?? ids(), name, color, symbol,
      ...(sharedId ? {sharedId, sharedLink: 'active'} : {recoveredFrom})};
    alignLocalIds(current, next);
    if (current && plain(current) === plain(next)) return {ok: true, workspace: current};
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

// A row says what Java can't look up: the group a tab joins, and who closed a tab.
function detailed(row) {
  const blob = context()?.blob, joins = row.op === 'create' ? row.record.groupId.v : row.field === 'groupId' ? row.value.v : null;
  const by = row.op === 'close' ? row.value.by : null;
  return {...row, ...(joins ? {group: blob?.groups[joins]} : {}),
    ...(by ? {fromId: by, fromName: sync().pairingDevices().find(device => device.deviceId === by)?.name ?? null,
      page: blob?.tabs[row.id]?.nav?.v, spaceId: context()?.spaceId} : {})};
}

function applyRow(_, row) {
  const token = ++nextToken;
  return new Promise(done => {
    const timer = setTimeout(() => { waiting.delete(token); done(false); }, ROW_MILLIS);
    waiting.set(token, ok => { clearTimeout(timer); done(ok); });
    emit('spaces-row', {token, row: detailed(row)});
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
      bound = {localIds: captured.localIds, tabIds: diff.tabIds, groupBindings: diff.groupBindings};
      emit('spaces-bindings', bound);
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
  const run = runtimeSync.apply(window).finally(() => { applying--; });
  work = Promise.allSettled([work, run]);
  return run;
}

// Undo of a Space deleted everywhere keeps a copy here. Shipping's reconcile removes anything still
// linked to a deleted record, so the copy lets go of the link.
function keepCopy(id) {
  sharing.restored(id);
  const row = rows.find(item => item.id === id);
  if (!row || row.sharedLink !== 'dormant') return;
  delete row.sharedId;
  delete row.sharedLink;
  row.tabIds = row.urls.map(() => null);
  report();
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
  async push({revision: seen, rows: next, shownId: id, capture: tabs, protectedIds: guarded, recoveryFormat: format, restoring}) {
    if (seen < revision) return {stale: true, revision, rows};
    if (applying) return {busy: true, revision};
    start();
    const moved = rows === null || id !== shownId;
    rows = next;
    shownId = id;
    captured = tabs;
    bound = null;
    protectedIds = guarded ?? [];
    recoveryFormat = format ?? recoveryFormat;
    holding = false;
    try { fs.writeFileSync(VISIBLE_FILE, JSON.stringify(visible())); } catch {}
    // A Space just shown may be behind its record: remote work first, and the tabs it changed come
    // in the next push. Otherwise these tabs are newer than the receipt, and what waited for the
    // tab on screen or for a switch can land now.
    if (restoring) keepCopy(restoring);
    if (!moved && captured && context()?.window) runtimeSync.local(window);
    await settle();
    await sharing.autoShare();
    return {revision, bindings: bound};
  },
  // Before a switch: what's on show goes out, and the answer says what it was bound to, because the
  // tabs are about to be saved. Nothing is under way when it answers, and nothing starts until the
  // next push.
  async prepare(args) {
    await work;
    const answer = await module.exports.push(args);
    if (answer.stale || answer.busy) return answer;
    holding = true;
    await work;
    return answer;
  },
  // A switch is moving the tabs: nothing is read from them or done to them until the next push.
  hold() { holding = true; },
  rowDone(token, ok) { waiting.get(token)?.(ok); waiting.delete(token); },
  preview: options => { start(); return sharing.preview(options); },
  // The switch decides what the Recently closed band may show, so the band hears about it at once.
  apply: payload => { start(); return Promise.resolve(sharing.apply(payload)).finally(() => emit('closed', null)); },
  metadata: (id, patch) => { start(); return sharing.metadata(rows?.find(row => row.id === id), patch); },
  reorder: () => { start(); return sharing.reorder(); },
  // With the switch off: the library's Spaces this phone doesn't hold, read-only, as on the iPhone.
  remote() {
    const ctx = sync().sharedContext(), snapshot = state().snapshot(ctx);
    if (!sync().status().enabled || snapshot.enabled) return [];
    const held = new Set((rows ?? []).map(row => row.sharedId)), devices = sync().pairingDevices();
    return model().orderOf(snapshot.index.spaces).flatMap(id => {
      const record = snapshot.index.spaces[id];
      if (record.deleted.v || held.has(id) || record.createdBy === ctx.deviceId) return [];
      return [{id, name: record.name.v, color: record.color.v, symbol: record.symbol.v,
        device: devices.find(device => device.deviceId === record.createdBy)?.name ?? record.createdBy}];
    });
  },
  // One Space for the Bring sheet, read straight from the Worker: never merged, kept or uploaded.
  async previewSpace(id) {
    const ctx = sync().sharedContext(), {net, safeStorage} = __require('shim:electron');
    const {unprotectSyncKey} = __require('src/main/sync-key-storage.js'), {decrypt} = __require('src/main/sync-crypto.js');
    if (!/^[0-9a-f]{32}$/.test(id)) return null;
    const stored = JSON.parse(fs.readFileSync('/sync/sync.json', 'utf8'));
    const endpoint = __host.env?.BLANC_TEST_SYNC_ENDPOINT || 'https://blanc-sync.bnfy-441.workers.dev';
    const response = await net.fetch(`${endpoint}/v1/blob/${ctx.accountId}/space-${id}`);
    if (!response.ok) return null;
    const key = unprotectSyncKey(safeStorage, stored.protectedKey);
    try {
      const blob = model().sanitizeBlob(JSON.parse(decrypt(key, (await response.json()).blob)));
      return blob?.spaceId === id ? __require('src/main/shared-spaces-sharing.js').projectSpace(blob) : null;
    } finally { key.fill(0); }
  },
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
