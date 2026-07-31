const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { activeLocalProfileId } = require('./local-profile-context');
const { DEFAULT_PROFILE_ID, validProfileId } = require('./local-profile-model');

const SAVE_DELAY_MS = 250;
// A pure trailing debounce never fires while updates keep arriving faster
// than SAVE_DELAY_MS (e.g. the adblock counter during a blocked-request
// stream) — cap how long a pending save can be deferred.
const MAX_SAVE_DELAY_MS = 5000;

/** All live stores, so we can flush pending writes on quit. */
const instances = [];

/**
 * Minimal JSON-file persistence. Device stores keep their one file in
 * userData; profile stores retain the default profile's existing root file
 * and place every additional profile beneath `profiles/<opaque-id>/`.
 * Entries are selected through AsyncLocalStorage so two browser windows
 * cannot race a shared module singleton into writing each other's records.
 */
class JsonStore {
  /**
   * @param {string} name - file becomes `<userData>/<name>.json`
   * @param {object} defaults - shape used when the file is missing/corrupt
   * @param {{ scope?: 'device' | 'profile' }} options
   */
  constructor(name, defaults, { scope = 'device' } = {}) {
    this.name = name;
    this.defaults = defaults;
    this.scope = scope === 'profile' ? 'profile' : 'device';
    this.entries = new Map();
    instances.push(this);
  }

  #profileId() {
    return this.scope === 'profile' ? activeLocalProfileId() : DEFAULT_PROFILE_ID;
  }

  #fileFor(profileId) {
    const userData = app.getPath('userData');
    if (this.scope !== 'profile' || profileId === DEFAULT_PROFILE_ID) {
      return path.join(userData, `${this.name}.json`);
    }
    return path.join(userData, 'profiles', profileId, `${this.name}.json`);
  }

  #load(file) {
    try {
      return { ...this.defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  #entry() {
    const profileId = this.#profileId();
    let entry = this.entries.get(profileId);
    if (!entry) {
      const file = this.#fileFor(profileId);
      entry = {
        file,
        data: this.#load(file),
        saveTimer: null,
        pendingSince: null,
      };
      this.entries.set(profileId, entry);
    }
    return entry;
  }

  get file() { return this.#entry().file; }
  get data() { return this.#entry().data; }
  get saveTimer() { return this.#entry().saveTimer; }

  /** Mutate the active profile/device entry inside `fn`, then schedule a save. */
  update(fn) {
    const entry = this.#entry();
    fn(entry.data);
    this.#scheduleSave(entry);
  }

  #scheduleSave(entry) {
    entry.pendingSince ??= Date.now();
    if (Date.now() - entry.pendingSince >= MAX_SAVE_DELAY_MS) return this.#flush(entry);
    clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => this.#flush(entry), SAVE_DELAY_MS);
  }

  /** @returns {boolean} whether the write actually reached disk — callers
   * that promise the user something persisted (e.g. the install-id reset)
   * must not report success off a swallowed write error. */
  flush() {
    return this.#flush(this.#entry());
  }

  flushPending() {
    for (const entry of this.entries.values()) {
      if (entry.saveTimer) this.#flush(entry);
    }
  }

  #flush(entry) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
    entry.pendingSince = null;
    try {
      fs.mkdirSync(path.dirname(entry.file), { recursive: true });
      fs.writeFileSync(entry.file, JSON.stringify(entry.data, null, 2));
      return true;
    } catch (err) {
      console.warn(`[store] could not write ${entry.file}:`, err.message);
      return false;
    }
  }
}

app.on('before-quit', () => {
  for (const store of instances) {
    store.flushPending();
  }
});

// A profile deletion removes its whole `profiles/<opaque-id>/` tree after
// this call. Drop every cached entry and timer first, otherwise a delayed
// write from a feature store could recreate one of those records afterward.
function discardProfileStoreEntries(profileId) {
  if (!validProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) return false;
  for (const store of instances) {
    if (store.scope !== 'profile') continue;
    const entry = store.entries.get(profileId);
    if (entry?.saveTimer) clearTimeout(entry.saveTimer);
    store.entries.delete(profileId);
  }
  return true;
}

module.exports = { JsonStore, discardProfileStoreEntries };
