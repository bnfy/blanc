'use strict';

// A newly opened profile must not race its native extension background. Keep
// GET main-frame navigation in memory while that profile initializes. POST is
// never queued or replayed. Failed providers keep the gate until retry succeeds
// or the user explicitly disables blocking.
const MAX_PENDING = 256;
function createProfileNavigationGates({ coordinator, queued, resolveContents, ready, enabled, startupActive }) {
  const profiles = new Map();
  function prune(entry) {
    for (const [id, item] of entry.pending) {
      const target = resolveContents(id);
      if (target && !target.tab.private && target.tab.profileId === entry.profileId && target.wc === item.wc && target.tab.navEpoch === item.epoch) continue;
      entry.pending.delete(id); queued.delete(id);
    }
  }
  function listener(entry, details) {
    if (details.resourceType !== 'mainFrame') return false;
    prune(entry);
    const id = details.webContentsId;
    if (!enabled() || !startupActive() && ready(entry.profileId)) return false;
    // A replacement navigation supersedes the old deferred destination.
    entry.pending.delete(id); queued.delete(id);
    if (!/^https?:/i.test(details.url)) return false;
    const target = resolveContents(id);
    if (entry.pending.size < MAX_PENDING && details.method === 'GET' && target && target.tab.profileId === entry.profileId && !target.tab.private) {
      entry.pending.set(id, { wc: target.wc, epoch: target.tab.navEpoch, url: details.url });
      queued.set(id, details.url);
    }
    return true;
  }
  function hold(profileId, session) {
    if (profiles.has(profileId)) return;
    const entry = { profileId, session, pending: new Map() };
    entry.listener = details => listener(entry, details);
    profiles.set(profileId, entry);
    coordinator.setGate(session, entry.listener);
  }
  function owns(id) { return [...profiles.values()].some(entry => entry.pending.has(id)); }
  function reconcile() {
    for (const [profileId, entry] of profiles) {
      prune(entry);
      if (startupActive() || enabled() && !ready(profileId)) {
        coordinator.setGate(entry.session, entry.listener); continue;
      }
      profiles.delete(profileId);
      coordinator.setGate(entry.session, null);
      for (const [id, item] of entry.pending) {
        queued.delete(id);
        const target = resolveContents(id);
        if (!target || target.tab.private || target.tab.profileId !== profileId || target.wc !== item.wc || target.tab.navEpoch !== item.epoch) continue;
        target.wc.loadURL(item.url).catch(() => {});
      }
    }
  }
  function active(tab) { return !!tab && !tab.private && profiles.has(tab.profileId); }
  function forget(profileId) {
    const entry = profiles.get(profileId);
    if (!entry) return;
    for (const id of entry.pending.keys()) queued.delete(id);
    coordinator.setGate(entry.session, null);
    profiles.delete(profileId);
  }
  return { hold, reconcile, owns, active, forget };
}
module.exports = { createProfileNavigationGates, MAX_PENDING };
