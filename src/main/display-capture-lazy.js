'use strict';

// Defers the display-capture helper until a page first asks to share a screen.
//
// The helper is a hidden BrowserWindow with its own session and renderer
// process. Creating it at every launch cost that whole renderer (18 MB on
// macOS) for a feature most sessions never use. This installs a stand-in
// `display-capture:request` handler instead. The first request creates the
// helper, waits for its page to report ready, installs the platform broker,
// and hands the request (and any that arrived meanwhile) to the broker's own
// handler. From then on the broker handles everything directly.
//
// The broker, helper page and helper preload are pinned in
// capture-runtime-lock.json and are not changed: the broker receives a live,
// loaded helper exactly as before, only later.

const REQUEST_CHANNEL = 'display-capture:request';
const READY_CHANNEL = 'display-capture-helper:ready';
const HELPER_READY_TIMEOUT_MS = 10_000;

/**
 * An ipcMain that forwards everything to the real one but remembers `handle`
 * registrations, so a request that reached the stand-in can be passed to the
 * broker's handler.
 */
function recordingIpc(ipcMain) {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn);
      return ipcMain.handle(channel, fn);
    },
    on: (...args) => ipcMain.on(...args),
    once: (...args) => ipcMain.once(...args),
    removeListener: (...args) => ipcMain.removeListener(...args),
    removeHandler: (...args) => ipcMain.removeHandler(...args),
    emit: (...args) => ipcMain.emit(...args),
  };
}

/**
 * @param {object} options
 * @param {Electron.IpcMain} options.ipcMain
 * @param {() => {window: Electron.BrowserWindow, webContents: Electron.WebContents, session: Electron.Session}} options.createHelper
 *   creates the helper session and window and starts loading its page
 * @param {(deps: {ipcMain: object, helperWc: Electron.WebContents, helperSession: Electron.Session}) => object} options.installBroker
 * @param {(event: Electron.IpcMainEvent, helperWc: Electron.WebContents) => boolean} options.isHelperSender
 */
function createLazyDisplayCaptureBroker({
  ipcMain,
  createHelper,
  installBroker,
  isHelperSender,
  readyTimeoutMs = HELPER_READY_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  warn = (message) => console.warn(message),
}) {
  let broker = null;
  let requestHandler = null;
  let starting = null;

  const waitForReady = (helperWc) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      ipcMain.removeListener(READY_CHANNEL, onReady);
      helperWc.removeListener('did-fail-load', onFailLoad);
      helperWc.removeListener('render-process-gone', onGone);
      helperWc.removeListener('destroyed', onGone);
      if (error) reject(error);
      else resolve();
    };
    const onReady = (event) => {
      if (isHelperSender(event, helperWc)) finish();
    };
    const onFailLoad = (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame !== false) finish(new Error(`helper page failed to load (${errorCode})`));
    };
    const onGone = () => finish(new Error('helper went away before it was ready'));
    const timer = setTimer(() => finish(new Error('helper was not ready in time')), readyTimeoutMs);
    ipcMain.on(READY_CHANNEL, onReady);
    helperWc.on('did-fail-load', onFailLoad);
    helperWc.on('render-process-gone', onGone);
    helperWc.on('destroyed', onGone);
  });

  const start = async () => {
    const helper = createHelper();
    try {
      await waitForReady(helper.webContents);
    } catch (error) {
      try {
        if (!helper.window.isDestroyed()) helper.window.destroy();
      } catch {
        // Already gone.
      }
      throw error;
    }
    ipcMain.removeHandler(REQUEST_CHANNEL);
    const recorder = recordingIpc(ipcMain);
    broker = installBroker({
      ipcMain: recorder,
      helperWc: helper.webContents,
      helperSession: helper.session,
    });
    requestHandler = recorder.handlers.get(REQUEST_CHANNEL);
    if (typeof requestHandler !== 'function') {
      throw new Error(`broker did not handle ${REQUEST_CHANNEL}`);
    }
    return broker;
  };

  const ensure = () => {
    if (broker) return Promise.resolve(broker);
    if (!starting) {
      starting = start().catch((error) => {
        starting = null;
        throw error;
      });
    }
    return starting;
  };

  ipcMain.handle(REQUEST_CHANNEL, async (event, payload) => {
    try {
      await ensure();
    } catch (error) {
      warn(`[display-capture] helper unavailable: ${error?.message || error}`);
      return { ok: false, errorName: 'AbortError', reason: 'helper-unavailable' };
    }
    return requestHandler(event, payload);
  });

  return {
    /** The installed broker, or null until the first request has set it up. */
    get broker() {
      return broker;
    },
    /** Create the helper and broker now, as the first request would. */
    prepare: ensure,
  };
}

module.exports = {
  HELPER_READY_TIMEOUT_MS,
  READY_CHANNEL,
  REQUEST_CHANNEL,
  createLazyDisplayCaptureBroker,
  recordingIpc,
};
