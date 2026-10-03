// Drive the installed suite's final native Quit action without a test IPC hook.
// Only the disposable bundle already selected by the installed test is targeted.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
assert.equal(process.platform, 'darwin');
const executable = path.resolve(process.env.BLANC_PACKAGED_EXECUTABLE);
const bundle = path.resolve(path.dirname(executable), '../..');
assert(bundle.endsWith('.app') && executable.startsWith(bundle + '/Contents/MacOS/'));
const suite = fileURLToPath(new URL('../packaged-ublock-acceptance.mjs', import.meta.url));
const child = spawn(process.execPath, [suite], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
let pending = '';
let quitSent = false;
child.stdout.on('data', data => {
  process.stdout.write(data);
  pending = (pending + data.toString()).slice(-4096);
  if (!quitSent && pending.includes('READY_FOR_NATIVE_QUIT')) {
    quitSent = true;
    try { execFileSync('/usr/bin/osascript', ['-e', `tell application ${JSON.stringify(bundle)} to quit`], { timeout: 10000, stdio: 'inherit' }); }
    catch (error) { console.error('Native Quit failed:', error.message); }
  }
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code === 0 && quitSent ? 0 : 1; });
