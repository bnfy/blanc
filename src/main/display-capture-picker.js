'use strict';

function projectPickerSources(sources) {
  return sources.filter((source) => typeof source.id === 'string' && source.id)
    .slice(0, 200).map((source) => ({
      id: source.id,
      name: String(source.name || 'Screen').slice(0, 512),
      kind: source.id.startsWith('window:') ? 'window' : 'screen',
      thumbnailDataURL: source.thumbnail?.toDataURL?.() || '',
    }));
}

// This model belongs exclusively to main and the requesting window's chrome.
// No source metadata is broadcast with tabs or sent to the website preload.
function createDisplayCapturePicker({ platform, portalSelection = false, desktopCapturer, ownerForRequest,
  isOwnerSender, present, dismiss, onCancel, onChoose }) {
  const requests = new Map();
  const byOwner = new Map();
  let enumerationTail = Promise.resolve();
  const live = (row) => requests.get(row.requestId) === row
    && ownerForRequest(row.requestId) === row.owner;
  const paint = (row, extras = {}) => present(row.owner, {
    requestId: row.requestId, origin: row.origin,
    audioRequested: row.audioRequested,
    sources: projectPickerSources(row.sources),
    portal: row.portal, loading: row.loading, ...extras,
  });
  function hide(requestId) {
    const row = requests.get(requestId);
    if (!row) return;
    requests.delete(requestId);
    if (byOwner.get(row.owner) === requestId) byOwner.delete(row.owner);
    dismiss(row.owner, requestId);
  }
  function cancel(requestId) {
    hide(requestId);
    onCancel(requestId);
  }
  async function enumerate(row) {
    row.loading = true;
    paint(row);
    try {
      const task = enumerationTail.then(() => {
        if (!live(row)) return [];
        return desktopCapturer.getSources({
          types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 },
        });
      });
      enumerationTail = task.catch(() => {});
      const sources = await task;
      if (!live(row)) return false;
      row.sources = sources;
      row.loading = false;
      if (!sources.length) { cancel(row.requestId); return false; }
      return true;
    } catch {
      if (live(row)) cancel(row.requestId);
      return false;
    }
  }
  async function show(requestId, model) {
    const owner = ownerForRequest(requestId);
    if (!owner || byOwner.has(owner)) { onCancel(requestId); return; }
    const row = { requestId, owner, origin: model.origin,
      audioRequested: model.audioRequested === true, sources: [],
      portal: platform === 'linux', loading: false, choosing: false };
    requests.set(requestId, row);
    byOwner.set(owner, requestId);
    if (row.portal) { paint(row); return; }
    if (await enumerate(row)) paint(row);
  }
  async function resolve(event, payload) {
    const row = requests.get(payload?.requestId);
    if (!row || !live(row) || !isOwnerSender(event, row.owner)) return;
    if (payload.cancelled === true) { cancel(row.requestId); return; }
    if (row.loading || row.choosing) return;
    const computerAudioApproved = row.audioRequested && payload.computerAudioApproved === true;
    let source;
    if (row.portal) {
      // On PipeWire this call opens the system portal. Enumeration completion,
      // not the Island Continue button, is source consent. Never enumerate a
      // second time during acquisition: that would open a second chooser.
      if (!await enumerate(row)) return;
      row.portal = false;
      if (!portalSelection || row.sources.length !== 1) {
        // X11 may return a normal list, even of one item. Continue alone
        // never chooses a source when a native portal isn't established.
        paint(row);
        return;
      }
      source = row.sources[0];
    } else {
      source = row.sources.find((item) => item.id === payload.sourceId);
    }
    if (!source || !live(row)) return;
    row.choosing = true;
    const projected = projectPickerSources([source])[0];
    await onChoose(event, {
      requestId: row.requestId, sourceId: source.id, computerAudioApproved,
      surfaceLabel: projected.name, surfaceKind: projected.kind,
    }, platform === 'linux' ? source : null);
  }
  return { show, hide, cancel, resolve };
}

module.exports = { projectPickerSources, createDisplayCapturePicker };
