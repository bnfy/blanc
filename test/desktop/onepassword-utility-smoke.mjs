// Proves the real Electron utility process can load the pinned 1Password SDK.
// Unit tests keep matching and RPC policy deterministic, while this catches
// Electron/Node/WASM packaging incompatibilities that a mocked broker cannot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';

const { callTestHook } = testHookCall;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-onepassword-utility-'));
let electronApp;

try {
  electronApp = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, BLANC_TEST: '1' },
  });
  await electronApp.firstWindow();
  const result = await callTestHook(electronApp, 'probeOnePasswordUtilityProcess');
  assert.deepEqual(result, { loaded: true, processCount: 1 });
  console.log(`onepassword-utility-smoke OK on ${process.platform}`);
} finally {
  if (electronApp) await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(`${userDataDir}-Dev`, { recursive: true, force: true });
}
