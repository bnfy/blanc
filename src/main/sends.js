// Send to device orchestration: owns sends.json (the last-merged sends map
// and this device's opened/dismissed ids, bound to the sync account they
// came from) and bridges it to the pure rules in sends-model.js. sync.js
// drives exportForSync/mergeFromSync through its STORES table with the same
// ctx it gives tabsync. See the M7b addendum
// (docs/superpowers/specs/2026-10-24-ios-m7b-send-to-device-design.md).
const { JsonStore } = require('./store');
const { canonical } = require('./tabsync-model');
const model = require('./sends-model');

let store = null;
const ensureStore = () => (store ??= new JsonStore('sends', { accountId: '', devices: {}, dismissed: {} }));

const listeners = new Set();
const onChanged = (fn) => listeners.add(fn);
const notify = () => { for (const fn of listeners) fn(); };

/** Cross-account guard, as tabsync.rebind: a different account discards the
 * cached map and the dismissed ids before anything reads or exports them. */
function rebind(accountId) {
  const s = ensureStore();
  if (s.data.accountId !== accountId) {
    s.update((d) => { d.accountId = accountId; d.devices = {}; d.dismissed = {}; });
  }
  return s;
}

const identity = (ctx) => ({ name: ctx.deviceName, platform: ctx.platform });

function exportForSync(ctx) {
  const s = rebind(ctx.accountId);
  const now = Date.now();
  const { entry } = model.ownEntry(s.data.devices[ctx.deviceId], identity(ctx), now);
  const merged = model.mergeDevices({ ...s.data.devices, [ctx.deviceId]: entry }, {}, ctx.deviceId, now);
  s.update((d) => { d.devices = merged; d.dismissed = model.pruneDismissed(d.dismissed, now); });
  return { devices: model.applyBudget(merged, ctx.deviceId) };
}

function mergeFromSync(remote, ctx) {
  const s = rebind(ctx.accountId);
  const before = canonical(s.data.devices);
  s.update((d) => { d.devices = model.mergeDevices(d.devices, remote?.devices, ctx.deviceId, Date.now()); });
  if (canonical(s.data.devices) !== before) notify();
}

const equalsRemote = (exported, remote) => canonical(exported?.devices ?? {}) === canonical(remote?.devices ?? {});

/** Only a device with something to deliver may create a missing store: a
 * presence-only entry written into Cloudflare KV's short missing-read window
 * could replace a store another device has just created. */
const hasOwnItems = (payload, ctx) => {
  const own = payload?.devices?.[ctx.deviceId];
  return !!own && !own.retracted && Array.isArray(own.items) && own.items.length > 0;
};

const heartbeatDue = (ctx) => {
  const own = rebind(ctx.accountId).data.devices[ctx.deviceId];
  return !own || own.retracted || Date.now() - own.updatedAt >= model.HEARTBEAT_MS;
};

/** Add one item to our own entry before the immediate PUT. */
function addOwnItem(ctx, { url, title, to }, makeId) {
  const s = rebind(ctx.accountId);
  const now = Date.now();
  const { entry } = model.ownEntry(s.data.devices[ctx.deviceId], identity(ctx), now, { force: true });
  const added = model.addItem(entry, { url, title, to }, ctx.deviceId, now, makeId);
  if (added.error) return added;
  s.update((d) => { d.devices = { ...d.devices, [ctx.deviceId]: added.entry }; });
  return { item: added.item };
}

/** Take back an item whose PUT failed, so a later pass never delivers a page
 * the sender was told didn't go. */
function removeOwnItem(ctx, id) {
  const s = rebind(ctx.accountId);
  const own = s.data.devices[ctx.deviceId];
  if (!own || !Array.isArray(own.items) || !own.items.some((item) => item.id === id)) return;
  s.update((d) => {
    d.devices = { ...d.devices, [ctx.deviceId]: { ...own, items: own.items.filter((item) => item.id !== id) } };
  });
}

/** The entry published when this device leaves the sync. */
const retractedOwn = () => model.retractedEntry(Date.now());

const inbox = (ctx) => {
  const s = rebind(ctx.accountId);
  return model.inbox(s.data.devices, ctx.deviceId, s.data.dismissed, Date.now());
};

const targets = (ctx, sessionDevices, deviceNames) =>
  model.targets(rebind(ctx.accountId).data.devices, sessionDevices, ctx.deviceId, deviceNames);

/** Hide one inbox item on this device (opened or dismissed alike). Returns
 * the item, or null when it isn't in the inbox. */
function hide(ctx, id) {
  const item = inbox(ctx).find((row) => row.id === id) ?? null;
  if (!item) return null;
  ensureStore().update((d) => { d.dismissed = { ...d.dismissed, [id]: Date.now() }; });
  notify();
  return item;
}

function onSyncDisabled() {
  const s = ensureStore();
  const had = Object.keys(s.data.devices).length > 0 || Object.keys(s.data.dismissed).length > 0;
  s.update((d) => { d.accountId = ''; d.devices = {}; d.dismissed = {}; });
  if (had) notify();
}

module.exports = {
  onChanged, exportForSync, mergeFromSync, equalsRemote, hasOwnItems, heartbeatDue,
  addOwnItem, removeOwnItem, retractedOwn, inbox, targets, hide, onSyncDisabled,
};
