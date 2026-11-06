// A4's emulator checks: shipping sync in the sandboxed runner, against the real Worker code and a
// peer running the same bundle under Node's crypto. Fails closed: a missing answer fails.
//
//   node chromium/tests/android/sync.mjs --apk <ChromePublic.apk> --evidence <dir> [--only <text>]
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Device, PACKAGE, adb, sleep, startFixtures} from './acceptance/support/device.mjs';
import {answer, call, callNoWait, startWorker, useWorker, value} from './support/sync-device.mjs';

const {peer} = createRequire(import.meta.url)('./support/sync-peer.cjs');
const urls = list => [...list].map(item => item.url).sort();
const holds = (list, url) => new Set(urls(list)).has(url);
async function until(test, what, seconds = 30) {
  for (let waited = 0; waited < seconds; waited++) {
    if (await test()) return;
    await new Promise(done => setTimeout(done, 1000));
  }
  throw Error(`waiting for ${what}`);
}
const sandboxed = () => adb('shell', 'ps', '-A', '-o', 'PID,NAME').split('\n').filter(l => /sandboxed_process/.test(l)).map(l => l.trim().split(/\s+/)[0]);
const FIRST = 'https://example.org/first', PHONE = 'https://example.org/phone';

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence'), only = option('--only');
  if (!apk || !evidence) throw Error('Usage: sync.mjs --apk <path> --evidence <dir> [--only <text>]');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  const stopFixtures = startFixtures();
  // Each check gets its own: the Worker's limits would otherwise carry from one to the next.
  let worker = await startWorker();
  const d = new Device();
  const results = [], measures = {};
  const check = async (name, body, extra = '') => {
    if (only && !name.includes(only)) return;
    try {
      worker.stop();
      worker = await startWorker();
      useWorker(worker, extra);
      adb('logcat', '-c');
      await d.reset();
      results.push({case: name, problems: (await body()) ?? []});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
    const last = results.at(-1);
    console.log(`${last.problems.length ? 'FAIL' : 'pass'} ${last.case}${last.problems.length ? ': ' + last.problems.join('; ') : ''}`);
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
      return holds(list, FIRST) ? [] : [JSON.stringify(list)];
    });

    await check('the phone joins with a code a peer shows', async () => {
      const device = await startedPeer('Shows');
      const {code} = await device.sync.beginPairing();
      const joined = await value('sync.joinWithCode', [code]);
      if (!joined.ok) return [JSON.stringify(joined)];
      const list = await value('bookmarks.listBookmarks');
      return holds(list, FIRST) ? [] : [JSON.stringify(list)];
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
      return holds(list, PHONE) ? [] : [JSON.stringify(list)];
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
      if (!holds(list, PHONE)) return [`after the kill: ${JSON.stringify(list)}`];
      await value('sync.resetRequestWindowForTest');
      const synced = await value('sync.syncNow', [], 120);
      await device.pass();
      const kept = urls(device.module('bookmarks').listBookmarks());
      return new Set(kept).has(PHONE) ? [] : [`ended ${JSON.stringify(ended)}, synced ${JSON.stringify(synced)}, peer has ${kept.join()}`];
    });

    await check('a Favorite saved as the runner dies is neither lost nor deleted', async () => {
      const device = await startedPeer('Dies');
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      await until(async () => holds(await value('test.favorites'), FIRST), 'the Favorite in Chromium');
      await d.view('https://dying.example/');
      d.menu('Save to Favorites');
      d.killSandboxed();
      await until(async () => holds(await value('bookmarks.listBookmarks'), 'https://dying.example/'), 'the runner to get it again');
      return holds(await value('test.favorites'), 'https://dying.example/') ? [] : ['deleted from Chromium'];
    });

    await check('a lost Keystore key turns Sync off and asks for a code', async () => {
      const device = await startedPeer('Keeps');
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      await value('test.loseKey');
      await d.relaunch();
      sleep(4);
      d.runInPalette('/sync');
      await d.waitFor(async () => d.dump().includes('Pairing or recovery code'), 'the code field', 20);
      const status = await value('sync.status');
      // A new device reads the account from the Worker, so this proves nothing there was wiped.
      device.sync.resetRequestWindowForTest();
      const fresh = peer('Fresh', worker.url);
      const pairing = await device.sync.beginPairing();
      await fresh.sync.joinWithCode(pairing.code);
      await fresh.pass();
      const kept = urls(fresh.module('bookmarks').listBookmarks());
      return status.enabled === false && new Set(kept).has(FIRST) ? [] : [JSON.stringify(status), kept.join()];
    });

    await check('a peer\'s Favorite and theme arrive, and a Favorite saved here reaches it', async () => {
      const device = await startedPeer('Profile');
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      await until(async () => holds(await value('test.favorites'), FIRST), 'the Favorite in Chromium');
      device.module('settings').setSettings({theme: 'dark'});
      await device.pass();
      await value('sync.resetRequestWindowForTest');
      await value('sync.syncNow', [], 120);
      await until(async () => adb('shell', 'run-as', PACKAGE, 'cat', `shared_prefs/${PACKAGE}_preferences.xml`).includes('name="ui_theme_setting" value="2"'), 'the theme');
      await d.view('https://saved.example/');
      d.menu('Save to Favorites');
      await until(async () => holds(await value('bookmarks.listBookmarks'), 'https://saved.example/'), 'the runner to hear');
      await value('sync.resetRequestWindowForTest');
      await value('sync.syncNow', [], 120);
      await device.pass();
      const kept = urls(device.module('bookmarks').listBookmarks());
      return new Set(kept).has('https://saved.example/') ? [] : [kept.join()];
    });

    await check('a setting a newer desktop added survives a phone edit and a restart', async () => {
      const device = await startedPeer('Newer');
      const settings = device.module('settings');
      const exportSettings = settings.exportForSync;
      settings.exportForSync = () => {
        const out = exportSettings();
        out.values.futureSetting = 'kept';
        out.meta.futureSetting = Date.now();
        return out;
      };
      settings.setSettings({theme: 'light'});
      await device.pass();
      device.sync.resetRequestWindowForTest();
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      await value('settings.setSettings', [{theme: 'dark'}]);
      await value('sync.resetRequestWindowForTest');
      await value('sync.syncNow', [], 120);
      await d.relaunch();
      const exported = await value('settings.exportForSync');
      return exported.values.futureSetting === 'kept' && exported.values.theme === 'dark' ? [] : [JSON.stringify(exported).slice(0, 300)];
    });

    // A peer and the phone on one account, ready to pass as often as a check needs.
    const paired = async name => {
      const device = await startedPeer(name);
      const {code} = await device.sync.beginPairing();
      await value('sync.joinWithCode', [code]);
      return device;
    };
    const phonePass = async () => {
      await value('sync.resetRequestWindowForTest');
      await value('sync.syncNow', [], 120);
    };
    const peerTabs = device => {
      const list = [...device.sync.listRemoteDevices()].flatMap(entry => [...entry.tabs]);
      return new Set(list.map(tab => tab.url));
    };

    await check('sharing is off until asked, then open tabs reach a peer and private ones never', async () => {
      const device = await paired('Tabs');
      await d.view('https://shared.example/');
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(2);
      await d.launch();
      await phonePass();
      await device.pass();
      if (peerTabs(device).has('https://shared.example/')) return ['shared before asked'];
      await value('sync.setSyncTabs', [true]);
      d.menu('New Private Tab');
      sleep(2);
      d.runInPalette('https://shared2.example/');
      await d.waitForUrl('https://shared2.example/', 20);
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(2);
      await d.launch();
      await phonePass();
      await device.pass();
      const seen = peerTabs(device);
      if (!seen.has('https://shared.example/')) return [`missing: ${[...seen].join()}`];
      if (seen.has('https://shared2.example/')) return ['a private tab reached the peer'];
      await value('sync.setSyncTabs', [false]);
      await phonePass();
      await device.pass();
      return peerTabs(device).has('https://shared.example/') ? ['still shared after turning it off'] : [];
    });

    await check('a sent page waits in the palette, opens in a tab and goes', async () => {
      const device = await paired('Sender');
      await device.pass();
      const targets = [...device.sync.listSendTargets()];
      if (!targets.length) return ['no target on the peer'];
      device.sync.resetRequestWindowForTest();
      const sent = await device.sync.sendTab({url: 'https://sent.example/', title: 'Sent page', to: targets[0].id});
      if (sent.status !== 'sent') return [JSON.stringify(sent)];
      // The Worker allows an account 30 reads a minute; these passes are far faster than a phone's.
      sleep(61);
      await phonePass();
      await until(async () => [...await value('sync.listSentToThisDevice')].length === 1, 'the page to arrive');
      d.tap({id: 'blanc_island_domain'});
      await d.waitFor(async () => d.dump().includes('Sent page'), 'the sent row', 15);
      d.tap({text: 'Sent page'});
      await d.waitForUrl('https://sent.example/', 20);
      await until(async () => [...await value('sync.listSentToThisDevice')].length === 0, 'the page to go');
      return [];
    });

    await check('a sent page reaches an open Start Page and dismisses there', async () => {
      const device = await paired('Start');
      await device.pass();
      const [target] = [...device.sync.listSendTargets()];
      device.sync.resetRequestWindowForTest();
      await device.sync.sendTab({url: 'https://onstart.example/', title: 'On the Start Page', to: target.id});
      sleep(61);
      await phonePass();
      // The list belongs to the Ledger layout, so on Billboard it's filled but out of sight.
      const shown = async () => d.page(`document.getElementById('sentList').textContent.includes('On the Start Page')`);
      await until(shown, 'the row on the Start Page');
      await d.page(`document.querySelector('.sent-dismiss').click()`);
      await until(async () => [...await value('sync.listSentToThisDevice')].length === 0, 'the dismissal');
      return [];
    });

    await check('/send sends the current page to the named device', async () => {
      const device = await paired('Receiver');
      await phonePass();
      await device.pass();
      await phonePass();
      await d.view('https://tosend.example/');
      await until(async () => [...await value('sync.listSendTargets')].length > 0, 'a target');
      d.runInPalette('/send Receiver');
      sleep(3);
      device.sync.resetRequestWindowForTest();
      await device.pass();
      const inbox = [...device.sync.listSentToThisDevice()];
      return inbox.some(item => item.url === 'https://tosend.example/') ? [] : [JSON.stringify(inbox)];
    });

    await check('a background run with no window keeps this phone\'s tabs and brings Favorites', async () => {
      const device = await paired('Background');
      await d.view('https://kept.example/');
      await value('sync.setSyncTabs', [true]);
      await d.relaunch();
      sleep(61);
      await phonePass();
      await device.pass();
      if (!peerTabs(device).has('https://kept.example/')) return ['the tab never reached the peer'];
      device.module('bookmarks').saveFavorite('https://later.example/', 'Later');
      sleep(61);
      device.sync.resetRequestWindowForTest();
      await device.pass();
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(2);
      adb('shell', 'am', 'kill', PACKAGE);
      sleep(2);
      // pidof exits non-zero when nothing runs, which is what this check needs.
      let running = true;
      try { adb('shell', 'pidof', PACKAGE); } catch { running = false; }
      if (running) return ['Blanc is still running'];
      sleep(61);
      adb('shell', 'cmd', 'jobscheduler', 'run', '-f', PACKAGE, '120');
      sleep(20);
      device.sync.resetRequestWindowForTest();
      await device.pass();
      if (!peerTabs(device).has('https://kept.example/')) return ['the run wiped this phone\'s tabs'];
      // Before any window opens, so only the background run can have brought it.
      if (!adb('shell', 'run-as', PACKAGE, 'cat', 'app_chrome/blanc_sync/bookmarks.json').includes('later.example')) return ['the job brought nothing'];
      await d.launch();
      await until(async () => holds(await value('test.favorites'), 'https://later.example/'), 'the Favorite');
      return [];
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
  console.log(`Sync: ${JSON.stringify(measures)}`);
  if (!results.length || results.some(r => r.problems.length)) process.exitCode = 1;
  process.exit();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Sync: ${error.message}`); process.exit(1); });
}
