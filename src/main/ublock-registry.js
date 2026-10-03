'use strict';

// Browser identities outlive a WebContents renderer. No private record enters
// this registry; every read revalidates the current profile and live view.
function createUblockRegistry({ profileId, listTabs, listWindows, liveContents }) {
  const identities = new Map();
  let sequence = 0;
  const contents = new Map();
  function records() {
    return listTabs().filter(tab => !tab.private && tab.profileId === profileId);
  }
  function refresh() {
    const current = new Set();
    contents.clear();
    for (const tab of records()) {
      current.add(tab.id);
      if (!identities.has(tab.id)) identities.set(tab.id, ++sequence);
      const wc = liveContents(tab);
      if (wc && !wc.isDestroyed()) contents.set(wc.id, { tab, wc });
    }
    for (const id of identities.keys()) if (!current.has(id)) identities.delete(id);
  }
  function tabFor(id) {
    refresh();
    return records().find(tab => identities.get(tab.id) === id);
  }
  function project(tab) {
    const wc = liveContents(tab);
    const window = listWindows().find(item => item.id === tab.runtimeId);
    return {
      id: identities.get(tab.id), windowId: window?.window?.id ?? -1,
      index: window?.tabOrder?.indexOf(tab.id) ?? 0,
      active: window?.activeTabId === tab.id, incognito: false,
      title: tab.title || wc?.getTitle?.(), url: wc?.getURL() || tab.url,
      status: (tab.isLoading || wc?.isLoading?.()) ? 'loading' : 'complete', discarded: !!tab.asleep,
      pinned: !!tab.pinned, audible: !!tab.audible,
    };
  }
  function idForTab(tab) { refresh(); return tab && records().some(item => item === tab) ? identities.get(tab.id) : undefined; }
  function query(filter = {}) {
    refresh();
    const windows = listWindows().filter(item => item.profileId === profileId && !item.window?.isDestroyed?.());
    const current = windows.find(item => item.window?.isFocused?.()) ?? windows.at(-1);
    const urls = filter.url === undefined ? null : Array.isArray(filter.url) ? filter.url : [filter.url];
    const matches = (pattern, value) => typeof pattern === 'string' && new RegExp('^' + pattern.split('*')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(value.split('#', 1)[0]);
    return records().map(project).filter(tab =>
      (filter.active === undefined || filter.active === tab.active)
      && (filter.discarded === undefined || filter.discarded === tab.discarded)
      && (filter.pinned === undefined || filter.pinned === tab.pinned)
      && (filter.audible === undefined || filter.audible === tab.audible)
      && (filter.status === undefined || filter.status === tab.status)
      && (filter.windowId === undefined || filter.windowId === tab.windowId)
      && (!filter.currentWindow && !filter.lastFocusedWindow || tab.windowId === current?.window?.id)
      && (!urls || urls.some(pattern => matches(pattern, tab.url || '')))
      && (filter.incognito !== true));
  }
  function ownedContents(id) {
    const tab = tabFor(id);
    const wc = tab && liveContents(tab);
    return wc && !wc.isDestroyed() ? { tab, wc } : null;
  }
  function fromContents(id) {
    if (!Number.isInteger(id) || id <= 0) return undefined;
    refresh();
    return records().find(tab => liveContents(tab)?.id === id);
  }
  const frameId = frame => !frame ? -1 : !frame.parent ? 0 : frame.frameTreeNodeId;
  function frameData(frame) {
    return { frameId: frameId(frame), parentFrameId: frame?.parent ? frameId(frame.parent) : -1, url: frame?.url || '' };
  }
  function frames(id) {
    const owned = ownedContents(id);
    return owned ? owned.wc.mainFrame.framesInSubtree.map(frameData) : [];
  }
  function mapping() {
    refresh();
    return records().flatMap(tab => {
      const wc = liveContents(tab);
      return wc ? [{ webContentsId: wc.id, tabId: identities.get(tab.id) }] : [];
    });
  }
  function request(details) {
    // Lifecycle refresh owns the index. A network decision does no tab-list
    // scan, but still rejects a changed principal, discarded view, or old WC.
    const entry = contents.get(details.webContentsId);
    const tab = entry && !entry.tab.private && entry.tab.profileId === profileId
      && liveContents(entry.tab) === entry.wc && !entry.wc.isDestroyed() ? entry.tab : undefined;
    const frame = details.frame;
    const headers = value => Object.entries(value || {}).flatMap(([name, values]) =>
      (Array.isArray(values) ? values : [values]).map(value => ({ name, value: String(value) })));
    const types = { mainFrame: 'main_frame', subFrame: 'sub_frame', xhr: 'xmlhttprequest', webSocket: 'websocket', cspReport: 'csp_report' };
    return {
      requestId: String(details.id), tabId: tab ? identities.get(tab.id) : -1,
      ...frameData(frame), url: details.url, method: details.method,
      ...(!frame && details.resourceType === 'mainFrame' ? { frameId: 0 } : {}),
      type: types[details.resourceType] || details.resourceType || 'other',
      // Official Electron already emits milliseconds since the Unix epoch.
      timeStamp: details.timestamp ?? Date.now(),
      initiator: details.initiatorOrigin || details.initiator || frame?.origin || details.referrer,
      documentUrl: frame?.url || details.referrer,
      ...(details.requestHeaders ? { requestHeaders: headers(details.requestHeaders) } : {}),
      ...(details.responseHeaders ? { responseHeaders: headers(details.responseHeaders) } : {}),
      ...(details.statusCode === undefined ? {} : { statusCode: details.statusCode }),
      ...(details.statusLine === undefined ? {} : { statusLine: details.statusLine }),
      ...(details.redirectURL ? { redirectUrl: details.redirectURL } : {}),
      ...(details.error ? { error: details.error } : {}),
      ip: details.ip, fromCache: !!details.fromCache,
    };
  }
  refresh();
  return { refresh, idForTab, tabFor, project, query, ownedContents, fromContents, frames, mapping, request, frameData };
}

module.exports = { createUblockRegistry };
