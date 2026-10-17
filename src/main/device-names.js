'use strict';

// Names a user gives synced devices (spec 2026-10-16-island-lower-section-design.md
// §7). Settings sync is last-writer-wins per key, so a plain map would let a
// rename on one Mac clobber a rename of another device on a second Mac; each
// entry therefore carries its own clock. An empty name is a clear: it wins
// over an older name and the device's published name shows again.
// Pure: no Electron.

const MAX_DEVICE_NAME = 80; // device-name.js and tabsync-model.js cap names the same way
const MAX_DEVICE_NAME_ENTRIES = 64;
const MAX_TIE = 128;
// settings.js MAX_SYNC_TIMESTAMP: a clock past it would win every merge and
// leave the device impossible to rename or clear anywhere.
const MAX_CLOCK = Date.UTC(3000, 0, 1);
const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;

function normalizeName(raw) {
  return String(raw ?? '').trim().slice(0, MAX_DEVICE_NAME);
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.name !== 'string' || !Number.isSafeInteger(entry.at) || entry.at <= 0 || entry.at >= MAX_CLOCK) return null;
  const tie = typeof entry.tie === 'string' && entry.tie.length <= MAX_TIE ? entry.tie : '';
  return { name: normalizeName(entry.name), at: entry.at, tie };
}

// The newest entries, keyed in id order so equal maps serialize alike.
function bounded(entries) {
  const kept = entries
    .sort((a, b) => b[1].at - a[1].at || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_DEVICE_NAME_ENTRIES)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return Object.fromEntries(kept);
}

/** A stored or received map, with invalid ids and entries dropped. */
function normalizeDeviceNames(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = [];
  for (const [id, raw] of Object.entries(value)) {
    if (!DEVICE_ID.test(id)) continue;
    const entry = normalizeEntry(raw);
    if (entry) entries.push([id, entry]);
  }
  return bounded(entries);
}

function setDeviceNameEntry(map, deviceId, rawName, { at, tie = '' }) {
  const current = normalizeDeviceNames(map);
  if (!DEVICE_ID.test(String(deviceId))) return current;
  return normalizeDeviceNames({ ...current, [deviceId]: { name: normalizeName(rawName), at, tie } });
}

// Larger clock, then smaller tie-breaker, then smaller name: the same answer
// whichever side merges.
function newer(a, b) {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  if (a.tie !== b.tie) return a.tie < b.tie ? a : b;
  return a.name <= b.name ? a : b;
}

function mergeDeviceNames(local, remote) {
  const merged = { ...normalizeDeviceNames(local) };
  for (const [id, entry] of Object.entries(normalizeDeviceNames(remote))) {
    merged[id] = Object.hasOwn(merged, id) ? newer(merged[id], entry) : entry;
  }
  return bounded(Object.entries(merged));
}

/** The name to show: a chosen one, else the name the device publishes. */
function resolveDeviceName(map, deviceId, publishedName) {
  const entry = map && typeof map === 'object' && Object.hasOwn(map, deviceId) ? map[deviceId] : null;
  const name = entry && typeof entry.name === 'string' ? normalizeName(entry.name) : '';
  return name || publishedName;
}

function deviceNamesEqual(a, b) {
  return JSON.stringify(normalizeDeviceNames(a)) === JSON.stringify(normalizeDeviceNames(b));
}

module.exports = {
  MAX_DEVICE_NAME,
  MAX_DEVICE_NAME_ENTRIES,
  normalizeDeviceNames,
  setDeviceNameEntry,
  mergeDeviceNames,
  resolveDeviceName,
  deviceNamesEqual,
};
