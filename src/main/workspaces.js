'use strict';

// The only writer of profile-local workspace files. Critical operations are
// durable before success. Background captures remain queued until durable;
// recovery state here contains only the normal session columns, never pages.
const crypto = require('crypto');
const fs = require('fs');
const { JsonStore } = require('./store');
const { activeLocalProfileId, withLocalProfile } = require('./local-profile-context');
const model = require('./workspaces-model');

function createRepository({ store = new JsonStore('workspaces', model.EMPTY_FILE(), { scope: 'profile', quietErrors: true }), io = fs, clock = Date.now, makeId = crypto.randomUUID } = {}) {
  const profiles = new Map();
  let onStatus = () => {};
  function state() {
    const profileId = activeLocalProfileId();
    if (profiles.has(profileId)) return profiles.get(profileId);
    const current = { status: 'saved', pending: new Map(), timer: null, attempts: 0 };
    profiles.set(profileId, current);
    let bytes;
    try { bytes = io.readFileSync(store.file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') current.status = 'read-failed';
      return current;
    }
    let raw;
    try { raw = JSON.parse(bytes); } catch { raw = null; }
    const loaded = model.loadFile(raw);
    if (loaded.status === 'future-format') {
      current.status = 'future-format';
      return current;
    }
    const repaired = loaded.file;
    repaired.workspaces = repaired.workspaces.filter((w) => w.profileId === profileId);
    repaired.deleted = repaired.deleted.filter((d) => d.workspace.profileId === profileId);
    if (JSON.stringify(repaired) !== JSON.stringify(raw)) {
      // Preserve the exact original before any supported-format repair/migration.
      // A fresh unique name avoids replacing a previous recovery copy.
      let fd;
      try {
        fd = io.openSync(`${store.file}.before-repair-${makeId()}.bak`, 'wx', 0o600);
        io.writeFileSync(fd, bytes, 'utf8');
        io.fsyncSync(fd);
        io.closeSync(fd); fd = null;
        if (!store.updateAndFlush((data) => { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, repaired); })) throw new Error('write');
      } catch {
        if (fd != null) { try { io.closeSync(fd); } catch {} }
        current.status = 'repair-failed';
      }
    }
    return current;
  }
  const unavailable = (s) => ['future-format', 'repair-failed', 'read-failed'].includes(s.status);
  function status() { return state().status; }
  function list() {
    const s = state();
    if (unavailable(s)) return [];
    return store.data.workspaces.filter((w) => w.profileId === activeLocalProfileId());
  }
  const get = (id) => list().find((w) => w.id === id) ?? null;
  function write(result) {
    const s = state();
    if (unavailable(s)) return { ok: false, error: s.status };
    if (result.error) return { ok: false, error: result.error };
    if (!result.file) return { ok: false, error: 'not-found' };
    if (!result.unchanged && !store.updateAndFlush((data) => Object.assign(data, result.file))) {
      s.status = 'storage-failed'; onStatus();
      return { ok: false, error: 'storage-failed' };
    }
    s.status = s.pending.size ? 'pending' : 'saved'; s.attempts = 0; onStatus();
    return { ok: true, ...(result.workspace ? { workspace: result.workspace } : {}) };
  }
  function mutate(operation) {
    const s = state();
    return unavailable(s) ? { ok: false, error: s.status } : write(operation(store.data));
  }
  function saveCapture(id, capture) {
    const result = mutate((data) => { const changed = model.updateCapture(data, id, capture, clock()); return changed.workspace ? changed : { error: 'not-found' }; });
    if (result.ok) state().pending.delete(id);
    return result;
  }
  function flushPending() {
    const s = state();
    clearTimeout(s.timer); s.timer = null;
    for (const [id, capture] of s.pending) {
      const result = saveCapture(id, capture);
      if (!result.ok && result.error !== 'not-found') {
        scheduleRetry(s); return result;
      }
      s.pending.delete(id);
    }
    s.status = unavailable(s) ? s.status : 'saved'; onStatus();
    return { ok: true };
  }
  function scheduleRetry(s) {
    if (s.timer || unavailable(s)) return;
    const profileId = activeLocalProfileId();
    const delay = Math.min(30000, 250 * 2 ** Math.min(s.attempts++, 7));
    s.timer = setTimeout(() => withLocalProfile(profileId, flushPending), delay);
    s.timer.unref?.();
  }
  function queueCapture(id, capture) {
    const s = state();
    if (unavailable(s)) return { ok: false, error: s.status };
    const current = get(id);
    if (!current) return { ok: false, error: 'not-found' };
    const columns = model.captureColumns(capture);
    if (!s.pending.has(id) && JSON.stringify(model.captureColumns(current)) === JSON.stringify(columns)) return { ok: true };
    s.pending.set(id, columns);
    if (s.status !== 'storage-failed' && s.status !== 'pending') { s.status = 'pending'; onStatus(); }
    scheduleRetry(s);
    return { ok: true };
  }
  return {
    list, get, status, saveCapture, queueCapture, flushPending,
    setStatusObserver(fn) { onStatus = typeof fn === 'function' ? fn : () => {}; },
    validateCreate(name) {
      const s = state(); if (unavailable(s)) return { ok: false, error: s.status };
      const result = model.createWorkspace(store.data, { name, capture: {}, now: clock(), id: makeId(), profileId: activeLocalProfileId() });
      return result.error ? { ok: false, error: result.error } : { ok: true };
    },
    create({ name, capture }) { return mutate((data) => model.createWorkspace(data, { name, capture, now: clock(), id: makeId(), profileId: activeLocalProfileId() })); },
    rename(id, name) { return mutate((data) => model.renameWorkspace(data, id, name, clock())); },
    remove(id) {
      const s = state();
      const result = mutate((data) => { const r = model.deleteWorkspace(data, id, clock()); return r.removed ? r : { error: 'not-found' }; });
      if (result.ok) s.pending.delete(id);
      return result;
    },
    deleted() {
      const s = state();
      if (unavailable(s)) return [];
      const remaining = store.data.deleted.filter((d) => clock() - d.deletedAt < model.RECOVERY_TTL_MS);
      if (remaining.length !== store.data.deleted.length && !store.updateAndFlush((data) => { data.deleted = remaining; })) s.status = 'storage-failed';
      return remaining;
    },
    restore(id) { return mutate((data) => model.restoreWorkspace(data, id, clock())); },
    move(id, direction) { return mutate((data) => model.moveWorkspace(data, id, direction)); },
    forget(id) { return mutate((data) => data.deleted.some((d) => d.workspace.id === id) ? { file: { ...data, deleted: data.deleted.filter((d) => d.workspace.id !== id) } } : { error: 'not-found' }); },
    disposeProfile(profileId) { clearTimeout(profiles.get(profileId)?.timer); profiles.delete(profileId); },
  };
}
const repository = createRepository();
module.exports = { ...repository, createRepository };
