const crypto = require('crypto');
const { shell } = require('electron');
const { JsonStore } = require('./store');
const { withLocalProfile, activeLocalProfileId } = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');

// Completed/cancelled downloads persist across launches; in-flight ones
// live here alongside their DownloadItem so cancel/pause can reach them.
const MAX_PERSISTED = 200;

let store = null;
const ensureStore = () => (store ??= new JsonStore(
  'downloads', { items: [] }, { scope: 'profile' }
));

/** @type {Map<string, { record: object, item: Electron.DownloadItem, profileId: string }>} */
const active = new Map();
// Private-session metadata lives only for this process lifetime. The file the
// user explicitly saved remains on disk, but its source URL/path never enters
// downloads.json and disappears when Blanc quits.
const privateFinishedByProfile = new Map();

/** A download finished as `completed` and hasn't been looked at yet — drives
 * the pill's contextual downloads button. Cleared by acknowledgeDownloads(). */
const recentProfileIds = new Set();
const deletedProfileIds = new Set();
// In-memory only, like hasRecent: a fresh launch must not replay the pulse for
// a download that finished in a previous session.
const lastCompletedAtByProfile = new Map();

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

function setupDownloads(
  session,
  notifyChanged,
  { private: isPrivate = false, profileId = DEFAULT_PROFILE_ID } = {}
) {
  onChanged = notifyChanged;

  session.on('will-download', (_event, item) => withLocalProfile(profileId, () => {
    if (deletedProfileIds.has(profileId)) {
      item.cancel();
      return;
    }
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
      private: !!isPrivate,
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
      // Cancelling in-flight items is part of profile deletion. Their delayed
      // done callbacks must not recreate profile-scoped files afterward.
      if (deletedProfileIds.has(profileId)) {
        broadcast();
        return;
      }
      if (isPrivate) {
        const finished = privateFinishedByProfile.get(profileId) ?? [];
        finished.unshift(record);
        if (finished.length > MAX_PERSISTED) finished.length = MAX_PERSISTED;
        privateFinishedByProfile.set(profileId, finished);
      } else {
        ensureStore().update((d) => {
          d.items.unshift(record);
          if (d.items.length > MAX_PERSISTED) d.items.length = MAX_PERSISTED;
        });
      }
      if (state === 'completed') {
        recentProfileIds.add(profileId);
        // The pill's completion pulse keys off this changing, not off `active`
        // reaching 0: cancelling a download after an earlier one finished also
        // empties `active` while hasRecent is still true, and that must not
        // read as "your download landed".
        lastCompletedAtByProfile.set(profileId, record.finishedAt);
      }
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
  return [
    ...inFlight,
    ...(privateFinishedByProfile.get(profileId) ?? []),
    ...ensureStore().data.items,
  ];
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
  privateFinishedByProfile.delete(activeLocalProfileId());
  ensureStore().update((d) => { d.items = []; });
  broadcast();
}

function acknowledgeDownloads() {
  recentProfileIds.delete(activeLocalProfileId());
}

function discardProfileDownloads(profileId) {
  deletedProfileIds.add(profileId);
  recentProfileIds.delete(profileId);
  lastCompletedAtByProfile.delete(profileId);
  privateFinishedByProfile.delete(profileId);
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
    lastCompletedAt: lastCompletedAtByProfile.get(profileId) ?? null,
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
