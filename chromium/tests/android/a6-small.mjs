// A6 rulings H1, S1 and SH1 on the emulator (patches 0127–0129):
//   - An HTTP basic challenge shows no "Sign in" dialog; the 401 reaches the page.
//   - A certificate warning never offers Google's enhanced protection.
//   - Plain words shared into Blanc search with Blanc's engine (DuckDuckGo by default).
// Fails closed: a missing page or an unexpected dialog fails.
//
//   node chromium/tests/android/a6-small.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {nodeBounds} from './island-menu.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: a6-small.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const open = url => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', PACKAGE); sleep(9); };
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(8);

  open('https://httpbin.org/basic-auth/user/pass');
  let xml = dump(); shot('http-auth');
  check('an HTTP sign-in shows no dialog', /requires a username and password/.test(xml) ? ['the Sign in dialog showed']
    : /HTTP ERROR 401/.test(xml) ? [] : ['no 401 page']);

  open('https://expired.badssl.com/');
  xml = dump(); shot('certificate');
  check('the certificate warning offers no enhanced protection', !/Your connection is not private/.test(xml) ? ['no warning']
    : /enhanced protection|highest level of security/.test(xml) ? ['the enhanced protection line showed'] : []);

  // One argument for the device shell, so the words stay one extra.
  adb('shell', `am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT 'blanc gate words' -p ${PACKAGE}`);
  sleep(9);
  xml = dump(); shot('shared-words');
  const domain = nodeBounds(xml, {id: 'blanc_island_domain'});
  const shown = /resource-id="[^"]*blanc_island_domain"[^>]*text="([^"]*)"|text="([^"]*)"[^>]*resource-id="[^"]*blanc_island_domain"/.exec(xml);
  const host = shown ? (shown[1] || shown[2]) : '';
  check('shared words search with Blanc\'s engine', !domain ? ['no Island'] : /^(www\.)?duckduckgo\.com$/.test(host) ? [] : [`the Island shows "${host}"`]);

  fs.writeFileSync(path.join(evidence, 'a6-small.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

main(process.argv.slice(2));
