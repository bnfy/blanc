// A page's first request can reach the browser before it has processed the commit. Loads a page
// whose first bytes ask for a blocked script, over and over, and fails if the menu ever misses it.
// Before the fix about 1 load in 30 lost its count.
//
//   node chromium/tests/android/shield-race.mjs --apk <ChromePublic.apk> [--rounds <n>]
import {Device, adb, sleep, startFixtures} from './acceptance/support/device.mjs';

const COUNT = /\d+ ads? (&amp; trackers|or tracker) blocked on this page/;

const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const apk = option('--apk'), rounds = Number(option('--rounds') ?? 40);
if (!apk) throw Error('Usage: shield-race.mjs --apk <path> [--rounds <n>]');
adb('install', '-r', apk);
const stop = startFixtures();
const d = new Device();
let missed = 0;
try {
  await d.reset();
  for (let i = 0; i < rounds; i++) {
    // A new host each time, and one host again and again, which can reuse the frame.
    await d.view(i % 2 ? `https://race.example/first-ad?${i}` : `https://race${i}.example/first-ad`);
    await d.waitFor(async () => (await d.page('document.readyState')) === 'complete', 'the page to load', 30);
    sleep(1);
    d.tap({id: 'blanc_island_menu'});
    let xml = d.dump();
    for (let j = 0; j < 10 && !xml.includes('Ad &amp; tracker blocking'); j++) {
      sleep(0.5);
      xml = d.dump();
    }
    d.back();
    if (!COUNT.test(xml)) {
      missed++;
      console.log(`FAIL load ${i} lost its count`);
    }
  }
  // A page back from the back-forward cache keeps counting.
  d.runInPalette('https://race.example/first-ad?cached');
  await d.waitForUrl('https://race.example/first-ad?cached');
  d.runInPalette('https://elsewhere.example/');
  await d.waitForUrl('https://elsewhere.example/');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await d.waitForUrl('https://race.example/first-ad?cached');
  sleep(2);
  const restored = await d.page('document.title');
  d.tap({id: 'blanc_island_menu'});
  sleep(1);
  const xml = d.dump();
  d.back();
  if (restored !== 'restored') {
    missed++;
    console.log('FAIL the page did not come from the back-forward cache');
  } else if (!COUNT.test(xml)) {
    missed++;
    console.log('FAIL a page back from the cache lost its count');
  }
} finally {
  stop();
}
console.log(`${missed} of ${rounds} loads lost their count`);
process.exit(missed ? 1 : 0);
