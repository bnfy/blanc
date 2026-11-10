// The one door in: main calls __call(method, argsJson, done). `method` names a
// module and an export, from this list only.
const MODULES = {sync: 'sync', bookmarks: 'bookmarks', settings: 'settings'};
// Recently closed takes the account's context, and is only there with the Spaces switch on, as on
// desktop: the store it syncs through is one a person has to agree to.
// Clear all needs only Sync, as on the iPhone: what this phone already shared must be able to go.
const closed = (name, off, always) => (...args) => {
  const sync = __require('src/main/sync.js');
  if (!sync.status().enabled || !(always || sync.sharedStatus().enabled)) return off;
  return __require('src/main/synced-closed.js')[name](sync.sharedContext(), ...args);
};
const spaces = name => (...args) => __require('shim:spaces')[name](...args);
const DESKTOP = Object.fromEntries(['push', 'hold', 'rowDone', 'preview', 'apply', 'metadata', 'reorder', 'armPairing', 'acknowledge', 'status'].map(name => [`desktop.spaces.${name}`, (...args) => __require('shim:desktop-spaces')[name](...args)]));
const PHONE = {
  'spaces.push': spaces('push'), 'spaces.prepare': spaces('prepare'), 'spaces.hold': spaces('hold'), 'spaces.rowDone': spaces('rowDone'),
  'spaces.preview': spaces('preview'), 'spaces.apply': spaces('apply'), 'spaces.metadata': spaces('metadata'),
  'spaces.reorder': spaces('reorder'), 'spaces.status': spaces('status'), 'spaces.remote': spaces('remote'),
  'spaces.previewSpace': spaces('previewSpace'),
  'closed.add': closed('addOwnItem', false),
  'closed.inbox': closed('inbox', []),
  'closed.hide': closed('hide', null),
  'closed.clear': closed('clear', null, true),
};
globalThis.__call = (method, argsJson, done) => {
  // Saves every store's pending change now, so what the phone writes down as agreed is on disk.
  if (method === 'runner.flush') {
    __require('shim:electron').__flush();
    done(true, 'null');
    return;
  }
  // The phone's tabs, once its tab model has them. Until then the session store stays a no-op, so
  // a background run with no window can't publish an empty list.
  if (method === 'phone.setTabs') {
    const [tabList, groups] = JSON.parse(argsJson);
    globalThis.__phoneTabs = {tabList, groups};
    __require('src/main/tabsync.js').noteTabsChanged();
    __require('src/main/sync.js').setTabStateReady(true);
    done(true, 'null');
    return;
  }
  const [mod, fn] = String(method).split('.');
  const file = MODULES[mod];
  Promise.resolve().then(() => {
    const target = (method === 'desktop.setTabs' ? __require('shim:desktop-tabs') : null) ?? DESKTOP[method] ?? PHONE[method] ?? (file && __require(`src/main/${file}.js`)[fn]);
    if (typeof target !== 'function') throw new Error(`no method ${method}`);
    return target(...JSON.parse(argsJson || '[]'));
  }).then(value => {
    // Android can end Blanc at any moment: what a call changed is saved before it answers.
    __require('shim:electron').__flush();
    done(true, JSON.stringify(value === undefined ? null : value));
  }, error => done(false, String(error && error.message || error)));
};

// What the phone needs to hear about. Merges count: they're how another device's change arrives.
globalThis.__listen = () => {
  const bookmarks = __require('src/main/bookmarks.js'), settings = __require('src/main/settings.js');
  const sync = __require('src/main/sync.js');
  bookmarks.onChanged(() => __host.emit('favorites', ''));
  bookmarks.onMerged(() => __host.emit('favorites', ''));
  settings.onSettingsChanged(() => __host.emit('settings', ''));
  sync.onAccountChanged(() => __host.emit('account', ''));
  const tabsync = __require('src/main/tabsync.js');
  globalThis.__phoneTabs = {tabList: [], groups: []};
  tabsync.setSnapshotProvider(() => globalThis.__phoneTabs);
  __require('src/main/tabicons.js').setSnapshotProvider(() => ({tabList: []}));
  tabsync.onRemoteChanged(() => __host.emit('remote', ''));
  sync.onSendsChanged(() => __host.emit('remote', ''));
  __require('src/main/synced-closed.js').onChanged(() => __host.emit('closed', ''));
  const phoneSpaces = __require('shim:spaces');
  sync.setSharedVisibilityProvider(phoneSpaces.visible);
  sync.onAccountChanged(phoneSpaces.accountChanged);
};

// A setting a newer device added stays in the blob, as on the iPhone. Shipping's settings module
// keeps only the keys it knows, so unknown ones ride beside it: newest clock wins, nothing here
// reads their values, and they're never applied.
globalThis.__keepUnknownSettings = known => {
  const settings = __require('src/main/settings.js');
  const fs = __require('shim:fs');
  const FILE = '/sync/settings-unknown.json';
  const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
  const kept = read();
  const merge = settings.mergeFromSync, exportForSync = settings.exportForSync;
  settings.mergeFromSync = remote => {
    let changed = false;
    for (const key of Object.keys(remote.values ?? {})) {
      const at = remote.meta?.[key];
      if (known.includes(key) || !Number.isFinite(at) || at <= (kept[key]?.at ?? 0)) continue;
      kept[key] = {at, value: remote.values[key], tie: remote.tieBreakers?.[key]};
      changed = true;
    }
    const result = merge(remote);
    // A known key with a value this version can't hold: shipping keeps its old value at the new
    // clock, which would overwrite the newer device's. The value it was sent rides here instead.
    const after = exportForSync();
    for (const key of known) {
      const at = remote.meta?.[key], value = remote.values?.[key];
      if (key === 'deviceNames' || key === 'startPagePins' || value === undefined || !Number.isFinite(at)) continue;
      if (after.meta[key] !== at || JSON.stringify(after.values[key]) === JSON.stringify(value)) continue;
      kept[key] = {at, value, tie: remote.tieBreakers?.[key]};
      changed = true;
    }
    if (changed) fs.writeFileSync(FILE, JSON.stringify(kept));
    return result;
  };
  settings.exportForSync = () => {
    const out = exportForSync();
    for (const [key, entry] of Object.entries(kept)) {
      if (known.includes(key) && out.meta[key] !== entry.at) continue;
      out.values[key] = entry.value;
      out.meta[key] = entry.at;
      if (entry.tie) out.tieBreakers[key] = entry.tie;
    }
    return out;
  };
};
