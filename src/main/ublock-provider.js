'use strict';

const { app, WebContentsView, ipcMain, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isBrowserResource } = require('./blocking-resources');
const { installVerifiedPackage, installVerifiedFiles, readHostSources } = require('./ublock-package');
const { createUblockRegistry } = require('./ublock-registry');
const { validBridgeSender } = require('./ublock-host-policy');
const { captureDocuments, currentDocuments, guardScript } = require('./ublock-documents');

const DEADLINE_MS = 2000;
const MAX_PENDING = 256;
const instances = new Map();
let ipcInstalled = false;
const headersToElectron = values => {
  if (!Array.isArray(values) || values.length > 512) throw new Error('ubo-response-invalid');
  const result = Object.create(null);
  let bytes = 0;
  for (const header of values) {
    if (typeof header.name !== 'string' || typeof header.value !== 'string'
      || /[\r\n]/.test(header.name + header.value)) throw new Error('ubo-response-invalid');
    bytes += header.name.length + header.value.length;
    if (bytes > 512 * 1024) throw new Error('ubo-response-invalid');
    (result[header.name] ??= []).push(header.value);
  }
  return result;
};

function createUblockProvider({ session, profileId, hooks, onStateChange = () => {}, onBlocked = () => {} }) {
  const registry = createUblockRegistry({ profileId, ...hooks });
  const pending = new Map();
  const injectionLeases = new Map();
  const frameGenerations = new WeakMap();
  let scripts = new Map();
  const menus = new Map();
  const badges = new Map();
  const ownedCss = new Map();
  const watched = new Map();
  const knownTabs = new Set();
  const projections = new Map();
  const suspendedTools = new Map();
  const counted = new Set();
  const loadingIds = new Set();
  let cleanupScheduled = false;
  let initializePromise;
  let helper;
  let background;
  let cleaning = false;
  let cssHelper;
  let cssExtension;
  let cssReadyResolve;
  let extension;
  let sequence = 0;
  let enabled = true;
  let phase = 'initializing';
  let error = null;
  let readyResolve;
  let readyReject;
  let readyPromise;
  let disposed = false;
  let focusedWindowId = -1;
  const status = () => ({ id: 'ublock-origin', version: '1.75.0', phase, error });
  const browserResource = url => isBrowserResource(url, app.getAppPath());
  function managedFetch(details) {
    // Chromium's native extension webRequest API excludes the extension's
    // own fetches. Keep subscription updates outside recursive filtering.
    return extension && details.initiatorOrigin === `chrome-extension://${extension.id}`;
  }
  function state(next, code = null) { phase = next; error = code; onStateChange(status()); }
  function send(message) {
    if (!helper?.webContents || helper.webContents.isDestroyed()) throw new Error('ubo-background-unavailable');
    helper.webContents.send('ublock:bridge', message);
  }
  function fail(code) {
    if (disposed || phase === 'failed') return;
    state('failed', code);
    readyReject?.(new Error(code));
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(code)); }
    pending.clear();
    suspendTools();
    // Keep the failed provider in the coordinator so traffic stays closed.
    if (!cleanupScheduled) {
      cleanupScheduled = true;
      setImmediate(() => { cleanupScheduled = false; cleanup('background'); });
    }
  }
  function suspendTools() {
    if (!extension) return;
    const prefix = `chrome-extension://${extension.id}/`;
    hooks.closePopup?.(profileId);
    for (const entry of registry.mapping()) {
      const wc = registry.ownedContents(entry.tabId)?.wc;
      if (!wc || hooks.isHeld?.(wc) || !wc.getURL().startsWith(prefix)) continue;
      suspendedTools.set(wc.id, { wc, url: wc.getURL() });
      wc.loadURL('blanc://error?code=-20&desc=uBlock%20Origin%20needs%20retry').catch(() => {});
    }
  }
  function ask(message) {
    if (phase !== 'ready') return Promise.reject(new Error(error || 'ubo-not-ready'));
    if (pending.size >= MAX_PENDING) { fail('ubo-request-capacity'); return Promise.reject(new Error('ubo-request-capacity')); }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('ubo-decision-timeout'), DEADLINE_MS);
      pending.set(id, { resolve, reject, timer, transport: 'background' });
      try { send({ ...message, id }); } catch { fail('ubo-background-unavailable'); }
    });
  }
  function refresh() {
    registry.refresh();
    if (phase !== 'ready') return;
    const mapping = registry.mapping();
    send({ kind: 'mapping', entries: mapping });
    const tabs = registry.query();
    const currentFocus = hooks.listWindows().find(item => item.profileId === profileId
      && item.window && !item.window.isDestroyed() && item.window.isFocused())?.window.id ?? -1;
    if (currentFocus !== focusedWindowId) { focusedWindowId = currentFocus; emit('windows.onFocusChanged', currentFocus); }
    for (const tab of tabs) {
      const previous = projections.get(tab.id);
      if (tab.active && (!previous?.active || previous.windowId !== tab.windowId)) emit('tabs.onActivated', { tabId: tab.id, windowId: tab.windowId });
      if (previous && previous.discarded !== tab.discarded) emit('tabs.onUpdated', tab.id, { discarded: tab.discarded }, tab);
      projections.set(tab.id, tab);
    }
    for (const id of projections.keys()) if (!tabs.some(tab => tab.id === id)) projections.delete(id);
    const current = new Set(mapping.map(item => item.webContentsId));
    for (const [id, item] of watched) {
      if (current.has(id)) continue;
      for (const [name, listener] of item.listeners) item.wc.removeListener(name, listener);
      if (!registry.tabFor(item.tabId)) {
        emit('tabs.onRemoved', item.tabId, { windowId: item.windowId, isWindowClosing: false });
        knownTabs.delete(item.tabId);
      }
      watched.delete(id);
      if (item.wc.isDestroyed()) for (const [key, value] of ownedCss) if (value.target.tabId === id) ownedCss.delete(key);
    }
    for (const id of knownTabs) {
      if (registry.tabFor(id)) continue;
      emit('tabs.onRemoved', id, { isWindowClosing: false });
      knownTabs.delete(id); badges.delete(id);
    }
    for (const entry of mapping) {
      if (watched.has(entry.webContentsId)) continue;
      const { wc, tab } = registry.ownedContents(entry.tabId);
      const projected = registry.project(tab);
      const listeners = [];
      const on = (name, listener) => { wc.on(name, listener); listeners.push([name, listener]); };
      const valid = () => registry.ownedContents(entry.tabId)?.wc === wc && !hooks.isHeld?.(wc);
      on('did-frame-navigate', (_event, url, _code, _text, isMain, processId, routingId) => {
        if (!valid()) return;
        const frame = wc.mainFrame.framesInSubtree.find(item => item.processId === processId && item.routingId === routingId);
        if (!frame) return;
        frameGenerations.set(frame, (frameGenerations.get(frame) || 0) + 1);
        if (isMain) {
          for (const [key, value] of ownedCss) if (value.target.tabId === wc.id) ownedCss.delete(key);
        }
        emit('webNavigation.onCommitted', { tabId: entry.tabId, ...registry.frameData(frame), url, timeStamp: Date.now(), transitionType: 'link', transitionQualifiers: [] });
      });
      on('did-navigate-in-page', (_event, url, isMain) => {
        if (valid() && isMain) emit('tabs.onUpdated', entry.tabId, { url }, registry.project(tab));
      });
      on('did-finish-load', () => { if (valid()) emit('tabs.onUpdated', entry.tabId, { status: 'complete' }, registry.project(tab)); });
      on('page-title-updated', () => { if (valid()) emit('tabs.onUpdated', entry.tabId, { title: tab.title }, registry.project(tab)); });
      watched.set(wc.id, { wc, listeners, tabId: entry.tabId, windowId: projected.windowId });
      if (!knownTabs.has(entry.tabId)) { emit('tabs.onCreated', projected); knownTabs.add(entry.tabId); }
      else emit('tabs.onUpdated', entry.tabId, { discarded: false }, projected);
    }
  }
  function windowFor(id) {
    return hooks.listWindows().find(runtime => runtime.profileId === profileId
      && runtime.window?.id === id && !runtime.window.isDestroyed());
  }
  function owned(id) {
    const value = registry.ownedContents(id);
    if (!value || hooks.isHeld?.(value.wc)) throw new Error('ubo-tab-unavailable');
    return value;
  }
  const generationFor = frame => frameGenerations.get(frame) || 0;
  const documentPolicy = { liveContents: hooks.liveContents, isHeld: wc => !!hooks.isHeld?.(wc), registered: wc => !!registry.fromContents(wc.id), generationFor };
  function cssRequest(method, tabId, options) {
    const { tab, wc } = owned(tabId);
    if (!enabled || phase !== 'ready') throw new Error('ubo-filtering-disabled');
    const frames = registry.frames(tabId);
    if (options.frameId !== undefined && !frames.some(frame => frame.frameId === options.frameId)) throw new Error('ubo-frame-stale');
    if (frames.some(frame => frame.frameId === (options.frameId ?? 0) && /^chrome-extension:/.test(frame.url))) throw new Error('ubo-extension-document-excluded');
    if (typeof options.code !== 'string' || options.code.length > 2 * 1024 * 1024) throw new Error('ubo-css-invalid');
    const target = { tabId: wc.id };
    if (options.allFrames) target.allFrames = true;
    else target.frameIds = [options.frameId ?? 0];
    const operation = { target, css: options.code, origin: options.cssOrigin === 'user' ? 'USER' : 'AUTHOR' };
    const key = JSON.stringify([wc.id, target, operation.css, operation.origin]);
    const generation = tab.navEpoch;
    const documents = captureDocuments(tab, wc, wc.mainFrame.framesInSubtree.filter(frame => options.allFrames || registry.frameData(frame).frameId === (options.frameId ?? 0)), generationFor);
    const validDocument = () => enabled && phase === 'ready' && currentDocuments(documents, documentPolicy);
    const id = ++sequence;
    if (pending.size >= MAX_PENDING) throw new Error('ubo-request-capacity');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('ubo-css-timeout'), DEADLINE_MS);
      pending.set(id, { timer, reject, transport: 'css', validDocument, onError: () => {
        reject(new Error('ubo-css-failed'));
        if (validDocument()) fail('ubo-css-failed');
      }, resolve: insertedTarget => {
        if (insertedTarget) operation.target = insertedTarget;
        if (tab.navEpoch !== generation || hooks.liveContents(tab) !== wc) {
          if (method === 'insertCSS') cssHelper.webContents.send('ublock:bridge', { kind: 'css', id: ++sequence, method: 'removeCSS', options: operation });
          reject(new Error('ubo-document-stale')); return;
        }
        if (!enabled) { cssHelper.webContents.send('ublock:bridge', { kind: 'css', id: ++sequence, method: 'removeCSS', options: operation }); resolve(); return; }
        const cssBytes = [...ownedCss.values()].reduce((total, entry) => total + entry.css.length * 2, 0);
        if ((ownedCss.size >= 1024 || cssBytes + operation.css.length * 2 > 8 * 1024 * 1024) && !ownedCss.has(key)) {
          fail('ubo-css-capacity'); reject(new Error('ubo-css-capacity')); return;
        }
        if (method === 'insertCSS') ownedCss.set(key, operation); else ownedCss.delete(key);
        resolve();
      } });
      cssHelper.webContents.send('ublock:bridge', { kind: 'css', id, method, options: operation });
    });
  }
  function validateUrl(url) {
    if (typeof url !== 'string' || url.length > 8192) throw new Error('ubo-url-invalid');
    if (!/^https?:\/\//i.test(url) && !url.startsWith(`chrome-extension://${extension.id}/`)) throw new Error('ubo-url-invalid');
    return url;
  }
  async function call(method, args) {
    if (phase === 'failed' || disposed || !Array.isArray(args) || args.length > 4
      || JSON.stringify(args).length > 3 * 1024 * 1024) throw new Error('ubo-call-invalid');
    const [id, options = {}] = args;
    switch (method) {
    case 'tabs.query': return registry.query(id || {});
    case 'tabs.get': { const tab = registry.tabFor(id); return tab ? registry.project(tab) : undefined; }
    case 'tabs.authorizeMessaging': {
      const { wc } = owned(id);
      if (!enabled || phase !== 'ready') throw new Error('ubo-filtering-disabled');
      if (options.frameId !== undefined && !registry.frames(id).some(frame => frame.frameId === options.frameId)) throw new Error('ubo-frame-stale');
      return { webContentsId: wc.id };
    }
    case 'tabs.authorizeInjection': {
      const { wc, tab } = owned(id);
      if (!enabled || phase !== 'ready') throw new Error('ubo-filtering-disabled');
      const frames = wc.mainFrame.framesInSubtree.filter(frame => options.allFrames || registry.frameData(frame).frameId === (options.frameId ?? 0));
      if (!frames.length || frames.length > 1024) throw new Error('ubo-frame-stale');
      let code;
      if (options.file !== undefined) {
        if (typeof options.file !== 'string') throw new Error('ubo-injection-invalid');
        code = scripts.get(options.file.replace(/^\//, ''))?.toString('utf8');
      } else code = options.code;
      if (typeof code !== 'string' || code.length > 2 * 1024 * 1024) throw new Error('ubo-injection-invalid');
      for (const [key, lease] of injectionLeases) if (Date.now() > lease.expires) injectionLeases.delete(key);
      if (injectionLeases.size >= MAX_PENDING || [...injectionLeases.values()].reduce((bytes, lease) => bytes + lease.code.length * 2, 0) + code.length * 2 > 8 * 1024 * 1024) throw new Error('ubo-injection-capacity');
      const lease = randomUUID();
      injectionLeases.set(lease, { ...captureDocuments(tab, wc, frames, generationFor), code, expires: Date.now() + DEADLINE_MS });
      return { webContentsId: wc.id, lease };
    }
    case 'tabs.commitInjection': {
      const lease = injectionLeases.get(id);
      injectionLeases.delete(id);
      if (!lease || Date.now() > lease.expires || !enabled || phase !== 'ready'
        || !currentDocuments(lease, documentPolicy)) throw new Error('ubo-document-stale');
      // Tokens are minted inside uBO's isolated world by a fixed native probe.
      // Guard the actual script in that same world: a document replaced after
      // this check cannot execute it, even when the native frame ID is reused.
      return { code: guardScript(lease.code, options) };
    }
    case 'tabs.insertCSS': return cssRequest('insertCSS', id, options);
    case 'tabs.removeCSS': return cssRequest('removeCSS', id, options);
    case 'tabs.create': {
      const value = id || {};
      const url = validateUrl(value.url);
      const windows = hooks.listWindows().filter(item => item.profileId === profileId && item.window && !item.window.isDestroyed());
      const runtime = value.windowId === undefined ? windows.find(item => item.window.isFocused()) ?? windows.at(-1) : windowFor(value.windowId);
      if (!runtime) throw new Error('ubo-window-unavailable');
      const tab = await hooks.createTab(runtime, url, { active: value.active !== false, index: value.index });
      refresh(); return registry.project(tab);
    }
    case 'tabs.update': {
      const { tab } = owned(id);
      if (options.url !== undefined) validateUrl(options.url);
      await hooks.updateTab(tab, options); refresh(); return registry.project(tab);
    }
    case 'tabs.remove':
      for (const target of Array.isArray(id) ? id : [id]) { const tab = registry.tabFor(target); if (tab) await hooks.closeTab(tab); }
      refresh(); return;
    case 'tabs.reload': {
      const { wc } = owned(id);
      // A provider action must never silently replay a POST result.
      if (hooks.methodFor?.(wc) === 'POST') throw new Error('ubo-post-reload-refused');
      if (options.bypassCache) wc.reloadIgnoringCache(); else wc.reload();
      return;
    }
    case 'tabs.move': { const { tab } = owned(id); await hooks.moveTab?.(tab, options); refresh(); return registry.project(tab); }
    case 'extension.restart': setImmediate(() => retry().catch(() => {})); return;
    case 'webNavigation.getAllFrames': return registry.frames(id?.tabId);
    case 'webNavigation.getFrame': return registry.frames(id?.tabId).find(frame => frame.frameId === id?.frameId) ?? null;
    case 'windows.get':
    case 'windows.getCurrent':
    case 'windows.getAll': {
      const windows = hooks.listWindows().filter(item => item.profileId === profileId && item.window && !item.window.isDestroyed());
      const values = windows.map(item => ({ id: item.window.id, focused: item.window.isFocused(), incognito: false, type: 'normal', tabs: registry.query({ windowId: item.window.id }) }));
      if (method === 'windows.getAll') return values;
      if (method === 'windows.getCurrent') return values.find(value => value.focused) ?? values.at(-1);
      return values.find(value => value.id === id);
    }
    case 'windows.update': { const runtime = windowFor(id); if (!runtime) throw new Error('ubo-window-unavailable'); if (options.focused) runtime.window.focus(); return { id }; }
    case 'windows.create': { const runtime = await hooks.createWindow(profileId); if (id?.url) await hooks.createTab(runtime, validateUrl(id.url), { active: true }); return { id: runtime.window.id }; }
    case 'contextMenus.create': {
      if (!id || typeof id.id !== 'string' || id.id.length > 128 || menus.size >= 32) throw new Error('ubo-menu-invalid');
      menus.set(id.id, id); return id.id;
    }
    case 'contextMenus.remove': menus.delete(id); return;
    case 'contextMenus.removeAll': menus.clear(); return;
    case 'contextMenus.update': if (menus.has(id)) menus.set(id, { ...menus.get(id), ...options }); return;
    case 'browserAction.setBadgeText':
    case 'browserAction.setBadgeBackgroundColor':
    case 'browserAction.setBadgeTextColor':
    case 'browserAction.setIcon':
    case 'browserAction.setTitle':
      if (!id || !Number.isInteger(id.tabId) || !registry.tabFor(id.tabId)) return;
      badges.set(id.tabId, { ...badges.get(id.tabId), ...id }); return;
    default: throw new Error('ubo-call-unsupported');
    }
  }
  async function receive(event, message) {
    const wc = helper?.webContents;
    if (!validBridgeSender(event, wc, session, `chrome-extension://${extension?.id}/blanc-bridge.html`)) return;
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'ready') {
      if (phase !== 'initializing') return;
      if (message.node !== false) return fail('ubo-background-node');
      const bg = webContents.getAllWebContents().find(item => item.session === session
        && item.getType() === 'backgroundPage' && item.getURL() === `chrome-extension://${extension.id}/background.html`);
      if (!bg) return fail('ubo-background-unavailable');
      if (['darwin', 'win32'].includes(process.platform)
        && app.getAppMetrics().find(item => item.pid === bg.getOSProcessId())?.sandboxed !== true) return fail('ubo-background-unsandboxed');
      if (process.platform === 'linux') {
        const processStatus = fs.readFileSync(`/proc/${bg.getOSProcessId()}/status`, 'utf8');
        if (!/^Seccomp:\s+2$/m.test(processStatus) || !/^NoNewPrivs:\s+1$/m.test(processStatus)) return fail('ubo-background-unsandboxed');
      }
      send({ kind: 'enabled', value: enabled });
      state('ready'); refresh(); readyResolve?.(status()); return;
    }
    if (message.kind === 'disconnected') return fail('ubo-background-disconnected');
    if (message.kind === 'host-failed') return fail('ubo-host-capacity');
    if (message.kind === 'storage-failed') return fail('ubo-storage-failed');
    if (message.kind === 'decision') {
      const item = pending.get(message.id);
      if (!item || item.transport !== 'background') return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) { item.reject(new Error('ubo-decision-failed')); fail('ubo-decision-failed'); } else item.resolve(message.value);
      return;
    }
    if (message.kind === 'call' && Number.isSafeInteger(message.id) && typeof message.method === 'string') {
      try { const value = await call(message.method, message.args); send({ kind: 'reply', id: message.id, value }); }
      catch { try { send({ kind: 'reply', id: message.id, error: 'ubo-host-operation-refused' }); } catch {} }
    }
  }
  async function initialize() {
    if (initializePromise) return initializePromise;
    initializePromise = initializeInner();
    try { return await initializePromise; } finally { initializePromise = undefined; }
  }
  async function initializeInner() {
    state('initializing');
    readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // Handle the promise immediately; extraction/load failure can precede await.
    readyPromise.catch(() => {});
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
      const managedRoot = path.join(fs.realpathSync(app.getPath('userData')), 'managed-ublock', profileId);
      const cssPath = path.join(managedRoot, 'css-host');
      const cssFiles = {
        'manifest.json': JSON.stringify({ name: 'Blanc uBlock Origin CSS host', version: '1.0.0', manifest_version: 3, permissions: ['scripting'], host_permissions: ['http://*/*', 'https://*/*'] }),
        'bridge.html': '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="bridge.js"></script></body></html>',
        'bridge.js': fs.readFileSync(path.join(__dirname, 'ublock-css-mainworld.js')),
      };
      installVerifiedFiles(new Map(Object.entries(cssFiles).map(([name, bytes]) => [name, Buffer.from(bytes)])), cssPath);
      async function loadManaged(directory, options) {
        const onLoaded = (_event, loaded) => { if (loaded.path === directory) loadingIds.add(loaded.id); };
        session.extensions.on('extension-loaded', onLoaded);
        try {
          const loaded = await session.extensions.loadExtension(directory, options);
          loadingIds.add(loaded.id);
          return loaded;
        } finally { session.extensions.removeListener('extension-loaded', onLoaded); }
      }
      cssExtension = await loadManaged(cssPath);
      cssHelper = new WebContentsView({ webPreferences: {
        session, sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: path.join(__dirname, 'ublock-bridge-preload.js'),
      } });
      const cssReady = new Promise(resolve => { cssReadyResolve = resolve; });
      instances.set(cssHelper.webContents.id, (event, message) => {
        const wc = cssHelper.webContents;
        if (!validBridgeSender(event, wc, session, `chrome-extension://${cssExtension.id}/bridge.html`)) return;
        if (message?.kind === 'css-ready') { cssReadyResolve(); return; }
        if (message?.kind === 'css-target') {
          const item = pending.get(message.id);
          if (!item || item.transport !== 'css' || !item.validDocument) return;
          cssHelper.webContents.send('ublock:bridge', { kind: 'css-apply', id: message.id, allowed: item.validDocument() });
          return;
        }
        if (message?.kind !== 'css-result') return;
        const item = pending.get(message.id); if (!item || item.transport !== 'css') return;
        pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) { if (item.onError) item.onError(); else item.reject(new Error('ubo-css-failed')); } else {
          if (message.target && (!Array.isArray(message.target.documentIds) || message.target.documentIds.length > 1024
            || message.target.documentIds.some(id => typeof id !== 'string' || id.length > 128))) { item.reject(new Error('ubo-css-target-invalid')); fail('ubo-css-target-invalid'); return; }
          item.resolve(message.target);
        }
      });
      cssHelper.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      cssHelper.webContents.on('will-navigate', event => event.preventDefault());
      cssHelper.webContents.on('render-process-gone', () => fail('ubo-css-crashed'));
      await cssHelper.webContents.loadURL(`chrome-extension://${cssExtension.id}/bridge.html`);
      let cssTimer;
      try { await Promise.race([cssReady, new Promise((_, reject) => { cssTimer = setTimeout(() => reject(new Error('ubo-css-startup-timeout')), DEADLINE_MS); })]); }
      finally { clearTimeout(cssTimer); }
      const installed = installVerifiedPackage({
        root: path.join(app.getAppPath(), 'ublock'),
        destination: path.join(managedRoot, 'extension'),
        hostSources: readHostSources(app.getAppPath()),
      });
      scripts = installed.scripts;
      let backgroundReadyResolve;
      let backgroundDomReady = false;
      const backgroundReady = new Promise(resolve => { backgroundReadyResolve = resolve; });
      const resolveBackground = () => {
        if (backgroundDomReady && extension && background?.getURL() === `chrome-extension://${extension.id}/background.html`) backgroundReadyResolve();
      };
      const created = (_event, wc) => {
        if (wc.session !== session || wc.getType() !== 'backgroundPage') return;
        background = wc;
        wc.once('dom-ready', () => { backgroundDomReady = true; resolveBackground(); });
        wc.once('render-process-gone', () => { if (!cleaning && background === wc) fail('ubo-background-crashed'); });
        wc.once('destroyed', () => { if (!cleaning && background === wc) fail('ubo-background-lost'); });
      };
      app.on('web-contents-created', created);
      let backgroundTimer;
      try {
        extension = await loadManaged(installed.path, { allowFileAccess: false });
        resolveBackground();
        await Promise.race([backgroundReady, new Promise((_, reject) => {
          backgroundTimer = setTimeout(() => reject(new Error('ubo-background-startup-timeout')), 15000);
        })]);
      } finally { app.removeListener('web-contents-created', created); clearTimeout(backgroundTimer); }

      helper = new WebContentsView({ webPreferences: {
        session, sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: path.join(__dirname, 'ublock-bridge-preload.js'),
      } });
      instances.set(helper.webContents.id, receive);
      helper.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      helper.webContents.on('will-navigate', event => event.preventDefault());
      helper.webContents.on('render-process-gone', () => fail('ubo-bridge-crashed'));
      await helper.webContents.loadURL(`chrome-extension://${extension.id}/blanc-bridge.html`);
      const timer = setTimeout(() => fail('ubo-startup-timeout'), 15000);
      try { await readyPromise; } finally { clearTimeout(timer); }
      return status();
    } catch { fail(error || 'ubo-initialization-failed'); throw new Error(error); }
  }
  async function decide(name, details) {
    // The browser's own error/recovery pages must remain usable after a
    // provider failure. Their scheme is served by Blanc's exact allowlist.
    if (browserResource(details.url)) return {};
    if (managedFetch(details)) return {};
    // Internal extension bootstrapping stays available, but page-initiated
    // web-accessible resources must pass upstream's capability guard even when
    // the user has disabled filtering. Their secret is not an adblock setting.
    let guardedResource = false;
    if (details.url.startsWith('chrome-extension://')) {
      const target = new URL(details.url);
      if (!loadingIds.has(target.hostname)) return { cancel: true };
      // Electron decodes file paths after matching webRequest patterns. Reject
      // noncanonical own-resource paths before a percent-encoded WAR path can
      // escape upstream's literal /web_accessible_resources/* listener. Native
      // extension-origin fetches were already admitted above.
      if (target.hostname === extension?.id && target.pathname.includes('%')) return { cancel: true };
      guardedResource = target.hostname === extension?.id && target.pathname.startsWith('/web_accessible_resources/');
      if (!guardedResource) return {};
    }
    if (!enabled && !guardedResource) return {};
    if (phase !== 'ready') return { cancel: true };
    const converted = registry.request(details);
    // The extension's own filter-data fetches use its native background.
    const result = await ask({ kind: 'request', name, details: converted });
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some(key => !['cancel', 'redirectUrl', 'requestHeaders', 'responseHeaders'].includes(key))
      || (result.cancel !== undefined && typeof result.cancel !== 'boolean')) { fail('ubo-response-invalid'); return { cancel: true }; }
    if ((result.cancel === true || result.redirectUrl !== undefined) && !counted.has(details.id)) {
      counted.add(details.id);
      if (converted.tabId !== -1) onBlocked(registry.tabFor(converted.tabId));
    }
    if (result.cancel === true) {
      return { cancel: true };
    }
    const value = {};
    if (result.redirectUrl !== undefined) {
      if (typeof result.redirectUrl !== 'string' || result.redirectUrl.length > 8192
        || (!result.redirectUrl.startsWith(`chrome-extension://${extension.id}/`) && !/^(https?:\/\/|data:)/.test(result.redirectUrl))) { fail('ubo-redirect-invalid'); return { cancel: true }; }
      value.redirectURL = result.redirectUrl;
    }
    try {
    if (result.responseHeaders !== undefined) value.responseHeaders = headersToElectron(result.responseHeaders);
    if (result.requestHeaders !== undefined) {
      const headers = headersToElectron(result.requestHeaders);
      value.requestHeaders = Object.fromEntries(Object.entries(headers).map(([name, values]) => [name, values.join(', ')]));
    }
    } catch { fail('ubo-response-invalid'); return { cancel: true }; }
    return value;
  }
  async function observe(name, details) {
    if (name === 'onCompleted' || name === 'onErrorOccurred') counted.delete(details.id);
    if (enabled && phase === 'ready' && !browserResource(details.url) && !managedFetch(details)) await ask({ kind: 'request', name, details: registry.request(details) });
  }
  function emit(name, ...args) { if (phase === 'ready') send({ kind: 'event', name, args }); }
  async function removeOwnedCss() {
    const operations = [...ownedCss.values()].filter(options => {
      const wc = webContents.fromId(options.target.tabId);
      return wc && !wc.isDestroyed() && wc.session === session;
    }); ownedCss.clear();
    if (!cssHelper?.webContents || cssHelper.webContents.isDestroyed()) return;
    for (let start = 0; start < operations.length; start += 32) await Promise.allSettled(operations.slice(start, start + 32).map(options => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('ubo-css-removal-timeout')); }, DEADLINE_MS);
      pending.set(id, { transport: 'css', timer, resolve, reject });
      cssHelper.webContents.send('ublock:bridge', { kind: 'css', id, method: 'removeCSS', options });
    })));
  }
  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) removeOwnedCss().catch(() => {});
    if (phase === 'ready') send({ kind: 'enabled', value: enabled });
    onStateChange(status());
  }
  const siteId = value => { const id = typeof value === 'object' ? registry.idForTab(value) : value; owned(id); return id; };
  async function setSite(tab, url, value) { await ask({ kind: 'site', tabId: siteId(tab), url, enabled: !!value }); }
  async function siteState(tab) { return ask({ kind: 'site-state', tabId: siteId(tab) }); }
  function cleanup(scope = 'all') {
    cleaning = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('ubo-disposed')); }
    pending.clear();
    for (const item of watched.values()) for (const [name, listener] of item.listeners) item.wc.removeListener(name, listener);
    scripts.clear(); injectionLeases.clear();
    watched.clear(); counted.clear(); knownTabs.clear(); projections.clear(); badges.clear(); menus.clear(); loadingIds.clear();
    if (helper?.webContents) { instances.delete(helper.webContents.id); helper.webContents.close(); }
    if (extension) session.extensions.removeExtension(extension.id);
    if (scope === 'all') {
      ownedCss.clear();
      if (cssHelper?.webContents) { instances.delete(cssHelper.webContents.id); cssHelper.webContents.close(); }
      if (cssExtension) session.extensions.removeExtension(cssExtension.id);
      cssHelper = undefined; cssExtension = undefined;
    }
    helper = undefined; extension = undefined; background = undefined;
    cleaning = false;
  }
  async function eraseStorage() {
    if (initializePromise) await initializePromise.catch(() => {});
    if (phase === 'failed') await retry();
    if (phase !== 'ready') await initialize();
    await ask({ kind: 'erase-storage' });
  }
  function dispose() {
    disposed = true;
    cleanup();
    suspendedTools.clear();
    state('disposed');
  }
  async function retry() {
    if (disposed || initializePromise || cleanupScheduled) throw new Error('ubo-retry-unavailable');
    await removeOwnedCss();
    suspendTools();
    cleanup();
    await initialize();
    const tools = [...suspendedTools.values()]; suspendedTools.clear();
    await Promise.allSettled(tools.filter(item => !item.wc.isDestroyed() && item.wc.session === session)
      .map(item => item.wc.loadURL(item.url)));
  }
  if (!ipcInstalled) {
    ipcInstalled = true;
    ipcMain.on('ublock:bridge', (event, message) => {
      Promise.resolve().then(() => instances.get(event.sender.id)?.(event, message)).catch(() => {});
    });
  }
  return { id: 'ublock-origin', initialize, retry, decide, observe, status, setEnabled, setSite, siteState, getBlockedCount: tab => tab?.blockedCount || 0, eraseStorage, dispose, refresh, emit, registry, menus, badges, ownedCss,
    get extensionId() { return extension?.id; } };
}

module.exports = { createUblockProvider, DEADLINE_MS, MAX_PENDING };
