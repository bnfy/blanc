const crypto = require('crypto');
const { shell } = require('electron');
const { JsonStore } = require('./store');

// Completed/cancelled downloads persist across launches; in-flight ones
// live here alongside their DownloadItem so cancel/pause can reach them.
const MAX_PERSISTED = 200;

let store = null;
const ensureStore = () => (store ??= new JsonStore('downloads', { items: [] }));

/** @type {Map<string, { record: object, item: Electron.DownloadItem }>} */
const active = new Map();

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

function setupDownloads(session, notifyChanged) {
  onChanged = notifyChanged;

  session.on('will-download', (_event, item) => {
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
    active.set(id, { record, item });

    item.on('updated', (_e, state) => {
      record.state = state; // 'progressing' | 'interrupted'
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      broadcast();
    });

    item.once('done', (_e, state) => {
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      record.savePath = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.finishedAt = Date.now();
      active.delete(id);
      ensureStore().update((d) => {
        d.items.unshift(record);
        if (d.items.length > MAX_PERSISTED) d.items.length = MAX_PERSISTED;
      });
      broadcast();
    });

    broadcast();
  });
}

/** Active downloads first (newest leading), then the persisted backlog. */
function listDownloads() {
  const inFlight = Array.from(active.values(), ({ record }) => record).reverse();
  return [...inFlight, ...ensureStore().data.items];
}

function activeCount() {
  return active.size;
}

function cancelDownload(id) {
  active.get(id)?.item.cancel();
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

module.exports = {
  setupDownloads,
  listDownloads,
  activeCount,
  cancelDownload,
  openDownload,
  showDownloadInFolder,
  clearFinishedDownloads,
};
