'use strict';
const STATES = new Set(['idle', 'preparing', 'ready', 'restart-required', 'installation-failed', 'timed-out', 'updates-disabled', 'unsupported']);
const RESTARTABLE = new Set(['restart-required', 'installation-failed', 'timed-out']);
// A settings-only projection. Never expose component errors, paths or a way
// to select/download a CDM. Restart uses the ordinary unsaved-work guard.
function createDrmControls({ support, restart }) {
  async function status() {
    if (!support.enabled) return { enabled: false, state: 'unsupported', version: null, canRestart: false };
    let value;
    try { value = await support.inspect(); } catch { value = { state: 'installation-failed' }; }
    const state = STATES.has(value.state) ? value.state : 'installation-failed';
    return { enabled: true, state,
      version: /^\d+(?:\.\d+){3}$/.test(value.version || '') ? value.version : null,
      canRestart: RESTARTABLE.has(state) };
  }
  return { status, async restart() { return (await status()).canRestart ? Boolean(await restart()) : false; } };
}
module.exports = { createDrmControls };
