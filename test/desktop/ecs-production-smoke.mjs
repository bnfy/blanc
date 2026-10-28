// Normal packaged entrypoint, no main-process inspector or candidate bootstrap.
// File probes use the page's default JS world, not Playwright's utility world.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const { connect, targets, waitFor } = require('./ecs-local-html-smoke.cjs');
const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
assert(executable, 'An isolated packaged executable is required');
assert.equal(process.env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-production-smoke-'));
const profile = path.join(root, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, usagePing: false, searchSuggestions: false }));
const canary = path.join(root, 'private.html');
await fs.writeFile(canary, '<p id="secret">PRIVATE_LOCAL_CANARY</p>');
// The head goes out at once and the body 1.5 s later, so the fixture's target
// is listed while its document is still parsing, as on a slow runner (#1210).
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html'); res.write('<!doctype html><title>File access boundary</title>');
  setTimeout(() => res.end('<body>Untrusted web page</body>'), 1500);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const report = { platform: process.platform, arch: process.arch, rounds: [], profileRemoved: false };
try {
  for (let round = 0; round < 2; round++) {
    let app, client;
    const start = Date.now();
    try {
      const socket = net.createServer();
      await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
      const port = socket.address().port;
      await new Promise(resolve => socket.close(resolve));
      app = await launchPackagedOverCdp({ executablePath: executable, launchViaOpen: process.platform === 'darwin',
        args: [`--user-data-dir=${profile}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '' }, debugPort: port, timeoutMs: 15000 });
      const chrome = await waitFor(() => app.pages().find(p => p.url() === 'blanc-chrome://index/'), 'browser chrome', 15000);
      await chrome.waitForFunction(() => !!window.browserAPI, undefined, { timeout: 15000 });
      await chrome.evaluate(() => window.browserAPI.openPage('settings'));
      const settings = await waitFor(() => app.pages().find(p => p.url() === 'blanc://settings/'), 'settings', 15000);
      const info = await settings.evaluate(async () => (await window.bowserPages.settings.get()).appInfo);
      assert.equal(info.electronVersion, '44.9.3');
      const readyMs = Date.now() - start;
      assert(readyMs < 15000, `Offline readiness exceeded 15 seconds: ${readyMs}`);
      await chrome.evaluate(url => window.browserAPI.createTab(url), url);
      const target = await waitFor(async () => (await targets(port)).find(p => p.url === url), 'web fixture');
      client = await connect(target);
      // The target is listed once the tab commits to the fixture, before its
      // document has parsed: wait for the loaded page before probing (#1210).
      await waitFor(async () => {
        try {
          return await client.evaluate(href => location.href === href && document.readyState === 'complete' && !!document.body, url);
        } catch { return false; }
      }, 'web fixture document', 30000);
      const boundary = await client.evaluate(async file => {
        let readable = false, workerStarted = false, serviceWorkerRegistered = false, frameReadable = false;
        try { readable = (await (await fetch(file)).text()).includes('PRIVATE_LOCAL_CANARY'); } catch {}
        try { new Worker(file); workerStarted = true; } catch {}
        try {
          const registration = await navigator.serviceWorker.register(file);
          serviceWorkerRegistered = true; await registration.unregister();
        } catch {}
        const frame = document.createElement('iframe'); frame.src = file; document.body.append(frame);
        await new Promise(resolve => setTimeout(resolve, 500));
        try { frameReadable = frame.contentWindow.document.body.textContent.includes('PRIVATE_LOCAL_CANARY'); } catch {}
        frame.remove();
        return { readable, workerStarted, serviceWorkerRegistered, frameReadable, nodeExposed: typeof require !== 'undefined' || typeof process !== 'undefined' };
      }, pathToFileURL(canary).href);
      assert.deepEqual(boundary, { readable: false, workerStarted: false, serviceWorkerRegistered: false, frameReadable: false, nodeExposed: false });
      report.rounds.push({ round, offlineReadyMs: readyMs, ...boundary });
    } finally { client?.close(); if (app) await app.close(); }
  }
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  report.profileRemoved = !(await fs.stat(root).catch(() => null));
  await fs.mkdir('output/ecs-production', { recursive: true });
  await fs.writeFile(`output/ecs-production/offline-${process.platform}-${process.arch}.json`, JSON.stringify(report, null, 2));
}
assert.equal(report.profileRemoved, true);
console.log(JSON.stringify(report));
