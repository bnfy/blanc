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

// Each committed record has a sibling backup. Keeping the backup next to the
// primary lets the normal platform backup/restore story treat the two files as
// one small unit, while the temporary files below make an interrupted rewrite
// leave the previous primary intact.
const BACKUP_SUFFIX = '.bak';

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

  #readRecord(file) {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A store is always a JSON object. Treat a truncated file and a syntactically
    // valid but wrong-shaped value equally: neither should replace defaults.
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError('JSON store record must be an object');
    }
    return record;
  }

  #writeAtomically(file, contents) {
    // The temp file stays in the target directory so rename is an atomic
    // operation on one filesystem. A unique suffix avoids colliding with a
    // second app process during an update hand-off.
    const tempFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      fs.writeFileSync(tempFile, contents);
      fs.renameSync(tempFile, file);
    } finally {
      // If writing or renaming failed, the old primary/backup is still in
      // place. Do not leave failed temporary writes around indefinitely.
      try { fs.rmSync(tempFile, { force: true }); } catch { /* best effort */ }
    }
  }

  #load(file) {
    try {
      return { ...this.defaults, ...this.#readRecord(file) };
    } catch (primaryError) {
      try {
        const backup = this.#readRecord(`${file}${BACKUP_SUFFIX}`);
        console.warn(`[store] recovering ${file} from its backup: ${primaryError.message}`);
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          this.#writeAtomically(file, JSON.stringify(backup, null, 2));
        } catch (repairError) {
          // The recovered in-memory record remains usable; a later flush will
          // retry the repair. Avoid turning a recoverable disk issue into a
          // startup failure.
          console.warn(`[store] could not repair ${file}:`, repairError.message);
        }
        return { ...this.defaults, ...backup };
      } catch (backupError) {
        // Missing primary and backup is the ordinary first-run path. Surface
        // only genuine corruption so it is diagnosable without noisy launches.
        if (primaryError.code !== 'ENOENT') {
          console.warn(`[store] could not load ${file}; using defaults:`, primaryError.message);
        }
      }
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

  /**
   * Apply a mutation and synchronously verify that it reached disk. This is
   * reserved for state transitions that must survive a crash before the normal
   * debounce fires (for example, a confirmed profile deletion).
   *
   * If the write fails, restore the in-memory record too. A later unrelated
   * flush must never accidentally commit an operation that was reported as
   * rejected to its caller.
   */
  updateAndFlush(fn) {
    const entry = this.#entry();
    const previous = structuredClone(entry.data);
    const pendingSince = entry.pendingSince;
    const hadPendingSave = !!entry.saveTimer;
    fn(entry.data);
    if (this.#flush(entry)) return true;
    entry.data = previous;
    // Do not lose an earlier ordinary update just because a later critical
    // write could not reach disk. It is restored without the rejected mutation
    // and gets its original debounce window back.
    if (hadPendingSave) {
      entry.pendingSince = pendingSince;
      this.#scheduleSave(entry);
    }
    return false;
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
      const contents = JSON.stringify(entry.data, null, 2);
      if (typeof contents !== 'string') throw new TypeError('JSON store record is not serializable');
      this.#writeAtomically(entry.file, contents);

      // This is deliberately best-effort: once the primary rename succeeds,
      // the requested state did reach disk and synchronous callers can report
      // success. If a backup refresh fails, the prior backup remains intact
      // because it is also replaced atomically, and the next flush retries it.
      try {
        this.#writeAtomically(`${entry.file}${BACKUP_SUFFIX}`, contents);
      } catch (backupError) {
        console.warn(`[store] could not back up ${entry.file}:`, backupError.message);
      }
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
