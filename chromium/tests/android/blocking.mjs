// A3 on the emulator: Blanc Blocker. A page's request EasyList blocks never reaches the network,
// one it doesn't still loads, and an element it hides is hidden, in a normal and a private tab.
// Fails closed: a missing page or state fails.
//
//   node chromium/tests/android/blocking.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Device, adb, fixtureRequests, sleep, startFixtures} from './acceptance/support/device.mjs';

// What a page's check found: problems, if any.
export function blockingProblems({requests, libLoaded, hidden}) {
  const problems = [];
  if (requests.some(r => r.startsWith('ad.doubleclick.net'))) problems.push('the ad request reached the network');
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
    requests: [...fixtureRequests],
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
  const check = async (name, body) => {
    try { results.push({case: name, problems: await body()}); } catch (error) { results.push({case: name, problems: [error.message]}); }
  };
  try {
    await d.reset();
    await check('a normal tab blocks the ad and loads the rest', async () => {
      fixtureRequests.length = 0;
      await d.view('https://news.example/ads');
      return blockingProblems(await pageState(d, 'https://news.example/ads'));
    });
    await check('a private tab blocks the ad and loads the rest', async () => {
      d.menu('New Private Tab');
      sleep(2);
      fixtureRequests.length = 0;
      d.runInPalette('https://private.example/ads');
      return blockingProblems(await pageState(d, 'https://private.example/ads'));
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
