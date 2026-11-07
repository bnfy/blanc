// A4d's emulator checks: Shared Spaces between this phone and another device running the same
// bundle, over the real Worker code. Fails closed: a missing control or state fails.
//
//   node chromium/tests/android/shared-spaces.mjs --apk <ChromePublic.apk> --evidence <dir> [--only <text>]
import fs from 'node:fs';
import path from 'node:path';
import {Device, adb, fixtureRequests, sleep, startFixtures} from './acceptance/support/device.mjs';
import {startWorker, useWorker, value} from './support/sync-device.mjs';
import {Phone} from './support/spaces-phone.mjs';

const url = name => `https://${name}.example/`;
const titles = state => state.tabs.filter(t => !t.private).map(t => t.title);
async function until(test, what, seconds = 30) {
  for (let waited = 0; waited < seconds; waited++) {
    if (await test()) return;
    await new Promise(done => setTimeout(done, 1000));
  }
  throw Error(`waiting for ${what}`);
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence'), only = option('--only');
  if (!apk || !evidence) throw Error('Usage: shared-spaces.mjs --apk <path> --evidence <dir> [--only <text>]');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  const stopFixtures = startFixtures();
  let worker = await startWorker();
  const d = new Device();
  const results = [];
  const check = async (name, body) => {
    if (only && !name.includes(only)) return;
    try {
      worker.stop();
      worker = await startWorker();
      useWorker(worker, '');
      adb('logcat', '-c');
      await d.reset();
      results.push({case: name, problems: (await body()) ?? []});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
    const last = results.at(-1);
    console.log(`${last.problems.length ? 'FAIL' : 'pass'} ${last.case}${last.problems.length ? ': ' + last.problems.join('; ') : ''}`);
  };
  // The Worker allows an account 30 reads a minute; these passes are far faster than a phone's.
  const wait = () => sleep(61);
  const phonePass = async () => {
    await value('sync.resetRequestWindowForTest');
    await value('sync.syncNow', [], 240);
  };
  const paired = async () => {
    const other = new Phone('Desk', worker.url);
    if (!(await other.device.sync.startNew({handle: 'spaces'})).ok) throw Error('peer account');
    const {code} = await other.device.sync.beginPairing();
    await value('sync.joinWithCode', [code]);
    return other;
  };
  const create = name => {
    d.runInPalette(`/space ${name}`);
    sleep(1);
    d.tap({text: 'Create space'});
    sleep(2);
  };
  // Through the Sync sheet: the switch, then the sheet's Turn on with Work ticked.
  const turnOn = async () => {
    d.runInPalette('/sync');
    await d.waitFor(async () => d.dump().includes('Keep Spaces and groups in sync on this phone'), 'the switch', 15);
    d.tap({text: 'Keep Spaces and groups in sync on this phone'});
    await d.waitFor(async () => d.dump().includes('Choose Spaces to sync'), 'the sheet', 15);
    d.tap({text: 'Turn on'});
    await until(async () => (await value('spaces.status')).enabled === true, 'the switch to turn on');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    sleep(2);
  };
  // This phone shares Work, holding two pages; the other device turns the switch on and shows it.
  const sharedWork = async () => {
    const other = await paired();
    create('Work');
    await d.view(url('one'));
    await d.view(url('two'));
    await d.waitForUrl(url('two'));
    await turnOn();
    await phonePass();
    await other.push();
    if (!(await other.call('spaces.apply', {enabled: true, selections: []})).ok) throw Error('peer switch');
    await other.pass();
    const row = other.rows.find(item => item.name === 'Work');
    if (!row) throw Error(`no Work on the peer: ${JSON.stringify(other.rows.map(item => item.name))}`);
    other.shownId = row.id;
    other.tabs = row.urls.map((address, index) => ({local: `p${index}`, shared: row.tabIds[index], url: address, title: ''}));
    await other.push();
    return {other, row};
  };

  try {
    await check('a Space shared here reaches the other device with its tabs', async () => {
      const {row} = await sharedWork();
      return row.urls.includes(url('two')) ? [] : [`peer holds ${row.urls}`];
    });

    await check('a tab added elsewhere arrives quietly, and a close elsewhere lands in Recently closed', async () => {
      const {other} = await sharedWork();
      other.tabs.push({local: 'added', url: url('three'), title: 'Three'});
      await other.push();
      wait();
      await other.pass();
      wait();
      await phonePass();
      await until(() => titles(d.grid()).includes('Three'), 'the new tab in the grid');
      const asked = fixtureRequests().filter(address => address.includes('three.example'));
      if (asked.length) return [`the new tab loaded: ${asked}`];
      other.tabs = other.tabs.filter(tab => tab.local !== 'added');
      await other.push();
      wait();
      await other.pass();
      wait();
      await phonePass();
      await until(() => !titles(d.grid()).includes('Three'), 'the tab to close');
      d.tap({id: 'blanc_island_domain'});
      await d.waitFor(async () => d.dump().includes('Recently closed'), 'the band', 15);
      d.tap({text: 'Recently closed  1'});
      await d.waitFor(async () => d.dump().includes('Closed on Desk'), 'who closed it', 15);
      return [];
    });

    await check('the tab on screen keeps its page when another device closes it', async () => {
      const {other} = await sharedWork();
      other.tabs = other.tabs.filter(tab => tab.url !== url('two'));
      await other.push();
      wait();
      await other.pass();
      wait();
      await phonePass();
      sleep(3);
      await d.waitForUrl(url('two'), 5);
      return [];
    });

    await check('a tab closed here closes elsewhere, and a restart changes nothing', async () => {
      const {other} = await sharedWork();
      d.runInPalette('/close');
      sleep(6);
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(2);
      await d.launch();
      await phonePass();
      wait();
      await other.pass();
      if (other.tabs.some(tab => tab.url === url('two'))) return ['still open on the peer'];
      await d.relaunch();
      sleep(3);
      await phonePass();
      wait();
      await other.pass();
      return other.tabs.filter(tab => tab.url === url('one')).length === 1 ? [] : [`peer holds ${other.tabs.map(tab => tab.url)}`];
    });

    await check('switching away and back keeps a shared Space and closes nothing elsewhere', async () => {
      const {other} = await sharedWork();
      d.runInPalette('/space This phone');
      sleep(3);
      await phonePass();
      wait();
      await other.pass();
      if (other.tabs.length !== 2) return [`peer holds ${other.tabs.map(tab => tab.url)} after leaving`];
      d.runInPalette('/space Work');
      sleep(3);
      await phonePass();
      wait();
      await other.pass();
      return other.tabs.length === 2 ? [] : [`peer holds ${other.tabs.map(tab => tab.url)} after coming back`];
    });

  } finally {
    worker.stop();
    stopFixtures();
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(item => item.problems.length);
  console.log(`Shared Spaces: ${results.length - failed.length} of ${results.length}`);
  process.exit(failed.length || !results.length ? 1 : 0);
}

main(process.argv.slice(2)).catch(error => { console.error(error); process.exit(1); });
