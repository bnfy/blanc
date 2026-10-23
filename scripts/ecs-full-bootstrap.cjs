'use strict';

// Copied only into an isolated full-browser staging tree by the candidate
// builder. The production entrypoint never imports this module.
const { app, BrowserWindow, Menu, dialog, session, webContents, shell, clipboard } = require('electron');
// Match production's first-operation Linux guard before accessing the ECS
// component binding, which can initialize native component/child services.
if (!require('./linux-sandbox-launch').enforceLinuxSandbox({ app, dialog, shell, clipboard })) return;
const fs = require('node:fs');
const path = require('node:path');
const { createDrmRuntime } = require('./drm-runtime');
const { openIsolatedLocalHtml } = require('./ecs-local-html.cjs');
const { applyCandidateGraphicsPolicy } = require('./ecs-graphics-policy.cjs');
const { startCandidateDrm, isWidevineComponentError } = require('./ecs-drm-startup.cjs');
const metadata = require('../../package.json');
const profile = process.env.BLANC_ECS_FULL_PROFILE;
if (process.env.BLANC_ECS_FULL_SMOKE === '1' && /^\d{4,5}$/.test(process.env.BLANC_ECS_TEST_DEBUG_PORT || '')) {
  const port = Number(process.env.BLANC_ECS_TEST_DEBUG_PORT);
  if (port < 1024 || port > 65535) throw Error('Invalid candidate test port');
  app.commandLine.appendSwitch('remote-debugging-port', String(port));
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}
if (!metadata.blancEcsFullCandidate || !profile || !path.isAbsolute(profile)
  || !fs.statSync(profile).isDirectory()
  || JSON.parse(fs.readFileSync(path.join(profile, 'ecs-candidate-profile.json'), 'utf8')).candidate !== true) {
  throw Error('Use the full ECS candidate launcher with an explicitly initialized isolated profile');
}
if (process.env.BLANC_ECS_FULL_SMOKE === '1') {
  // Owned-process cleanup/diagnosis even when a relaunch fails before ready.
  require('./ecs-runtime-state.cjs').writeRuntimeState(path.join(profile, 'ecs-launch-attempt.json'), {
    pid: process.pid, version: metadata.version,
    nativeProfileMatches: app.commandLine.getSwitchValue('user-data-dir') === profile,
  });
}
require('./ecs-profile-policy.cjs').requireNativeLinuxProfile({ profile,
  switchProfile: app.commandLine.getSwitchValue('user-data-dir'), nativeProfile: app.getPath('userData') });
const { components } = require('electron');
app.setName('Blanc ECS Candidate');
const graphics = applyCandidateGraphicsPolicy({ app, metadata });
app.setPath('userData', profile);
const chromiumProfile = process.platform === 'linux' && process.env.BLANC_ECS_SHARED_PROFILE_TRIAL === '1'
  ? profile : path.join(profile, 'chromium');
fs.mkdirSync(chromiumProfile, { recursive: true });
app.setPath('sessionData', chromiumProfile);
app.setAppLogsPath(path.join(profile, 'logs'));
// Defense in depth beyond the staged updater module and absent URL claims.
const updaterMode = require('./ecs-updater-policy.cjs').applyCandidateUpdaterPolicy({
  metadata, env: process.env, resolveUpdaterPolicy: require('./updater-policy').resolveUpdaterPolicy,
});
app.setAsDefaultProtocolClient = () => false;
const stateFile = path.join(profile, 'ecs-runtime.json');
if (process.platform === 'linux') {
  const updater = require('electron-updater').autoUpdater;
  const originalSpawn = updater.spawnLog.bind(updater);
  updater.spawnLog = function (command, args, env, stdio) {
    if (!path.isAbsolute(command) || !command.endsWith('.AppImage')) throw Error('Candidate updater requires an absolute AppImage path');
    const cleanEnv = require('./ecs-appimage-relaunch.cjs').cleanRelaunchEnvironment(env);
    if (process.env.BLANC_ECS_FULL_SMOKE !== '1') return originalSpawn(command, args, cleanEnv, stdio);
    // Same real updater path, with stderr captured only for synthetic tests.
    const fd = fs.openSync(path.join(profile, 'ecs-updater-child.log'), 'a', 0o600);
    fs.writeFileSync(path.join(profile, 'ecs-updater-launch.json'), JSON.stringify({
      args, appDirExists: fs.existsSync(env.APPDIR || ''),
      exitAfterInstall: env.APPIMAGE_EXIT_AFTER_INSTALL || null,
      silentInstall: env.APPIMAGE_SILENT_INSTALL || null,
      preloadExists: fs.existsSync(env.LD_PRELOAD || ''),
      cleanedImageEnvironment: !cleanEnv.APPDIR && !cleanEnv.APPIMAGE && !cleanEnv.LD_PRELOAD,
    }));
    try { return originalSpawn(command, args, cleanEnv, stdio || ['ignore', fd, fd]); }
    finally { fs.closeSync(fd); }
  };
}
const state = { candidate: true, pid: process.pid, version: metadata.version, electron: process.versions.electron, chrome: process.versions.chrome,
  profile, selfContainedLauncher: Boolean(process.env.BLANC_ECS_LAUNCHER_ROOT),
  preloadInsideCurrentImage: process.env.LD_PRELOAD === path.join(process.env.BLANC_ECS_LAUNCHER_ROOT || '', 'blanc-cdm-preload.so'),
  productionUpdater: false, updaterMode, defaultBrowserRegistration: false, drm: null, blockedFileRequests: 0, graphics };
const writeState = () => require('./ecs-runtime-state.cjs').writeRuntimeState(stateFile, state);
const protectedSessions = new WeakSet();
function protectSession(ses) {
  if (protectedSessions.has(ses)) return;
  protectedSessions.add(ses);
  // Only allowlisted internal protocol handlers may use the native file loader
  // via their explicit main-process bypass. Renderers never receive file://.
  ses.protocol.handle('file', () => { state.blockedFileRequests++; return new Response(null, { status: 403 }); });
}
app.on('session-created', protectSession);
app.on('web-contents-created', (_event, wc) => {
  wc.on('will-navigate', (event, url) => { if (/^(?:file:|view-source:file:)/i.test(url)) event.preventDefault(); });
  wc.on('will-frame-navigate', event => { if (/^(?:file:|view-source:file:)/i.test(event.url)) event.preventDefault(); });
  wc.on('will-redirect', event => { if (/^(?:file:|view-source:file:)/i.test(event.url)) event.preventDefault(); });
});
const cdmPrefix = path.join(profile, 'WidevineCdm') + path.sep;
const cdmPath = process.env.BLANC_ECS_CDM_PRELOAD_PATH || '';
const preloadedVersion = cdmPath.startsWith(cdmPrefix) ? cdmPath.slice(cdmPrefix.length).split(path.sep)[0] : null;
const drm = createDrmRuntime({ app, components,
  ...(process.platform === 'linux' && metadata.blancEcsPreloadRequired
    ? { linuxPreloadedVersion: /^\d+(?:\.\d+){3}$/.test(preloadedVersion || '') ? preloadedVersion : null } : {}),
});
const ready = app.whenReady().then(() => {
  protectSession(session.defaultSession);
  // Do not hold startup for a download, offline error, or missing component.
  // A failed first install can be retried on the next online launch.
  void startCandidateDrm({ drm, update: status => { Object.assign(state, status); writeState(); } });
});

async function openLocalFiles(paths) {
  await ready;
  for (const file of paths || []) {
    try { await openIsolatedLocalHtml({ BrowserWindow, session }, file); }
    catch (error) { dialog.showErrorBox('Isolated HTML preview could not open', error.message); }
  }
}
function decorateMenu(template) {
  return [...template, { label: 'ECS Candidate', submenu: [
    { label: 'Open isolated local HTML…', click: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm', 'xhtml', 'xht', 'xhtm'] }] });
      if (!result.canceled) await openLocalFiles(result.filePaths);
    } },
    { label: 'Show runtime status', click: () => dialog.showMessageBox({ type: 'info',
      message: 'Full Blanc ECS test candidate', detail: `Electron ${state.electron}\nChromium ${state.chrome}\nWidevine: ${state.drm?.state}\nIf protected media is unavailable, connect to the internet and restart this candidate. Ordinary browsing remains available.\nUpdater: ${updaterMode}; production feed and default-browser registration disabled.\nOptional uBO awaits ECS compatibility review.` }) },
  ] }];
}
module.exports = { ready, openLocalFiles, decorateMenu, browserReady: () => { state.browserReady = true; writeState(); } };
process.on('uncaughtException', error => {
  fs.appendFileSync(path.join(profile, 'ecs-errors.log'), `${error.stack}\n`, { mode: 0o600 }); app.exit(1);
});
process.on('unhandledRejection', error => {
  // ECS can reject a per-component native promise separately from the public
  // whenReady aggregate. Handle only its typed Widevine error, not arbitrary
  // application rejections or message-string matches.
  if (isWidevineComponentError(error, components?.WIDEVINE_CDM_ID)) {
    state.componentRejectionsHandled = (state.componentRejectionsHandled || 0) + 1;
    if (state.drm?.state !== 'ready') state.drm = { state: 'installation-failed', playbackVerified: false };
    writeState();
    return;
  }
  fs.appendFileSync(path.join(profile, 'ecs-errors.log'), `${error?.stack || error}\n`, { mode: 0o600 }); app.exit(1);
});
require('./main.js');
ready.then(() => {
  // A narrow, file-only status channel for the launcher. No credentials,
  // document content, arbitrary evaluation or renderer IPC is exposed.
  const timer = setInterval(() => {
    const quitRequest = path.join(profile, 'ecs-smoke-quit');
    if (process.env.BLANC_ECS_FULL_SMOKE === '1' && fs.existsSync(quitRequest)) {
      fs.unlinkSync(quitRequest); app.quit(); return;
    }
    state.windows = BrowserWindow.getAllWindows().length;
    state.contents = webContents.getAllWebContents().filter(wc => !wc.isDestroyed()).map(wc => {
      const prefs = wc.getLastWebPreferences();
      let scheme = ''; try { scheme = new URL(wc.getURL()).protocol; } catch {}
      return { id: wc.id, type: wc.getType(), scheme, audible: wc.isCurrentlyAudible(), muted: wc.isAudioMuted(),
        sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
    });
    writeState();
  }, 1000);
  timer.unref(); app.once('will-quit', () => clearInterval(timer));
  const componentTimer = setInterval(() => {
    void drm.inspect().then(component => {
      if (state.drm?.state === 'ready' && component.state === 'restart-required') {
        state.drm = { state: component.state, supported: component.supported, playbackVerified: false };
        state.component = component; writeState();
      }
    }).catch(() => {});
  }, 30000);
  componentTimer.unref(); app.once('will-quit', () => clearInterval(componentTimer));
  // Fixture access is explicit and candidate-only; ordinary HTML enters via
  // the native menu above or the existing OS open-file event.
  if (process.env.BLANC_ECS_LOCAL_HTML) openLocalFiles([process.env.BLANC_ECS_LOCAL_HTML]);
});
