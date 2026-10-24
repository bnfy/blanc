'use strict';
// Navigations the startup or profile navigation gate actually refused and
// queued for replay. Chromium can deliver that refused load's failure
// (ERR_BLOCKED_BY_CLIENT, -20) after the gate has opened and replayed the
// navigation; the failure belongs to the refusal, not to the replay, and must
// not replace the tab with an error page.
//
// Only that exact case matches: the same WebContents, the exact refused URL,
// error -20, at most once per refusal, within a short window. Every other
// failure, including an unrelated ERR_BLOCKED_BY_CLIENT from a blocking
// provider, is presented exactly as before. No navigation is retried here;
// the gates' own replay is unchanged.
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
  function take(id, url) {
    const list = live(id);
    const index = list.findIndex(entry => entry.url === url);
    if (index < 0) return false;
    list.splice(index, 1);
    if (!list.length) byContents.delete(id);
    return true;
  }
  return {
    noteRefused(id, url) {
      if (!Number.isInteger(id) || id <= 0 || typeof url !== 'string' || !/^https?:/i.test(url)) return;
      const list = live(id);
      list.push({ url, at: now() });
      while (list.length > MAX_PER_CONTENTS) list.shift();
      byContents.set(id, list);
    },
    // The refusal's failure arrived while the gate was still active and was
    // already kept off the error page; drop the record so it cannot match later.
    settle(id, url) { take(id, url); },
    // True only for the late -20 failure of a navigation the gate refused.
    consumeLateFailure(id, url, code) {
      if (code !== ERR_BLOCKED_BY_CLIENT) return false;
      return take(id, url);
    },
    forget(id) { byContents.delete(id); },
    pending(id) { return live(id).length; },
  };
}

module.exports = { createGateRefusals, ERR_BLOCKED_BY_CLIENT, WINDOW_MS, MAX_PER_CONTENTS };
