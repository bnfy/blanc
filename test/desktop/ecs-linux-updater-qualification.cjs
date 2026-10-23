'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const { updatedPlayback } = require('./ecs-updated-playback.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
function promptWindow() {
  const ids = execFileSync('xdotool', ['search', '--onlyvisible', '--name', '.*'], { encoding: 'utf8' }).trim().split(/\s+/);
  for (const id of ids) {
    if (!/^\d+$/.test(id)) continue;
    const geo = execFileSync('xdotool', ['getwindowgeometry', '--shell', id], { encoding: 'utf8' });
    const width = Number(geo.match(/^WIDTH=(\d+)/m)?.[1]), height = Number(geo.match(/^HEIGHT=(\d+)/m)?.[1]);
    if (width >= 200 && width <= 1000 && height >= 50 && height <= 400) return id;
  }
  return null;
}
async function main() {
  assert.equal(process.platform, 'linux');
  const files = [process.argv[2], process.argv[3], process.argv[5]].filter(Boolean);
  const builds = await Promise.all(files.map(async file => JSON.parse(await fs.readFile(file, 'utf8'))));
  for (const info of builds) assert.ok(info.nativeValidation && info.nativeSecurityPatch && !info.productionUpdater);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-update-'));
  const profile = path.join(root, 'config/Blanc-ECS-Candidate');
  const report = { from: builds[0].candidateVersion, versions: builds.map(b => b.candidateVersion), publicFeed: false, requests: [], handoffs: [], profile };
  const assets = await Promise.all(builds.map(async b => {
    const name = `Blanc-${b.candidateVersion}.AppImage`, file = path.join(b.dist, name);
    const bytes = await fs.readFile(file);
    return { name, file, version: b.candidateVersion, size: bytes.length, sha512: crypto.createHash('sha512').update(bytes).digest('base64') };
  }));
  let offered = assets[0];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const asset = assets.find(a => pathname === `/${a.name}`);
    const known = pathname === '/staging-linux.yml' || !!asset;
    const entry = { path: known ? pathname : 'unexpected', method: req.method }; report.requests.push(entry);
    res.on('finish', () => { entry.complete = true; });
    if (pathname === '/staging-linux.yml') return res.end(`version: ${offered.version}\nfiles:\n  - url: ${offered.name}\n    sha512: ${offered.sha512}\n    size: ${offered.size}\npath: ${offered.name}\nsha512: ${offered.sha512}\n`);
    if (!asset) return res.writeHead(404).end();
    res.setHeader('Content-Length', asset.size); syncFs.createReadStream(asset.file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const stateFile = path.join(profile, 'ecs-runtime.json');
  const state = () => fs.readFile(stateFile, 'utf8').then(JSON.parse, () => null);
  const alive = pid => Number.isSafeInteger(pid) && syncFs.existsSync(`/proc/${pid}/exe`);
  const waitReady = version => waitFor(async () => {
    const value = await state(); return value?.browserReady && value.version === version && value;
  }, `candidate ${version} ready`, 45000);
  let child, currentPid, logs = '', hiddenUnpacked;
  try {
    const install = path.join(root, assets[0].name);
    await fs.copyFile(assets[0].file, install); await fs.chmod(install, 0o755);
    const { ELECTRON_RUN_AS_NODE: ignored, BLANC_ECS_FULL_PROFILE: ignoredProfile, LD_PRELOAD: ignoredPreload,
      BLANC_ECS_CDM_PRELOAD_PATH: ignoredCdm, BLANC_UPDATE_STAGING_AUTO_INSTALL: ignoredAuto,
      BLANC_UPDATE_STAGING_STATUS_FILE: ignoredStatus, ...env } = process.env;
    void ignored; void ignoredProfile; void ignoredPreload; void ignoredCdm; void ignoredAuto; void ignoredStatus;
    const appEnv = { ...env, APPIMAGE_EXTRACT_AND_RUN: '1', BLANC_ECS_FULL_SMOKE: '1',
      BLANC_ECS_TEST_DEBUG_PORT: '55822', XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache') };
    // No repository launcher, profile argument, or preload environment. The
    // image must create only its own profile before native Electron starts.
    child = spawn(install, [], { env: appEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const capture = stream => stream.on('data', b => { logs = (logs + b).slice(-8000); });
    capture(child.stdout); capture(child.stderr);
    let initial = await waitReady(assets[0].version); currentPid = initial.pid;
    assert.equal(initial.selfContainedLauncher, true); assert.equal(initial.preloadInsideCurrentImage, true);
    report.coldSelfContainedStartup = true;
    const component = await waitFor(async () => (await state())?.component, 'initial component install');
    assert.equal(component.state, 'restart-required');
    await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
    await waitFor(() => child.exitCode !== null, 'warmup normal shutdown'); assert.equal(child.exitCode, 0);
    await fs.unlink(stateFile);
    await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, firstRunCompletedAt: Date.now(), usagePing: false, searchSuggestions: false }));
    offered = assets[1];
    child = spawn(install, [], { env: { ...appEnv, BLANC_UPDATE_CHANNEL: 'staging', BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
      BLANC_UPDATE_STAGING_URL: `http://127.0.0.1:${server.address().port}/` }, stdio: ['ignore', 'pipe', 'pipe'] });
    capture(child.stdout); capture(child.stderr);
    initial = await waitReady(assets[0].version); currentPid = initial.pid;
    hiddenUnpacked = path.join(builds[0].dist, 'linux-unpacked.unavailable');
    await fs.rename(path.join(builds[0].dist, 'linux-unpacked'), hiddenUnpacked);
    report.oldLooseInstallationUnavailable = true;
    for (let index = 1; index < assets.length; index++) {
      const previous = assets[index - 1], next = assets[index]; offered = next;
      const handoff = { from: previous.version, to: next.version }; report.handoffs.push(handoff);
      if (index > 1) {
        const chrome = await connect((await targets(55822)).find(t => t.url === 'blanc-chrome://index/'));
        try { await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/')); } finally { chrome.close(); }
        const settings = await connect(await waitFor(async () => (await targets(55822)).find(t => t.url.startsWith('blanc://settings/')), 'settings'));
        try { await waitFor(() => settings.evaluate(() => !!window.bowserPages?.settings?.checkForUpdates), 'settings bridge');
          void settings.evaluate(() => window.bowserPages.settings.checkForUpdates()).catch(() => {});
        } finally { await delay(1000); settings.close(); }
      }
      await waitFor(() => report.requests.some(r => r.path === `/${next.name}` && r.complete), 'real staged download', 90000);
      handoff.downloadVerified = true;
      const prompt = await waitFor(promptWindow, 'Restart Now prompt', 20000);
      await fs.unlink(stateFile); const oldPid = currentPid;
      execFileSync('xdotool', ['windowfocus', prompt]); execFileSync('xdotool', ['key', '--clearmodifiers', 'Return']);
      handoff.restartNowAccepted = true;
      await waitFor(() => !alive(oldPid), 'old candidate exit', 30000); handoff.oldExited = true;
      const installed = path.join(root, next.name);
      await waitFor(() => fs.stat(installed).then(() => true, () => false), 'replacement image');
      handoff.installedHash = await hash(installed); handoff.expectedHash = await hash(next.file);
      assert.equal(handoff.installedHash, handoff.expectedHash);
      assert.equal(await fs.stat(path.join(root, previous.name)).then(() => true, () => false), false);
      const relaunched = await waitReady(next.version); currentPid = relaunched.pid;
      handoff.relaunchedVersion = relaunched.version;
      assert.equal(relaunched.productionUpdater, false); assert.equal(relaunched.selfContainedLauncher, true);
      assert.equal(relaunched.preloadInsideCurrentImage, true); assert.equal(relaunched.profile, profile);
      const launch = JSON.parse(await fs.readFile(path.join(profile, 'ecs-launch-attempt.json')));
      assert.equal(launch.nativeProfileMatches, true);
      handoff.protectedPlayback = await updatedPlayback(55822, currentPid); handoff.passed = true;
    }
    report.passed = report.handoffs.length === 2 && report.handoffs.every(h => h.passed);
    assert.equal(report.passed, true, 'two consecutive automatic handoffs required');
  } catch (error) { report.error = error.message; report.sandboxFailure = error.sandboxEvidence; throw error; }
  finally {
    report.logs = logs;
    report.updaterLaunch = await fs.readFile(path.join(profile, 'ecs-updater-launch.json'), 'utf8').then(JSON.parse, () => null);
    report.childLog = await fs.readFile(path.join(profile, 'ecs-updater-child.log'), 'utf8').then(value => value.slice(-8000), () => null);
    const finalState = await state(); if (finalState?.pid) currentPid = finalState.pid;
    if (alive(currentPid)) { await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit'); await waitFor(() => !alive(currentPid), 'final normal shutdown', 15000).catch(() => process.kill(currentPid, 'SIGKILL')); }
    if (child?.exitCode === null) { child.kill('SIGTERM'); await delay(1000); if (child.exitCode === null) child.kill('SIGKILL'); }
    if (hiddenUnpacked) await fs.rename(hiddenUnpacked, path.join(builds[0].dist, 'linux-unpacked'));
    await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true });
    report.profileRemoved = !syncFs.existsSync(profile); report.installationRemoved = !syncFs.existsSync(root);
    await fs.writeFile(process.argv[4], JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
