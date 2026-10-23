'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { getCurrentFuseWire } = require('@electron/fuses');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const { candidatePaths } = require('./ecs-candidate-paths.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspectCdmProcess(mainPid, app) {
  if (process.platform === 'linux') return require('./ecs-linux-sandbox.cjs').inspectLinuxCdm(mainPid);
  // Never inspect process arguments: other processes can carry credentials.
  const children = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' }).trim().split('\n')
    .map(line => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean)
    .filter(match => Number(match[2]) === mainPid && match[3].startsWith(`${app}/Contents/Frameworks/`));
  const loaded = children.filter(match => {
    try { return execFileSync('lsof', ['-Fn', '-p', match[1]], { encoding: 'utf8' }).includes('/libwidevinecdm.dylib'); }
    catch { return false; }
  });
  assert.equal(loaded.length, 1, 'exactly one CDM process must hold the library');
  const pid = Number(loaded[0][1]);
  assert.equal(path.basename(loaded[0][3]), 'Blanc Helper (Plugin)', 'CDM must not load in the ordinary helper');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-cdm-sandbox-probe-'));
  try {
    const probe = path.join(dir, 'probe'), canary = path.join(dir, 'canary');
    execFileSync('xcrun', ['clang', '-O2', path.join(__dirname, 'mac-sandbox-probe.c'), '-o', probe]);
    await fs.writeFile(canary, 'test canary only');
    const sandbox = JSON.parse(execFileSync(probe, [String(pid), canary], { encoding: 'utf8' }));
    assert.equal(sandbox.sandboxed, 1, 'CDM process must remain OS sandboxed');
    assert.equal(sandbox.canaryRead, 1, 'CDM sandbox must deny unrelated local files');
    assert.equal(sandbox.processFork, 1, 'CDM sandbox must deny forking');
    // Some macOS versions reject process-exec introspection with -1. That is
    // unavailable evidence, never proof that the attempted execution is denied.
    if (sandbox.processExec !== -1) assert.equal(sandbox.processExec, 1);
    return { pid, executable: path.basename(loaded[0][3]), ...sandbox };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function run(appPath, output) {
  const app = await fs.realpath(appPath);
  if (process.platform === 'darwin') execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  const { full, executable, fuseExecutable, launchEnv } = candidatePaths(app);
  const wire = await getCurrentFuseWire(fuseExecutable || executable);
  assert.equal(wire[7], 49);
  const evidence = { app, wire, backend: 'Production', mediaErrors: [], players: {} };
  const earlySandbox = process.platform === 'linux' && process.env.BLANC_ECS_EARLY_SANDBOX_TRIAL === '1';
  const earlyArgs = earlySandbox ? ['--enable-sandbox'] : [];
  evidence.earlySandboxTrial = earlySandbox;
  try {
    await withDiagnosticProfile(async profile => {
      evidence.profile = profile;
      if (full) {
        await fs.writeFile(path.join(profile, 'ecs-candidate-profile.json'), JSON.stringify({ candidate: true }));
        await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, firstRunCompletedAt: Date.now(), usagePing: false, searchSuggestions: false }));
      }
      const { ELECTRON_RUN_AS_NODE: ignored, BLANC_ECS_LOCAL_HTML: ignoredFixture, ...env } = process.env;
      void ignored; void ignoredFixture;
      if (process.platform === 'linux') {
        const warm = spawn(executable, [...earlyArgs, `--user-data-dir=${profile}`], { env: { ...env, ...launchEnv, BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1' }, stdio: 'ignore' });
        const warmExit = new Promise(resolve => warm.once('exit', code => resolve(code)));
        try {
          evidence.initialInstall = await waitFor(async () => {
            if (warm.exitCode !== null) throw Error('Initial Linux component launch exited');
            const state = await fs.readFile(path.join(profile, 'ecs-runtime.json'), 'utf8').then(JSON.parse, () => null);
            return state?.component && state;
          }, 'initial Linux component installation');
        } finally {
          await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
          const code = await Promise.race([warmExit, delay(10000).then(() => null)]);
          if (code === null) { warm.kill('SIGKILL'); await warmExit; throw Error('Initial Linux launch did not quit'); }
          assert.equal(code, 0);
        }
        await fs.unlink(path.join(profile, 'ecs-runtime.json'));
      }
      const port = 55822;
      const child = spawn(executable, [...earlyArgs, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
        env: { ...env, ...launchEnv, BLANC_DRM_DIAGNOSTIC_PROFILE: profile, BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const exited = new Promise(resolve => child.once('exit', resolve));
      let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
      let page, chrome;
      try {
        if (full) {
          const target = await waitFor(async () => {
            if (child.exitCode !== null) throw Error(`Candidate exited: ${logs.slice(-1500)}`);
            try { return (await targets(port)).find(t => t.url === 'blanc-chrome://index/'); } catch { return null; }
          }, 'full browser chrome');
          chrome = await connect(target);
          await waitFor(() => chrome.evaluate(() => typeof window.browserAPI?.getAllTabs === 'function'), 'browser IPC bridge');
          await waitFor(async () => {
            try { return JSON.parse(await fs.readFile(path.join(profile, 'ecs-runtime.json'))).browserReady === true; }
            catch { return false; }
          }, 'full startup and restore completion');
          await waitFor(() => chrome.evaluate(async () => (await window.browserAPI.getAllTabs()).tabs.length > 0), 'initial browser tab');
          const startTarget = await waitFor(async () => (await targets(port)).find(t => t.url === 'blanc://newtab/'), 'start page');
          const start = await connect(startTarget);
          try {
            await waitFor(() => start.evaluate(async () => (await window.bowserPages?.start.data())?.startup?.phase === 'ready'), 'Blanc Blocker initialization');
          } finally { start.close(); }
          evidence.browserSmoke = await chrome.evaluate(async () => {
            const api = window.browserAPI;
            const initial = (await api.getAllTabs()).tabs.length;
            const regular = await api.createTab('blanc://newtab');
            const duplicate = await api.duplicateTab(regular);
            await api.toggleTabPinned(regular);
            const privateId = await api.createTab('blanc://newtab', { private: true });
            const snapshot = await api.getAllTabs();
            const result = { initial, created: !!regular, duplicateCreated: !!duplicate,
              pinned: snapshot.tabs.find(t => t.id === regular)?.pinned,
              privateCreated: snapshot.tabs.find(t => t.id === privateId)?.private };
            await api.closeTab(privateId);
            if (duplicate) await api.closeTab(duplicate);
            await api.switchTab(regular);
            return result;
          });
          assert.equal(evidence.browserSmoke.created, true);
          assert.equal(evidence.browserSmoke.duplicateCreated, true);
          assert.equal(evidence.browserSmoke.pinned, true);
          assert.equal(evidence.browserSmoke.privateCreated, true);
          await chrome.evaluate(() => window.browserAPI.createTab('https://example.com/'));
          const webTarget = await waitFor(async () => (await targets(port)).find(t => t.url === 'https://example.com/'), 'ordinary web navigation after startup');
          const web = await connect(webTarget);
          try { await waitFor(() => web.evaluate(() => document.readyState === 'complete' && document.title === 'Example Domain'), 'ordinary webpage'); }
          finally { web.close(); }
          evidence.browserSmoke.webNavigation = true;
          await chrome.evaluate(() => window.browserAPI.createTab('https://castlabs.github.io/wv-vmp-lab/'));
          await waitFor(async () => JSON.parse(await fs.readFile(path.join(profile, 'ecs-runtime.json'))).component, 'DRM preparation complete');
          const state = JSON.parse(await fs.readFile(path.join(profile, 'ecs-runtime.json')));
          evidence.runtime = state;
          assert.equal(state.productionUpdater, false);
          assert.equal(state.defaultBrowserRegistration, false);
        }
        const target = await waitFor(async () => {
          if (child.exitCode !== null) throw Error(`Candidate exited: ${logs.slice(-1000)}`);
          try { return (await targets(port)).find(t => t.url.startsWith('https://castlabs.github.io/')); } catch { return null; }
        }, 'VMP Lab');
        page = await connect(target, message => {
          if (message.method === 'Media.playerErrorsRaised') {
            for (const error of message.params.errors) evidence.mediaErrors.push({ code: error.code, type: error.errorType });
          }
          if (message.method === 'Media.playerPropertiesChanged') {
            const properties = evidence.players[message.params.playerId] ||= {};
            for (const property of message.params.properties) {
              if (/audio|video|decrypt|codec|key/i.test(property.name) && !/url|origin/i.test(property.name)) properties[property.name] = property.value;
            }
          }
        });
        console.log('VMP: connected');
        await page.send('Media.enable');
        await waitFor(() => page.evaluate(() => document.readyState === 'complete' && typeof document.querySelector('#loadContentBtn')?.onclick === 'function'), 'VMP Lab initialization');
        console.log('VMP: initialized');
        await page.evaluate(() => {
          const select = document.querySelector('#backendSelect');
          select.value = 'https://proxy.widevine.com/proxy';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Load Content');
          if (!button) throw Error('Load Content button missing');
          button.click();
        });
        console.log('VMP: load requested');
        await waitFor(async () => {
          const status = await page.evaluate(() => document.body.innerText);
          if (/DRM\.FAILED_TO_CREATE_CDM/.test(status)) throw Error('VMP Lab: DRM.FAILED_TO_CREATE_CDM');
          return /PLATFORM_[A-Z_]+/.test(status);
        }, 'production VMP result');
        evidence.statuses = await page.evaluate(() => [...new Set(document.body.innerText.match(/PLATFORM_[A-Z_]+/g) || [])]);
        console.log('VMP: license response', evidence.statuses);
        if (process.platform !== 'linux') assert.ok(evidence.statuses.includes('PLATFORM_SOFTWARE_VERIFIED'));
        assert.ok(!evidence.statuses.includes('PLATFORM_TAMPERED'));
        await page.send('Runtime.evaluate', { expression: 'document.querySelector("video").play()', awaitPromise: true, userGesture: true, returnByValue: true });
        const sample = () => page.evaluate(() => {
          const video = document.querySelector('video');
          return { time: video.currentTime, clockMs: performance.now(), playbackRate: video.playbackRate,
            paused: video.paused, ended: video.ended, seeking: video.seeking, muted: video.muted,
            error: video.error?.code ?? null, readyState: video.readyState };
        });
        evidence.first = await sample(); await delay(5000); evidence.second = await sample();
        assert.equal(evidence.second.error, null); assert.equal(evidence.second.paused, false);
        assert.ok(evidence.second.time - evidence.first.time > 2, 'protected playback must advance');
        evidence.elapsedSeconds = (evidence.second.clockMs - evidence.first.clockMs) / 1000;
        assert.ok(evidence.second.time - evidence.first.time <= evidence.elapsedSeconds * evidence.second.playbackRate + 2, 'playback advances without an unexplained seek');
        assert.equal(evidence.second.seeking, false);
        assert.equal(evidence.mediaErrors.length, 0);
        assert.ok(Object.values(evidence.players).some(player => /"encryption scheme":"(?:CENC|CBCS)"/.test(player.kVideoTracks || '')), 'video pipeline must report encrypted tracks');
        if (full) evidence.cdmProcess = await inspectCdmProcess(child.pid, app);
        const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
        await fs.mkdir(path.dirname(output), { recursive: true });
        await fs.writeFile(output.replace(/\.json$/, '.png'), Buffer.from(screenshot.data, 'base64'));
        if (full) await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
        else await page.send('Page.close').catch(() => {});
        await Promise.race([exited, delay(10000).then(() => { throw Error('Candidate did not quit'); })]);
      } finally {
        evidence.processLogs = logs.slice(-8000);
        if (child.exitCode === null && full) {
          await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
          await Promise.race([exited, delay(3000)]);
        }
        if (child.exitCode === null && page) await page.send('Page.close').catch(() => {});
        if (chrome) chrome.close();
        if (page) page.close();
        if (child.exitCode === null) {
          child.kill('SIGTERM');
          await Promise.race([exited, delay(3000)]);
          if (child.exitCode === null) child.kill('SIGKILL');
        }
        await exited;
      }
    });
    evidence.profileRemoved = await fs.stat(evidence.profile).then(() => false, () => true);
    assert.equal(evidence.profileRemoved, true); evidence.passed = true;
  } catch (error) { evidence.error = error.stack; evidence.sandboxFailure = error.sandboxEvidence; throw error; }
  finally {
    if (evidence.profile) evidence.profileRemoved = await fs.stat(evidence.profile).then(() => false, () => true);
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify(evidence, null, 2));
}
if (require.main === module) run(process.argv[2], path.resolve(process.argv[3] || 'output/playwright/ecs-local-html/drm.json')).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run };
