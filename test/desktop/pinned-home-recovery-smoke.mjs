import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import testHook from './support/test-hook-call.js';

const { callTestHook } = testHook;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const profiles = [];
const apps = new Set();

const server = http.createServer((req, res) => {
  const name = new URL(req.url || '/', 'http://127.0.0.1').pathname.slice(1) || 'page';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><title>${name}</title><h1>${name}</h1>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const page = (name) => `${base}/${name}`;

function profile() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pinned-home-recovery-'));
  const actualAlias = `${userData}-Dev`;
  fs.mkdirSync(actualAlias);
  const actual = fs.realpathSync(actualAlias);
  profiles.push(userData, actualAlias);
  fs.writeFileSync(path.join(actual, 'settings.json'), JSON.stringify({
    onboardingVersion: 1,
    usagePing: false,
    searchSuggestions: false,
  }));
  return { userData, actual };
}

async function waitFor(read, accept, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${label} timed out; last value: ${JSON.stringify(last)}`);
}

async function launch(profilePaths, { recoveryChoice = null } = {}) {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
  void _ignored;
  const app = await _electron.launch({
    chromiumSandbox: true,
    args: [ROOT, `--user-data-dir=${profilePaths.userData}`],
    env: { ...cleanEnv, BLANC_TEST: '1' },
  });
  apps.add(app);
  const actualUserData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  assert.equal(actualUserData, profilePaths.actual);
  await app.evaluate(() => new Promise((resolve) => {
    const timer = setInterval(() => {
      if (globalThis.__blancCall) {
        clearInterval(timer);
        resolve();
      }
    }, 25);
  }));
  if (recoveryChoice) {
    await waitFor(
      () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(profilePaths.actual, 'crash-ledger.json'), 'utf8'))),
      (ledger) => ledger.recoveryPending === true,
      'crash ledger to mark recovery pending',
    );
    await waitFor(
      () => callTestHook(app, 'sessionRecoveryState'),
      (state) => state.required === true,
      'recovery choice to become ready',
    );
    const choice = await callTestHook(app, 'chooseSessionRecovery', [recoveryChoice]);
    assert.equal(choice.ok, true, JSON.stringify(choice));
  }
  await waitFor(
    () => callTestHook(app, 'startupReady'),
    Boolean,
    'session persistence readiness',
  );
  return app;
}

async function crash(app, profilePaths) {
  const child = app.process();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  assert.equal(child.kill('SIGKILL'), true, 'Electron main process accepted SIGKILL');
  await exited;
  apps.delete(app);
  const ledger = JSON.parse(fs.readFileSync(path.join(profilePaths.actual, 'crash-ledger.json'), 'utf8'));
  assert.ok(ledger.currentRun, `hard kill must leave an active crash-ledger session: ${JSON.stringify(ledger)}`);
}

async function close(app) {
  await app.close();
  apps.delete(app);
}

async function seedPinnedSession(app, profilePaths) {
  const home = page('home-a');
  const away = page('away-b');
  const id = await callTestHook(app, 'openTab', [home]);
  await waitFor(
    () => callTestHook(app, 'state'),
    (state) => state.tabs.some((tab) => tab.id === id && !tab.isLoading && tab.url === home),
    'home page load',
  );
  await callTestHook(app, 'pinTab', [id]);
  assert.equal(await callTestHook(app, 'pinnedHome', [id]), home);
  await callTestHook(app, 'navigateTab', [id, away]);
  await waitFor(
    () => callTestHook(app, 'state'),
    (state) => state.tabs.some((tab) => tab.id === id && !tab.isLoading && tab.url === away),
    'away page load',
  );
  await waitFor(
    () => Promise.resolve(fs.existsSync(path.join(profilePaths.actual, 'session.json'))
      ? JSON.parse(fs.readFileSync(path.join(profilePaths.actual, 'session.json'), 'utf8'))
      : null),
    (data) => JSON.stringify(data).includes(home) && JSON.stringify(data).includes(away),
    'pinned session write',
  );
  return { home, away };
}

try {
  const restoreProfile = profile();
  let app = await launch(restoreProfile);
  const { home, away } = await seedPinnedSession(app, restoreProfile);
  await crash(app, restoreProfile);

  app = await launch(restoreProfile, { recoveryChoice: 'restore' });
  let restored = await waitFor(
    () => callTestHook(app, 'state'),
    (state) => state.tabs.find((tab) => tab.pinned && tab.url === away),
    'crash-restored last page',
  );
  let tab = restored.tabs.find((candidate) => candidate.pinned && candidate.url === away);
  assert.equal(await callTestHook(app, 'pinnedHome', [tab.id]), home);

  await close(app);
  app = await launch(restoreProfile);
  restored = await waitFor(
    () => callTestHook(app, 'state'),
    (state) => state.tabs.find((candidate) => candidate.pinned && candidate.url === home),
    'clean-start pinned home',
  );
  tab = restored.tabs.find((candidate) => candidate.pinned && candidate.url === home);
  assert.equal(await callTestHook(app, 'pinnedHome', [tab.id]), home);
  await close(app);

  const freshProfile = profile();
  app = await launch(freshProfile);
  await seedPinnedSession(app, freshProfile);
  await crash(app, freshProfile);
  app = await launch(freshProfile, { recoveryChoice: 'fresh' });
  const fresh = await callTestHook(app, 'state');
  assert.equal(fresh.tabs.some((candidate) => candidate.pinned), false);
  for (const candidate of fresh.tabs) {
    assert.equal(await callTestHook(app, 'pinnedHome', [candidate.id]), null);
  }
  await close(app);

  console.log('Pinned-home recovery smoke passed (restore, clean start, and fresh recovery).');
} finally {
  for (const app of apps) {
    try { app.process().kill('SIGKILL'); } catch {}
  }
  await new Promise((resolve) => server.close(resolve));
  for (const dir of profiles) fs.rmSync(dir, { recursive: true, force: true });
}
