import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import electronPath from 'electron';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// Several URLs on one command line: `Blanc -- URL1 URL2`.
//
// On Windows, Electron refuses a command line where any argument follows a
// URL without a `--` first. That is its CVE-2018-1000006 guard, and it exits
// with -1 before main.js runs. Chromium moves switches ahead of plain
// arguments before the check, so even two URLs trip it. Blanc's own
// registrations pass a single URL ("%1"), so only scripts and launchers that
// pass several URLs meet it. This smoke proves the `--` form opens every URL
// and activates the last one. On Windows it also proves the guard still
// refuses the same URLs without `--`, so the note in startup-urls.js stays
// true across Electron upgrades.

const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const repo = path.resolve('.');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-command-line-urls-'));
const uncaughtLog = path.join(root, 'uncaught.log');
const seedProfile = (userData) => {
  fs.mkdirSync(`${userData}-Dev`, { recursive: true });
  fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({
    onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
  }));
};

const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'page';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>${name}</title><p>${name}</p>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pageA = `http://127.0.0.1:${server.address().port}/command-line-a`;
const pageB = `http://127.0.0.1:${server.address().port}/command-line-b`;

let app;
try {
  const userData = path.join(root, 'separator');
  seedProfile(userData);
  app = await _electron.launch({
    chromiumSandbox: true,
    args: [repo, `--user-data-dir=${userData}`, '--', pageA, pageB],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  await app.firstWindow();
  await waitForValue(() => callTestHook(app, 'startupReady'), Boolean, 'startup', 30_000);
  const primary = await waitForValue(
    () => callTestHook(app, 'windowRuntimes').then((runtimes) => runtimes.find((runtime) => runtime.id === 'primary')),
    (runtime) => [pageA, pageB].every((url) => runtime?.tabs.some((tab) => tab.url === url)),
    'both command-line pages to open',
    15_000,
  );
  const active = primary.tabs.find((tab) => tab.id === primary.activeTabId);
  assert.equal(active?.url, pageB, `the last command-line URL is the active tab: ${JSON.stringify(primary)}`);
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await exited;
  app = null;
  const log = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  assert.equal(log, '', 'main process threw');

  if (process.platform === 'win32') {
    const refused = path.join(root, 'no-separator');
    seedProfile(refused);
    const child = spawn(electronPath, [repo, `--user-data-dir=${refused}`, pageA, pageB], {
      env: { ...env, BLANC_TEST: '1' },
      stdio: 'ignore',
    });
    const code = await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(() => resolve('still running'), 20_000)),
    ]);
    if (code === 'still running') child.kill();
    assert.ok(code === -1 || code === 4294967295,
      `Electron no longer refuses two URLs without "--" (exit: ${code}); update the note in src/main/startup-urls.js`);
    assert.equal(fs.existsSync(path.join(`${refused}-Dev`, 'crash-ledger.json')), false,
      'the refused launch never reached main.js');
  }
  console.log(`command-line-urls: ok (${process.platform})`);
} finally {
  try {
    if (app && app.process().exitCode === null) await app.close();
  } catch {}
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
