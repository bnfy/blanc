// A4's emulator checks: shipping sync in the sandboxed runner, against the real Worker code and a
// peer running the same bundle under Node's crypto. Fails closed: a missing answer fails.
//
//   node chromium/tests/android/sync.mjs --apk <ChromePublic.apk> --evidence <dir> [--only <text>]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Device, adb, sleep, startFixtures} from './acceptance/support/device.mjs';
import {answer, call, callNoWait, startWorker, useWorker, value} from './support/sync-device.mjs';

const {peer} = createRequire(import.meta.url)('./support/sync-peer.cjs');
const urls = list => [...list].map(item => item.url).sort();
const sandboxed = () => adb('shell', 'ps', '-A', '-o', 'PID,NAME').split('\n').filter(l => /sandboxed_process/.test(l)).map(l => l.trim().split(/\s+/)[0]);
const FIRST = 'https://example.org/first', PHONE = 'https://example.org/phone';

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence'), only = option('--only');
  if (!apk || !evidence) throw Error('Usage: sync.mjs --apk <path> --evidence <dir> [--only <text>]');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  const stopFixtures = startFixtures();
  const worker = await startWorker();
  const d = new Device();
  const results = [], measures = {};
  const check = async (name, body, extra = '') => {
    if (only && !name.includes(only)) return;
    try {
      useWorker(worker, extra);
      adb('logcat', '-c');
      await d.reset();
      results.push({case: name, problems: (await body()) ?? []});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
  };
  // A peer with an account the phone can join, holding one Favorite.
  const startedPeer = async name => {
    const device = peer(name, worker.url);
    if (!(await device.sync.startNew({handle: 'tester'})).ok) throw Error('peer account');
    device.module('bookmarks').saveFavorite(FIRST, 'First');
    await device.pass();
    device.sync.resetRequestWindowForTest();
    return device;
  };
  try {
    await check('a passphrase on the phone reaches the same account as on a peer', async () => {
      const device = peer('Passphrase', worker.url);
      const account = {handle: 'same-account', passphrase: 'correct horse battery staple'};
      if (!(await device.sync.enable(account)).ok) return ['peer enable'];
      device.module('bookmarks').saveFavorite(FIRST, 'First');
      await device.pass();
      const before = sandboxed();
      const started = Date.now();
      const enabled = await value('sync.enable', [account]);
      measures.enableMs = Date.now() - started;
      const runner = sandboxed().find(pid => !before.includes(pid));
      if (runner) measures.runnerPssKb = Number(/TOTAL PSS:\s*(\d+)/.exec(adb('shell', 'dumpsys', 'meminfo', runner))?.[1]);
      if (!enabled.ok) return [JSON.stringify(enabled)];
      const list = await value('bookmarks.listBookmarks');
      return urls(list).includes(FIRST) ? [] : [JSON.stringify(list)];
    });

    await check('the phone joins with a code a peer shows', async () => {
      const device = await startedPeer('Shows');
      const {code} = await device.sync.beginPairing();
      const joined = await value('sync.joinWithCode', [code]);
      if (!joined.ok) return [JSON.stringify(joined)];
      const list = await value('bookmarks.listBookmarks');
      return urls(list).includes(FIRST) ? [] : [JSON.stringify(list)];
    });

    await check('a peer joins with a code the phone shows and gets its Favorite', async () => {
      await value('sync.startNew', [{handle: 'tester'}]);
      await value('bookmarks.saveFavorite', [PHONE, 'Phone']);
      await value('sync.resetRequestWindowForTest');
      await value('sync.syncNow', [], 120);
      await value('sync.resetRequestWindowForTest');
      const {code} = await value('sync.beginPairing', [], 120);
      const device = peer('Joins', worker.url);
      if (!(await device.sync.joinWithCode(code)).ok) return ['peer join'];
      await device.pass();
      const list = device.module('bookmarks').listBookmarks();
      return urls(list).includes(PHONE) ? [] : [JSON.stringify(list)];
    });

    await check('a killed runner answers, restarts and keeps what it saved', async () => {
      const device = await startedPeer('Killed');
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      await value('bookmarks.saveFavorite', [PHONE, 'Phone']);
      sleep(11);
      const id = callNoWait('sync.syncNow');
      d.killSandboxed();
      const ended = await answer(id);
      const list = await value('bookmarks.listBookmarks');
      if (!urls(list).includes(PHONE)) return [`after the kill: ${JSON.stringify(list)}`];
      await value('sync.resetRequestWindowForTest');
      const synced = await value('sync.syncNow', [], 120);
      await device.pass();
      const seen = urls(device.module('bookmarks').listBookmarks()).filter(url => url === PHONE);
      return seen.length === 1 ? [] : [`ended ${JSON.stringify(ended)}, synced ${JSON.stringify(synced)}, peer has ${seen.length}`];
    });

    await check('three early endings stop the runner, and it says so', async () => {
      for (let i = 0; i < 3; i++) {
        await value('sync.status');
        d.killSandboxed();
        sleep(1);
      }
      const result = await call('sync.status');
      return result.ok === false && result.error === 'unavailable' ? [] : [JSON.stringify(result)];
    });

    await check('a wrong bundle never runs', async () => {
      const result = await call('sync.status');
      return result.ok === false ? [] : [JSON.stringify(result)];
    }, '--blanc-sync-test-bad-bundle');
  } finally {
    worker.stop();
    stopFixtures();
  }
  fs.writeFileSync(path.join(evidence, 'sync.json'), JSON.stringify({results, measures, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  console.log(`Sync: ${JSON.stringify(measures)}`);
  if (!results.length || results.some(r => r.problems.length)) process.exitCode = 1;
  process.exit();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Sync: ${error.message}`); process.exit(1); });
}
