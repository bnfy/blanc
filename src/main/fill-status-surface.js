'use strict';

// Main-side controller for the fill-status capsule. Owns the single
// active-message record, the request-id transport, the readiness deadline
// with its first-visible-presentation boundary, and the native-dialog
// fallback. Pure and injectable: no require('electron') — main.js supplies
// the view, dialog, and focus dependencies (spec §1, plan Task 3).
//
// Identity model: every view-scoped event (rendererReady, viewGone,
// loadFailed) carries (runtimeId, viewId) and acts only when BOTH match the
// active record — runtime scoping alone would let a recreated view in the
// same window fail late and kill its replacement's message.
// invalidatePending is runtime-only: surface transitions are about the
// window, not a particular view.

const { FILL_KINDS, MODES } = require('./fill-status-kinds');

function createFillStatusSurface({
  ensureView,
  attach,
  hide,
  showFallbackDialog,
  restoreFocus,
  setTimeout,
  clearTimeout,
  readinessMs = 2000,
} = {}) {
  let nextRequestId = 0;
  let active = null;
  // { runtimeId, viewId, requestId, mode, kind, target, webContents,
  //   presented, deadline, resolve }

  const send = (channel, payload) => {
    const wc = active?.webContents;
    if (wc && !wc.isDestroyed?.()) wc.send(channel, payload);
  };

  const clearDeadline = () => {
    if (active?.deadline != null) {
      clearTimeout(active.deadline);
      active.deadline = null;
    }
  };

  /** Resolve a record's decision exactly once. Late resolutions — a native
   * fallback dialog answered after invalidation or displacement — are
   * ignored here, never re-delivered. */
  const resolveOnce = (record, outcome, { focus = false } = {}) => {
    if (record.settled) return;
    record.settled = true;
    if (focus) restoreFocus?.(record.target);
    if (record.resolve) record.resolve(outcome);
  };

  /** Tear down the record. A pending decision resolves `outcome` (or is
   * left for the fallback dialog when outcome is null). Every resolution
   * path funnels here so `activeFlow` can never be left waiting on a lost
   * message. */
  const settle = ({ outcome, sendHide = true, focus = false }) => {
    if (!active) return;
    const record = active;
    active = null;
    if (record.deadline != null) clearTimeout(record.deadline);
    if (sendHide && record.webContents && !record.webContents.isDestroyed?.()) {
      record.webContents.send('fill:hide', { requestId: record.requestId });
    }
    hide?.(record.target);
    if (outcome !== null) resolveOnce(record, outcome, { focus });
    else if (focus) restoreFocus?.(record.target); // notice replies have no outcome
  };

  /** Pre-presentation failure: the native dialog substitutes as the
   * presentation and answers the same pending decision. The record STAYS
   * active while the dialog is up — invalidation and displacement must be
   * able to cancel the decision (resolving exactly once), after which the
   * dialog's late answer is ignored. A native dialog cannot be dismissed
   * programmatically, so an invalidated one stays visible until answered
   * and its answer is dropped. */
  const fallBack = (record) => {
    if (record.deadline != null) {
      clearTimeout(record.deadline);
      record.deadline = null;
    }
    record.fallingBack = true;
    if (record.webContents && !record.webContents.isDestroyed?.()) {
      record.webContents.send('fill:hide', { requestId: record.requestId });
    }
    hide?.(record.target);
    Promise.resolve(showFallbackDialog(record.target, record.kind)).then(
      (answer) => {
        if (active === record) active = null;
        resolveOnce(record, answer === 'primary' ? 'primary' : 'cancel', { focus: true });
      },
      () => {
        if (active === record) active = null;
        resolveOnce(record, 'cancel');
      },
    );
  };

  const show = (target, kind, mode, resolve) => {
    // One message at a time: a new show displaces whatever is active.
    settle({ outcome: 'cancel' });
    const requestId = ++nextRequestId;
    const view = ensureView(target);
    const record = {
      runtimeId: target.runtimeId,
      viewId: view?.id ?? null,
      requestId,
      mode,
      kind,
      target,
      webContents: view?.webContents ?? null,
      presented: false,
      deadline: null,
      settled: false,
      fallingBack: false,
      resolve,
    };
    if (!view) {
      active = record; // keep it cancellable while the native dialog is up
      fallBack(record);
      return;
    }
    active = record;
    attach?.(target);
    if (view.loaded) {
      record.presented = true;
      send('fill:show', { kind, mode, requestId });
      return;
    }
    // Queued: nothing sent until rendererReady replays it, or the deadline
    // (or a matching loadFailed/viewGone) falls back to the native dialog.
    record.deadline = setTimeout(() => {
      if (active === record && !record.presented) fallBack(record);
    }, readinessMs);
  };

  return {
    notice(target, kind) {
      const def = FILL_KINDS[kind];
      if (!def || def.mode !== MODES.NOTICE) return Promise.resolve();
      show(target, kind, MODES.NOTICE, null);
      return Promise.resolve();
    },

    decision(target, kind) {
      const def = FILL_KINDS[kind];
      if (!def || def.mode !== MODES.DECISION) return Promise.resolve('cancel');
      return new Promise((resolve) => { show(target, kind, MODES.DECISION, resolve); });
    },

    handleReply(senderOk, payload) {
      if (senderOk !== true || !active || active.fallingBack) return;
      const requestId = payload?.requestId;
      const verb = payload?.verb;
      if (requestId !== active.requestId) return;
      if (!FILL_KINDS[active.kind].verbs.includes(verb)) return;
      const outcome = active.mode === MODES.DECISION
        ? (verb === 'cancel' ? 'cancel' : 'primary')
        : null;
      // The renderer already hid itself before replying.
      settle({ outcome, sendHide: false, focus: true });
    },

    rendererReady(runtimeId, viewId) {
      if (!active || active.presented || active.fallingBack) return;
      if (active.runtimeId !== runtimeId || active.viewId !== viewId) return;
      clearDeadline();
      active.presented = true;
      send('fill:show', { kind: active.kind, mode: active.mode, requestId: active.requestId });
    },

    viewGone(runtimeId, viewId) {
      if (!active || active.fallingBack) return;
      if (active.runtimeId !== runtimeId || active.viewId !== viewId) return;
      if (!active.presented) fallBack(active);
      else settle({ outcome: 'cancel', sendHide: false });
    },

    loadFailed(runtimeId, viewId) {
      if (!active || active.fallingBack) return;
      if (active.runtimeId !== runtimeId || active.viewId !== viewId) return;
      if (!active.presented) fallBack(active);
      else settle({ outcome: 'cancel', sendHide: false });
    },

    invalidatePending(runtimeId) {
      if (!active || active.runtimeId !== runtimeId) return;
      // Successor surface: cancel without stealing focus back.
      settle({ outcome: 'cancel' });
    },

    isShowing: () => active !== null,
  };
}

module.exports = { createFillStatusSurface };
