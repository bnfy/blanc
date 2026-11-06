// The one door in: main calls __call(method, argsJson, done). `method` names a
// module and an export, from this list only.
const MODULES = {sync: 'sync', bookmarks: 'bookmarks', settings: 'settings'};
globalThis.__call = (method, argsJson, done) => {
  // Saves every store's pending change now, so what the phone writes down as agreed is on disk.
  if (method === 'runner.flush') {
    __require('shim:electron').__quit();
    done(true, 'null');
    return;
  }
  const [mod, fn] = String(method).split('.');
  const file = MODULES[mod];
  Promise.resolve().then(() => {
    const target = file && __require(`src/main/${file}.js`)[fn];
    if (typeof target !== 'function') throw new Error(`no method ${method}`);
    return target(...JSON.parse(argsJson || '[]'));
  }).then(value => done(true, JSON.stringify(value === undefined ? null : value)), error => done(false, String(error && error.message || error)));
};

// What the phone needs to hear about. Merges count: they're how another device's change arrives.
globalThis.__listen = () => {
  const bookmarks = __require('src/main/bookmarks.js'), settings = __require('src/main/settings.js');
  const sync = __require('src/main/sync.js');
  bookmarks.onChanged(() => __host.emit('favorites', ''));
  bookmarks.onMerged(() => __host.emit('favorites', ''));
  settings.onSettingsChanged(() => __host.emit('settings', ''));
  sync.onAccountChanged(() => __host.emit('account', ''));
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
