// A5c on the emulator: the launch ping, against a loopback collector (a debuggable build started with
// --blanc-test-ping-host sends only there, with --blanc-test-ping-version), with Chromium's own
// NetLog on, so the outbound gate's view is checked both ways:
//   - A fresh install whose walkthrough closes on Welcome sends nothing, at launch or the next one,
//     and the NetLog has no request to the collector.
//   - Measure usage turned on in Settings sends one ping at once, in desktop's shape for Android, and
//     the NetLog shows it (the positive control: the gate would have seen one).
//   - The next launch sends one more, same install id, new session id; with Measure usage off, none.
//   - A fresh install that says yes on the walkthrough's privacy step sends in that launch.
// Fails closed.
//
//   node chromium/tests/android/launch-ping.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawn} from 'node:child_process';

const PACKAGE = 'me.bnfy.blanc.dev';
const SETTINGS = `${PACKAGE}/org.chromium.chrome.browser.settings.SettingsActivity`;
const COMMAND_LINE = '/data/local/tmp/chrome-command-line';
const SKIP_FILE = '/data/local/tmp/blanc-walkthrough-off';
const DEVICE_NETLOG = `/data/data/${PACKAGE}/cache/blanc-ping-netlog.json`;
const PORT = 8471;
const VERSION = '0.1.0-test';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const bounds = (xml, text) => {
  const escaped = text.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<node[^>]*text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
};

// The collector: a child process, so adb calls here never stall it. Each request is a JSON line.
function startCollector(log) {
  const source = `
    const http = require('node:http'), fs = require('node:fs');
    http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({method: req.method, url: req.url,
          type: req.headers['content-type'] || '', cookie: req.headers.cookie || '', body, at: Date.now()}) + '\\n');
        res.writeHead(204); res.end();
      });
    }).listen(${PORT}, '127.0.0.1');`;
  return spawn(process.execPath, ['-e', source], {stdio: 'ignore'});
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: launch-ping.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { try { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); } catch { return ''; } };
  const tapAt = b => { adb('shell', 'input', 'tap', String(Math.round((b.left + b.right) / 2)), String(Math.round((b.top + b.bottom) / 2))); sleep(1.5); };
  const waitFor = (text, seconds = 12) => { for (let i = 0; i < seconds; i++) { const xml = dump(); if (bounds(xml, text)) return xml; sleep(1); } return null; };
  const tapText = text => { const xml = waitFor(text); if (!xml) return false; tapAt(bounds(xml, text)); return true; };
  const size = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  const scroll = () => { adb('shell', 'input', 'swipe', String(size[1] / 2), String(size[2] * 0.75), String(size[1] / 2), String(size[2] * 0.3), '300'); sleep(0.8); };
  const tapRow = text => { for (let i = 0; i < 10; i++) { const xml = dump(); if (bounds(xml, text)) { tapAt(bounds(xml, text)); return true; } scroll(); } return false; };
  const launch = () => { adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(7); };
  const stop = () => { adb('shell', 'input', 'keyevent', 'HOME'); sleep(1.5); adb('shell', 'am', 'force-stop', PACKAGE); sleep(1); };
  const netlog = () => { try { return adb('shell', 'cat', DEVICE_NETLOG); } catch { return ''; } };
  const sawCollector = text => text.includes(`127.0.0.1:${PORT}/ping`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ping-'));
  const log = path.join(dir, 'requests.jsonl');
  fs.writeFileSync(log, '');
  const requests = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const results = [];
  const check = (name, problems) => { results.push({case: name, problems}); console.log(`${problems.length ? 'FAIL' : 'pass'} ${name}${problems.length ? ': ' + problems.join('; ') : ''}`); };
  const bodyProblems = (request, installId) => {
    const problems = [];
    let body;
    try { body = JSON.parse(request.body); } catch { return ['the body is not JSON']; }
    const keys = Object.keys(body).sort().join(',');
    if (keys !== 'arch,device,installId,osVersion,platform,sessionId,version') problems.push(`fields ${keys}`);
    if (request.method !== 'POST' || request.url !== '/ping') problems.push(`${request.method} ${request.url}`);
    if (!request.type.startsWith('application/json')) problems.push(`content type ${request.type}`);
    if (request.cookie) problems.push('sent a cookie');
    if (body.platform !== 'android' || body.arch !== 'x64' || body.version !== VERSION || body.device !== 'phone') {
      problems.push(`${body.platform} ${body.arch} ${body.version} ${body.device}`);
    }
    if (!/^\d{1,4}$/.test(body.osVersion)) problems.push(`osVersion ${body.osVersion}`);
    if (!UUID.test(body.installId)) problems.push(`installId ${body.installId}`);
    if (installId && body.installId !== installId) problems.push('a different install id');
    if (!Number.isInteger(body.sessionId) || body.sessionId < 1) problems.push(`sessionId ${body.sessionId}`);
    return problems;
  };

  const collector = startCollector(log);
  adb('install', '-r', apk);
  adb('root');
  adb('wait-for-device');
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  adb('shell', `echo '_ --blanc-test-ping-host=http://127.0.0.1:${PORT}/ --blanc-test-ping-version=${VERSION} --log-net-log=${DEVICE_NETLOG} --net-log-capture-mode=Default' > ${COMMAND_LINE}`);
  adb('shell', 'chmod', '644', COMMAND_LINE);
  adb('shell', 'rm', '-f', SKIP_FILE);
  try {
    // Before consent: a card closed on Welcome, two launches, nothing.
    stop();
    adb('shell', 'pm', 'clear', PACKAGE);
    launch();
    let problems = [];
    if (!waitFor('Your Blanc, in your pocket.', 15)) problems.push('no Welcome card');
    adb('shell', 'input', 'keyevent', 'BACK');
    sleep(5);
    stop();
    const firstLog = netlog();
    launch();
    sleep(5);
    stop();
    const beforeLog = firstLog + netlog();
    fs.writeFileSync(path.join(evidence, 'netlog-before-consent.json'), beforeLog);
    if (requests().length) problems.push(`${requests().length} request(s) reached the collector`);
    if (!beforeLog.includes('"constants"')) problems.push('no NetLog was written');
    if (sawCollector(beforeLog)) problems.push('the NetLog shows a request to the collector');
    check('nothing is sent before a saved choice, and the NetLog agrees', problems);

    // Settings → Measure usage on: one ping, now.
    problems = [];
    launch();
    adb('shell', 'am', 'start', '-n', SETTINGS);
    sleep(4);
    if (!tapRow('Measure usage')) problems.push('no Measure usage row');
    sleep(4);
    let got = requests();
    if (got.length !== 1) problems.push(`${got.length} request(s), not 1`);
    else problems.push(...bodyProblems(got[0], null));
    const installId = got.length ? JSON.parse(got[0].body).installId : null;
    const firstSession = got.length ? JSON.parse(got[0].body).sessionId : null;
    stop();
    const afterLog = netlog();
    fs.writeFileSync(path.join(evidence, 'netlog-after-consent.json'), afterLog);
    if (!sawCollector(afterLog)) problems.push('the NetLog does not show the ping (the gate could not have seen it)');
    check('turning Measure usage on sends one ping at once, which the NetLog shows', problems);

    // The next launch: one more, same install, new session.
    problems = [];
    launch();
    sleep(3);
    got = requests();
    if (got.length !== 2) problems.push(`${got.length} request(s), not 2`);
    else {
      problems.push(...bodyProblems(got[1], installId));
      if (JSON.parse(got[1].body).sessionId === firstSession) problems.push('the same session id');
    }
    adb('shell', 'input', 'keyevent', 'HOME');
    sleep(2);
    adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
    sleep(4);
    if (requests().length !== 2) problems.push('coming back to the same process sent again');
    check('each launch sends one, with the same install id', problems);

    // Off: nothing on the next launch.
    problems = [];
    adb('shell', 'am', 'start', '-n', SETTINGS);
    sleep(4);
    if (!tapRow('Measure usage')) problems.push('no Measure usage row');
    // The switch really went off, so a quiet launch below means something.
    const saved = (() => { try { return adb('shell', 'run-as', PACKAGE, 'cat', `shared_prefs/${PACKAGE}_preferences.xml`); } catch { return ''; } })();
    if (!/<boolean name="blanc\.usage_ping" value="false"/.test(saved)) problems.push('Measure usage was not saved off');
    stop();
    launch();
    sleep(4);
    if (!/topResumedActivity=.*me\.bnfy\.blanc\.dev/.test(adb('shell', 'dumpsys', 'activity', 'activities'))) problems.push('Blanc is not running after the launch');
    if (requests().length !== 2) problems.push(`${requests().length - 2} request(s) with Measure usage off`);
    check('with Measure usage off, a launch sends nothing', problems);

    // Yes on the walkthrough's privacy step sends in that launch.
    problems = [];
    stop();
    adb('shell', 'pm', 'clear', PACKAGE);
    const before = requests().length;
    launch();
    if (!tapText('Browse without pairing')) problems.push('no Browse without pairing');
    if (!waitFor('Measure usage')) problems.push('no privacy step');
    if (requests().length !== before) problems.push('sent before Continue');
    if (!tapText('Continue')) problems.push('no Continue');
    sleep(4);
    got = requests().slice(before);
    if (got.length !== 1) problems.push(`${got.length} request(s) after Continue`);
    else {
      problems.push(...bodyProblems(got[0], null));
      if (JSON.parse(got[0].body).installId === installId) problems.push('a cleared app kept its install id');
    }
    check('yes on the privacy step sends in that launch, as a new install', problems);
  } finally {
    stop();
    adb('shell', 'rm', '-f', COMMAND_LINE);
    adb('reverse', '--remove', `tcp:${PORT}`);
    adb('shell', 'touch', SKIP_FILE);
    adb('shell', 'chmod', '644', SKIP_FILE);
    collector.kill();
  }
  fs.copyFileSync(log, path.join(evidence, 'requests.jsonl'));
  fs.writeFileSync(path.join(evidence, 'launch-ping.json'), JSON.stringify(results, null, 2) + '\n');
  const failed = results.filter(r => r.problems.length);
  console.log(`launch ping: ${results.length - failed.length} of ${results.length} pass`);
  if (failed.length) process.exitCode = 1;
}

main(process.argv.slice(2));
