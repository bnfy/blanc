#!/usr/bin/env node
// Ctrl-Tab release probe — manual check for the MRU tab switcher spike
// (docs/superpowers/specs/2026-10-24-mru-tab-switcher-design.md §3.4, §10).
//
// Question: after Ctrl+Tab, does Blanc's main process see the Control key being
// RELEASED? On Linux (2026-10-25 spike) the answer was: never, while Blanc
// consumes the Ctrl+Tab key press; always, once it stops consuming it and the
// menu shortcut is display-only. This script asks the same question on macOS
// and Windows with a real keyboard.
//
// Usage, from the root of your Blanc checkout (npm install already done):
//   node docs/superpowers/specs/assets/2026-10-24-mru-tab-switcher/ctrl-tab-probe.mjs
// Linux self-test with real X11 keys (xdotool, xvfb, not as root):
//   xvfb-run -a node docs/superpowers/specs/assets/2026-10-24-mru-tab-switcher/ctrl-tab-probe.mjs --auto
//
// It never modifies your checkout: it makes a throwaway git worktree of
// origin/main in your temp folder, applies a test-only patch there, runs, and
// removes the worktree at the end (pass --keep to keep it).
//
// Each step: press Enter in this terminal, switch to Blanc with Cmd-Tab
// (macOS) or Alt-Tab (Windows) if it didn't come to the front, wait for the
// beep, do the keys, then come back here. "Ctrl" means Control (⌃ on a Mac),
// never Command.
//
// On a Mac, round B shows "Blanc steps 0": with the menu shortcut display-only
// nothing in today's macOS code handles Ctrl+Tab. That's expected; the question
// in round B is only whether the release is seen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const AUTO = argv.includes('--auto'); // Linux self-test: xdotool presses the keys
const KEEP = argv.includes('--keep');
const repo = process.cwd();
if (!fs.existsSync(path.join(repo, 'src/main/main.js'))) {
  console.error('Run this from the root of your Blanc checkout.');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

// ---- 1. Throwaway worktree with the test-only patch --------------------------
const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ctrltab-probe-'));
fs.rmSync(wt, { recursive: true });
console.log('Fetching origin/main and making a throwaway worktree…');
try { git('fetch', '--quiet', 'origin', 'main'); } catch { console.log('  (fetch failed; using your local origin/main)'); }
git('worktree', 'add', '--quiet', '--detach', wt, 'origin/main');
const cleanup = () => {
  if (KEEP) { console.log(`Worktree kept at ${wt}`); return; }
  try { git('worktree', 'remove', '--force', wt); } catch { /* best effort */ }
};

function patch(rel, edits) {
  const file = path.join(wt, rel);
  let text = fs.readFileSync(file, 'utf8');
  for (const [oldText, newText] of edits) {
    if (text.split(oldText).length !== 2) {
      cleanup();
      throw new Error(`The probe patch no longer fits ${rel} (main has moved). Tell Claude; it needs updating.`);
    }
    text = text.replace(oldText, newText);
  }
  fs.writeFileSync(file, text);
}
// BLANC_PROBE_HOLD=1: Ctrl+Tab only counts a step and never switches tabs, so
//   keyboard focus stays put (the switcher design: nothing changes until release).
// BLANC_PROBE_NOCONSUME=1: Blanc stops consuming the Ctrl+Tab key press and the
//   menu shows Ctrl+Tab without registering it (the Linux fix).
patch('src/main/main.js', [
  ["  'next-tab': () => cycleTab(1),\n  'previous-tab': () => cycleTab(-1),",
   "  'next-tab': () => (process.env.BLANC_PROBE_HOLD === '1' ? (globalThis.__probeSteps = (globalThis.__probeSteps ?? 0) + 1) : cycleTab(1)),\n" +
   "  'previous-tab': () => (process.env.BLANC_PROBE_HOLD === '1' ? (globalThis.__probeSteps = (globalThis.__probeSteps ?? 0) - 1) : cycleTab(-1)),"],
  ["      accelerator: definition.primary,\n      click: (_item, window) => {",
   "      accelerator: definition.primary,\n" +
   "      ...(process.env.BLANC_PROBE_NOCONSUME === '1' && (id === 'next-tab' || id === 'previous-tab') ? { registerAccelerator: false } : {}),\n" +
   "      click: (_item, window) => {"],
]);
patch('src/main/browser-shortcuts.js', [
  ["    event.preventDefault();\n    if (input.isAutoRepeat) return;",
   "    if (!(process.env.BLANC_PROBE_NOCONSUME === '1' && (id === 'next-tab' || id === 'previous-tab'))) event.preventDefault();\n    if (input.isAutoRepeat) return;"],
]);
// Dependencies and the generated blocker seed come from your checkout.
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const seed = path.join(repo, 'src/main/assets/adblock-engine-seed.bin');
if (fs.existsSync(seed)) fs.copyFileSync(seed, path.join(wt, 'src/main/assets/adblock-engine-seed.bin'));

const require = createRequire(path.join(wt, 'package.json'));
const { _electron } = require('playwright');
const { callTestHook: call } = require(path.join(wt, 'test/desktop/support/test-hook-call.js'));
const { waitForValue: wait } = require(path.join(wt, 'test/desktop/support/poll.js'));

// ---- 2. Fixture pages --------------------------------------------------------
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Probe page</title><body style="font:20px system-ui;padding:40px">Ctrl-Tab probe page. Don’t click here; just press keys when you hear the beep.<p><input id="typing" placeholder="(focus starts here)">');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const rl = AUTO ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const report = { platform: process.platform, arch: process.arch, osRelease: os.release(), at: new Date().toISOString(), base: git('rev-parse', '--short', 'origin/main'), runs: [] };

// ---- 3. One app launch per mode ------------------------------------------------
async function runMode(mode, env, scenarios) {
  console.log(`\n=== Mode: ${mode}`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ctrltab-profile-'));
  fs.mkdirSync(`${profile}-Dev`);
  fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockEnabled: false, searchSuggestions: false, usagePing: false }));
  const { ELECTRON_RUN_AS_NODE: _ignored, ...base } = process.env;
  const app = await _electron.launch({ cwd: wt, args: [wt, `--user-data-dir=${profile}`], env: { ...base, BLANC_TEST: '1', ...env }, chromiumSandbox: true });
  try {
    await app.firstWindow();
    await wait(() => call(app, 'startupReady'), Boolean, 'startup', 60_000);
    await app.evaluate(({ app: electronApp, webContents }) => {
      globalThis.__probeLog = [];
      const kind = (wc) => {
        const url = wc.getURL();
        if (url.startsWith('blanc-chrome://')) return 'chrome:' + url.slice(15).replace(/\/.*$/, '');
        if (url.startsWith('blanc://')) return 'page:' + url.slice(8).replace(/\/.*$/, '');
        return 'web:' + (url.split('/')[3] ?? '');
      };
      const attach = (wc) => {
        if (wc.__probe) return;
        wc.__probe = true;
        wc.on('before-input-event', (_e, input) => {
          if (!['Control', 'Tab'].includes(input.key)) return;
          const f = webContents.getFocusedWebContents();
          globalThis.__probeLog.push({ t: Date.now(), wc: wc.id, kind: kind(wc), type: input.type, key: input.key, repeat: input.isAutoRepeat, focused: f ? `${f.id}:${kind(f)}` : null });
        });
      };
      webContents.getAllWebContents().forEach(attach);
      electronApp.on('web-contents-created', (_e, wc) => attach(wc));
    });
    for (const n of ['one', 'two', 'three']) await call(app, 'openTab', [`${origin}/${n}`]);
    await sleep(800);
    for (const s of scenarios) await runScenario(app, mode, s);
  } finally {
    await app.close().catch(() => {});
  }
}

const KEYS = {
  held: 'hold Ctrl, press Tab, press Tab again, then release Ctrl',
  tap: 'press Ctrl+Tab once, quickly (a tap)',
};

async function runScenario(app, mode, s) {
  if (rl) {
    console.log(`\n--- ${s.name}`);
    console.log(`    After the beep: ${KEYS[s.keys]}. Don’t click inside Blanc.`);
    await rl.question('    Press Enter to start… ');
  }
  // Prepare the surface that should hold keyboard focus.
  const s0 = await call(app, 'state');
  await call(app, 'closeUtilitySurface').catch(() => {});
  await call(app, 'activateTab', [s0.tabOrder[1], true]);
  await sleep(300);
  if (s.prepare === 'panel') {
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/');
      const item = Menu.getApplicationMenu().getMenuItemById('browser-address');
      item.click(item, win);
    });
    await wait(() => call(app, 'overlayMode'), (m) => m === 'panel' || m === 'palette', 'address panel open', 10_000);
  }
  if (s.prepare === 'settings') {
    await app.evaluate(() => globalThis.__blanc.openSettings());
    await wait(() => call(app, 'utilitySurface'), (v) => v?.ready, 'Settings open', 15_000);
  }
  // Bring Blanc forward, wait until it really has focus, then focus the target.
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === 'blanc-chrome://index/');
    if (process.platform === 'darwin') electronApp.focus({ steal: true });
    win.show(); win.focus();
  });
  if (rl) console.log('    Switch to Blanc now if it isn’t in front (Cmd-Tab / Alt-Tab)…');
  await wait(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isFocused())), Boolean, 'Blanc window focused', 30_000);
  const target = await app.evaluate(({ webContents }, prepare) => {
    const all = webContents.getAllWebContents();
    const wc = prepare === 'panel' ? all.find((w) => w.getURL() === 'blanc-chrome://overlay/')
      : prepare === 'settings' ? all.find((w) => w.getURL().startsWith('blanc://settings'))
        : null;
    if (wc) wc.focus();
    const f = webContents.getFocusedWebContents();
    return f ? f.getURL().slice(0, 50) : null;
  }, s.prepare);
  await sleep(400);
  const stepsBefore = await app.evaluate(() => globalThis.__probeSteps ?? 0);
  await app.evaluate(({ shell }) => { globalThis.__probeLog = []; shell.beep(); });
  const t0 = Date.now();
  if (AUTO) {
    const xdo = (...a) => execFileSync('xdotool', a);
    xdo('keydown', 'ctrl');
    if (s.keys === 'held') { await sleep(150); xdo('key', 'Tab'); await sleep(300); xdo('key', 'Tab'); await sleep(300); }
    else xdo('key', 'Tab');
    xdo('keyup', 'ctrl');
  }
  // Wait for the keys: until a Control release plus a moment, or 12 seconds.
  let log = [];
  while (Date.now() - t0 < 12_000) {
    await sleep(200);
    log = await app.evaluate(() => globalThis.__probeLog);
    // On macOS the menu can take Ctrl+Tab before Blanc's logger sees the Tab,
    // so a counted step also proves the keys reached Blanc.
    const stepped = (await app.evaluate(() => globalThis.__probeSteps ?? 0)) !== stepsBefore;
    const sawTab = stepped || log.some((e) => e.key === 'Tab' && e.type !== 'keyUp');
    const up = log.find((e) => e.key === 'Control' && e.type === 'keyUp');
    if (sawTab && up && Date.now() - up.t > 800) break;
    const last = log.at(-1)?.t ?? t0;
    if (sawTab && !up && Date.now() - last > 3000) break; // keys done, no release came
  }
  const tabDowns = log.filter((e) => e.key === 'Tab' && e.type !== 'keyUp' && !e.repeat).length;
  const ups = log.filter((e) => e.key === 'Control' && e.type === 'keyUp');
  const result = {
    mode, scenario: s.name, focusedBeforeKeys: target,
    tabPressesSeen: tabDowns,
    blancSteps: (await app.evaluate(() => globalThis.__probeSteps ?? 0)) - stepsBefore,
    ctrlReleaseSeen: ups.length > 0,
    ctrlReleaseOn: ups.map((e) => e.kind),
    log: log.map((e) => `${e.type} ${e.key}${e.repeat ? ' (repeat)' : ''} @${e.kind} focused=${e.focused}`),
  };
  report.runs.push(result);
  const reached = tabDowns > 0 || result.blancSteps !== 0;
  result.keysReachedBlanc = reached;
  const verdict = !reached ? 'NO KEYS SEEN (Blanc wasn’t in front? this step can be ignored)' : result.ctrlReleaseSeen ? 'release SEEN' : 'release MISSING';
  console.log(`    → ${verdict}; Tab presses ${tabDowns}, Blanc steps ${result.blancSteps}${result.ctrlReleaseSeen ? `, on ${result.ctrlReleaseOn.join(', ')}` : ''}`);
}

const SCENARIOS = [
  { name: 'Page focused, held Ctrl, Tab ×2', prepare: 'page', keys: 'held' },
  { name: 'Page focused, quick tap', prepare: 'page', keys: 'tap' },
  { name: 'Address panel (⌘L / Ctrl+L) open', prepare: 'panel', keys: 'held' },
  { name: 'Settings sheet open', prepare: 'settings', keys: 'held' },
];

try {
  console.log(`\nBlanc Ctrl-Tab probe — ${process.platform} ${os.release()}, base ${report.base}`);
  console.log('Two short rounds of four steps each; about three minutes.');
  await runMode('A: Blanc consumes Ctrl+Tab (today)', { BLANC_PROBE_HOLD: '1' }, SCENARIOS);
  await runMode('B: not consumed, menu shortcut display-only (Linux fix)', { BLANC_PROBE_HOLD: '1', BLANC_PROBE_NOCONSUME: '1' }, SCENARIOS);
} catch (error) {
  report.error = String(error?.stack || error);
  console.error(`\nProbe stopped: ${error?.message || error}`);
} finally {
  rl?.close();
  server.close();
  cleanup();
  const out = path.join(repo, `ctrl-tab-probe-${process.platform}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\n=== Summary');
  for (const r of report.runs) {
    console.log(`  ${r.mode.slice(0, 2)} ${r.scenario.padEnd(36)} release ${r.ctrlReleaseSeen ? 'SEEN   ' : 'MISSING'}  Tab presses ${r.tabPressesSeen}  Blanc steps ${r.blancSteps}`);
  }
  console.log(`\nReport saved to ${out} — send it to Claude (it holds key names and Blanc page kinds only, no page content).`);
}
