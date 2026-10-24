'use strict';
// Navigations the startup or profile navigation gate actually refused,
// queued and then replayed. Chromium can deliver the refused load's failure
// (ERR_BLOCKED_BY_CLIENT, -20) after the gate opened and replayed the
// navigation; that failure belongs to the refusal, not to the replay, and must
// not replace the tab with an error page.
//
// Attribution is navigation-aware, not URL-and-time alone:
// - a refusal is only pending until the gate replays that exact URL, which
//   arms it; refusals that were superseded and never replayed can never match;
// - after arming, new-document main-frame navigation starts in that contents
//   are counted (commits and same-document navigations are not). The replay's
//   own start is the first; a late -20 matches only while at most that one
//   start has happened, so the replay committing does not invalidate it but
//   any other navigation starting does;
// - if a blocking provider (or a policy failure) cancels the replayed request
//   itself, the record is disarmed so that block is shown;
// - a failure for that URL already handled elsewhere (while the gate was
//   active, or ignored as not presentable) settles the record;
// - each record matches at most once, within a short window.
// Every other failure is presented exactly as before. Nothing is retried; the
// gates' own replay is unchanged.
const ERR_BLOCKED_BY_CLIENT = -20;
const WINDOW_MS = 30000;
const MAX_PER_CONTENTS = 8;

function createGateRefusals({ now = () => Date.now(), windowMs = WINDOW_MS } = {}) {
  const byContents = new Map();
  function live(id) {
    const list = (byContents.get(id) || []).filter(entry => now() - entry.at <= windowMs);
    if (list.length) byContents.set(id, list); else byContents.delete(id);
    return list;
  }
  function remove(id, entry) {
    const list = byContents.get(id) || [];
    const index = list.indexOf(entry);
    if (index >= 0) list.splice(index, 1);
    if (!list.length) byContents.delete(id);
  }
  const validId = id => Number.isInteger(id) && id > 0;
  return {
    noteRefused(id, url) {
      if (!validId(id) || typeof url !== 'string' || !/^https?:/i.test(url)) return;
      const list = live(id);
      list.push({ url, at: now(), armed: null });
      while (list.length > MAX_PER_CONTENTS) list.shift();
      byContents.set(id, list);
    },
    // The gate is about to replay `url` in this contents (called before its
    // loadURL). Only a pending refusal of that exact URL is armed; every other
    // refusal of this contents was superseded and is dropped.
    armReplay(id, url) {
      const list = live(id);
      const entry = list.find(item => item.url === url && item.armed === null);
      byContents.delete(id);
      if (!entry) return;
      entry.armed = true;
      entry.starts = 0;
      entry.at = now();
      byContents.set(id, [entry]);
    },
    // A new-document main-frame navigation started in this contents. The
    // first after arming is the replay itself; a second supersedes it.
    noteNavigationStart(id) {
      for (const entry of [...live(id)]) {
        if (entry.armed !== true) continue;
        entry.starts += 1;
        if (entry.starts > 1) remove(id, entry);
      }
    },
    // A provider or policy cancelled the replayed request itself: show it.
    disarm(id, url) {
      for (const entry of [...live(id)]) if (entry.url === url) remove(id, entry);
    },
    // The refusal's failure was already handled (gate active, or ignored).
    settle(id, url) {
      const entry = live(id).find(item => item.url === url);
      if (entry) remove(id, entry);
    },
    // True only for the armed refusal's own late -20 while no navigation other
    // than the replay has started.
    consumeLateFailure(id, url, code) {
      const entry = live(id).find(item => item.url === url && item.armed === true);
      if (!entry) return false;
      if (code !== ERR_BLOCKED_BY_CLIENT) return false;
      remove(id, entry);
      return entry.starts <= 1;
    },
    forget(id) { byContents.delete(id); },
    pending(id) { return live(id).length; },
  };
}

module.exports = { createGateRefusals, ERR_BLOCKED_BY_CLIENT, WINDOW_MS, MAX_PER_CONTENTS };
