const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const { JsonStore } = require('./store');
const { withLocalProfile, activeLocalProfileId } = require('./local-profile-context');
const { DEFAULT_PROFILE_ID } = require('./local-profile-model');
const { chooseDownloadPath, downloadReservationKey, maxDownloadPathLength } = require('./download-path');

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
// Retry needs the session that owned the original download, and reuses the
// file the user already chose so a retry doesn't ask where to save again.
const sessionsByOwner = new Map();
const retrySavePaths = new Map();
const ownerKey = (profileId, isPrivate) => `${profileId}\0${isPrivate ? 'private' : 'normal'}`;
// In-memory only, like hasRecent: a fresh launch must not replay the pulse for
// a download that finished in a previous session.
const lastCompletedAtByProfile = new Map();

/** @type {(() => void) | null} notify the chrome UI that something changed */
let onChanged = null;
let downloadRequesterAllowed = () => true;

// Main owns page/runtime liveness. Check new requests before Chromium can
// show a save dialog; already accepted downloads keep their normal lifecycle.
function setDownloadRequesterCheck(check) {
  downloadRequesterAllowed = typeof check === 'function' ? check : () => true;
}

// Where a new download goes when Blanc saves it without asking (#1591). Main
// supplies the setting and the folder; with no policy, or when asking is on,
// Electron shows its Save As dialog as before.
let savePolicy = null;
// Paths handed to downloads still in flight, so two downloads of the same file
// at once never get the same name. Released when each download is done.
const reservedPaths = new Set();

function setDownloadSavePolicy(policy) {
  savePolicy = policy && typeof policy === 'object' ? policy : null;
}

// Downloads that always show Save As, whatever the setting: "Save Image As…"
// promises a dialog. Keyed by URL, used once, and forgotten after a minute
// in case the download never starts.
const SAVE_DIALOG_TTL_MS = 60_000;
const saveDialogUrls = new Map();

function requestSaveDialog(url) {
  if (typeof url === 'string' && url) saveDialogUrls.set(url, Date.now() + SAVE_DIALOG_TTL_MS);
}

function takeSaveDialogRequest(item) {
  const now = Date.now();
  for (const [url, expiresAt] of saveDialogUrls) if (expiresAt < now) saveDialogUrls.delete(url);
  const chain = typeof item.getURLChain === 'function' ? item.getURLChain() : [];
  for (const url of [...chain, item.getURL()]) {
    if (saveDialogUrls.delete(url)) return true;
  }
  return false;
}

// Takes a name by creating the empty file, so another app or download can't
// take it before Chromium starts writing (Chromium writes over it). A folder
// Blanc can't write to, including one Windows permissions block, throws here
// and the caller shows Save As instead.
function claimPath(p) {
  try {
    fs.closeSync(fs.openSync(p, 'wx'));
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

// A download that never finished leaves the empty file it claimed; remove it,
// but never a file with something in it.
function releaseClaimedFile(p) {
  try {
    if (fs.statSync(p).size === 0) fs.unlinkSync(p);
  } catch {
    // Already gone, or not ours to remove.
  }
}

// One download per click, as in Chrome. Chromium counts a download as
// user-initiated for about 5 seconds after any click on the page, so a page
// could follow one click with any number of downloads. Each real mouse press,
// touch or key press on a tab gives it one download that skips Save As;
// further downloads ask. A tab Blanc doesn't watch never skips it.
const GESTURE_INPUTS = new Set(['mouseDown', 'rawKeyDown', 'keyDown', 'touchStart', 'gestureTap']);
const watchedForGestures = new WeakSet();
const gestureAllowance = new WeakSet();

function trackDownloadGestures(wc) {
  if (!wc || watchedForGestures.has(wc)) return;
  watchedForGestures.add(wc);
  wc.on('input-event', (_event, input) => {
    if (GESTURE_INPUTS.has(input?.type)) gestureAllowance.add(wc);
  });
}

function chooseSavePath(item, requester) {
  if (!savePolicy) return null;
  try {
    // A page can start a download without anyone clicking. Before #1591 the
    // dialog stopped that; it still does, so pages can't fill Downloads alone.
    if (typeof item.hasUserGesture !== 'function' || !item.hasUserGesture()) return null;
    if (!requester || !gestureAllowance.has(requester)) return null;
    if (savePolicy.askWhereToSave()) return null;
    // A missing or unwritable folder makes claimPath throw: the dialog, never
    // a failed download.
    const chosen = chooseDownloadPath({
      folder: savePolicy.folder(),
      filename: item.getFilename(),
      claim: claimPath,
      reserved: reservedPaths,
      maxPathLength: maxDownloadPathLength(process.platform),
    });
    if (chosen) gestureAllowance.delete(requester);
    return chosen;
  } catch {
    return null;
  }
}

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
  const owner = ownerKey(profileId, isPrivate);
  sessionsByOwner.set(owner, session);

  session.on('will-download', (_event, item, requestingWebContents) => withLocalProfile(profileId, () => {
    if (!downloadRequesterAllowed(requestingWebContents)) {
      _event.preventDefault();
      return;
    }
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
      canResume: false,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      startedAt: Date.now(),
      private: !!isPrivate,
    };
    const entry = { record, item, profileId, replaced: false };
    active.set(id, entry);
    const retryKey = `${owner}\0${record.url}`;
    const asked = takeSaveDialogRequest(item);
    if (retrySavePaths.has(retryKey)) {
      const retry = retrySavePaths.get(retryKey);
      retrySavePaths.delete(retryKey);
      entry.reservedKey = retry.key;
      let savePath = retry.path;
      // A row retried from the list may find its file name taken since: never
      // overwrite it. A live retry's own partial file may still be there.
      if (retry.fromList && fs.existsSync(savePath)) {
        reservedPaths.delete(retry.key);
        let fresh = null;
        try {
          fresh = chooseDownloadPath({
            folder: path.dirname(retry.path),
            filename: path.basename(retry.path),
            claim: claimPath,
            reserved: reservedPaths,
            maxPathLength: maxDownloadPathLength(process.platform),
          });
        } catch {
          // The folder can't be written now: ask below rather than overwrite.
        }
        entry.reservedKey = null;
        savePath = fresh;
        if (fresh) {
          entry.claimedPath = fresh;
          entry.reservedKey = downloadReservationKey(fresh);
          reservedPaths.add(entry.reservedKey);
        }
      }
      // No free name for a retried file that's now taken: Save As, never an
      // overwrite.
      if (savePath) {
        item.setSavePath(savePath);
        record.filename = path.basename(savePath);
      }
    } else {
      const savePath = asked ? null : chooseSavePath(item, requestingWebContents);
      if (savePath) {
        item.setSavePath(savePath);
        record.filename = path.basename(savePath);
        entry.claimedPath = savePath;
        entry.reservedKey = downloadReservationKey(savePath);
        reservedPaths.add(entry.reservedKey);
      }
    }

    item.on('updated', (_e, state) => withLocalProfile(profileId, () => {
      record.state = state; // 'progressing' | 'interrupted'
      record.canResume = state === 'interrupted' && item.canResume();
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      broadcast();
    }));

    item.once('done', (_e, state) => withLocalProfile(profileId, () => {
      if (entry.reservedKey) reservedPaths.delete(entry.reservedKey);
      if (entry.claimedPath && state !== 'completed') releaseClaimedFile(entry.claimedPath);
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      record.canResume = false;
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.finishedAt = Date.now();
      active.delete(id);
      // A retry cancels the stale item and starts a fresh one; the old row
      // must not come back as a cancelled entry beside its replacement.
      if (entry.replaced) {
        broadcast();
        return;
      }
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
    .map(({ record }) => ({ ...record, inFlight: true }))
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

/** Continue an interrupted download in place, where Chromium still can. */
function resumeDownload(id) {
  const entry = active.get(id);
  if (entry?.profileId !== activeLocalProfileId()) return;
  if (entry.record.state === 'interrupted' && entry.item.canResume()) entry.item.resume();
}

/** Start an interrupted download over from its source URL, replacing its row. */
function retryDownload(id) {
  const profileId = activeLocalProfileId();
  const entry = active.get(id);
  if (entry && entry.profileId !== profileId) return;
  const record = entry?.record ?? listDownloads().find((r) => r.id === id);
  if (record?.state !== 'interrupted' || !isRetryableUrl(record.url)) return;
  const owner = ownerKey(profileId, record.private);
  const session = sessionsByOwner.get(owner);
  if (!session) return;

  // The retry inherits the name its first attempt held, so nothing else can
  // take it while the request restarts.
  let reservedKey = null;
  if (entry) {
    reservedKey = entry.reservedKey ?? null;
    entry.reservedKey = null;
    entry.replaced = true;
    active.delete(id);
    entry.item.cancel();
  } else if (record.private) {
    const finished = privateFinishedByProfile.get(profileId) ?? [];
    privateFinishedByProfile.set(profileId, finished.filter((r) => r.id !== id));
  } else {
    ensureStore().update((d) => { d.items = d.items.filter((r) => r.id !== id); });
  }
  if (record.savePath) {
    reservedKey ??= downloadReservationKey(record.savePath);
    reservedPaths.add(reservedKey);
    retrySavePaths.set(`${owner}\0${record.url}`, { path: record.savePath, key: reservedKey, fromList: !entry });
  }
  session.downloadURL(record.url);
  broadcast();
}

function isRetryableUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
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
  for (const key of retrySavePaths.keys()) {
    if (key.startsWith(`${profileId}\0`)) retrySavePaths.delete(key);
  }
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
  setDownloadRequesterCheck,
  setDownloadSavePolicy,
  requestSaveDialog,
  trackDownloadGestures,
  setupDownloads,
  listDownloads,
  activeCount,
  acknowledgeDownloads,
  downloadsActivity,
  cancelDownload,
  resumeDownload,
  retryDownload,
  openDownload,
  showDownloadInFolder,
  clearFinishedDownloads,
  discardProfileDownloads,
};
