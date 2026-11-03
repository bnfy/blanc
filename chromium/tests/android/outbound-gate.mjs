// Android privacy gate (A0 task 6): no request to a Google service the app
// makes by itself. Runs a scripted session on an emulator over adb with a
// NetLog on, then judges every host the browser's network stack contacted
// against outbound-denylist.json, letting through only allowlisted flows the
// person started (outbound-allowlist.json). Fails closed: a session whose
// pages never loaded is "not-run", never a pass.
//
//   node chromium/tests/android/outbound-gate.mjs --apk <ChromePublic.apk> --avd <name> --evidence <dir> [--chrome-flags "<flags>"]
//
// --chrome-flags adds Chromium switches for a discovery run (for example
// --disable-fre on a build that still has Chromium's first-run screen); the
// report records them, and a release gate runs without any.
//
// Scope: the NetLog sees Chromium's own network stack, not Play services' or
// the OS's traffic; those need the server's packet capture (A7's privacy gate).
// The device steps (adb root, the command-line file, the NetLog path) assume a
// Google APIs emulator image without the Play Store and are confirmed on the
// build server's first run.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SESSION_PAGES = ['https://example.com/', 'https://example.org/', 'https://example.net/',
  'https://www.iana.org/help/example-domains', 'https://duckduckgo.com/?q=blanc'];
const PACKAGE = 'me.bnfy.blanc.dev';
const COMMAND_LINE = '/data/local/chrome-command-line';
const DEVICE_NETLOG = `/data/data/${PACKAGE}/cache/blanc-netlog.json`;

// A host from a NetLog field: a URL, "host:port", "[v6]:port", or a socket
// group such as "ssl/host:port" or "https://host:port <…>".
export function hostFrom(value) {
  if (typeof value !== 'string' || !value) return null;
  const text = value.trim().split(/\s/)[0].replace(/^(?:ssl|pm|socks[45]?|http-proxy)\//i, '');
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return new URL(text).hostname.replace(/^\[|\]$/g, '').toLowerCase() || null;
  } catch { return null; }
  const bracketed = /^\[([0-9a-f:.]+)\](?::\d+)?$/i.exec(text);
  if (bracketed) return bracketed[1].toLowerCase();
  const plain = /^([a-z0-9.-]+)(?::\d+)?$/i.exec(text);
  return plain ? plain[1].toLowerCase() : null;
}

// A NetLog file's JSON. Chromium writes it as it goes, so one cut short by
// the app stopping lacks its closing "]}"; that tail is restored.
export function readNetLog(text) {
  try { return JSON.parse(text); } catch {}
  const body = text.trimEnd().replace(/,$/, '');
  for (const tail of [']}', '}]}']) {
    try { return JSON.parse(body + tail); } catch {}
  }
  throw Error('The NetLog is not readable JSON, even with its tail restored.');
}

// Every host the network stack touched, with a count, and the page URLs its
// requests started.
export function netLogHosts(netlog) {
  if (!Array.isArray(netlog?.events)) throw Error('The NetLog has no events.');
  const names = Object.fromEntries(Object.entries(netlog.constants?.logEventTypes ?? {}).map(([name, id]) => [id, name]));
  const hosts = new Map();
  const urls = [];
  for (const event of netlog.events) {
    const params = event.params ?? {};
    if (names[event.type] === 'URL_REQUEST_START_JOB' && typeof params.url === 'string') urls.push(params.url);
    for (const field of ['url', 'original_url', 'host', 'group_name', 'group_id']) {
      const host = hostFrom(params[field]);
      if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
    }
  }
  return {hosts, urls};
}

// "*.google.com" matches google.com and every subdomain; "clients*.google.com"
// matches clients1.google.com. Labels are compared whole otherwise.
export function hostPattern(glob) {
  const lower = glob.toLowerCase();
  const apex = lower.startsWith('*.');
  const body = (apex ? lower.slice(2) : lower).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*');
  return new RegExp(apex ? `^(?:[a-z0-9-]+\\.)*${body}$` : `^${body}$`);
}

// The verdict. `actions` are the session's recorded steps, by name.
export function judge({hosts, urls, pages, denylist, allowlist, actions}) {
  const problems = [];
  const missing = pages.filter(page => !urls.some(url => hostFrom(url) === hostFrom(page)));
  if (missing.length) {
    return {verdict: 'not-run', problems: [`the session's pages never loaded: ${missing.join(', ')}`], hosts: Object.fromEntries(hosts)};
  }
  const denied = denylist.map(glob => [glob, hostPattern(glob)]);
  for (const [host, count] of hosts) {
    const rule = denied.find(([, pattern]) => pattern.test(host))?.[0];
    if (!rule) continue;
    const flow = allowlist.find(entry => hostPattern(entry.host).test(host));
    if (flow && actions.includes(flow.trigger)) continue;
    problems.push(flow
      ? `${count} request(s) to ${host} (${rule}) without its trigger "${flow.trigger}"`
      : `${count} request(s) to ${host} (${rule})`);
  }
  return {verdict: problems.length ? 'fail' : 'pass', problems, hosts: Object.fromEntries(hosts)};
}

function adb(serial, ...args) {
  return execFileSync('adb', ['-s', serial, ...args], {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
}
const pause = seconds => execFileSync('sleep', [String(seconds)]);

// The running emulator started from `avd`; the gate never boots one itself.
function emulatorFor(avd) {
  const serials = execFileSync('adb', ['devices'], {encoding: 'utf8'}).split('\n')
    .map(line => /^(emulator-\d+)\s+device$/.exec(line)?.[1]).filter(Boolean);
  const serial = serials.find(s => adb(s, 'emu', 'avd', 'name').split('\n')[0].trim() === avd);
  if (!serial) throw Error(`No running emulator for AVD ${avd}; start it first (no session ran).`);
  return serial;
}

function runSession({apk, avd, evidence, flags}) {
  const serial = emulatorFor(avd);
  const actions = [];
  const act = (name, ...args) => { actions.push({name, at: new Date().toISOString()}); if (args.length) adb(serial, ...args); };
  adb(serial, 'root');
  adb(serial, 'wait-for-device');
  act('install', 'install', '-r', apk);
  act('reset', 'shell', 'pm', 'clear', PACKAGE);
  act('netlog-on', 'shell', `echo '_ --log-net-log=${DEVICE_NETLOG} --net-log-capture-mode=Default ${flags}' > ${COMMAND_LINE}`);
  for (const page of SESSION_PAGES) {
    act(`open ${page}`, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', page, '-p', PACKAGE);
    pause(8);
  }
  act('idle'); pause(60);
  act('background', 'shell', 'input', 'keyevent', 'KEYCODE_HOME'); pause(5);
  act('foreground', 'shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); pause(5);
  act('quit', 'shell', 'am', 'force-stop', PACKAGE);
  const netlog = adb(serial, 'shell', 'cat', DEVICE_NETLOG);
  act('netlog-off', 'shell', 'rm', '-f', COMMAND_LINE);
  fs.writeFileSync(path.join(evidence, 'netlog-android.json'), netlog);
  return {netlog, actions: actions.map(a => a.name), log: actions, serial};
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), avd = option('--avd'), evidence = option('--evidence'), flags = option('--chrome-flags') ?? '';
  if (/['\\\n]/.test(flags)) throw Error('--chrome-flags may not contain quotes, backslashes or newlines.');
  if (!apk || !avd || !evidence) throw Error('Usage: outbound-gate.mjs --apk <path> --avd <name> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const read = name => JSON.parse(fs.readFileSync(path.join(here, name), 'utf8'));
  const session = runSession({apk, avd, evidence, flags});
  const {hosts, urls} = netLogHosts(readNetLog(session.netlog));
  const report = {...judge({hosts, urls, pages: SESSION_PAGES, denylist: read('outbound-denylist.json').hosts,
    allowlist: read('outbound-allowlist.json').flows, actions: session.actions}), apk: path.resolve(apk), avd,
    emulator: session.serial, chromeFlags: flags, session: session.log, checkedAt: new Date().toISOString()};
  fs.writeFileSync(path.join(evidence, 'outbound-android.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({verdict: report.verdict, problems: report.problems}, null, 2));
  if (report.verdict !== 'pass') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Android outbound gate: ${error.message}`); process.exitCode = 1; }
}
