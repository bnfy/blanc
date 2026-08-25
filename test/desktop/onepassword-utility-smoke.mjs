// Proves the platform boundary in a real Electron process: macOS can load the
// pinned SDK in one utility process, while other platforms cannot start the
// broker at all.
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
  const expected = process.platform === 'darwin'
    ? { loaded: true, processCount: 1 }
    : { available: false, loaded: false, processCount: 0 };
  assert.deepEqual(result, expected);
  console.log(
    `onepassword-utility-smoke OK on ${process.platform} ` +
    `(available=${process.platform === 'darwin'})`,
  );
} finally {
  if (electronApp) await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(`${userDataDir}-Dev`, { recursive: true, force: true });
}
