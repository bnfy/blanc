'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');
const { linuxPreloadEnv } = require('../../scripts/ecs-linux-preload-env.cjs');
const { waitFor } = require('./ecs-local-html-smoke.cjs');
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
  const first = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  const second = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
  for (const info of [first, second]) assert.ok(info.nativeValidation && info.nativeSecurityPatch && !info.productionUpdater);
  assert.notEqual(first.candidateVersion, second.candidateVersion);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-update-'));
  const report = { from: first.candidateVersion, to: second.candidateVersion, publicFeed: false, requests: [] };
  const firstName = `Blanc-${first.candidateVersion}.AppImage`, nextName = `Blanc-${second.candidateVersion}.AppImage`;
  const nextSource = path.join(second.dist, nextName);
  const nextSize = (await fs.stat(nextSource)).size;
  const sha512 = crypto.createHash('sha512').update(await fs.readFile(nextSource)).digest('base64');
  const metadata = `version: ${second.candidateVersion}\nfiles:\n  - url: ${nextName}\n    sha512: ${sha512}\n    size: ${nextSize}\npath: ${nextName}\nsha512: ${sha512}\n`;
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const known = pathname === '/staging-linux.yml' || pathname === `/${nextName}`;
    const entry = { path: known ? pathname : 'unexpected', method: req.method }; report.requests.push(entry);
    if (!known) return res.writeHead(404).end();
    res.on('finish', () => { entry.complete = true; });
    if (pathname === '/staging-linux.yml') return res.end(metadata);
    res.setHeader('Content-Length', nextSize);
    require('node:fs').createReadStream(nextSource).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let child, newPid;
  try {
    await withDiagnosticProfile(async profile => {
      report.profile = profile;
      await fs.writeFile(path.join(profile, 'ecs-candidate-profile.json'), '{"candidate":true}');
      await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, firstRunCompletedAt: Date.now(), usagePing: false, searchSuggestions: false }));
      const install = path.join(root, firstName);
      await fs.copyFile(path.join(first.dist, firstName), install); await fs.chmod(install, 0o755);
      const { ELECTRON_RUN_AS_NODE: ignored, BLANC_UPDATE_STAGING_AUTO_INSTALL: ignoredAuto,
        BLANC_UPDATE_STAGING_STATUS_FILE: ignoredStatus, ...env } = process.env;
      void ignored; void ignoredAuto; void ignoredStatus;
      const appEnv = { ...env, ...linuxPreloadEnv(path.join(first.dist, 'linux-unpacked'), profile),
        APPIMAGE_EXTRACT_AND_RUN: '1', BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1',
        XDG_CACHE_HOME: path.join(root, 'cache'), BLANC_UPDATE_CHANNEL: 'staging',
        BLANC_UPDATE_STAGING_ALLOW_HTTP: '1', BLANC_UPDATE_STAGING_URL: `http://127.0.0.1:${server.address().port}/` };
      let logs = '';
      child = spawn(install, [`--user-data-dir=${profile}`], { env: appEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', b => { logs = (logs + b).slice(-8000); }); child.stderr.on('data', b => { logs = (logs + b).slice(-8000); });
      const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
      const stateFile = path.join(profile, 'ecs-runtime.json');
      const state = async () => fs.readFile(stateFile, 'utf8').then(JSON.parse, () => null);
      try {
        await waitFor(async () => (await state())?.browserReady, 'old candidate ready', 30000);
        report.oldReady = true;
        await waitFor(() => report.requests.some(r => r.path === `/${nextName}` && r.complete), 'real staged download', 90000);
        report.downloadVerified = true;
        const prompt = await waitFor(promptWindow, 'Restart Now prompt', 20000);
        await fs.unlink(stateFile);
        execFileSync('xdotool', ['windowfocus', prompt]);
        execFileSync('xdotool', ['key', '--clearmodifiers', 'Return']);
        report.restartNowAccepted = true;
        report.oldExit = await Promise.race([exited, delay(30000).then(() => { throw Error('Old candidate did not quit after Restart Now'); })]);
        const installed = path.join(root, nextName);
        await waitFor(async () => fs.stat(installed).then(() => true, () => false), 'AppImage replacement', 15000);
        report.installedHash = await hash(installed); report.expectedHash = await hash(nextSource);
        assert.equal(report.installedHash, report.expectedHash);
        report.fileReplaced = !(await fs.stat(install).then(() => true, () => false));
        assert.equal(report.fileReplaced, true);
        const relaunched = await waitFor(async () => {
          const value = await state();
          if (value?.pid) newPid = value.pid;
          return value?.browserReady && value.version === second.candidateVersion && value;
        }, 'updated candidate self-relaunch with isolated profile', 30000);
        report.relaunchedVersion = relaunched.version;
        assert.equal(relaunched.productionUpdater, false);
        report.passed = true;
      } finally {
        report.logs = logs;
        if (child.exitCode === null || newPid) {
          await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
          await Promise.race([exited, delay(5000)]);
        }
        if (newPid && Number.isSafeInteger(newPid)) { try { process.kill(newPid, 'SIGTERM'); } catch {} }
        if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([exited, delay(3000)]); }
        if (child.exitCode === null) child.kill('SIGKILL');
        await exited;
      }
    });
  } catch (error) { report.error = error.message; throw error; }
  finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
    report.profileRemoved = !report.profile || await fs.stat(report.profile).then(() => false, () => true);
    report.installationRemoved = await fs.stat(root).then(() => false, () => true);
    await fs.writeFile(process.argv[4], JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
