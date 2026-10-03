/* global chrome */
// Blanc's narrow host adapter for the pinned upstream package. MIT.
// This runs only as a bundled script in the managed extension's own pages.
(() => {
  'use strict';
  const roots = [...new Set([self.chrome, self.browser].filter(Boolean))];
  const runtime = chrome.runtime;
  if (location.pathname === '/background.html') Object.defineProperty(runtime, 'reload', {
    value: () => call('extension.restart', []), configurable: true,
  });
  const nativeTabs = chrome.tabs;
  const connectEvent = runtime.onConnect;
  const nativeAddConnect = connectEvent.addListener.bind(connectEvent);
  const background = location.pathname === '/background.html';
  const define = (name, value) => roots.forEach(root => Object.defineProperty(root, name, { value, configurable: true }));
  const pending = new Map();
  const events = new Map();
  const networkEvents = new Map();
  const contents = new Map();
  const contentPorts = new Map();
  let sequence = 0;
  let bridge;
  let isReady = false;
  let filteringEnabled = false;
  let contentPending = 0;
  let contentBytes = 0;
  const queued = [];
  const MAX_BYTES = 8 * 1024 * 1024;
  let capacityFailed = false;
  let queuedBytes = 0;
  const send = message => {
    if (bridge) { bridge.postMessage(message); return; }
    const bytes = JSON.stringify(message).length * 2;
    if (queued.length >= 256 || queuedBytes + bytes > MAX_BYTES) { capacityFailed = true; return; }
    queued.push(message); queuedBytes += bytes;
  };
  if (background) {
    for (const local of new Set(roots.map(root => root.storage.local))) {
      for (const name of ['get', 'set', 'remove', 'clear']) {
        const native = local[name];
        Object.defineProperty(local, name, { configurable: true, value: (...args) => {
          const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
          const execute = (resolve, reject) => native.call(local, ...args, value => {
            if (runtime.lastError) {
              send({ kind: 'storage-failed' });
              if (callback) callback(); else reject(new Error('ubo-storage-failed'));
            } else if (callback) callback(value); else resolve(value);
          });
          if (callback) { execute(); return; }
          return new Promise(execute);
        } });
      }
    }
  }
  const call = (method, args) => {
    if (!background) return runtime.sendMessage({ blancHost: 1, method, args });
    const bytes = JSON.stringify(args).length * 2;
    if (bytes > 6 * 1024 * 1024 || pending.size >= 256 || queued.length >= 256
      || [...pending.values()].reduce((size, item) => size + item.bytes, 0) + bytes > MAX_BYTES) {
      capacityFailed = true; send({ kind: 'host-failed' });
      return Promise.reject(new Error('ubo-host-capacity'));
    }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const index = queued.findIndex(item => item.kind === 'call' && item.id === id);
        if (index !== -1) { queuedBytes -= JSON.stringify(queued[index]).length * 2; queued.splice(index, 1); }
        reject(new Error('ubo-host-timeout'));
      }, 2000);
      pending.set(id, { resolve, reject, timer, bytes });
      send({ kind: 'call', id, method, args });
    });
  };
  const method = name => (...args) => {
    const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
    const promise = call(name, args);
    if (callback) { promise.then(value => callback(value), () => callback()); return; }
    return promise;
  };
  const event = name => {
    const listeners = new Set();
    events.set(name, listeners);
    return {
      addListener: callback => listeners.add(callback),
      removeListener: callback => listeners.delete(callback),
      hasListener: callback => listeners.has(callback),
      hasListeners: () => listeners.size > 0,
    };
  };
  const match = (pattern, value) => {
    if (pattern === '<all_urls>') return /^(https?|file|ftp):/.test(value);
    const parsed = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
    if (!parsed) return false;
    let url;
    try { url = new URL(value); } catch { return false; }
    if (parsed[1] === '*' ? !['http:', 'https:'].includes(url.protocol) : `${parsed[1]}:` !== url.protocol) return false;
    const host = parsed[2];
    if (host !== '*' && host !== url.hostname && !(host.startsWith('*.') && (url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))))) return false;
    const expression = parsed[3].split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(`${url.pathname}${url.search}`);
  };
  define('privacy', undefined); // Upstream marks browser privacy controls unavailable.
  for (const root of roots) Object.defineProperty(root.storage, 'sync', { value: undefined, configurable: true });
  define('browserAction', {
    onClicked: event('browserAction.onClicked'),
    ...Object.fromEntries(['setBadgeBackgroundColor', 'setBadgeTextColor', 'setBadgeText', 'setIcon', 'setTitle'].map(name => [name, method(`browserAction.${name}`)])),
  });
  define('contextMenus', {
    onClicked: event('contextMenus.onClicked'),
    create: method('contextMenus.create'), remove: method('contextMenus.remove'), removeAll: method('contextMenus.removeAll'), update: method('contextMenus.update'),
  });
  define('webNavigation', {
    onCreatedNavigationTarget: event('webNavigation.onCreatedNavigationTarget'),
    onCommitted: event('webNavigation.onCommitted'),
    getFrame: method('webNavigation.getFrame'), getAllFrames: method('webNavigation.getAllFrames'),
  });
  define('windows', {
    WINDOW_ID_NONE: -1, onFocusChanged: event('windows.onFocusChanged'),
    get: method('windows.get'), getAll: method('windows.getAll'), getCurrent: method('windows.getCurrent'),
    create: method('windows.create'), update: method('windows.update'),
  });
  const tabs = {};
  for (const name of ['query', 'get', 'create', 'remove', 'move', 'insertCSS', 'removeCSS', 'executeScript', 'reload', 'update']) tabs[name] = method(`tabs.${name}`);
  for (const name of ['executeScript']) {
    tabs[name] = (tabId, options, callback) => {
      const inject = (webContentsId, details) => new Promise((resolve, reject) => nativeTabs[name](webContentsId, details, value => {
        if (runtime.lastError) reject(new Error('ubo-injection-failed')); else resolve(value);
      }));
      const promise = call('tabs.authorizeInjection', [tabId, options]).then(async ({ webContentsId, lease }) => {
        const target = { allFrames: !!options.allFrames, frameId: options.frameId ?? 0,
          matchAboutBlank: !!options.matchAboutBlank, runAt: options.runAt || 'document_idle' };
        const tokens = await inject(webContentsId, { ...target, code: "if (!Object.hasOwn(self, '__blancUboDocumentV1')) Object.defineProperty(self, '__blancUboDocumentV1', { value: crypto.randomUUID() }); self.__blancUboDocumentV1;" });
        const { code } = await call('tabs.commitInjection', [lease, tokens]);
        return inject(webContentsId, { ...target, code });
      });
      if (callback) { promise.then(callback, () => callback()); return; }
      return promise;
    };
  }
  for (const name of ['insertCSS', 'removeCSS']) {
    tabs[name] = method(`tabs.${name}`);
  }
  tabs.sendMessage = (tabId, message, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    const promise = call('tabs.authorizeMessaging', [tabId, options || {}]).then(({ webContentsId }) =>
      new Promise(resolve => nativeTabs.sendMessage(webContentsId, message, options || {}, resolve)));
    if (callback) { promise.then(callback, () => callback()); return; }
    return promise;
  };
  for (const name of ['onActivated', 'onCreated', 'onUpdated', 'onRemoved', 'onReplaced', 'onAttached', 'onDetached']) tabs[name] = event(`tabs.${name}`);
  define('tabs', tabs);
  const requests = { ResourceType: chrome.webRequest.ResourceType, handlerBehaviorChanged: callback => callback?.() };
  for (const name of ['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred']) {
    const listeners = new Map();
    networkEvents.set(name, listeners);
    requests[name] = {
      addListener: (listener, filter, extra) => listeners.set(listener, { filter, extra }),
      removeListener: listener => listeners.delete(listener),
      hasListener: listener => listeners.has(listener), hasListeners: () => listeners.size > 0,
    };
  }
  if (background) define('webRequest', requests);
  const trustedPage = sender => sender.id === runtime.id && typeof sender.url === 'string' && sender.url.startsWith(runtime.getURL(''));
  if (background) {
    // Reserve our own transport port. Upstream's privileged content/UI port
    // boundary remains in place and cannot receive host-control messages.
    Object.defineProperty(connectEvent, 'addListener', { value: listener => nativeAddConnect(port => {
      if (port.name === 'blanc-host-v1') return;
      const original = port.sender?.tab?.id;
      if (original !== undefined) {
        if (contents.has(original)) {
          port.sender.tab.id = contents.get(original);
          if (!trustedPage(port.sender)) {
            if (contentPorts.size >= 512) { send({ kind: 'host-failed' }); port.disconnect(); return; }
            contentPorts.set(port, original);
            const frameId = port.sender.frameId;
            const tabId = port.sender.tab.id;
            const documentToken = port.name; // Upstream vAPI.sessionId is per document.
            let chain = Promise.resolve();
            const addMessage = port.onMessage.addListener.bind(port.onMessage);
            Object.defineProperty(port.onMessage, 'addListener', { configurable: true,
              value: callback => addMessage((...args) => {
                if (!filteringEnabled) return;
                const bytes = JSON.stringify(args[0]).length * 2;
                if (contentPending >= 256 || contentBytes + bytes > MAX_BYTES) { send({ kind: 'host-failed' }); return; }
                contentPending++; contentBytes += bytes;
                chain = chain.then(async () => {
                  if (!filteringEnabled || !contentPorts.has(port)) return;
                  const authorized = await call('tabs.authorizeMessaging', [tabId, { frameId }]);
                  if (authorized.webContentsId !== original) { port.disconnect(); return; }
                  // A fixed native probe in uBO's own isolated world verifies
                  // this port still belongs to the current document. No page
                  // script or caller-supplied code enters the probe operation.
                  let timer;
                  try {
                    const tokens = await Promise.race([
                      new Promise(resolve => nativeTabs.executeScript(original, {
                        code: 'self.vAPI?.sessionId;', frameId, matchAboutBlank: true, runAt: 'document_start',
                      }, value => { void runtime.lastError; resolve(value); })),
                      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ubo-content-timeout')), 2000); }),
                    ]);
                    if (!filteringEnabled || !contentPorts.has(port)) return;
                    if (tokens?.[0] !== documentToken) { port.disconnect(); return; }
                    callback(...args);
                  } finally { clearTimeout(timer); }
                }).catch(() => { port.disconnect(); }).finally(() => { contentPending--; contentBytes -= bytes; });
              }) });
            port.onDisconnect.addListener(() => contentPorts.delete(port));
          }
        }
        else if (!trustedPage(port.sender)) return;
      }
      listener(port);
    }), configurable: true });
    nativeAddConnect(port => {
      if (port.name !== 'blanc-host-v1' || !trustedPage(port.sender) || port.sender.url !== runtime.getURL('blanc-bridge.html')) return;
      bridge = port;
      port.onDisconnect.addListener(() => {
        bridge = undefined;
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('ubo-host-disconnected')); }
        pending.clear();
        queued.length = 0; queuedBytes = 0;
      });
      port.onMessage.addListener(async message => {
        if (message.kind === 'reply') {
          const item = pending.get(message.id);
          if (!item) return;
          pending.delete(message.id); clearTimeout(item.timer);
          if (message.error) item.reject(new Error(message.error)); else item.resolve(message.value);
        } else if (message.kind === 'event') {
          for (const listener of events.get(message.name) || []) listener(...message.args);
        } else if (message.kind === 'enabled') {
          filteringEnabled = message.value === true;
          if (!filteringEnabled) for (const id of new Set(contentPorts.values())) {
            nativeTabs.sendMessage(id, { blancFilteringDisabled: true }, () => { void runtime.lastError; });
          }
        } else if (message.kind === 'mapping') {
          contents.clear(); for (const entry of message.entries) contents.set(entry.webContentsId, entry.tabId);
          for (const [port, id] of contentPorts) {
            if (contents.has(id)) continue;
            contentPorts.delete(port); port.disconnect();
          }
        } else if (message.kind === 'request') {
          let result = {};
          try {
            for (const [listener, { filter, extra }] of networkEvents.get(message.name) || []) {
              if (filter?.types && !filter.types.includes(message.details.type)) continue;
              if (filter?.tabId !== undefined && filter.tabId !== message.details.tabId) continue;
              if (filter?.urls && !filter.urls.some(pattern => match(pattern, message.details.url))) continue;
              const decision = await listener({ ...message.details });
              if (extra?.includes('blocking') && decision) result = { ...result, ...decision };
              if (result.cancel) break;
            }
            send({ kind: 'decision', id: message.id, value: result });
          } catch { send({ kind: 'decision', id: message.id, error: 'ubo-decision-failed' }); }
        } else if (message.kind === 'site') {
          const store = self.µBlock?.pageStoreFromTabId(message.tabId);
          if (store) store.toggleNetFilteringSwitch(message.url, 'site', message.enabled);
          send({ kind: 'decision', id: message.id, value: {} });
        } else if (message.kind === 'site-state') {
          const store = self.µBlock?.pageStoreFromTabId(message.tabId);
          send({ kind: 'decision', id: message.id, value: { enabled: store?.getNetFilteringSwitch() ?? true } });
        }
      });
      queuedBytes = 0;
      if (capacityFailed) send({ kind: 'host-failed' });
      for (const message of queued.splice(0)) if (message.kind !== 'call' || pending.has(message.id)) send(message);
      if (isReady) send({ kind: 'ready', node: typeof require !== 'undefined' || typeof process !== 'undefined' });
    });
    runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.blancHost !== 1 || !trustedPage(sender)) return;
      call(message.method, message.args).then(respond, () => respond(undefined));
      return true;
    });
  }
  self.BlancUboHost = {
    closePopup() { call('extension.closePopup', []).catch(() => {}); },
    async ready() {
      try {
        const key = 'blancHostStorageProbe';
        const token = `${Date.now()}-${Math.random()}`;
        await chrome.storage.local.set({ [key]: token });
        const result = await chrome.storage.local.get(key);
        if (result[key] !== token) throw new Error('ubo-storage-failed');
        await chrome.storage.local.remove(key);
        isReady = true;
        send({ kind: 'ready', node: typeof require !== 'undefined' || typeof process !== 'undefined' });
      } catch { send({ kind: 'storage-failed' }); }
    },
  };
})();
