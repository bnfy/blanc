// A3 on the emulator: Blanc Blocker.
//   - A request EasyList blocks never reaches the network, one it doesn't still loads, and an
//     element it hides is hidden, in a normal and a private tab.
//   - Allowing ads on a site loads its ad and shows that in the menu; blocking it again stops the
//     ad; both last across a relaunch. /allow-ads and /block-ads do the same.
//   - The engine's process ending starts it again by itself, and pages stay filtered.
//   - A service worker's fetch and a prefetch are filtered like a page's own requests.
//   - The Start Page reports whether protection is on.
//   - Repeated quick endings leave pages stopped and the menu saying so; Retry recovers.
//   - A first launch with no network still blocks, from the bundled lists.
//   - A bundle with the wrong hash stops every page: nothing loads unfiltered.
// Fails closed: a missing page or state fails.
//
//   node chromium/tests/android/blocking.mjs --apk <ChromePublic.apk> --evidence <dir> [--only <case>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Device, PACKAGE, adb, clearFixtureRequests, fixtureRequests, setSwitches, sleep, startFixtures} from './acceptance/support/device.mjs';

// Whether a logged request ("host/path") went to the ad's exact host.
const isAd = request => new URL(`https://${request}`).hostname === 'ad.doubleclick.net';

// What a page's check found: problems, if any.
export function blockingProblems({requests, libLoaded, hidden}) {
  const problems = [];
  if (requests.some(r => isAd(r))) problems.push('the ad request reached the network');
  if (!requests.some(r => r.startsWith('lib.example'))) problems.push('the allowed request never left');
  if (!libLoaded) problems.push('the allowed script did not run');
  if (!hidden) problems.push('the ad element is showing');
  return problems;
}

async function pageState(d, url) {
  await d.waitForUrl(url, 30);
  await d.waitFor(async () => (await d.page('document.readyState')) === 'complete', 'the page to load', 30);
  // The ad's rule arrives with the first scan after the page's elements exist.
  sleep(2);
  return {
    requests: fixtureRequests(),
    libLoaded: await d.page('(window.loaded||[]).length>0'),
    hidden: await d.page('getComputedStyle(document.getElementById("hidden-ad")).display==="none"'),
  };
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: blocking.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  adb('install', '-r', apk);
  const stop = startFixtures();
  const d = new Device();
  const results = [];
  const only = option('--only');
  const check = async (name, body) => {
    if (only && !name.includes(only)) return;
    try { await d.reset(); results.push({case: name, problems: await body()}); } catch (error) { results.push({case: name, problems: [error.message]}); }
  };
  try {
    await check('a normal tab blocks the ad and loads the rest', async () => {
      clearFixtureRequests();
      await d.view('https://news.example/ads');
      return blockingProblems(await pageState(d, 'https://news.example/ads'));
    });
    const adLoaded = () => fixtureRequests().some(r => isAd(r));
    await check('the menu counts what it blocked', async () => {
      await d.view('https://news.example/ads');
      await pageState(d, 'https://news.example/ads');
      d.tap({id: 'blanc_island_menu'});
      const count = /\d+ ads? (&amp; trackers|or tracker) blocked on this page/;
      await d.waitFor(async () => count.test(d.dump()), 'the count in the menu', 5).catch(() => {});
      const xml = d.dump();
      d.back();
      return count.test(xml) ? [] : ['no count in the menu'];
    });
    await check('allowing ads on a site loads its ad, across a relaunch', async () => {
      await d.view('https://news.example/ads');
      await pageState(d, 'https://news.example/ads');
      clearFixtureRequests();
      d.menu('Ad & tracker blocking');
      await d.waitFor(adLoaded, 'the ad to load after allowing the site');
      // Force-stopped soon after, as Android may: the write Blanc asked for at once has had time.
      sleep(2);
      await d.relaunch();
      clearFixtureRequests();
      d.runInPalette('https://news.example/ads');
      await d.waitFor(adLoaded, 'the ad to load after a relaunch');
      d.tap({id: 'blanc_island_menu'});
      const shown = d.has({text: 'Ads allowed on this site'});
      d.back();
      return shown ? [] : ['the menu does not say ads are allowed'];
    });
    await check('/allow-ads allows a site and /block-ads blocks it again', async () => {
      await d.view('https://commands.example/ads');
      await pageState(d, 'https://commands.example/ads');
      clearFixtureRequests();
      d.runInPalette('/allow-ads');
      // Unexplained: twice in full gate runs (A4a, A4b) this missed 15 s, never alone (11 of 11).
      await d.waitFor(adLoaded, 'the ad to load after /allow-ads', 30);
      await d.waitFor(async () => (await d.page('document.readyState')) === 'complete', 'the reload');
      d.runInPalette('/block-ads');
      sleep(2);
      await d.waitFor(async () => (await d.page('document.readyState')) === 'complete', 'the reload');
      clearFixtureRequests();
      d.runInPalette('https://commands.example/ads?again');
      return blockingProblems(await pageState(d, 'https://commands.example/ads?again'));
    });
    await check('a request held while the engine comes back is still filtered', async () => {
      await d.view('https://before-kill.example/ads');
      await pageState(d, 'https://before-kill.example/ads');
      d.killSandboxed();
      clearFixtureRequests();
      await d.view('https://after-kill.example/ads');
      return blockingProblems(await pageState(d, 'https://after-kill.example/ads'));
    });
    await check('endings long after starting never stop pages', async () => {
      await d.view('https://steady.example/ads');
      await pageState(d, 'https://steady.example/ads');
      for (let i = 0; i < 5; i++) {
        // Past the crash window: an ordinary background kill.
        sleep(12);
        d.killSandboxed();
        sleep(1);
        clearFixtureRequests();
        await d.view(`https://steady${i}.example/ads`);
        const problems = blockingProblems(await pageState(d, `https://steady${i}.example/ads`));
        if (problems.length) return problems;
      }
      return [];
    });
    await check('restored tabs are filtered on a cold launch', async () => {
      for (const site of ['r1', 'r2', 'r3', 'r4']) await d.view(`https://${site}.example/ads`);
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(3);
      clearFixtureRequests();
      await d.relaunch();
      for (const site of ['r1', 'r2', 'r3']) {
        d.openGrid();
        d.tap(d.card(`${site}.example/ads`));
        await pageState(d, `https://${site}.example/ads`);
      }
      const requests = fixtureRequests();
      return [...(requests.some(r => isAd(r)) ? ['a restored tab reached the ad'] : []),
        ...(requests.some(r => r.startsWith('lib.example')) ? [] : ['no restored tab loaded'])];
    });
    await check('quick endings stop pages, and Retry recovers', async () => {
      await d.view('https://burst.example/');
      // Each ending must land after the engine is up (a few seconds) and within ten seconds of that,
      // or it isn't a crash: too soon ends nothing, too late is an ordinary background kill.
      for (let i = 0; i < 6; i++) {
        d.killSandboxed();
        sleep(1);
        // A page starts the engine, for the next ending to end.
        adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'https://burst${i}.example/'`, '-p', PACKAGE);
        sleep(6);
      }
      clearFixtureRequests();
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', "'https://stopped.example/ads'", '-p', PACKAGE);
      sleep(6);
      const problems = fixtureRequests().some(r => isAd(r)) ? ['an ad loaded while the blocker was down'] : [];
      if (!d.has({text: 'Blocking could not start.'})) problems.push('nothing on screen says why');
      d.tap({id: 'blanc_island_menu'});
      if (!d.has({text: 'Blocking could not start.'})) problems.push('the menu does not say blocking is down');
      d.tap({text: 'Retry'});
      clearFixtureRequests();
      await d.view('https://recovered.example/ads');
      return [...problems, ...blockingProblems(await pageState(d, 'https://recovered.example/ads'))];
    });
    await check('a service worker\'s fetch is filtered', async () => {
      await d.view('https://worker.example/sw');
      await d.waitFor(async () => (await d.page('window.workerUp===true')) === true, 'the worker to install', 20);
      const requests = fixtureRequests();
      return [...(requests.some(r => isAd(r)) ? ['the worker reached the ad'] : []),
        ...(requests.some(r => r.startsWith('lib.example/sw-allowed')) ? [] : ['the worker\'s allowed fetch never left'])];
    });
    await check('a prefetch is filtered', async () => {
      await d.view('https://hint.example/prefetch');
      await d.waitFor(() => fixtureRequests().some(r => r.startsWith('lib.example/prefetch-allowed')), 'the allowed prefetch', 20);
      return fixtureRequests().some(r => isAd(r)) ? ['the prefetch reached the ad'] : [];
    });
    await check('the Start Page reports whether protection is on', async () => {
      const on = await d.page('window.bowserPages.start.data().then(x=>x.mobileAdblockEnabled)');
      await d.view('https://off.example/');
      d.runInPalette('/block-ads');
      sleep(2);
      d.tap({id: 'blanc_island_new_tab'});
      await d.waitFor(async () => /^chrome:\/\/blanc\/newtab/.test((await d.visibleUrl()) || ''), 'the Start Page');
      const off = await d.page('window.bowserPages.start.data().then(x=>x.mobileAdblockEnabled)');
      return on === true && off === false ? [] : [`on ${on}, off ${off}`];
    });
    await check('a private tab blocks the ad and loads the rest', async () => {
      d.menu('New Private Tab');
      sleep(2);
      clearFixtureRequests();
      d.runInPalette('https://private.example/ads');
      return blockingProblems(await pageState(d, 'https://private.example/ads'));
    });
    await check('a first launch with no network still blocks', async () => {
      adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
      sleep(3);
      try {
        await d.reset();
        clearFixtureRequests();
        await d.view('https://offline.example/ads');
        return blockingProblems(await pageState(d, 'https://offline.example/ads'));
      } finally {
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
        sleep(3);
      }
    });
    await check('a wrong bundle stops every page', async () => {
      setSwitches('--blanc-blocker-test-bad-bundle');
      await d.reset();
      clearFixtureRequests();
      adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', "'https://tampered.example/ads'", '-p', PACKAGE);
      let told = false;
      await d.waitFor(() => {
        d.tap({id: 'blanc_island_menu'});
        told = d.has({text: 'Blocking could not start.'});
        d.back();
        return told;
      }, 'the menu to say blocking is down', 30);
      setSwitches();
      // A page's own document may be requested; the response gate refuses it, so nothing of it runs.
      const reached = fixtureRequests().filter(r => !r.startsWith('tampered.example/ads'));
      return reached.length ? [`requests left the page: ${reached.join(', ')}`] : [];
    });
  } finally {
    stop();
  }
  fs.writeFileSync(path.join(evidence, 'blocking.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  process.exit(results.some(r => r.problems.length) ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Blocking: ${error.message}`); process.exit(1); });
}
