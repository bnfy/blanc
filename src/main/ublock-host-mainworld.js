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
  // getRandomValues is available on ordinary HTTP pages; randomUUID requires
  // a secure context. Keep a cryptographic, immutable token in the extension's
  // isolated world so stale-document injection guards work on both.
  const documentTokenCode = `
    if (!Object.hasOwn(self, '__blancUboDocumentV1')) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const token = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
      Object.defineProperty(self, '__blancUboDocumentV1', { value: token });
    }
    self.__blancUboDocumentV1;
  `;
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
  const toolCapabilities = new Map();
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
      }, ['tabs.insertCSS', 'tabs.removeCSS'].includes(method) ? 10000 : 2000);
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
    if (pattern === '<all_urls>') return /^(https?|wss?|file|ftp):/.test(value);
    const parsed = /^(\*|https?|wss?|file|ftp|chrome-extension):\/\/([^/]*)(\/.*)$/.exec(pattern);
    if (!parsed) return false;
    let url;
    try { url = new URL(value); } catch { return false; }
    if (parsed[1] === '*' ? !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) : `${parsed[1]}:` !== url.protocol) return false;
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
    onDOMContentLoaded: event('webNavigation.onDOMContentLoaded'),
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
        const tokens = await inject(webContentsId, { ...target, runAt: 'document_start', code: documentTokenCode });
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
  tabs.connect = (tabId, options = {}) => {
    const listeners = { message: new Set(), disconnect: new Set() };
    let port, stopped = false, queued = 0, documentToken, webContentsId;
    let incoming = Promise.resolve(), outgoing = Promise.resolve();
    const emit = (name, ...args) => { for (const listener of listeners[name]) listener(...args); };
    const close = () => {
      if (stopped) return;
      stopped = true; port?.disconnect(); emit('disconnect', facade);
      listeners.message.clear(); listeners.disconnect.clear();
    };
    const authorize = async () => {
      const target = await call('tabs.authorizeMessaging', [tabId, { frameId: options.frameId ?? 0 }]);
      if (stopped || target.webContentsId !== webContentsId
        || await probeContent(webContentsId, options.frameId ?? 0) !== documentToken) throw new Error('ubo-port-stale');
    };
    const ready = call('tabs.authorizeMessaging', [tabId, { frameId: options.frameId ?? 0 }]).then(async target => {
      webContentsId = target.webContentsId;
      documentToken = await probeContent(webContentsId, options.frameId ?? 0);
      if (stopped || !documentToken) throw new Error('ubo-port-stale');
      await authorize();
      port = nativeTabs.connect(webContentsId, options);
      port.onDisconnect.addListener(close);
      port.onMessage.addListener(message => {
        if (queued >= 64 || JSON.stringify(message).length > 1024 * 1024) return close();
        queued++;
        incoming = incoming.then(authorize).then(() => { if (!stopped) emit('message', message, facade); }).catch(close).finally(() => { queued--; });
      });
    });
    // A Chrome Port is synchronous; defer only its native connection until the
    // sender-bound regular-profile/frame authorization has completed.
    const facade = {
      name: options.name || '', disconnect: close,
      onMessage: { addListener: fn => listeners.message.add(fn), removeListener: fn => listeners.message.delete(fn) },
      onDisconnect: { addListener: fn => listeners.disconnect.add(fn), removeListener: fn => listeners.disconnect.delete(fn) },
      postMessage(message) {
        if (stopped) throw new Error('ubo-port-disconnected');
        if (queued >= 64 || JSON.stringify(message).length > 1024 * 1024) return close();
        queued++;
        outgoing = outgoing.then(() => ready).then(authorize).then(() => { if (!stopped) port.postMessage(message); }).catch(close).finally(() => { queued--; });
      },
    };
    ready.catch(close);
    return facade;
  };
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
  // A capability travels only through native extension messaging and the
  // isolated content-script -> tool MessagePort handoff, never through DOM URLs.
  const probeContent = async (webContentsId, frameId) => {
    let timer;
    try {
      return await Promise.race([
        new Promise(resolve => nativeTabs.executeScript(webContentsId, {
          code: 'self.vAPI?.sessionId;', frameId, matchAboutBlank: true, runAt: 'document_start',
        }, value => { void runtime.lastError; resolve(value?.[0]); })),
        new Promise(resolve => { timer = setTimeout(() => resolve(undefined), 2000); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const toolMessage = async (message, sender) => {
    if (!filteringEnabled || sender.id !== runtime.id || !['picker', 'inspector'].includes(message.tool)) return false;
    const original = sender.tab?.id;
    const tabId = contents.get(original);
    if (tabId === undefined || !Number.isInteger(sender.frameId) || sender.frameId < 0) return false;
    const now = Date.now();
    for (const [token, entry] of toolCapabilities) if (entry.expires <= now) toolCapabilities.delete(token);
    if (message.action === 'issue') {
      if (trustedPage(sender) || toolCapabilities.size >= 256) return false;
      const authorized = await call('tabs.authorizeMessaging', [tabId, { frameId: sender.frameId }]);
      if (authorized.webContentsId !== original) return false;
      const documentToken = await probeContent(original, sender.frameId);
      if (!documentToken || !filteringEnabled || contents.get(original) !== tabId || toolCapabilities.size >= 256) return false;
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      toolCapabilities.set(token, { tool: message.tool, original, tabId, frameId: sender.frameId, documentToken, expires: Date.now() + 30000 });
      return token;
    }
    if (message.action !== 'consume' || !trustedPage(sender)) return false;
    const target = new URL(sender.url);
    const toolPath = message.tool === 'picker' ? '/web_accessible_resources/epicker-ui.html' : '/web_accessible_resources/dom-inspector.html';
    if (target.pathname !== toolPath || typeof message.token !== 'string') return false;
    const entry = toolCapabilities.get(message.token);
    if (!entry || entry.original !== original || entry.tabId !== tabId || entry.tool !== message.tool) return false;
    const frame = await call('webNavigation.getFrame', [{ tabId, frameId: sender.frameId }]);
    if (frame?.parentFrameId !== entry.frameId) return false;
    const documentToken = await probeContent(original, entry.frameId);
    if (!filteringEnabled || contents.get(original) !== tabId || documentToken !== entry.documentToken
      || entry.expires <= Date.now() || toolCapabilities.get(message.token) !== entry) return false;
    toolCapabilities.delete(message.token); // One successful consumer, including concurrent handoffs.
    return true;
  };
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
        toolCapabilities.clear();
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
          // Native runtime messaging reaches extension pages in this session;
          // content scripts remain on their authenticated tab-specific ports.
          runtime.sendMessage({ blancHostEvent: 1, name: message.name, args: message.args }, () => { void runtime.lastError; });
          for (const listener of events.get(message.name) || []) listener(...message.args);
        } else if (message.kind === 'enabled') {
          filteringEnabled = message.value === true;
          if (!filteringEnabled) toolCapabilities.clear();
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
        } else if (message.kind === 'erase-storage') {
          try {
            const assets = (await import('/js/assets.js')).default;
            assets.updateStop();
            await chrome.storage.local.clear();
            send({ kind: 'decision', id: message.id, value: {} });
          } catch { send({ kind: 'decision', id: message.id, error: 'ubo-storage-erase-failed' }); }
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
      if (message?.blancTool === 1) {
        toolMessage(message, sender).then(respond, () => respond(false));
        return true;
      }
      if (message?.blancHost !== 1 || !trustedPage(sender)) return;
      call(message.method, message.args).then(respond, () => respond(undefined));
      return true;
    });
  }
  if (!background) runtime.onMessage.addListener((message, sender) => {
    if (message?.blancHostEvent !== 1 || sender.id !== runtime.id
      || sender.url !== runtime.getURL('background.html') || !Array.isArray(message.args)
      || message.args.length > 4 || !events.has(message.name)) return;
    for (const listener of events.get(message.name)) listener(...message.args);
  });
  self.BlancUboHost = {
    navigationURL(value) {
      try {
        const target = new URL(value);
        return ['http:', 'https:'].includes(target.protocol) ? target.href : null;
      } catch { return null; }
    },
    async authorizeToolPort(tool, event) {
      if (event.source !== self.parent || event.ports?.length !== 1
        || !/^[a-f0-9]{32}$/.test(event.data?.blancToolCapability || '')) return false;
      try {
        return await runtime.sendMessage({ blancTool: 1, action: 'consume', tool, token: event.data.blancToolCapability }) === true;
      } catch { return false; }
    },
    // Close only the initiating native popup; delayed requests from an old
    // document must never dismiss a newly opened view in the same profile.
    closePopup() { self.blancUboPopup?.close(); },
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
