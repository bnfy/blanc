'use strict';
const { normalizeOrder } = require('../renderer/tab-sections');

/** Compute every edit before main applies any of them. */
function planTabEdits(list, ids, action, { groupId = null, muted = tab => tab.muted, pinnedHome = () => null } = {}) {
  const wanted = new Set(ids);
  const members = list.filter(tab => wanted.has(tab.id));
  if (members.length !== wanted.size || !members.length) return null;
  const pin = !members.every(tab => tab.pinned);
  const mute = !members.every(muted);
  const patches = members.map(tab => ({ id: tab.id, patch:
    action === 'pin' ? { pinned: pin, pinnedHomeUrl: pin ? pinnedHome(tab) : null }
      : action === 'mute' ? { muted: mute, siteUnmuted: !mute && !!tab.siteMuted, backgroundAutoplayMuted: false }
      : { groupId } }));
  const byId = new Map(patches.map(p => [p.id, p.patch]));
  let next = list.map(tab => ({ ...tab, ...byId.get(tab.id) }));
  if (action === 'group' && groupId) {
    const rest = next.filter(tab => !wanted.has(tab.id));
    const at = rest.findLastIndex(tab => tab.groupId === groupId) + 1;
    rest.splice(at || rest.length, 0, ...next.filter(tab => wanted.has(tab.id)));
    next = rest;
  } else if (action === 'group') {
    // Remove from Group: as for one tab (placeInGroup, spec 2026-10-17 §5.3),
    // tabs leaving a group land directly below what remains of it, in order.
    // A group they empty leaves them where they were.
    const left = new Map();
    for (const tab of members) if (tab.groupId) left.set(tab.groupId, [...(left.get(tab.groupId) ?? []), tab.id]);
    for (const [from, leaving] of left) {
      const remaining = next.filter(tab => !wanted.has(tab.id) && tab.groupId === from);
      if (!remaining.length) continue;
      const moving = next.filter(tab => leaving.includes(tab.id));
      next = next.filter(tab => !leaving.includes(tab.id));
      next.splice(next.indexOf(remaining.at(-1)) + 1, 0, ...moving);
    }
  } else if (action === 'pin' && !pin) next = [...next.filter(tab => !wanted.has(tab.id) || tab.groupId), ...next.filter(tab => wanted.has(tab.id) && !tab.groupId)];
  return { patches, order: normalizeOrder(next) };
}

async function runPerTab(ids, perform) {
  const done = [], remaining = [];
  for (const id of ids) {
    let ok = false;
    try { ok = await perform(id) === true; } catch { /* this member stays selected */ }
    (ok ? done : remaining).push(id);
  }
  return { done, remaining };
}
module.exports = { planTabEdits, runPerTab };
