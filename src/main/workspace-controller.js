'use strict';

// Electron-free orchestration. Ownership is queried from the runtime registry,
// never cached here. All adapters are synchronous transactions: no event-loop
// yield can expose a half-switched session. Locks also reject reentrant calls.
function createWorkspaceController(adapter) {
  const busy = new Set();
  const reservations = new Set();
  const decisions = new Map();
  let serial = 0;
  const key = (runtime, target) => `${runtime.profileId}:${target}`;
  function authorize(runtime, target, options) {
    const protection = adapter.protection(runtime);
    if (protection.blocked) return { ok: false, error: 'protected-pages', reason: protection.reason };
    if (!protection.tabCount) return null;
    const fingerprint = adapter.fingerprint(runtime);
    const old = decisions.get(runtime.id);
    decisions.delete(runtime.id);
    if (options.decision && old && old.token === options.decision && old.target === target
      && old.fingerprint === fingerprint && old.expires > Date.now()) return null;
    const token = `${++serial}-${adapter.randomId()}`;
    decisions.set(runtime.id, { token, target, fingerprint, expires: Date.now() + 60000 });
    return { ok: false, error: 'unsaved-scratch', tabCount: protection.tabCount,
      privateCount: protection.privateCount, decision: token };
  }
  function operate(runtime, target, options, run) {
    const reservation = key(runtime, target);
    if (busy.has(runtime.id) || reservations.has(reservation)) return { ok: false, error: 'busy' };
    busy.add(runtime.id); reservations.add(reservation);
    if (!options.decision) decisions.delete(runtime.id);
    try { return run(); }
    catch { return { ok: false, error: 'activation-failed' }; }
    finally { busy.delete(runtime.id); reservations.delete(reservation); }
  }
  function activate(runtime, workspace, options) {
    const checkpoint = adapter.checkpoint(runtime);
    if (!checkpoint.ok) return checkpoint;
    let transition;
    try {
      transition = adapter.stage(runtime, workspace, options);
      const committed = transition.commit();
      if (!committed.ok) { transition.rollback(); return committed; }
      transition.finish();
      decisions.delete(runtime.id);
      return { ok: true, action: 'swap' };
    } catch {
      transition?.rollback();
      return { ok: false, error: 'activation-failed' };
    }
  }
  function open(runtime, id, options = {}) {
    return operate(runtime, id, options, () => {
      const workspace = adapter.get(runtime, id);
      if (!workspace) return { ok: false, error: adapter.readError?.(runtime) || 'not-found' };
      const holder = adapter.owner(runtime, id);
      if (holder === runtime) return { ok: true, action: 'noop' };
      if (holder && !holder.resident) return adapter.focus(holder);
      if (options.newWindow) return adapter.openElsewhere(runtime, workspace);
      const guard = authorize(runtime, id, options);
      if (guard) return guard;
      return activate(runtime, workspace, options);
    });
  }
  function create(runtime, name, options = {}) {
    return operate(runtime, `new:${name}`, options, () => {
      if (!adapter.canCreate()) return { ok: false, error: 'not-patron' };
      const validation = adapter.validateCreate?.(name);
      if (validation && !validation.ok) return validation;
      if (!options.newWindow) {
        const guard = authorize(runtime, `new:${name}`, options);
        if (guard) return guard;
      }
      const made = adapter.create(runtime, name);
      if (!made.ok) return made;
      const result = options.newWindow ? adapter.openElsewhere(runtime, made.workspace) : activate(runtime, made.workspace, options);
      // Keep a successfully saved new record recoverable if activation fails;
      // identify that partial success truthfully so the UI does not invite a
      // retry that can only fail with duplicate-name.
      return result.ok
        ? { ...result, workspaceId: made.workspace.id }
        : { ok: false, error: 'saved-not-opened', cause: result.error, workspaceId: made.workspace.id };
    });
  }
  return { open, create, cancel(runtime) { decisions.delete(runtime.id); } };
}
module.exports = { createWorkspaceController };
