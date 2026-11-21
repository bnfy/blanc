// Reaching the runner on the emulator: a broadcast calls it (SyncTestDriver) and logcat has the
// answer. Plus the real Worker, for the phone and its peers.
import {Worker} from 'node:worker_threads';
import {adb, PACKAGE, setSwitches} from '../acceptance/support/device.mjs';

let nextCall = 1;
// What each call asked for, so a call with no answer names its method.
const methods = new Map();
const pause = ms => new Promise(done => setTimeout(done, ms));

export function callNoWait(method, args = []) {
  const id = String(nextCall++);
  methods.set(id, method);
  adb('shell', 'am', 'broadcast', '-p', PACKAGE, '-a', 'me.bnfy.blanc.SYNC_TEST', '--es', 'id', id,
    '--es', 'method', method, '--es', 'args', `'${JSON.stringify(args).replace(/'/g, `'\\''`)}'`);
  return id;
}

export async function answer(id, seconds = 90) {
  const pattern = new RegExp(`result ${id} (.*)$`, 'm');
  for (let waited = 0; waited < seconds * 4; waited++) {
    const match = pattern.exec(adb('logcat', '-d', '-s', 'cr_BlancSync:W'));
    if (match) return JSON.parse(match[1]);
    await pause(250);
  }
  throw Error(`no answer to call ${id} (${methods.get(id) ?? 'unknown'}) in ${seconds} s`);
}

export const call = async (method, args = [], seconds) => answer(callNoWait(method, args), seconds);

// A call that must succeed; its value.
export async function value(method, args = [], seconds) {
  const result = await call(method, args, seconds);
  if (!result.ok) throw Error(`${method}: ${result.error}`);
  return result.value;
}

export async function startWorker() {
  const thread = new Worker(new URL('./sync-worker-thread.cjs', import.meta.url));
  const url = await new Promise((resolve, reject) => {
    thread.once('message', message => resolve(message.url));
    thread.once('error', reject);
  });
  const port = new URL(url).port;
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  return {url, switches: `--blanc-sync-test --blanc-sync-endpoint=http://127.0.0.1:${port}`,
    stop() { thread.terminate(); adb('reverse', '--remove', `tcp:${port}`); }};
}

export const useWorker = (worker, extra = '') => setSwitches(`${worker.switches} ${extra}`);
