'use strict';

// Draft adapter around the shipping tab-switcher model. Each runtime is one
// native window. The embedding must feed authoritative snapshots and perform
// the final same-window/profile check in native code before activation.
const shipping = require('./shipping-tab-switcher.cjs');

function createSnapshotController({ activate, onChange = () => {} }) {
  if (typeof activate !== 'function') throw new TypeError('activate required');
  const windows = new WeakMap();
  const stateFor = runtime => windows.get(runtime);
  const publicSession = session => session ? {...session, order:[...session.order]} : null;
  const switcher = shipping.createTabSwitcher({
    orderFor(runtime) {
      const state = stateFor(runtime);
      return shipping.switcherOrder({
        activeTabId: state.active,
        history: state.history,
        tabOrder: state.order,
        splitOf: id => state.splitByTab.get(id) ?? null,
      });
    },
    isLive: (runtime, id) => stateFor(runtime)?.ids.has(id) === true,
    land: (runtime, id) => activate(runtime, id),
    onChange: runtime => onChange(runtime, publicSession(switcher.session(runtime))),
  });

  function observe(runtime, snapshot) {
    if (!runtime || typeof runtime !== 'object') throw new TypeError('window required');
    try {
    if (!Array.isArray(snapshot?.tabs) || !Array.isArray(snapshot?.splits)) {
      throw new TypeError('complete tab/split snapshot required');
    }
    const order = snapshot.tabs.map(t => t?.id);
    if (order.some(id => typeof id !== 'string' || !id) || new Set(order).size !== order.length) {
      throw new TypeError('invalid or duplicate tab identity');
    }
    const ids = new Set(order), active = snapshot.activeTabId;
    if ((order.length && !ids.has(active)) || (!order.length && active != null)) throw new TypeError('invalid active tab');
    const splitByTab = new Map();
    for (const split of snapshot.splits) {
      if (!Array.isArray(split?.tabIds) || split.tabIds.length < 2) throw new TypeError('invalid split');
      const key = JSON.stringify(split.tabIds);
      for (const id of split.tabIds) {
        if (!ids.has(id) || splitByTab.has(id)) throw new TypeError('invalid split membership');
        splitByTab.set(id, key);
      }
    }
    const previous = stateFor(runtime);
    if (previous && switcher.isSwitching(runtime)) {
      const commonSplitChanged = [...ids].some(id => previous.ids.has(id) && previous.splitByTab.get(id) !== splitByTab.get(id));
      if (previous.active !== active || commonSplitChanged) switcher.cancel(runtime);
      else for (const id of previous.order) if (!ids.has(id)) switcher.removed(runtime, id);
    }
    const history = (previous?.history ?? []).filter(id => ids.has(id));
    if (active != null && (!previous || previous.active !== active)) {
      const i = history.indexOf(active);
      if (i !== -1) history.splice(i, 1);
      history.push(active);
    }
    windows.set(runtime, { order, ids, active, splitByTab, history });
    } catch (error) {
      switcher.cancel(runtime);
      windows.delete(runtime);
      throw error;
    }
  }

  return {
    observe,
    step(runtime, direction) {
      if (!stateFor(runtime) || (direction !== 1 && direction !== -1)) return false;
      return switcher.step(runtime, direction);
    },
    release: runtime => switcher.release(runtime),
    choose: (runtime, id) => switcher.choose(runtime, id),
    cancel: runtime => switcher.cancel(runtime),
    session: runtime => publicSession(switcher.session(runtime)),
  };
}
module.exports = { createSnapshotController };
