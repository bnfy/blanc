'use strict';

const path = require('node:path');
const { createDrmRuntime } = require('./drm-runtime');
const { startCandidateDrm, isWidevineComponentError } = require('./drm-startup');
const { openIsolatedLocalHtml } = require('./local-html-preview');
const { clearStartupPreloadEnvironment, cleanRelaunchEnvironment } = require('./drm-relaunch');

// Selected by immutable package metadata, never a renderer message or an
// environment variable. Ordinary Electron builds retain their existing policy.
function createDrmSupport({ app, session, BrowserWindow, components, metadata,
  platform = process.platform, env = process.env, processEvents = process, updater }) {
  const enabled = metadata?.blancRuntime === 'ecs';
  if (!enabled) return { enabled: false, inspect: async () => ({ state: 'unsupported', supported: false }) };
  if (!components?.WIDEVINE_CDM_ID || typeof components.whenReady !== 'function') {
    throw new Error('The ECS package requires its declared runtime');
  }
  if (platform === 'linux' && (!env.BLANC_ECS_LAUNCHER_ROOT
    || path.resolve(env.BLANC_ECS_FULL_PROFILE || '.') !== path.resolve(app.getPath('userData')))) {
    throw new Error('Linux ECS requires the packaged launcher and its native profile');
  }
  if (platform === 'linux') {
    // AppImage's replacement starts before AppRun can clean its environment.
    // Keep the current runtime's mount and loader paths out of the successor.
    const nativeUpdater = updater || require('electron-updater').autoUpdater;
    const spawn = nativeUpdater.spawnLog.bind(nativeUpdater);
    nativeUpdater.spawnLog = (command, args, childEnv, stdio) => {
      if (!path.isAbsolute(command)) throw new Error('ECS updater requires an absolute AppImage path');
      return spawn(command, args, cleanRelaunchEnvironment(childEnv), stdio);
    };
  }
  if (platform === 'darwin') app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
  const protectedSessions = new WeakSet();
  const protect = ses => {
    if (protectedSessions.has(ses)) return;
    protectedSessions.add(ses);
    // Only trusted internal handlers may bypass this explicitly. Untrusted
    // pages never receive file privileges, including nested file frames.
    ses.protocol.handle('file', () => new Response(null, { status: 403 }));
  };
  app.on('session-created', protect);
  app.on('web-contents-created', (_event, wc) => {
    const denyFile = (event, target) => {
      if (/^(?:file:|view-source:file:)/i.test(target || event.url || '')) event.preventDefault();
    };
    wc.on('will-navigate', denyFile);
    wc.on('will-frame-navigate', event => denyFile(event));
    wc.on('will-redirect', event => denyFile(event));
  });
  const cdmPrefix = path.join(app.getPath('userData'), 'WidevineCdm') + path.sep;
  const cdm = env.BLANC_ECS_CDM_PRELOAD_PATH || '';
  const preloaded = cdm.startsWith(cdmPrefix) ? cdm.slice(cdmPrefix.length).split(path.sep)[0] : null;
  const drm = createDrmRuntime({ app, components, platform,
    ...(platform === 'linux' ? { linuxPreloadedVersion: /^\d+(?:\.\d+){3}$/.test(preloaded || '') ? preloaded : null } : {}) });
  let state = { state: 'preparing', supported: true, playbackVerified: false };
  const onRejection = error => {
    if (isWidevineComponentError(error, components.WIDEVINE_CDM_ID)) {
      if (state.state !== 'ready') state = { state: 'installation-failed', supported: true, playbackVerified: false };
      return;
    }
    // Installing a listener must not swallow unrelated programming failures.
    processEvents.nextTick(() => { throw error; });
  };
  processEvents.on('unhandledRejection', onRejection);
  const ready = app.whenReady().then(() => {
    clearStartupPreloadEnvironment(env);
    protect(session.defaultSession);
    // A CDM download or offline error must never hold the browser UI hostage.
    void startCandidateDrm({ drm, update: value => { if (value.drm) state = value.drm; } });
  });
  app.once('will-quit', () => processEvents.removeListener('unhandledRejection', onRejection));
  return { enabled: true, ready, inspect: async () => ({ ...state, ...await drm.inspect() }),
    async openLocalFiles(paths) {
      await ready;
      for (const file of paths || []) await openIsolatedLocalHtml({ BrowserWindow, session, title: app.getName() }, file);
    },
  };
}
module.exports = { createDrmSupport };
