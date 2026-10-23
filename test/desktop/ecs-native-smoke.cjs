'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { extractFile } = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const { withDiagnosticProfile } = require('../../scripts/drm-diagnostics.cjs');
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const { spawn } = require('node:child_process');
const http = require('node:http');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const info = JSON.parse(await fs.readFile(process.env.BLANC_ECS_BUILD_RESULT, 'utf8'));
  const mac = process.platform === 'darwin', win = process.platform === 'win32';
  const appDir = path.join(info.dist, mac ? (process.arch === 'arm64' ? 'mac-arm64/Blanc.app' : 'mac/Blanc.app') : win ? 'win-unpacked' : 'linux-unpacked');
  const executable = path.join(appDir, mac ? 'Contents/MacOS/Blanc' : win ? 'Blanc.exe' : 'blanc-ecs-full-candidate');
  const asar = path.join(appDir, mac ? 'Contents/Resources/app.asar' : 'resources/app.asar');
  const metadata = JSON.parse(extractFile(asar, 'package.json'));
  assert.equal(metadata.blancEcsFullCandidate, true);
  assert.equal(metadata.blancUblockBundled, false);
  const wire = await getCurrentFuseWire(mac ? appDir : executable);
  const names = { runAsNode: 'RunAsNode', enableCookieEncryption: 'EnableCookieEncryption', enableNodeOptionsEnvironmentVariable: 'EnableNodeOptionsEnvironmentVariable',
    enableNodeCliInspectArguments: 'EnableNodeCliInspectArguments', enableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation', onlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
    loadBrowserProcessSpecificV8Snapshot: 'LoadBrowserProcessSpecificV8Snapshot', grantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges' };
  for (const [key, name] of Object.entries(names)) assert.equal(wire[FuseV1Options[name]], info.candidateFuses[key] ? 49 : 48, name);
  const report = { platform: process.platform, arch: process.arch, version: metadata.version, runtime: info.runtime, sourceCommit: info.sourceCommit,
    fusesVerified: true, productionUpdater: false, vmpSigned: false, releaseQualified: false, samples: [] };
  // AppImageUpdater intentionally disables itself for the loose executable.
  // Launch the actual image so its runtime supplies APPIMAGE naturally; the
  // supported extract-and-run mode avoids granting a hosted runner FUSE access.
  let launchExecutable = executable;
  if (!mac && !win) {
    const images = (await fs.readdir(info.dist)).filter(name => name.endsWith('.AppImage'));
    assert.equal(images.length, 1, 'one native AppImage required');
    launchExecutable = path.join(info.dist, images[0]);
    await fs.chmod(launchExecutable, 0o755);
    report.appImageLaunch = 'extract-and-run';
  }
  let usedProfile;
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url.split('?')[0]);
    res.setHeader('Content-Type', 'text/yaml');
    res.end(`version: ${metadata.version}\nfiles:\n  - url: unused.zip\n    sha512: ${Buffer.alloc(64).toString('base64')}\n    size: 1\npath: unused.zip\nsha512: ${Buffer.alloc(64).toString('base64')}\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await withDiagnosticProfile(async profile => {
    usedProfile = profile;
    await fs.writeFile(path.join(profile, 'ecs-candidate-profile.json'), JSON.stringify({ candidate: true }));
    const fixture = path.join(profile, 'fixture.html');
    await fs.writeFile(fixture, '<h1 id="canary">Original</h1><script>document.querySelector("h1").textContent="SCRIPT RAN"</script>');
    for (const iteration of [0, 1]) {
      const child = spawn(launchExecutable, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '', BLANC_ECS_FULL_PROFILE: profile, BLANC_ECS_FULL_SMOKE: '1', BLANC_ECS_LOCAL_HTML: fixture,
          ...(!mac && !win ? { APPIMAGE_EXTRACT_AND_RUN: '1' } : {}),
          BLANC_UPDATE_CHANNEL: iteration ? 'staging' : 'production', BLANC_UPDATE_STAGING_URL: `http://127.0.0.1:${server.address().port}/`,
          BLANC_UPDATE_STAGING_ALLOW_HTTP: '1', BLANC_UPDATE_STAGING_AUTO_INSTALL: '1', BLANC_UPDATE_STAGING_STATUS_FILE: path.join(profile, 'staging-status.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '', endpoint;
      child.stdout.on('data', b => { text += b; });
      child.stderr.on('data', b => { text += b; endpoint = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)?.[1]; });
      const exited = new Promise(resolve => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', error => resolve({ error: error.message })); });
      let page;
      try {
        const runtime = await waitFor(async () => {
          if (child.exitCode !== null) throw Error(`Native launch failed (${child.exitCode}): ${text.slice(-3000)}`);
          const state = await fs.readFile(path.join(profile, 'ecs-runtime.json'), 'utf8').then(JSON.parse, () => null);
          return state?.browserReady && Array.isArray(state.contents) && endpoint && state;
        }, 'candidate native startup', 90000);
        assert.equal(runtime.electron, info.runtime.split('+')[0]);
        assert.equal(runtime.productionUpdater, false);
        assert.equal(runtime.updaterMode, iteration ? 'staging' : 'disabled');
        if (iteration) {
          const status = await waitFor(async () => {
            const value = await fs.readFile(path.join(profile, 'staging-status.json'), 'utf8').then(JSON.parse, () => null);
            if (value?.phase === 'error') throw Error(`Staging updater: ${JSON.stringify(value)}`);
            return value?.phase === 'not-available' && value;
          }, 'real staging metadata check', 90000);
          report.stagingCheck = { phase: status.phase, requestedPaths: [...requests], handoffTested: false };
          assert.ok(requests.some(url => /^\/staging(?:-mac|-linux)?\.yml$/.test(url)));
          assert.ok(requests.every(url => !url.includes('latest')));
        } else assert.deepEqual(requests, []);
        const local = await waitFor(async () => (await targets(Number(endpoint))).find(t => t.url.startsWith('blanc-local-preview:')), 'local preview');
        page = await connect(local);
        const dom = await page.send('DOM.getDocument');
        const html = (await page.send('DOM.getOuterHTML', { nodeId: dom.root.nodeId })).outerHTML;
        assert.ok(html.includes('<h1 id="canary">Original</h1>'), 'untrusted script must not run');
        assert.ok(runtime.contents.every(c => c.sandbox !== false && c.nodeIntegration !== true && c.contextIsolation !== false));
        report.samples.push({ iteration, browserReady: true, nativeSandboxPreferences: true, localHtmlScriptBlocked: true, updaterMode: runtime.updaterMode, drm: runtime.drm?.state });
      } finally {
        page?.close();
        await fs.writeFile(path.join(profile, 'ecs-smoke-quit'), 'quit');
        const result = await Promise.race([exited, delay(10000).then(() => null)]);
        if (!result) { child.kill('SIGKILL'); await exited; throw Error('Candidate did not shut down normally'); }
        assert.equal(result.code, 0, `Candidate exit: ${JSON.stringify(result)} ${text.slice(-2000)}`);
      }
      await fs.unlink(path.join(profile, 'ecs-runtime.json'));
    }
  }); } finally { await new Promise(resolve => server.close(resolve)); }
  report.profileRemoved = await fs.stat(usedProfile).then(() => false, () => true);
  assert.equal(report.profileRemoved, true);
  await fs.mkdir('output/ecs-native', { recursive: true });
  await fs.writeFile('output/ecs-native/smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
