'use strict';

const { app, WebContentsView, ipcMain, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { isBrowserResource } = require('./blocking-resources');
const { installVerifiedPackageAsync, installVerifiedFilesAsync, readHostSourcesAsync } = require('./ublock-package');
const { createUblockRegistry } = require('./ublock-registry');
const { validBridgeSender } = require('./ublock-host-policy');
const { ublockTool } = require('./ublock-tool-url');
const { captureDocuments, currentDocuments, guardScript } = require('./ublock-documents');
const recoveryPolicy = require('./ublock-recovery');

const DEADLINE_MS = 2000;
const OPERATION_DEADLINE_MS = 10000;
// Right after ready, a cold background (new profile, slow machine) can need
// more than two seconds for its first network decisions; the held first
// navigation then failed closed and was never replayed. For a short window
// after each ready, decisions get longer to answer. Requests stay held while
// they wait and a missed decision still fails closed.
const WARMUP_DEADLINE_MS = 10000;
const WARMUP_WINDOW_MS = 15000;
// A profile's first start compiles every bundled filter list before uBO
// reports ready, and that takes 6–10 s on hosted Intel Macs and sometimes
// more than 15 s. Navigation stays held until then, and a startup that misses
// this deadline still fails closed; it only stops a slow machine from being
// treated as a broken one.
const STARTUP_DEADLINE_MS = 45000;
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

function createUblockProvider({ session, profileId, hooks, onStateChange = () => {}, onBlocked = () => {}, recovery: recoveryOptions = {} }) {
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
  let warmUntil = 0;
  let error = null;
  let readyResolve;
  let readyReject;
  let readyPromise;
  let disposed = false;
  // Cancels a running initialization (disposal, or a recovery episode giving
  // up): every async step races `cancelled`, then checks the generation.
  let generation = 0;
  let cancelRun = null;
  const CANCELLED = 'ubo-initialization-cancelled';
  function cancelInitialization() {
    generation++;
    cancelRun?.(); cancelRun = null;
    readyReject?.(new Error(CANCELLED));
  }
  // Automatic recovery (docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md).
  const budget = recoveryOptions.budget ?? recoveryPolicy.createRecoveryBudget();
  const RECOVERY_DEADLINE = recoveryOptions.deadlineMs ?? recoveryPolicy.RECOVERY_DEADLINE_MS;
  let everReady = false;
  let recovering = false;
  let episode = null; // { code, attempt, firstDelay, scheduled, deadlineAt, deadline, retryTimer }
  let lastRecovery = null;
  const decisionGrace = { granted: 0, saved: 0 };
  let stallNextDecisionMs = 0;    // test-only, see stallAfterNextDecisionForTest()
  let graceDisabledNext = false;  // test-only negative control, same hook
  const holdQueue = [];      // FIFO of { resolve, timer }
  let inTransit = 0;         // released from the queue, not yet in `pending`
  let drainOutstanding = 0;  // released and not yet settled
  // Reloading pages the outage cancelled, bound to the exact request (spec §3).
  const OUTAGE_CLAIM = recoveryOptions.outageClaimMs ?? recoveryPolicy.OUTAGE_CLAIM_MS;
  const latestMainFrame = new Map(); // webContentsId → id of its current http(s) main-frame request
  const outageRecords = new Map();   // request id → { webContentsId, url, at }
  const outageTokens = new Map();    // token → { webContentsId, url, committed, recovered }
  let focusedWindowId = -1;
  // Startup stage durations in milliseconds. A failed startup keeps the stage
  // it stopped in, so diagnostics show which step stalled or failed.
  let stage = null;
  let stageStarted = 0;
  let timings = {};
  const status = () => ({ id: 'ublock-origin', version: '1.75.0', phase: recovering ? 'recovering' : phase, error, stage,
    timings: { ...timings }, decisionGrace: { ...decisionGrace }, ...(lastRecovery ? { recovery: { ...lastRecovery } } : {}) });
  function endStage() { if (stage) timings[stage] = Math.round((performance.now() - stageStarted) * 10) / 10; }
  function beginStage(name) { endStage(); stage = name; stageStarted = performance.now(); }
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
    endStage();
    if (!recovering && everReady && recoveryPolicy.RECOVERABLE.has(code)) beginEpisode(code);
    state('failed', code);
    readyReject?.(new Error(code));
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(code)); }
    pending.clear();
    if (!recovering) releaseHeld();
    suspendTools();
    // Keep the failed provider in the coordinator so traffic stays closed.
    if (!cleanupScheduled) {
      cleanupScheduled = true;
      setImmediate(() => {
        cleanupScheduled = false; cleanup('background');
        if (episode && !episode.scheduled) { episode.scheduled = true; scheduleAttempt(episode, episode.firstDelay); }
      });
    }
  }
  function noteRecovery(kind, attempt, reason) {
    lastRecovery = { kind, attempt, ...(reason ? { reason } : {}) };
    onStateChange(status());
  }
  function beginEpisode(code) {
    const ticket = budget.take();
    if (!ticket.allowed) { lastRecovery = { kind: 'exhausted', attempt: 0, reason: 'budget' }; return; }
    recovering = true;
    const current = { code, attempt: ticket.attempt, firstDelay: ticket.delayMs, scheduled: false,
      deadlineAt: Date.now() + RECOVERY_DEADLINE, retryTimer: null };
    current.deadline = setTimeout(() => endEpisode(current, 'deadline'), RECOVERY_DEADLINE);
    episode = current;
    lastRecovery = { kind: 'restarting', attempt: ticket.attempt };
  }
  function scheduleAttempt(current, delayMs) {
    clearTimeout(current.retryTimer);
    current.retryTimer = setTimeout(() => {
      if (episode !== current || disposed) return;
      restartNetwork().then(restoreTools, caught => attemptFailed(current, caught));
    }, delayMs);
  }
  function attemptFailed(current, caught) {
    if (episode !== current) return;
    const code = error || caught?.message;
    if (!recoveryPolicy.ATTEMPT_RECOVERABLE.has(code)) return endEpisode(current, 'ineligible');
    const ticket = budget.take();
    if (!ticket.allowed) return endEpisode(current, 'budget');
    if (Date.now() + ticket.delayMs >= current.deadlineAt) return endEpisode(current, 'deadline');
    current.attempt = ticket.attempt;
    noteRecovery('restarting', ticket.attempt);
    // The attempt's own fail() queued background cleanup first.
    setImmediate(() => scheduleAttempt(current, ticket.delayMs));
  }
  function endEpisode(current, reason) {
    if (episode !== current) return;
    episode = null; recovering = false;
    clearTimeout(current.deadline); clearTimeout(current.retryTimer);
    cancelInitialization();
    releaseHeld();
    lastRecovery = { kind: 'exhausted', attempt: current.attempt, reason };
    state('failed', current.code);
  }
  function finishEpisode() {
    const current = episode;
    episode = null; recovering = false;
    clearTimeout(current.deadline); clearTimeout(current.retryTimer);
    lastRecovery = { kind: 'recovered', attempt: current.attempt };
  }
  const drainActive = () => holdQueue.length > 0 || drainOutstanding > 0;
  // Resolves true when the request may ask uBO, false when it must be cancelled.
  function holdForRecovery() {
    if (holdQueue.length >= recoveryPolicy.HOLD_CAPACITY) return Promise.resolve(false);
    return new Promise(resolve => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        const index = holdQueue.indexOf(entry);
        if (index !== -1) holdQueue.splice(index, 1);
        resolve(false);
      }, RECOVERY_DEADLINE);
      holdQueue.push(entry);
      pump();
    });
  }
  // Release held requests while decision slots remain, leaving room for other
  // operations; every settled decision calls this again.
  function pump() {
    while (phase === 'ready' && !recovering && holdQueue.length
      && pending.size + inTransit < MAX_PENDING - recoveryPolicy.DRAIN_RESERVE) {
      const entry = holdQueue.shift();
      clearTimeout(entry.timer);
      inTransit++; drainOutstanding++;
      entry.resolve(true);
    }
  }
  function releaseHeld() {
    for (const entry of holdQueue.splice(0)) { clearTimeout(entry.timer); entry.resolve(false); }
  }
  const httpMainFrame = details => details.resourceType === 'mainFrame'
    && Number.isInteger(details.webContentsId) && /^https?:/i.test(details.url || '');
  function trackMainFrame(details) {
    if (!httpMainFrame(details) || latestMainFrame.get(details.webContentsId) === details.id) return;
    latestMainFrame.delete(details.webContentsId);
    latestMainFrame.set(details.webContentsId, details.id);
    if (latestMainFrame.size > 512) latestMainFrame.delete(latestMainFrame.keys().next().value);
    for (const [id, record] of outageRecords) if (record.webContentsId === details.webContentsId && id !== details.id) outageRecords.delete(id);
  }
  // Only a main-frame GET the outage itself cancelled; never uBO's own blocks.
  function noteOutage(details) {
    if (!httpMainFrame(details) || details.method !== 'GET') return;
    const now = Date.now();
    for (const [id, record] of outageRecords) if (now - record.at >= OUTAGE_CLAIM) outageRecords.delete(id);
    outageRecords.set(details.id, { webContentsId: details.webContentsId, url: details.url, at: now });
  }
  function claimOutage(webContentsId, url) {
    const latest = latestMainFrame.get(webContentsId);
    let found = null;
    for (const [id, record] of outageRecords) {
      if (record.webContentsId !== webContentsId) continue;
      outageRecords.delete(id); // consumed either way
      if (id === latest && record.url === url && Date.now() - record.at < OUTAGE_CLAIM) found = record;
    }
    if (!found || outageTokens.size >= recoveryPolicy.MAX_OUTAGE_TOKENS) return null;
    const token = randomBytes(16).toString('hex');
    outageTokens.set(token, { webContentsId, url, committed: false, recovered: phase === 'ready' && !recovering });
    return token;
  }
  function maybeReload(token, entry) {
    if (!entry.committed || !entry.recovered) return;
    outageTokens.delete(token);
    hooks.reloadAfterOutage?.({ webContentsId: entry.webContentsId, token, url: entry.url });
  }
  function noteMainFrameCommitted(webContentsId, url) {
    for (const [token, entry] of outageTokens) {
      if (entry.webContentsId !== webContentsId) continue;
      if (recoveryPolicy.outageReloadTarget(url, token) === entry.url) { entry.committed = true; maybeReload(token, entry); }
      else outageTokens.delete(token); // the tab left that error page
    }
  }
  function markOutageRecovered() {
    for (const [token, entry] of outageTokens) { entry.recovered = true; maybeReload(token, entry); }
  }
  function suspendTools() {
    if (!extension) return;
    const desc = recovering ? 'uBlock%20Origin%20is%20restarting' : 'uBlock%20Origin%20needs%20retry';
    const prefix = `chrome-extension://${extension.id}/`;
    hooks.closePopup?.(profileId);
    for (const entry of registry.mapping()) {
      const wc = registry.ownedContents(entry.tabId)?.wc;
      if (!wc || hooks.isHeld?.(wc) || !wc.getURL().startsWith(prefix)) continue;
      suspendedTools.set(wc.id, { wc, url: wc.getURL() });
      wc.loadURL(`blanc://error?code=-20&desc=${desc}`).catch(() => {});
    }
  }
  function decisionDeadline() {
    return Date.now() < warmUntil ? WARMUP_DEADLINE_MS : DEADLINE_MS;
  }
  function ask(message) {
    if (phase !== 'ready') return Promise.reject(new Error(error || 'ubo-not-ready'));
    // Reject excess work without invalidating already pending decisions. The
    // coordinator cancels this request; existing decisions retain their deadline.
    if (pending.size >= MAX_PENDING) return Promise.reject(new Error('ubo-request-capacity'));
    const id = ++sequence;
    const critical = message.kind === 'request' && ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived'].includes(message.name);
    const item = { timer: null, critical, transport: 'background', graced: 0,
      maxGrace: critical && !graceDisabledNext ? recoveryPolicy.MAX_GRACE_COUNT : 0 };
    if (critical) graceDisabledNext = false;
    const promise = new Promise((resolve, reject) => {
      item.resolve = resolve; item.reject = reject;
      const arm = delay => {
        const due = performance.now() + delay;
        item.timer = setTimeout(() => {
          if (!critical) { pending.delete(id); reject(new Error('ubo-operation-timeout')); return; }
          // Late means main was frozen when this was due: answers queued
          // behind the freeze get a bounded grace before failing closed.
          if (performance.now() - due >= recoveryPolicy.LATE_TIMER_MS && item.graced < item.maxGrace) {
            item.graced++; decisionGrace.granted++;
            arm(item.graced === 1 ? recoveryPolicy.FIRST_GRACE_MS : recoveryPolicy.GRACE_MS);
            return;
          }
          fail('ubo-decision-timeout');
        }, delay);
      };
      arm(critical ? decisionDeadline() : OPERATION_DEADLINE_MS);
      pending.set(id, item);
      try { send({ ...message, id }); } catch { fail('ubo-background-unavailable'); }
      if (critical && stallNextDecisionMs) {
        const end = Date.now() + stallNextDecisionMs; stallNextDecisionMs = 0;
        while (Date.now() < end) { /* test-only main-process freeze */ }
      }
    });
    // decideNow() counts a saved decision only once the reply validates.
    promise.graced = () => item.graced;
    // A settled decision frees a slot for held requests.
    promise.then(pump, pump);
    return promise;
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
      on('dom-ready', () => { if (valid()) emit('webNavigation.onDOMContentLoaded', { tabId: entry.tabId, ...registry.frameData(wc.mainFrame), timeStamp: Date.now() }); });
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
      const timer = setTimeout(() => fail('ubo-css-timeout'), OPERATION_DEADLINE_MS);
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
      // Selecting a discarded tool wakes its renderer through the browser hook.
      // A quiet tab remains owned even while it has no live WebContents.
      const tab = registry.tabFor(id);
      const wc = tab && hooks.liveContents(tab);
      if (!tab || (wc && hooks.isHeld?.(wc))) throw new Error('ubo-tab-unavailable');
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
    case 'windows.create': {
      // Upstream defaults to a detached Logger. Blanc hosts original tools as
      // profile-owned tabs, including that popup route, without extra windows.
      const url = id?.url ? validateUrl(id.url) : null;
      if (ublockTool(url, extension.id)) {
        const tab = await hooks.openTool(profileId, url);
        if (!tab || registry.idForTab(tab) === undefined) throw new Error('ubo-tool-unavailable');
        const projected = registry.project(tab);
        return { id: projected.windowId, tabs: [projected] };
      }
      const runtime = await hooks.createWindow(profileId);
      if (url) await hooks.createTab(runtime, url, { active: true });
      return { id: runtime.window.id };
    }
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
      everReady = true;
      // Recovery ends when filtering works again, not when retry() returns.
      if (recovering) finishEpisode();
      warmUntil = Date.now() + WARMUP_WINDOW_MS;
      send({ kind: 'enabled', value: enabled });
      state('ready'); refresh(); readyResolve?.(status()); pump(); markOutageRecovered(); return;
    }
    if (message.kind === 'disconnected') return fail('ubo-background-disconnected');
    if (message.kind === 'host-failed') return fail('ubo-host-capacity');
    if (message.kind === 'storage-failed') return fail('ubo-storage-failed');
    if (message.kind === 'decision') {
      const item = pending.get(message.id);
      if (!item || item.transport !== 'background') return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) { item.reject(new Error('ubo-decision-failed')); if (item.critical) fail('ubo-decision-failed'); } else item.resolve(message.value);
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
    const run = ++generation;
    const cancelled = new Promise((_, reject) => { cancelRun = () => reject(new Error(CANCELLED)); });
    cancelled.catch(() => {});
    const stale = () => run !== generation || disposed;
    const step = async value => {
      const result = await Promise.race([value, cancelled]);
      if (stale()) throw new Error(CANCELLED);
      return result;
    };
    timings = {}; stage = null;
    state('initializing');
    readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // Handle the promise immediately; extraction/load failure can precede await.
    readyPromise.catch(() => {});
    try {
      beginStage('cssHostLoad');
      fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
      const managedRoot = path.join(fs.realpathSync(app.getPath('userData')), 'managed-ublock', profileId);
      const cssPath = path.join(managedRoot, 'css-host');
      const cssFiles = {
        'manifest.json': JSON.stringify({ name: 'Blanc uBlock Origin CSS host', version: '1.0.0', manifest_version: 3, permissions: ['scripting'], host_permissions: ['http://*/*', 'https://*/*'] }),
        'bridge.html': '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="bridge.js"></script></body></html>',
        'bridge.js': await step(fs.promises.readFile(path.join(__dirname, 'ublock-css-mainworld.js'))),
      };
      await step(installVerifiedFilesAsync(new Map(Object.entries(cssFiles).map(([name, bytes]) => [name, Buffer.from(bytes)])), cssPath));
      async function loadManaged(directory, options) {
        const onLoaded = (_event, loaded) => { if (loaded.path === directory) loadingIds.add(loaded.id); };
        session.extensions.on('extension-loaded', onLoaded);
        try {
          const loading = session.extensions.loadExtension(directory, options);
          // A load that completes after cancellation is unloaded when it lands.
          Promise.resolve(loading).then(late => { if (stale()) { try { session.extensions.removeExtension(late.id); } catch {} } }, () => {});
          const loaded = await step(loading);
          loadingIds.add(loaded.id);
          return loaded;
        } finally { session.extensions.removeListener('extension-loaded', onLoaded); }
      }
      cssExtension = await loadManaged(cssPath);
      cssHelper = new WebContentsView({ webPreferences: {
        session, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
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
      await step(cssHelper.webContents.loadURL(`chrome-extension://${cssExtension.id}/bridge.html`));
      beginStage('cssHostReady');
      let cssTimer;
      try { await step(Promise.race([cssReady, new Promise((_, reject) => { cssTimer = setTimeout(() => reject(new Error('ubo-css-startup-timeout')), DEADLINE_MS); })])); }
      finally { clearTimeout(cssTimer); }
      // Awaited per file: the main process keeps serving pages meanwhile.
      // Web traffic stays held until uBO reports ready.
      beginStage('install');
      const installed = await step(installVerifiedPackageAsync({
        root: path.join(app.getAppPath(), 'ublock'),
        destination: path.join(managedRoot, 'extension'),
        hostSources: await step(readHostSourcesAsync(app.getAppPath())),
      }));
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
        // This verified extension background drives filter updates and bounded
        // host replies. It has no browser window or ordinary webpage views.
        wc.setBackgroundThrottling(false);
        wc.once('dom-ready', () => { backgroundDomReady = true; resolveBackground(); });
        wc.once('render-process-gone', () => { if (!cleaning && background === wc) fail('ubo-background-crashed'); });
        wc.once('destroyed', () => { if (!cleaning && background === wc) fail('ubo-background-lost'); });
      };
      app.on('web-contents-created', created);
      let backgroundTimer;
      try {
        beginStage('loadExtension');
        extension = await loadManaged(installed.path, { allowFileAccess: false });
        beginStage('background');
        resolveBackground();
        await step(Promise.race([backgroundReady, new Promise((_, reject) => {
          backgroundTimer = setTimeout(() => reject(new Error('ubo-background-startup-timeout')), STARTUP_DEADLINE_MS);
        })]));
      } finally { app.removeListener('web-contents-created', created); clearTimeout(backgroundTimer); }

      beginStage('bridge');
      helper = new WebContentsView({ webPreferences: {
        session, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
        preload: path.join(__dirname, 'ublock-bridge-preload.js'),
      } });
      instances.set(helper.webContents.id, receive);
      helper.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      helper.webContents.on('will-navigate', event => event.preventDefault());
      helper.webContents.on('render-process-gone', () => fail('ubo-bridge-crashed'));
      await step(helper.webContents.loadURL(`chrome-extension://${extension.id}/blanc-bridge.html`));
      beginStage('ready');
      const timer = setTimeout(() => fail('ubo-startup-timeout'), STARTUP_DEADLINE_MS);
      try { await step(readyPromise); } finally { clearTimeout(timer); }
      beginStage(null);
      cancelRun = null;
      return status();
    } catch (caught) {
      if (caught?.message === CANCELLED || stale()) {
        // Close whatever this run created; nothing outlives the cancellation.
        cleanup();
        cancelRun = null;
        throw new Error(CANCELLED);
      }
      fail(error || 'ubo-initialization-failed'); throw new Error(error);
    }
  }
  async function decide(name, details) {
    trackMainFrame(details);
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
    if (phase !== 'ready' && !recovering) return { cancel: true };
    // During recovery, and until its drain has settled, requests wait in one
    // FIFO queue instead of failing; they never go out undecided.
    if (phase !== 'ready' || drainActive()) {
      if (!(await holdForRecovery())) { noteOutage(details); return { cancel: true }; }
      inTransit--;
      if (phase !== 'ready') { drainOutstanding--; pump(); noteOutage(details); return { cancel: true }; }
      return decideNow(name, details, true);
    }
    return decideNow(name, details, false);
  }
  async function decideNow(name, details, drained) {
    const converted = registry.request(details);
    let result;
    const asked = ask({ kind: 'request', name, details: converted });
    try {
      // The extension's own filter-data fetches use its native background.
      result = await asked;
    } catch (caught) {
      if (caught?.message !== 'ubo-request-capacity') noteOutage(details);
      throw caught;
    } finally {
      if (drained) { drainOutstanding--; pump(); }
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some(key => !['cancel', 'redirectUrl', 'requestHeaders', 'responseHeaders'].includes(key))
      || (result.cancel !== undefined && typeof result.cancel !== 'boolean')) { fail('ubo-response-invalid'); return { cancel: true }; }
    if ((result.cancel === true || result.redirectUrl !== undefined) && !counted.has(details.id)) {
      counted.add(details.id);
      if (converted.tabId !== -1) onBlocked(registry.tabFor(converted.tabId));
    }
    // A decision saved by grace counts only once it is usable.
    const usable = () => { if (asked.graced()) decisionGrace.saved++; };
    if (result.cancel === true) {
      usable();
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
    usable();
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
    if (episode) { clearTimeout(episode.deadline); clearTimeout(episode.retryTimer); episode = null; }
    recovering = false;
    releaseHeld();
    latestMainFrame.clear(); outageRecords.clear(); outageTokens.clear();
    cancelInitialization();
    cleanup();
    suspendedTools.clear();
    state('disposed');
  }
  async function restartNetwork() {
    if (disposed || initializePromise || cleanupScheduled) throw new Error('ubo-retry-unavailable');
    await removeOwnedCss();
    suspendTools();
    cleanup();
    await initialize();
  }
  // Best effort once filtering works again; recovery never waits for it.
  function restoreTools() {
    const run = generation;
    const tools = [...suspendedTools.values()]; suspendedTools.clear();
    for (const item of tools) {
      if (item.wc.isDestroyed() || item.wc.session !== session) continue;
      Promise.resolve().then(() => {
        if (run === generation && !disposed && phase === 'ready') return item.wc.loadURL(item.url);
      }).catch(() => {});
    }
  }
  async function retry() {
    await restartNetwork();
    restoreTools();
  }
  // Freeze main right after the next critical decision is sent; with
  // { grace: false } that one decision gets no grace (the negative control).
  function stallAfterNextDecisionForTest(ms, { grace = true } = {}) {
    if (app.isPackaged || process.env.BLANC_TEST !== '1') throw new Error('test-only');
    stallNextDecisionMs = Math.min(Math.max(Number(ms) || 0, 0), 10000);
    graceDisabledNext = !grace;
  }
  function exhaustRecoveryForTest() {
    if (app.isPackaged || process.env.BLANC_TEST !== '1') throw new Error('test-only');
    budget.exhaust();
  }
  if (!ipcInstalled) {
    ipcInstalled = true;
    ipcMain.on('ublock:bridge', (event, message) => {
      Promise.resolve().then(() => instances.get(event.sender.id)?.(event, message)).catch(() => {});
    });
  }
  return { id: 'ublock-origin', initialize, retry, exhaustRecoveryForTest, stallAfterNextDecisionForTest, claimOutage, noteMainFrameCommitted, decide, observe, status, setEnabled, setSite, siteState, getBlockedCount: tab => tab?.blockedCount || 0, eraseStorage, dispose, refresh, emit, registry, menus, badges, ownedCss,
    get extensionId() { return extension?.id; },
    // Read-only, for the acceptance harness.
    decisionDeadlineMs: decisionDeadline };
}

module.exports = { createUblockProvider, DEADLINE_MS, MAX_PENDING };
