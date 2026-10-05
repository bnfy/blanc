// #548: a utility sheet is attached, transparent and focused before its
// document commits. If that load never settles, Blanc must remove the sheet
// at the deadline instead of leaving an invisible layer over the page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sheet-deadline-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1' } });
  await waitForValue(() => app.evaluate(() => globalThis.__blanc?.startupReady()), Boolean, 'startup ready', 30000);
  const attached = (id) => app.evaluate(({ BrowserWindow }, id) =>
    BrowserWindow.getAllWindows()[0].contentView.children.some(view => view.webContents?.id === id), id);

  // Positive control: a normal open loads, attaches, and closes cleanly.
  await callTestHook(app, 'openSettings');
  const sheetId = await waitForValue(() => callTestHook(app, 'utilitySheetContentsId'), Boolean, 'sheet contents');
  await waitForValue(async () => (await app.windows()).find(p => p.url().startsWith('blanc://settings')), Boolean, 'settings loaded');
  assert.equal(await attached(sheetId), true);
  await callTestHook(app, 'closeUtilitySurface');
  assert.equal(await attached(sheetId), false);

  // Make the cached sheet's next load hang, as a stalled document would.
  await app.evaluate(({ webContents }, id) => {
    webContents.fromId(id).loadURL = () => new Promise(() => {});
  }, sheetId);
  await callTestHook(app, 'openHistorySheet');
  assert.equal(await attached(sheetId), true, 'sheet attaches immediately while loading');
  const started = Date.now();
  await waitForValue(() => attached(sheetId), v => v === false, 'stalled sheet removed', 12000);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 7000, `removed after ${elapsed} ms, before the deadline`);
  assert.equal(await callTestHook(app, 'utilitySheetContentsId'), null, 'stalled sheet discarded');

  // A fresh sheet is created on the next open and loads normally.
  await callTestHook(app, 'openSettings');
  const freshId = await waitForValue(() => callTestHook(app, 'utilitySheetContentsId'), Boolean, 'fresh sheet');
  assert.notEqual(freshId, sheetId);
  await waitForValue(async () => (await app.windows()).find(p => p.url().startsWith('blanc://settings')), Boolean, 'fresh settings loaded');
  await new Promise(resolve => setTimeout(resolve, 9000));
  assert.equal(await attached(freshId), true, 'a loaded sheet outlives the deadline');
  console.log(JSON.stringify({ ok: true, removedAfterMs: elapsed }));
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
