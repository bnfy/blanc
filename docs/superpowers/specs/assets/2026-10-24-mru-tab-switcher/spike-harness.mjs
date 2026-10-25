// Ctrl-Tab spike (docs/superpowers/specs/2026-10-24-mru-tab-switcher-design.md §10).
// Question: after Ctrl+Tab, does the main process see the Control key-UP, and on
// which webContents, wherever focus lands? Real X11 events via xdotool, so the
// native input path is exercised (sendInputEvent would bypass it).
//
// Run: xvfb-run -a node spike.mjs /home/user/blanc
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repo = path.resolve(process.argv[2] ?? '.');
const require = createRequire(path.join(repo, 'package.json'));
const { _electron } = require('playwright');
const { callTestHook: call } = require(path.join(repo, 'test/desktop/support/test-hook-call.js'));
const { waitForValue: wait } = require(path.join(repo, 'test/desktop/support/poll.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xdo = (...args) => execFileSync('xdotool', args, { env: process.env }).toString().trim();

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ctrltab-'));
const userData = path.join(root, 'profile');
fs.mkdirSync(`${userData}-Dev`);
fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, searchSuggestions: false, usagePing: false,
}));
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Spike fixture</title><input id="typing" autofocus>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
const app = await _electron.launch({
  cwd: repo,
  args: [repo, `--user-data-dir=${userData}`],
  env: { ...env, BLANC_TEST: '1' },
  chromiumSandbox: true,
});
const report = { platform: process.platform, scenarios: [] };
try {
  await app.firstWindow();
  await wait(() => call(app, 'startupReady'), Boolean, 'startup', 30_000);

  // Instrument every webContents, present and future. Records only modifier
  // and Tab keys, with the focused webContents at that moment.
  await app.evaluate(({ app: electronApp, webContents }) => {
    globalThis.__spikeLog = [];
    const kind = (wc) => {
      const url = wc.getURL();
      if (url.startsWith('blanc-chrome://')) return url.replace(/^blanc-chrome:\/\//, 'chrome:').replace(/\/.*$/, '');
      if (url.startsWith('blanc://')) return url.replace(/^blanc:\/\//, 'page:').replace(/\/.*$/, '');
      return wc.getType() + ':' + (url.split('/')[3] ?? '');
    };
    const attach = (wc) => {
      if (wc.__spike) return;
      wc.__spike = true;
      wc.on('input-event', (_e, input) => {
        if (!['keyDown', 'keyUp', 'rawKeyDown'].includes(input.type)) return;
        if (!['Control', 'Tab'].includes(input.key)) return;
        globalThis.__spikeLog.push({ t: Date.now(), wc: wc.id, kind: 'IE:' + kind(wc), type: input.type, key: input.key, control: null, repeat: false, focused: null });
      });
      wc.on('before-input-event', (_e, input) => {
        if (!['Control', 'Tab', 'Shift', 'Escape'].includes(input.key)) return;
        const focused = webContents.getFocusedWebContents();
        globalThis.__spikeLog.push({
          t: Date.now(), wc: wc.id, kind: kind(wc), type: input.type, key: input.key,
          control: input.control, repeat: input.isAutoRepeat,
          focused: focused ? `${focused.id}:${kind(focused)}` : null,
        });
      });
    };
    webContents.getAllWebContents().forEach(attach);
    electronApp.on('web-contents-created', (_e, wc) => attach(wc));
  });

  for (const n of ['one', 'two', 'three']) await call(app, 'openTab', [`${origin}/${n}`]);
  await sleep(800);

  // The X window that holds the browser.
  const xid = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/');
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? String(buf.readBigUInt64LE(0)) : String(buf.readUInt32LE(0));
  });
  report.xid = xid;

  const focusWindow = () => { try { xdo('windowfocus', '--sync', xid); } catch { xdo('windowfocus', xid); } };
  const state = () => call(app, 'state');
  const deliveries = async () => (await call(app, 'browserCommandState')).deliveries.length;
  const focusedNow = () => app.evaluate(({ webContents }) => {
    const f = webContents.getFocusedWebContents();
    return f ? `${f.id}:${f.getURL().slice(0, 40)}` : null;
  });

  async function scenario(name, prepare, keys) {
    await prepare();
    await sleep(400);
    focusWindow();
    await sleep(200);
    const before = await state();
    const deliveredBefore = await deliveries();
    const stepsBefore = await app.evaluate(() => globalThis.__spikeSteps ?? 0);
    const focusBefore = await focusedNow();
    await app.evaluate(() => { globalThis.__spikeLog = []; });
    for (const step of keys) {
      if (typeof step === 'number') await sleep(step);
      else xdo(...step);
    }
    await sleep(600);
    const log = await app.evaluate(() => globalThis.__spikeLog);
    const after = await state();
    const ctrlUps = log.filter((e) => e.key === 'Control' && e.type === 'keyUp' && !e.kind.startsWith('IE:'));
    const ieCtrlUps = log.filter((e) => e.key === 'Control' && e.type === 'keyUp' && e.kind.startsWith('IE:'));
    const result = {
      name,
      focusBefore,
      focusAfter: await focusedNow(),
      activeBefore: before.tabOrder.indexOf(before.activeTabId),
      activeAfter: after.tabOrder.indexOf(after.activeTabId),
      overlayMode: await call(app, 'overlayMode'),
      commandsDelivered: (await deliveries()) - deliveredBefore,
      steps: (await app.evaluate(() => globalThis.__spikeSteps ?? 0)) - stepsBefore,
      controlKeyUpSeen: ctrlUps.length > 0,
      inputEventCtrlUp: ieCtrlUps.length > 0,
      controlKeyUpOn: ctrlUps.map((e) => `${e.wc}:${e.kind} (focused ${e.focused})`),
      log: log.map((e) => `${e.type} ${e.key}${e.repeat ? ' (repeat)' : ''} @${e.wc}:${e.kind} focused=${e.focused}`),
    };
    report.scenarios.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const ctrlDown = ['keydown', 'ctrl'];
  const ctrlUp = ['keyup', 'ctrl'];
  const tab = ['key', 'Tab'];
  const held = [ctrlDown, 150, tab, 300, tab, 300, ctrlUp];
  const tap = [ctrlDown, tab, ctrlUp];

  const activate = async (index) => {
    const s = await state();
    await call(app, 'activateTab', [s.tabOrder[index], true]);
  };

  await scenario('CONTROL: page focused, Ctrl+A (not a Blanc shortcut)', () => activate(1), [ctrlDown, 150, ['key', 'a'], 300, ctrlUp]);
  await scenario('page focused, held Ctrl, Tab x2', () => activate(1), held);
  await scenario('page focused, tap', () => activate(1), tap);
  await scenario('blank new tab (address panel focused), held Ctrl, Tab x2', async () => {
    await activate(0);
    focusWindow();
    xdo('key', 'ctrl+t');
    await wait(() => call(app, 'overlayMode'), (m) => m === 'panel', 'panel open');
  }, held);
  await scenario('Settings sheet focused, held Ctrl, Tab x2', async () => {
    await activate(1);
    await app.evaluate(() => globalThis.__blanc.openSettings());
    await wait(() => call(app, 'utilitySurface'), (v) => v?.ready, 'settings ready');
  }, held);
  await scenario('chrome strip focused, held Ctrl, Tab x2', async () => {
    await call(app, 'closeUtilitySurface').catch(() => {});
    await activate(2);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/').webContents.focus();
    });
  }, held);
} catch (error) {
  report.error = String(error?.stack || error);
  console.error(error);
} finally {
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `report-${process.platform}.json`), JSON.stringify(report, null, 2));
  await app.close().catch(() => {});
  server.close();
}
