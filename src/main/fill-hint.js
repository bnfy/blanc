'use strict';

// Ambient login-form hint for the 1Password fill (spec §5): a structure-only
// isolated-world probe drives the pill's key glyph. Pure and injectable — no
// require('electron'); main.js supplies liveness, eligibility, and timers.
//
// Every scheduled probe and its single delayed recheck capture the tab's
// navigation epoch AND WebContents-identity token at schedule time, and
// revalidate BOTH plus eligibility before applying any result — a
// quiet/wake renderer replacement, a navigation, or a disable mid-flight
// discards the result rather than hinting a page that no longer matches.
// Errors are swallowed: the ambient path never produces user-visible
// output beyond the hint boolean itself.

/** Authoritative signal + genuinely visible, per the reviewed contract: an
 * autocomplete token list carrying new-password alongside current-password
 * is a contradiction (signup/reset), and opacity-zero or fully off-screen
 * fields are not an affordance the user can see. Mirrors the visibility
 * idiom collectCandidates already uses (onepassword-policy.js) —
 * checkVisibility plus viewport intersection. Structure only; never reads
 * values or text. */
function buildHintProbeScript() {
  return `(() => {
    try {
      const els = document.querySelectorAll('input[type=password]');
      const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      for (const el of els) {
        const tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\\s+/);
        if (!tokens.includes('current-password') || tokens.includes('new-password')) continue;
        const visible = typeof el.checkVisibility === 'function'
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : true;
        if (!visible) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0
            && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw) return true;
      }
    } catch {}
    return false;
  })()`;
}

/** Two {onePasswordEnabled, onePasswordAccount} pairs → what the hint
 * scheduler should do about the change: 'became-eligible' (probe the active
 * tab now), 'cleared' (cancel everything), or null (noise). An account edit
 * while enabled clears — the old account's hints are meaningless — but
 * trim-equal edits are noise. */
function configTransition(prev, next) {
  const eligible = (pair) => pair?.onePasswordEnabled === true
    && String(pair?.onePasswordAccount ?? '').trim().length > 0;
  const was = eligible(prev);
  const is = eligible(next);
  if (!was && is) return 'became-eligible';
  if (was && !is) return 'cleared';
  if (was && is
      && String(prev.onePasswordAccount ?? '').trim() !== String(next.onePasswordAccount ?? '').trim()) {
    return 'cleared';
  }
  return null;
}

function createFillHintScheduler({
  runProbe,
  isEligible,
  tabEpoch,
  contentsToken,
  onHint,
  setTimeout,
  clearTimeout,
  recheckMs = 2500,
} = {}) {
  // tab.id → { tab, epoch, token, timer, probedEpoch, hinted }
  const records = new Map();

  const recordFor = (tab) => {
    // Deliberately reuses a still-registered record (same generation: a
    // re-probe of the same tab supersedes via cancelTimer + fresh
    // epoch/token) but a cleared tab gets a NEW object, which is what
    // invalidates any probe still in flight from before the clear.
    let record = records.get(tab.id);
    if (!record) {
      record = { tab, epoch: null, token: null, timer: null, probedEpoch: null, hinted: false };
      records.set(tab.id, record);
    }
    record.tab = tab;
    return record;
  };

  const cancelTimer = (record) => {
    if (record.timer !== null) {
      clearTimeout(record.timer);
      record.timer = null;
    }
  };

  const retract = (record) => {
    if (!record.hinted) return;
    record.hinted = false;
    onHint(record.tab, false);
  };

  const stillValid = (record, epoch, token) => token !== null
    // Registration binds the run to its generation: clearTab/clearAll
    // delete the record and a post-clear probe creates a NEW object, so an
    // in-flight probe from before the clear can never publish late — even
    // when eligibility, epoch, and token all still hold (an enabled
    // account A→B change is exactly that case).
    && records.get(record.tab.id) === record
    && isEligible(record.tab)
    && tabEpoch(record.tab) === epoch
    && contentsToken(record.tab) === token;

  const runOnce = (record, epoch, token, { allowRecheck }) => {
    let result;
    try {
      result = runProbe(record.tab); // synchronous call; async settlement
    } catch {
      return; // ambient path: never surface anything
    }
    Promise.resolve(result)
      .then((found) => {
        if (!stillValid(record, epoch, token)) return;
        if (found === true) {
          record.hinted = true;
          onHint(record.tab, true);
          return;
        }
        if (!allowRecheck) return;
        // One delayed recheck catches client-rendered forms; a miss after
        // that is the documented limitation.
        record.timer = setTimeout(() => {
          record.timer = null;
          if (!stillValid(record, epoch, token)) return;
          runOnce(record, epoch, token, { allowRecheck: false });
        }, recheckMs);
      })
      .catch(() => {}); // ambient path: never surface anything
  };

  const probeTab = (tab) => {
    if (!isEligible(tab)) return;
    const token = contentsToken(tab);
    if (token === null || token === undefined) return;
    const record = recordFor(tab);
    cancelTimer(record);
    retract(record); // a new document invalidates the old page's hint
    const epoch = tabEpoch(tab);
    record.epoch = epoch;
    record.token = token;
    record.probedEpoch = epoch;
    runOnce(record, epoch, token, { allowRecheck: true });
  };

  return {
    probeTab,
    notePageLoad: (tab) => probeTab(tab),
    noteInPageNavigation: (tab) => probeTab(tab),
    noteActivated: (tab) => {
      const record = records.get(tab.id);
      if (record && record.probedEpoch === tabEpoch(tab)) return; // already covered
      probeTab(tab);
    },
    noteConfigChanged: (activeTab) => { if (activeTab) probeTab(activeTab); },
    clearTab: (tab) => {
      const record = records.get(tab.id);
      if (!record) return;
      cancelTimer(record);
      retract(record);
      records.delete(tab.id);
    },
    clearAll: () => {
      for (const record of records.values()) {
        cancelTimer(record);
        retract(record);
      }
      records.clear();
    },
  };
}

module.exports = { buildHintProbeScript, configTransition, createFillHintScheduler };
