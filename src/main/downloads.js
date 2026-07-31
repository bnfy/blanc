const crypto = require('crypto');
const { shell } = require('electron');
const { JsonStore } = require('./store');
const {
  withLocalProfile,
  activeLocalProfileId,
} = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');

// Completed/cancelled downloads persist across launches; in-flight ones
// live here alongside their DownloadItem so cancel/pause can reach them.
const MAX_PERSISTED = 200;

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'downloads', { items: [] }, { scope: 'profile' }
));

/** @type {Map<string, { record: object, item: Electron.DownloadItem }>} */
const active = new Map(); // id -> { record, item, profileId }

/** A download finished as `completed` and hasn't been looked at yet — drives
 * the pill's contextual downloads button. Cleared by acknowledgeDownloads(). */
const recentProfileIds = new Set();
const deletedProfileIds = new Set();

/** @type {(() => void) | null} notify the chrome UI that something changed */
let onChanged = null;

const THROTTLE_MS = 250;
let lastBroadcast = 0;
let broadcastTimer = null;
function broadcast() {
  // Progress events fire many times a second; coalesce to ~4 updates/s.
  const now = Date.now();
  const wait = Math.max(0, THROTTLE_MS - (now - lastBroadcast));
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    lastBroadcast = Date.now();
    onChanged?.();
  }, wait);
}

function setupDownloads(session, notifyChanged, { profileId = DEFAULT_PROFILE_ID } = {}) {
  onChanged = notifyChanged;

  session.on('will-download', (_event, item) => withLocalProfile(profileId, () => {
    const id = crypto.randomUUID();
    const record = {
      id,
      url: item.getURL(),
      filename: item.getFilename(),
      savePath: '',
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
    };
    active.set(id, { record, item, profileId });

    item.on('updated', (_e, state) => withLocalProfile(profileId, () => {
      record.state = state; // 'progressing' | 'interrupted'
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      broadcast();
    }));

    item.once('done', (_e, state) => withLocalProfile(profileId, () => {
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.finishedAt = Date.now();
      active.delete(id);
      // A profile deletion cancels in-flight downloads. Their delayed `done`
      // event must not write a new downloads.json after the profile directory
      // was deliberately removed; downloaded files themselves are untouched.
      if (deletedProfileIds.has(profileId)) {
        broadcast();
        return;
      }
      ensureStore().update((d) => {
        d.items.unshift(record);
        if (d.items.length > MAX_PERSISTED) d.items.length = MAX_PERSISTED;
      });
      if (state === 'completed') recentProfileIds.add(profileId);
      broadcast();
    }));

    broadcast();
  }));
}

/** Active downloads first (newest leading), then the persisted backlog. */
function listDownloads() {
  const profileId = activeLocalProfileId();
  const inFlight = Array.from(active.values())
    .filter((entry) => entry.profileId === profileId)
    .map(({ record }) => record)
    .reverse();
  return [...inFlight, ...ensureStore().data.items];
}

function activeCount() {
  const profileId = activeLocalProfileId();
  return [...active.values()].filter((entry) => entry.profileId === profileId).length;
}

function cancelDownload(id) {
  const entry = active.get(id);
  if (entry?.profileId === activeLocalProfileId()) entry.item.cancel();
}

function openDownload(id) {
  const record = listDownloads().find((r) => r.id === id);
  if (record?.state === 'completed' && record.savePath) shell.openPath(record.savePath);
}

function showDownloadInFolder(id) {
  const record = listDownloads().find((r) => r.id === id);
  if (record?.savePath) shell.showItemInFolder(record.savePath);
}

function clearFinishedDownloads() {
  ensureStore().update((d) => { d.items = []; });
  broadcast();
}

function acknowledgeDownloads() {
  recentProfileIds.delete(activeLocalProfileId());
}

function discardProfileDownloads(profileId) {
  deletedProfileIds.add(profileId);
  recentProfileIds.delete(profileId);
  for (const [id, entry] of active) {
    if (entry.profileId !== profileId) continue;
    active.delete(id);
    entry.item.cancel();
  }
  broadcast();
}

/** Snapshot for the chrome pill: how many are in-flight, whether a finished
 * one is still unacknowledged, and aggregate bytes for a progress ring. */
function downloadsActivity() {
  const profileId = activeLocalProfileId();
  let receivedBytes = 0;
  let totalBytes = 0;
  for (const { record, profileId: ownerProfileId } of active.values()) {
    if (ownerProfileId !== profileId) continue;
    receivedBytes += record.receivedBytes;
    totalBytes += record.totalBytes;
  }
  return {
    active: activeCount(),
    hasRecent: recentProfileIds.has(profileId),
    receivedBytes,
    totalBytes,
  };
}

module.exports = {
  setupDownloads,
  listDownloads,
  activeCount,
  acknowledgeDownloads,
  downloadsActivity,
  cancelDownload,
  openDownload,
  showDownloadInFolder,
  clearFinishedDownloads,
  discardProfileDownloads,
};
