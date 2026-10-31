'use strict';
(() => {
  if (location.origin !== 'chrome://blanc-prototype' ||
      location.pathname !== '/appearance-settings.html' || window.top !== window) return;
  const toggle = document.getElementById('launch-sunrise');
  const status = document.getElementById('setting-status');
  let next = 0, busy = false, refreshQueued = false, serial = 0, persistenceMessage = '', observedRevision = 0n;
  const pending = new Map();
  window.blancSunriseSettingsReply = (id, ok, value) => {
    const item = pending.get(id); if (!item) return;
    pending.delete(id); clearTimeout(item.timer);
    if (ok) item.resolve(value); else item.reject(new Error(String(value || 'Appearance setting unavailable.')));
  };
  const send = (method, args = []) => new Promise((resolve, reject) => {
    const id = String(++next);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Appearance setting confirmation timed out.')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    chrome.send('blancSunriseSettings', [id, method, args]);
  });
  function accept(value) {
    if (!value || typeof value.enabled !== 'boolean' || typeof value.modifiable !== 'boolean') throw new Error('Invalid setting response');
    if (typeof value.revision !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value.revision)) throw new Error('Invalid setting revision');
    const revision = BigInt(value.revision);
    if (revision < observedRevision) { refreshQueued = true; return false; }
    if (revision > observedRevision && persistenceMessage === 'Saved on this device.')
      persistenceMessage = 'Current setting shown; saved state could not be confirmed.';
    observedRevision = revision;
    return true;
  }
  function render(value) {
    toggle.checked = value.enabled;
    toggle.disabled = !value.modifiable;
    status.textContent = !value.modifiable ? 'This setting is managed.' : persistenceMessage;
  }
  async function refresh() {
    if (busy) { refreshQueued = true; return; }
    busy = true; const current = ++serial; toggle.disabled = true;
    try { const value = await send('get'); if (current === serial && accept(value)) render(value); }
    catch { status.textContent = 'Appearance settings could not be read.'; }
    finally { busy = false; if (refreshQueued) { refreshQueued = false; refresh(); } }
  }
  window.blancSunriseSettingsChanged = revision => {
    if (typeof revision !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(revision)) {
      persistenceMessage = 'Current setting shown; saved state could not be confirmed.';
      refresh(); return;
    }
    const nextRevision = BigInt(revision);
    if (nextRevision <= observedRevision) return;
    observedRevision = nextRevision;
    persistenceMessage = 'Current setting shown; saved state could not be confirmed.';
    status.textContent = persistenceMessage;
    refresh();
  };
  toggle.addEventListener('change', async () => {
    if (busy) return;
    busy = true; ++serial; toggle.disabled = true;
    persistenceMessage = 'Current setting shown; saved state could not be confirmed.';
    try {
      const value = await send('set', [toggle.checked]);
      if (accept(value)) {
        persistenceMessage = value.persisted === true ? 'Saved on this device.' :
          'Current setting shown; saved state could not be confirmed.';
        render(value);
      }
    } catch {
      status.textContent = 'Change could not be confirmed. Checking the current setting…';
      refreshQueued = true;
    } finally { busy = false; if (refreshQueued) { refreshQueued = false; refresh(); } }
  });
  refresh();
})();
