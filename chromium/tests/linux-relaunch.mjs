// On a disposable Linux runner, with beta N already installed:
// node chromium/tests/linux-relaunch.mjs FROM_VERSION TO_VERSION NEXT.deb NEW_RESULTS_DIR
// Staging's apt and dnf legs can supply their own upgrade() operation.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {connect, waitFor} from './lib/cdp.mjs';
import {Page} from './lib/page-shim.mjs';
import {netlogHosts} from './outbound/analyze-beta.mjs';

const launcher = '/usr/bin/blanc-beta';
const executable = '/opt/bnfy/blanc-beta/chrome';
const island = 'chrome://blanc-prototype/host.html';
const updateDomains = [
  'google.com', 'googleapis.com', 'googleusercontent.com', 'gstatic.com',
  'gvt1.com', 'chromereleases.googleblog.com', 'chrome-releases.googleblog.com', 'googlechromereleases.blogspot.com',
  'chromiumdash.appspot.com', 'omahaproxy.appspot.com', 'versionhistory.googleapis.com',
];

export function checkUpdateNetLog(text, controlUrl) {
  // Each process must have flushed its log through shutdown and recorded its
  // own probe. A partial log or yesterday's file cannot establish the result.
  const {events} = JSON.parse(text);
  assert.ok(events.some(({params}) => params?.url === controlUrl), 'Missing NetLog control ' + controlUrl);
  const hosts = netlogHosts(text);
  for (const host of hosts.keys()) {
    const name = host.replace(/\.$/, '');
    assert.ok(!updateDomains.some(domain => name === domain || name.endsWith('.' + domain)),
      'Browser contacted an update or Chrome releases host: ' + host);
  }
  return Object.fromEntries(hosts);
}

async function attach(profile, connections, previousEndpoint) {
  const endpoint = await waitFor(() => {
    const [port, socket] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
    if (Number(port) > 0 && socket?.startsWith('/devtools/browser/')) return {port, socket};
  }, value => value && value.socket !== previousEndpoint, 'new browser DevTools endpoint', 60000);
  const browser = await connect({webSocketDebuggerUrl: 'ws://127.0.0.1:' + endpoint.port + endpoint.socket});
  connections.push(browser);
  const {product} = await browser.send('Browser.getVersion');
  const {processInfo} = await browser.send('SystemInfo.getProcessInfo');
  const pid = processInfo.find(proc => proc.type === 'browser')?.id;
  assert.ok(pid > 0 && fs.readlinkSync('/proc/' + pid + '/exe') === executable, 'Expected the installed beta process');
  const targets = () => fetch('http://127.0.0.1:' + endpoint.port + '/json/list',
    {signal: AbortSignal.timeout(2000)}).then(response => response.json());
  const hostTarget = await waitFor(async () => (await targets()).find(target => target.url === island),
    Boolean, 'native Island host');
  const host = await connect(hostTarget);
  connections.push(host);
  await waitFor(() => host.eval("Boolean(document.querySelector('#strip')?.contentDocument?.getElementById('pillHeart'))"),
    Boolean, 'Island strip ready');
  const pageForUrl = async url => {
    const target = await waitFor(async () => (await targets()).find(t => t.type === 'page' && t.url === url),
      Boolean, 'page target for ' + url);
    return connect(target);
  };
  return {browser, host, pid, version: product.split('/').at(-1), socket: endpoint.socket, pageForUrl};
}

export async function loadedTabs({host, pageForUrl}, urls) {
  const tabs = await waitFor(() => host.eval('window.BlancPrototypeHost.api.getAllTabs().then(state => state.tabs)'),
    tabs => urls.every(url => tabs.some(tab => tab.url === url)), 'session tabs');
  for (const url of urls) {
    // Restored background tabs can be lazy. Select the existing tab so its
    // session entry has a chance to load, without navigating or retrying it.
    const id = tabs.find(tab => tab.url === url).id;
    await host.eval('window.BlancPrototypeHost.api.activateTabFromRail(' + JSON.stringify(id) + ')');
    const page = await pageForUrl(url);
    try {
      const rendered = await waitFor(() => page.eval(
        '({url: location.href, ready: document.readyState, body: document.body?.innerText})'),
      doc => doc?.url === url && doc.ready === 'complete', 'fixture document at ' + url);
      assert.equal(rendered.body, new URL(url).pathname, 'Wrong fixture response at ' + url);
    } finally { page.close(); }
  }
  return tabs.map(tab => tab.url);
}

const button = "document.querySelector('#strip').contentDocument.querySelector('#pillRestartToUpdate')";

// Evaluated in the requesting document, using the same navigation as the pill.
export function requestFromOverlay(version) {
  if (!document.hasFocus() || !navigator.userActivation.isActive)
    throw Error('Expected a focused, activated overlay');
  location.assign('/restartToUpdate?' + encodeURIComponent(version));
}

async function verifyOverlayRefusal(host, version) {
  await host.eval('window.BlancPrototypeHost.open()');
  const overlay = new Page({cdp: host, frame: 'overlay'});
  const context = await overlay.contextId();
  await waitFor(() => host.eval('document.hasFocus()', context), Boolean, 'focused overlay');
  await host.eval(`(() => {
    const receive = window.blancPrototypeEvent;
    window.blancPrototypeEvent = (kind, payload) => {
      if (kind === 'update-refused') {
        window.blancPrototypeEvent = receive;
        window.proofRefusedVersion = payload;
      }
      receive(kind, payload);
    };
  })()`);
  await host.eval(`(${requestFromOverlay})(${JSON.stringify(version)})`, context);
  await waitFor(() => host.eval('window.proofRefusedVersion'), value => value === version,
    'native refusal for the advertised version');
  assert.equal(await host.eval('location.pathname', context), '/overlay.html');
  await host.eval('window.BlancPrototypeHost.escape()');
}

export async function proveRelaunch({fromVersion, toVersion, upgrade, resultsDir}) {
  assert.equal(process.platform, 'linux');
  assert.notEqual(process.getuid(), 0, 'Run the installed browser as an ordinary user');
  for (const version of [fromVersion, toVersion]) assert.match(version, /^\d+\.\d+\.\d+\.\d+$/);
  assert.ok(fromVersion.localeCompare(toVersion, 'en', {numeric: true}) < 0, 'Expected a newer package');
  assert.equal(execFileSync(launcher, ['--product-version'], {encoding: 'utf8'}).trim(), fromVersion);
  const out = path.resolve(resultsDir);
  fs.mkdirSync(out);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-relaunch-'));
  const netlog = path.join(out, 'after-netlog.json');
  const firstLog = path.join(out, 'before-netlog.json');
  const managed = '/etc/chromium/policies/managed';
  let policyFile;
  const connections = [];
  const pages = http.createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
    response.end(request.url);
  });
  try {
    // Only on the disposable package runner. Give this run its own policy
    // file and require the browser to report it active before upgrading.
    const sudo = (...args) => execFileSync('sudo', ['-n', ...args], {encoding: 'utf8'}).trim();
    sudo('mkdir', '-p', managed);
    policyFile = sudo('mktemp', '--suffix=.json', path.join(managed, 'blanc-relaunch-XXXXXXXX'));
    execFileSync('sudo', ['-n', 'tee', policyFile], {input: JSON.stringify({RelaunchFastIfOutdated: 1})});
    sudo('chmod', '0644', policyFile);
    await new Promise((resolve, reject) => pages.once('error', reject).listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + pages.address().port;
    const tabs = [base + '/before-install', base + '/after-install'];
    const control = base + '/after-relaunch';
    const fd = fs.openSync(path.join(out, 'browser.log'), 'wx');
    try {
      const child = spawn(launcher, ['--user-data-dir=' + profile, '--remote-debugging-port=0',
        '--no-first-run', '--no-default-browser-check', '--check-for-update-interval=10',
        '--log-net-log=' + netlog, '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
      {stdio: ['ignore', fd, fd]});
      await new Promise((resolve, reject) => child.once('error', reject).once('spawn', resolve));
    } finally { fs.closeSync(fd); }
    const before = await attach(profile, connections);
    assert.equal(before.version, fromVersion);
    const policyUrl = 'chrome://policy/';
    const policyTab = await before.browser.send('Target.createTarget', {url: policyUrl});
    const policyPage = await before.pageForUrl(policyUrl);
    let policy;
    try {
      policy = await waitFor(() => policyPage.eval(`document.querySelector('policy-app')?.policyGroups_
        ?.find(group => group.id === 'chrome')?.policies.find(row => row.name === 'RelaunchFastIfOutdated')`),
      // chrome://policy keeps the C++ enums as numbers (policy_types.h):
      // POLICY_LEVEL_MANDATORY and POLICY_SCOPE_MACHINE are both 1.
      row => row?.value === 1 && row.source === 'platform' && row.level === 1 && row.scope === 1 &&
        row.status === 'OK' && !row.error && !row.ignored, 'active managed RelaunchFastIfOutdated policy');
    } finally {
      policyPage.close();
      await before.browser.send('Target.closeTarget', {targetId: policyTab.targetId});
    }
    await before.browser.send('Target.createTarget', {url: tabs[0]});
    await loadedTabs(before, [tabs[0]]);
    assert.equal(await before.host.eval('Boolean(' + button + ')'), false);
    // N keeps writing its open inode through exit. N+1 opens a new log at
    // the original path, so neither launch can erase the other's requests.
    fs.renameSync(netlog, firstLog);
    await upgrade();
    assert.equal(execFileSync(launcher, ['--product-version'], {encoding: 'utf8'}).trim(), toVersion);
    await before.browser.send('Target.createTarget', {url: tabs[1]});
    await loadedTabs(before, tabs);
    await waitFor(() => before.host.eval('Boolean(' + button + '?.getClientRects().length)'),
      Boolean, 'Island update recommendation', 120000);
    await verifyOverlayRefusal(before.host, toVersion);
    await before.host.eval("chrome.send('blancPrototype', ['proof-focus', 'focusIsland', []])");
    await waitFor(() => before.host.eval('document.hasFocus()'), Boolean, 'native Island focus');
    await before.host.eval(`document.querySelector('#strip').contentWindow.focus(); ${button}.focus()`);
    await waitFor(() => before.host.eval(`(() => {
      const button = ${button};
      return !!button && button.ownerDocument.hasFocus() && button.matches(':focus') && !button.disabled;
    })()`), Boolean, 'focused update button');
    const key = {key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13};
    await before.host.send('Input.dispatchKeyEvent', {...key, type: 'keyDown', text: '\r'});
    // The restart can close this target before the release of Enter.
    await before.host.send('Input.dispatchKeyEvent', {...key, type: 'keyUp'}).catch(() => {});
    const after = await attach(profile, connections, before.socket);
    assert.notEqual(after.pid, before.pid);
    assert.equal(after.version, toVersion);
    const restored = await loadedTabs(after, tabs);
    assert.equal(await after.host.eval('Boolean(' + button + ')'), false);
    await after.browser.send('Target.createTarget', {url: control});
    await loadedTabs(after, [control]);
    await after.browser.send('Browser.close');
    await waitFor(() => {
      try { return /^State:\s+Z/m.test(fs.readFileSync('/proc/' + after.pid + '/status', 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return true; throw error; }
    }, Boolean, 'restarted browser exit');
    const result = {
      policy,
      before: {pid: before.pid, version: before.version, hosts: checkUpdateNetLog(fs.readFileSync(firstLog, 'utf8'), tabs[1])},
      after: {pid: after.pid, version: after.version, hosts: checkUpdateNetLog(fs.readFileSync(netlog, 'utf8'), control)},
      restored,
    };
    fs.writeFileSync(path.join(out, 'relaunch.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    for (const connection of connections) connection.close();
    // Also cover a failed reconnection after Chromium started its replacement.
    for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
      try {
        const args = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0');
        if (args.includes('--user-data-dir=' + profile)) process.kill(Number(pid), 'SIGTERM');
      } catch (error) {
        if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) throw error;
      }
    }
    pages.closeAllConnections();
    await new Promise(resolve => pages.close(resolve));
    fs.rmSync(profile, {recursive: true, force: true});
    if (policyFile) execFileSync('sudo', ['-n', 'rm', '--', policyFile]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [fromVersion, toVersion, deb, resultsDir] = process.argv.slice(2);
  if (process.argv.length !== 6) throw Error('Usage: linux-relaunch.mjs FROM_VERSION TO_VERSION NEXT.deb NEW_RESULTS_DIR');
  const file = path.resolve(deb);
  const field = name => execFileSync('dpkg-deb', ['-f', file, name], {encoding: 'utf8'}).trim();
  assert.equal(field('Package'), 'blanc-beta');
  assert.equal(field('Version'), toVersion + '-1');
  const upgrade = () => execFileSync('sudo', ['-n', 'dpkg', '-i', file], {stdio: 'inherit'});
  console.log(await proveRelaunch({fromVersion, toVersion, upgrade, resultsDir}));
}
