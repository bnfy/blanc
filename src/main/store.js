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
/** Profiles deleted this launch: their entries are inert from now on. */
const tombstoned = new Set();
// profileId → the promise for that profile's in-flight writes, so a repeated
// or overlapping discard waits for the same writes instead of finding no
// entries and returning at once.
const profileDrains = new Map();

/**
 * Minimal JSON-file persistence. Device stores keep their one root file;
 * profile stores retain Personal's shipped root file and place each named
 * profile beneath `profiles/<opaque-id>/`. AsyncLocalStorage selects entries,
 * so overlapping window callbacks cannot race a shared module singleton.
 */
class JsonStore {
  /**
   * @param {string} name - file becomes `<userData>/<name>.json`
   * @param {object} defaults - shape used when the file is missing/corrupt
   * @param {{scope?: 'device'|'profile'}} options
   */
  constructor(name, defaults, { scope = 'device', quietErrors = false } = {}) {
    this.name = name;
    this.defaults = defaults;
    this.scope = scope === 'profile' ? 'profile' : 'device';
    this.quietErrors = quietErrors;
    this.entries = new Map();
    instances.push(this);
  }

  #profileId() {
    return this.scope === 'profile' ? activeLocalProfileId() : DEFAULT_PROFILE_ID;
  }

  #fileFor(profileId) {
    const root = app.getPath('userData');
    if (this.scope !== 'profile' || profileId === DEFAULT_PROFILE_ID) {
      return path.join(root, `${this.name}.json`);
    }
    return path.join(root, 'profiles', profileId, `${this.name}.json`);
  }

  #load(file) {
    try {
      const loaded = { ...this.defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      // Tighten legacy files on first read, not only after their next update.
      // Windows ignores POSIX mode bits; on Unix this removes group/world
      // access inherited from an older umask-based write.
      try { fs.chmodSync(file, 0o600); } catch { /* platform/best effort */ }
      return loaded;
    } catch {
      return structuredClone(this.defaults);
    }
  }

  #entry() {
    const profileId = this.#profileId();
    if (this.scope === 'profile' && tombstoned.has(profileId)) {
      let inert = this.entries.get(profileId);
      if (!inert?.inert) {
        // A deleted profile: in-memory only, never loaded or written, so
        // nothing can recreate its folder.
        inert = {
          file: this.#fileFor(profileId), data: structuredClone(this.defaults), saveTimer: null, pendingSince: null,
          changeSeq: 0, committedChangeSeq: 0, writeSeq: 0, committedWriteSeq: 0,
          inFlight: null, rewrite: false, discarded: true, inert: true, waiters: [],
        };
        this.entries.set(profileId, inert);
      }
      return inert;
    }
    let entry = this.entries.get(profileId);
    if (!entry) {
      const file = this.#fileFor(profileId);
      entry = {
        file,
        data: this.#load(file),
        saveTimer: null,
        pendingSince: null,
        // Routine saves run off main; one shared write sequence decides which
        // write may replace the file (spec 2026-10-06-jsonstore-async-saves).
        changeSeq: 0,
        committedChangeSeq: 0,
        writeSeq: 0,
        committedWriteSeq: 0,
        inFlight: null,
        rewrite: false,
        discarded: false,
        inert: false,
        waiters: [],
      };
      this.entries.set(profileId, entry);
    }
    return entry;
  }

  get file() { return this.#entry().file; }
  get data() { return this.#entry().data; }
  get saveTimer() { return this.#entry().saveTimer; }

  /** Mutate the active device/profile entry, then schedule a save. */
  update(fn) {
    const entry = this.#entry();
    fn(entry.data);
    if (entry.inert) return;
    entry.changeSeq++;
    this.#scheduleSave(entry);
  }

  /** Critical transition: rollback memory too if the synchronous write fails. */
  updateAndFlush(fn) {
    const entry = this.#entry();
    if (entry.inert) return false;
    const previous = structuredClone(entry.data);
    const previousChangeSeq = entry.changeSeq;
    const pendingSince = entry.pendingSince;
    const hadPendingSave = !!entry.saveTimer;
    fn(entry.data);
    entry.changeSeq++;
    if (this.#flush(entry)) return true;
    entry.data = previous;
    entry.changeSeq = previousChangeSeq;
    if (hadPendingSave) {
      entry.pendingSince = pendingSince;
      this.#scheduleSave(entry);
    }
    return false;
  }

  #scheduleSave(entry) {
    entry.pendingSince ??= Date.now();
    if (Date.now() - entry.pendingSince >= MAX_SAVE_DELAY_MS) return this.#routine(entry);
    clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => this.#routine(entry), SAVE_DELAY_MS);
  }

  #dirtyEntry(entry) { return entry.changeSeq > entry.committedChangeSeq; }

  #settleWaiters(entry, failedUpTo = -1) {
    entry.waiters = entry.waiters.filter(waiter => {
      if (entry.committedChangeSeq >= waiter.target) { waiter.resolve(true); return false; }
      if (entry.discarded || waiter.target <= failedUpTo) { waiter.resolve(false); return false; }
      return true;
    });
  }

  /** The routine save: written and flushed to disk off main, committed by a
   * sequence-checked rename on main. */
  #routine(entry) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
    entry.pendingSince = null;
    if (entry.discarded) return;
    if (entry.inFlight) { entry.rewrite = true; return; }
    if (!this.#dirtyEntry(entry)) { this.#settleWaiters(entry); return; }
    const changeSeq = entry.changeSeq;
    let json;
    try {
      json = JSON.stringify(entry.data, null, 2);
    } catch (err) {
      // Nothing was written: stay dirty (quit or a later save retries), fail
      // the waiters this write covered, and never throw out of the timer.
      if (!this.quietErrors) console.warn(`[store] could not serialize ${entry.file}:`, err.message);
      this.#settleWaiters(entry, changeSeq);
      return;
    }
    const writeSeq = ++entry.writeSeq;
    const temp = `${entry.file}.${process.pid}.${writeSeq}.tmp`;
    let ok = false;
    const run = async () => {
      let handle = null;
      try {
        await fs.promises.mkdir(path.dirname(entry.file), { recursive: true });
        if (entry.discarded) return;
        handle = await fs.promises.open(temp, 'w', 0o600);
        await handle.writeFile(json, 'utf8');
        await handle.chmod(0o600);
        await handle.sync();
        await handle.close();
        handle = null;
        // Commit in one synchronous step: nothing else runs on main between
        // this check and the rename, so an older write cannot land last.
        if (entry.discarded || writeSeq <= entry.committedWriteSeq) return;
        fs.renameSync(temp, entry.file);
        entry.committedWriteSeq = writeSeq;
        entry.committedChangeSeq = Math.max(entry.committedChangeSeq, changeSeq);
        ok = true;
      } catch (err) {
        if (!this.quietErrors) console.warn(`[store] could not write ${entry.file}:`, err.message);
      } finally {
        if (handle) { try { await handle.close(); } catch { /* best effort */ } }
        if (!ok) { try { await fs.promises.rm(temp, { force: true }); } catch { /* best effort */ } }
      }
    };
    entry.inFlight = run().then(() => {
      entry.inFlight = null;
      this.#settleWaiters(entry, ok ? -1 : changeSeq);
      if (entry.rewrite && !entry.discarded) {
        entry.rewrite = false;
        if (this.#dirtyEntry(entry)) this.#routine(entry);
      }
    });
  }

  /** Whether the active entry has changes not yet committed to disk. */
  get dirty() { return this.#dirtyEntry(this.#entry()); }

  #waitFor(entry, target) {
    return new Promise(resolve => { entry.waiters.push({ target, resolve }); this.#routine(entry); });
  }

  /** Apply a change and write it now, off the main thread (no rollback). */
  updateAndCommit(fn) {
    const entry = this.#entry();
    if (entry.inert) return Promise.resolve(false);
    fn(entry.data);
    entry.changeSeq++;
    return this.#waitFor(entry, entry.changeSeq);
  }

  /** Write already-applied changes now, off the main thread. */
  commitPending() {
    const entry = this.#entry();
    if (entry.inert) return Promise.resolve(false);
    if (!this.#dirtyEntry(entry)) return Promise.resolve(true);
    return this.#waitFor(entry, entry.changeSeq);
  }

  /** Test support: resolves when the active entry has no routine write in flight. */
  async settled() {
    const entry = this.#entry();
    while (entry.inFlight) await entry.inFlight;
  }

  /** @returns {boolean} whether the write actually reached disk — callers
   * that promise the user something persisted (e.g. the install-id reset)
   * must not report success off a swallowed write error. */
  flush() {
    return this.#flush(this.#entry());
  }

  flushPending() {
    for (const entry of this.entries.values()) {
      if (this.#dirtyEntry(entry)) this.#flush(entry);
    }
  }

  #flush(entry) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
    entry.pendingSince = null;
    if (entry.inert) return false;
    const writeSeq = ++entry.writeSeq;
    const changeSeq = entry.changeSeq;
    const tempFile = `${entry.file}.${process.pid}.${writeSeq}.tmp`;
    let descriptor = null;
    try {
      fs.mkdirSync(path.dirname(entry.file), { recursive: true });
      descriptor = fs.openSync(tempFile, 'w', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(entry.data, null, 2), 'utf8');
      fs.fchmodSync(descriptor, 0o600);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;
      fs.renameSync(tempFile, entry.file);
      entry.committedWriteSeq = writeSeq;
      entry.committedChangeSeq = Math.max(entry.committedChangeSeq, changeSeq);
      this.#settleWaiters(entry);
      return true;
    } catch (err) {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); } catch { /* best effort */ }
      }
      try { fs.rmSync(tempFile, { force: true }); } catch { /* best effort */ }
      if (!this.quietErrors) console.warn(`[store] could not write ${entry.file}:`, err.message);
      return false;
    }
  }
}

app.on('before-quit', () => {
  for (const store of instances) {
    store.flushPending();
  }
});

/** Tombstone a deleted profile and resolve once its in-flight writes have
 * closed their files and removed their temp files. */
async function discardProfileStoreEntries(profileId) {
  if (!validProfileId(profileId) || profileId === DEFAULT_PROFILE_ID) return false;
  tombstoned.add(profileId);
  const flights = profileDrains.has(profileId) ? [profileDrains.get(profileId)] : [];
  for (const store of instances) {
    if (store.scope !== 'profile') continue;
    const entry = store.entries.get(profileId);
    if (!entry || entry.inert) continue;
    entry.discarded = true;
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
    for (const waiter of entry.waiters) waiter.resolve(false);
    entry.waiters = [];
    if (entry.inFlight) flights.push(entry.inFlight);
    store.entries.delete(profileId);
  }
  const drain = Promise.allSettled(flights).then(() => {
    if (profileDrains.get(profileId) === drain) profileDrains.delete(profileId);
  });
  profileDrains.set(profileId, drain);
  await drain;
  return true;
}

module.exports = { JsonStore, discardProfileStoreEntries };
