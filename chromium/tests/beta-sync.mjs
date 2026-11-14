// Desktop Sync on the packaged local-qualification Blanc Beta (no test
// hooks): its embedded runner and fixed loopback endpoint (127.0.0.1:49261)
// against the local Worker, driven only through Settings → Sync's own
// controls over Chromium's standard remote-debugging connection, with an
// independent peer running the same bundle as the iPhone. No production
// endpoint, real device or real keychain (mock keychain, throwaway HOME).
//
//   node chromium/tests/beta-sync.mjs APP EVIDENCE.json
//
// The full desktop Sync gate (favorites, tabs, Spaces, recovery, profiles)
// is chromium/tests/desktop-sync.mjs on the prototype, whose test hooks the
// beta compiles out; this is the beta's own build of the same code proving
// it turns on, pairs and syncs.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {connect, waitFor} from './lib/cdp.mjs';

const require = createRequire(import.meta.url);
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');
const {peer} = require('./android/support/sync-peer.cjs');
export const ENDPOINT_PORT = 49261;
const [app, evidenceFile] = process.argv.slice(2);
if (!app || !evidenceFile) throw Error('Usage: beta-sync.mjs APP EVIDENCE.json');

// Deep query through shadow roots, in the Settings page.
const FIND = `(function find(sel, root = document) {
  const hit = root.querySelector(sel); if (hit) return hit;
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { const deep = find(sel, el.shadowRoot); if (deep) return deep; }
  return null; })`;
const page = id => `(${FIND})('settings-blanc-sync-page')?.shadowRoot?.getElementById(${JSON.stringify(id)})`;
const visible = id => `(() => { const e = ${page(id)}; return !!e && !e.hidden && e.getBoundingClientRect().width > 0; })()`;
const click = id => `(() => { const e = ${page(id)}; const more = e?.closest('details'); if (more && !more.open) more.querySelector('summary').click();
  if (!e || e.disabled || !e.getBoundingClientRect().width) return false; e.focus(); e.click(); return true; })()`;
const text = id => `(${page(id)})?.textContent.trim() ?? ''`;

const output = {schema: 1, gate: 'desktop-sync (beta, local)', checks: [], app: path.basename(app)};
const step = async (name, fn) => {
  try { await fn(); output.checks.push({name, result: 'pass'}); console.log('pass ' + name); }
  catch (error) { output.checks.push({name, result: 'fail', error: String(error.message).slice(0, 300)}); console.log('FAIL ' + name + ': ' + error.message); throw error; }
};

let worker, relay, browser, settings, device, port;
const servers = [];
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-sync-'));
const profile = path.join(home, 'profile');
try {
  worker = await createSyncFixture();
  const target = new URL(worker.url);
  assert.equal(target.hostname, '127.0.0.1');
  // The beta's endpoint is fixed; relay it to the local Worker.
  relay = net.createServer(socket => { const up = net.connect(Number(target.port), '127.0.0.1'); socket.pipe(up).pipe(socket);
    up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy()); });
  await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(ENDPOINT_PORT, '127.0.0.1', resolve); });

  browser = spawn(path.join(app, 'Contents/MacOS/Blanc Beta'), [`--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--use-mock-keychain',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank'],
  {stdio: 'ignore', env: {...process.env, HOME: home, CFFIXED_USER_HOME: home}});
  const portFile = path.join(profile, 'DevToolsActivePort');
  await waitFor(async () => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n')[0], Boolean, 'remote debugging port', 30000);
  port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const list = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());

  await step('Settings → Sync opens in the beta', async () => {
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('chrome://settings/sync')}`, {method: 'PUT'});
    const tab = await waitFor(async () => (await list()).find(t => t.url.startsWith('chrome://settings')), Boolean, 'Settings page', 20000);
    settings = await connect(tab);
    await waitFor(() => settings.eval(`!!(${FIND})('settings-blanc-sync-page[blanc-ready]')`), Boolean, 'Sync page ready', 30000);
  });
  await step('turn on Sync with the embedded runner against the local Worker', async () => {
    assert.equal(await settings.eval(click('syncTurnOn')), true, 'Turn on Sync button');
    await waitFor(() => settings.eval(visible('syncOn')), Boolean, 'Sync on', 90000);
    output.account = await settings.eval(text('syncAccount'));
  });
  await step('an independent iPhone peer pairs with the code the beta shows', async () => {
    device = peer('Beta Sync iPhone peer', worker.url, {platform: 'ios'});
    assert.equal(await settings.eval(click('syncAddDevice')), true, 'Add device button');
    const code = await waitFor(async () => { const c = await settings.eval(text('syncPairingCode')); return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c) ? c.replace('-', '') : null; }, Boolean, 'pairing code', 60000);
    const joined = await device.sync.joinWithCode(code);
    assert.equal(joined.ok, true, `peer joined (${joined.error ?? ''})`);
    await device.pass();
    output.joinedTitle = await waitFor(async () => { const t = await settings.eval(`(() => { const e = ${page('syncPairingJoined')}; return e && !e.hidden ? e.textContent.trim() : ''; })()`); return t || null; }, Boolean, 'joined notice', 90000);
    assert.match(output.joinedTitle, /Beta Sync iPhone peer/);
  });
  await step('with tab sharing on, the peer sees the beta and its open page', async () => {
    await settings.eval(click('syncPairingCancel'));
    const shared = http.createServer((q, r) => { r.writeHead(200, {'content-type': 'text/html'}); r.end('<title>Shared from the beta</title>ok'); });
    await new Promise(resolve => shared.listen(0, '127.0.0.1', resolve));
    servers.push(shared);
    const pageUrl = `http://localhost:${shared.address().port}/shared`;
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, {method: 'PUT'});
    // Settings' own "share open tabs" switch, as a person turns it on.
    const on = await settings.eval(`(() => { const e = ${page('syncTabsShare')}; if (!e || e.disabled) return null; if (!e.checked) e.click(); return true; })()`);
    assert.equal(on, true, 'share open tabs switch');
    await settings.eval(click('syncNow'));
    const devices = await waitFor(async () => { await device.pass(); const d = await device.sync.listRemoteDevices(); return Array.isArray(d) && d.length ? d : null; }, Boolean, 'remote devices on the peer', 90000);
    output.peerSees = devices.map(d => ({name: d.name ?? null, platform: d.platform ?? null, tabs: (d.tabs ?? []).map(t => t.title)}));
    assert.ok(devices.some(d => (d.tabs ?? []).some(t => t.title === 'Shared from the beta' || /\/shared$/.test(t.url ?? ''))), 'the beta\'s open page reached the peer');
  });
  await step('every Sync request stayed on this Mac', async () => {
    output.workerRequests = worker.requests.length;
    assert.ok(worker.requests.length > 0, 'the Worker served the beta and the peer');
  });
  output.status = 'pass';
} catch (error) {
  output.status = 'fail'; output.error = String(error.message).slice(0, 300);
} finally {
  try { settings?.close(); } catch {}
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await new Promise(r => setTimeout(r, 3000)); if (browser.exitCode === null) browser.kill('SIGKILL'); }
  relay?.close(); for (const server of servers) server.close(); await worker?.close?.();
  fs.rmSync(home, {recursive: true, force: true});
  fs.writeFileSync(evidenceFile, JSON.stringify(output, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: output.status, checks: output.checks.map(c => `${c.result} ${c.name}`)}));
  if (output.status !== 'pass') process.exitCode = 1;
}
