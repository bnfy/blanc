// Blanc's update server for the Windows beta (W3 Task C1), run in workerd
// with a throwaway key. Every answer must carry a CUP signature Chromium's
// updater accepts (checked here with OpenSSL, an independent implementation),
// offer only an upgrade, and refuse what isn't a well-formed 4.0 update check.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

process.env.WRANGLER_SEND_METRICS = 'false';
const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, '..');
const repo = path.resolve(workerRoot, '../..');
const OPENSSL = '/opt/homebrew/opt/openssl@3/bin/openssl';
const haveOpenSSL = fs.existsSync(OPENSSL);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest();
const BROWSER = '{459fd3cf-456c-4a06-8b37-2084cf64ddce}', UPDATER = '{4dbcbeee-9640-43b0-a87f-e679a3637712}';
const RELEASE = {appId: BROWSER, version: '158.0.8127.5', url: 'https://github.com/bnfy/blanc/releases/download/x/blanc-beta-158.0.8127.5.crx3',
  size: 123456, sha256: 'ab'.repeat(32), run: 'mini_installer.exe', arguments: '--do-not-launch-chrome'};

// A test seed, its PKCS#8 (seed-only) and public key, by OpenSSL.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-update-worker-'));
const seed = crypto.randomBytes(32);
let spkiHex = '';
if (haveOpenSSL) {
  const pkcs8 = Buffer.concat([Buffer.from('3034020100300b0609608648016503040311042280' + '20', 'hex'), seed]);
  fs.writeFileSync(path.join(work, 'seed.der'), pkcs8);
  spawnSync(OPENSSL, ['pkey', '-inform', 'DER', '-in', path.join(work, 'seed.der'), '-pubout', '-outform', 'DER', '-out', path.join(work, 'spki.der')]);
  spkiHex = fs.readFileSync(path.join(work, 'spki.der')).toString('hex');
}
function verifies(message, signature) {
  fs.writeFileSync(path.join(work, 'msg.bin'), message);
  fs.writeFileSync(path.join(work, 'sig.bin'), signature);
  return spawnSync(OPENSSL, ['pkeyutl', '-verify', '-pubin', '-keyform', 'DER', '-inkey', path.join(work, 'spki.der'),
    '-rawin', '-in', path.join(work, 'msg.bin'), '-sigfile', path.join(work, 'sig.bin')]).status === 0;
}
async function harness(options, vars = {}) {
  const root = fs.mkdtempSync(path.join(work, 'root-'));
  // The fixture adds a test-only upload route; the real Worker has none.
  fs.writeFileSync(path.join(root, 'fixture.js'), `import {makeWorker} from ${JSON.stringify(path.join(workerRoot, 'src/worker.js'))};
const worker = makeWorker(${JSON.stringify(options)});
export default {async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/__put/')) { await env.PACKAGES.put(url.pathname.slice(7), await request.arrayBuffer()); return new Response('ok'); }
  return worker.fetch(request, env, ctx);
}};\n`);
  fs.writeFileSync(path.join(root, 'wrangler.toml'), `name = "update-test"\nmain = "fixture.js"\ncompatibility_date = "2026-10-01"\ncompatibility_flags = ["webcrypto_modern_algorithms"]\n[[r2_buckets]]\nbinding = "PACKAGES"\nbucket_name = "test-packages"\n`);
  fs.writeFileSync(path.join(root, '.dev.vars'), `CUP_SEED=${seed.toString('base64')}\n` +
    Object.entries(vars).map(([k, v]) => `${k}='${v}'\n`).join(''));
  const {createTestHarness} = await import(path.join(workerRoot, 'node_modules/wrangler/wrangler-dist/cli.js'));
  const server = createTestHarness({root, workers: [{configPath: './wrangler.toml'}]});
  await server.listen();
  return server;
}
function request(apps, {nonce = crypto.randomBytes(32).toString('base64url'), version = 1, protocol = '4.0', hash} = {}) {
  const body = typeof apps === 'string' ? apps : JSON.stringify({request: {protocol, apps}});
  const cup2key = `ML-DSA-44-${version}:${nonce}`;
  const query = `?cup2key=${encodeURIComponent(cup2key)}&cup2hreq=${hash ?? sha(body).toString('hex')}`;
  return {body, cup2key, query};
}
async function check(worker, apps, options) {
  const r = request(apps, options);
  const res = await worker.fetch('/update/win/v4' + r.query, {method: 'POST', body: r.body, headers: {'content-type': 'application/json'}});
  const text = await res.text();
  return {...r, res, text};
}
function proofOk({body, cup2key, res, text}) {
  const proof = res.headers.get('x-cup-server-proof') ?? '';
  const [sigHex, hashHex] = proof.split(':');
  assert.equal(hashHex, sha(body).toString('hex'), 'the server reports the request hash it saw');
  assert.equal(sigHex.length, 2420 * 2, 'an ML-DSA-44 signature');
  const inner = sha(Buffer.concat([sha(body), sha(Buffer.from(text)), Buffer.from(cup2key)]));
  return verifies(inner, Buffer.from(sigHex, 'hex'));
}
const parse = text => { assert.ok(text.startsWith(")]}'"), 'the safe-JSON prefix'); return JSON.parse(text.slice(4)).response; };

test('an older beta is offered the current one, signed', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const r = await check(server.getWorker(), [{appid: BROWSER.toUpperCase(), version: '158.0.8127.2', updatecheck: {}}]);
  assert.equal(r.res.status, 200);
  assert.ok(proofOk(r), 'the CUP signature verifies');
  const response = parse(r.text);
  assert.equal(response.protocol, '4.0');
  assert.ok(response.daystart.elapsed_days > 7000);
  const [app] = response.apps;
  assert.equal(app.appid, BROWSER.toUpperCase());
  assert.equal(app.status, 'ok');
  assert.equal(app.updatecheck.status, 'ok');
  assert.equal(app.updatecheck.nextversion, RELEASE.version);
  const [download, crx3] = app.updatecheck.pipelines[0].operations;
  assert.deepEqual(download, {type: 'download', urls: [{url: RELEASE.url}], size: RELEASE.size, out: {sha256: RELEASE.sha256}});
  assert.deepEqual(crx3, {type: 'crx3', in: {sha256: RELEASE.sha256}, path: RELEASE.run, arguments: RELEASE.arguments});
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
});
test('the current or a newer beta, and the updater itself, get noupdate', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const r = await check(server.getWorker(), [
    {appid: BROWSER, version: RELEASE.version, updatecheck: {}},
    {appid: BROWSER, version: '158.0.8127.9', updatecheck: {}},
    {appid: UPDATER, version: '158.0.8127.2', updatecheck: {}},
  ]);
  assert.ok(proofOk(r));
  assert.deepEqual(parse(r.text).apps.map(a => a.updatecheck.status), ['noupdate', 'noupdate', 'noupdate']);
  const none = await harness({publicSpkiHex: spkiHex, release: {appId: BROWSER, version: null}}); t.after(() => none.close());
  const n = await check(none.getWorker(), [{appid: BROWSER, version: '1.0.0.0', updatecheck: {}}]);
  assert.equal(parse(n.text).apps[0].updatecheck.status, 'noupdate', 'with no release published, nothing is offered');
});
test('an unknown app is answered as unknown; an event-only app gets no update check', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const r = await check(server.getWorker(), [{appid: '{00000000-0000-0000-0000-000000000000}', version: '1.0', updatecheck: {}},
    {appid: BROWSER, version: '158.0.8127.2', event: [{eventtype: 3, eventresult: 1}]}]);
  assert.ok(proofOk(r));
  const [unknown, events] = parse(r.text).apps;
  assert.deepEqual(unknown, {appid: '{00000000-0000-0000-0000-000000000000}', status: 'error-unknownApplication'});
  assert.deepEqual(events, {appid: BROWSER, status: 'ok'});
});
test('an answer is bound to its request: replayed under another nonce it fails', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const r = await check(server.getWorker(), [{appid: BROWSER, version: '158.0.8127.2', updatecheck: {}}]);
  assert.ok(proofOk(r));
  assert.equal(proofOk({...r, cup2key: 'ML-DSA-44-1:another-nonce'}), false);
  assert.equal(proofOk({...r, text: r.text.replace(RELEASE.version, '999.0.0.0')}), false, 'a changed answer fails');
});
test('malformed requests are refused before anything is signed', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const worker = server.getWorker(), apps = [{appid: BROWSER, version: '1', updatecheck: {}}];
  const refused = async (r, status) => { assert.equal(r.res.status, status, r.text); assert.equal(r.res.headers.get('x-cup-server-proof'), null); };
  await refused(await check(worker, apps, {version: 2}), 400);
  await refused(await check(worker, apps, {hash: '00'.repeat(32)}), 400);
  await refused(await check(worker, '{"request":', {}), 400);
  await refused(await check(worker, apps, {protocol: '3.1'}), 400);
  await refused(await check(worker, JSON.stringify({request: {protocol: '4.0', apps: 'x'}})), 400);
  await refused(await check(worker, JSON.stringify({request: {protocol: '4.0', apps: [{appid: BROWSER, version: 'abc', updatecheck: {}}]}})), 400);
  const big = request('x'.repeat(200 * 1024));
  const bigRes = await worker.fetch('/update/win/v4' + big.query, {method: 'POST', body: big.body});
  assert.equal(bigRes.status, 413);
  assert.equal((await worker.fetch('/update/win/v4' + request(apps).query)).status, 405);
  assert.equal((await worker.fetch('/update/win/v4', {method: 'POST', body: '{}'})).status, 400, 'no CUP parameters and not a ping');
  assert.equal((await worker.fetch('/elsewhere', {method: 'POST', body: '{}'})).status, 404);
});
test('an unsigned ping (events only) is acknowledged; an unsigned update check is refused', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  // update_client sends event pings without CUP (use_signing=false).
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const worker = server.getWorker();
  const ping = JSON.stringify({request: {protocol: '4.0', apps: [{appid: UPDATER, version: '158.0.8127.900', events: [{eventtype: 2, eventresult: 1}]}]}});
  const ok = await worker.fetch('/update/win/v4', {method: 'POST', body: ping});
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-cup-server-proof'), null, 'nothing is signed without CUP parameters');
  assert.deepEqual(parse(await ok.text()).apps, [{appid: UPDATER, status: 'ok'}]);
  const check = JSON.stringify({request: {protocol: '4.0', apps: [{appid: BROWSER, version: '158.0.8127.900', updatecheck: {}}]}});
  const refused = await worker.fetch('/update/win/v4', {method: 'POST', body: check});
  assert.equal(refused.status, 400);
  assert.equal((await worker.fetch('/update/win/v4', {method: 'POST', body: '{'})).status, 400);
});
test('a secret that is not the committed key signs nothing', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const other = Buffer.from(spkiHex, 'hex'); other[other.length - 1] ^= 1;
  const server = await harness({publicSpkiHex: other.toString('hex'), release: RELEASE}); t.after(() => server.close());
  const r = await check(server.getWorker(), [{appid: BROWSER, version: '158.0.8127.2', updatecheck: {}}]);
  assert.equal(r.res.status, 500);
  assert.equal(r.res.headers.get('x-cup-server-proof'), null);
});
test('the deployed Worker uses the committed key, the beta\'s app id and the updater\'s address only', () => {
  const key = fs.readFileSync(path.join(repo, 'chromium/windows/keys/cup-public.der')).toString('hex');
  assert.match(fs.readFileSync(path.join(workerRoot, 'src/cup-public-key.js'), 'utf8'), new RegExp(`"${key}"`));
  const gni = fs.readFileSync(path.join(repo, 'chromium/blanc/branding/win-beta/updater.gni'), 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(workerRoot, 'src/release.json'), 'utf8'));
  assert.equal(release.appId, /^browser_appid = "([^"]+)"/m.exec(gni)[1]);
  assert.equal(UPDATER, /^updater_appid = "([^"]+)"/m.exec(gni)[1]);
  assert.equal(BROWSER, release.appId);
  const toml = fs.readFileSync(path.join(workerRoot, 'wrangler.toml'), 'utf8');
  assert.match(toml, /^compatibility_flags = \["webcrypto_modern_algorithms"\]$/m);
  assert.match(toml, /^compatibility_date = "2026-10-01"$/m);
  // The production routes: the addresses compiled into the updater (updater.gni):
  // the update check and the install window's logo (app_logo_url).
  const routes = [...toml.matchAll(/pattern = "([^"]+)", zone_name = "([^"]+)"/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(routes, [['blanc.day/update/win/*', 'blanc.day'], ['blanc.day/update/icons/*', 'blanc.day']]);
  assert.match(toml, /\[\[r2_buckets\]\]\nbinding = "PACKAGES"\nbucket_name = "blanc-windows-updates"/);
  assert.equal(/^update_check_url = "([^"]+)"/m.exec(gni)[1], 'https://blanc.day/update/win/v4');
  assert.equal(/^app_logo_url = "([^"]+)"/m.exec(gni)[1], 'https://blanc.day/update/icons/');
});
test('the smoke check passes a correctly signing Worker and fails a wrong key', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const {smokeCheck} = await import('../scripts/smoke.mjs');
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE}); t.after(() => server.close());
  const worker = server.getWorker();
  const fetchImpl = (url, init) => worker.fetch(new URL(url).pathname + new URL(url).search, init);
  const good = await smokeCheck('https://staging.invalid', path.join(work, 'spki.der'), {fetchImpl});
  assert.deepEqual(good, {status: 200, requestHashEchoed: true, signatureVerifies: true, safePrefix: true, updatecheck: 'ok', nextversion: RELEASE.version});
  const committed = path.join(repo, 'chromium/windows/keys/cup-public.der');
  assert.equal((await smokeCheck('https://staging.invalid', committed, {fetchImpl})).signatureVerifies, false, 'another key fails');
});
test('only the current release\'s package is served, whole or in ranges', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const pkg = crypto.randomBytes(4096), digest = sha(pkg).toString('hex');
  const stale = crypto.randomBytes(100), staleDigest = sha(stale).toString('hex');
  const server = await harness({publicSpkiHex: spkiHex, release: {...RELEASE, sha256: digest, size: pkg.length}}); t.after(() => server.close());
  const worker = server.getWorker();
  await worker.fetch(`/__put/${digest}.crx3`, {method: 'PUT', body: pkg});
  await worker.fetch(`/__put/${staleDigest}.crx3`, {method: 'PUT', body: stale});
  const whole = await worker.fetch(`/update/win/pkg/${digest}.crx3`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-length'), String(pkg.length));
  assert.ok(Buffer.from(await whole.arrayBuffer()).equals(pkg));
  const part = await worker.fetch(`/update/win/pkg/${digest}.crx3`, {headers: {range: 'bytes=100-199'}});
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${pkg.length}`);
  assert.ok(Buffer.from(await part.arrayBuffer()).equals(pkg.subarray(100, 200)));
  const head = await worker.fetch(`/update/win/pkg/${digest}.crx3`, {method: 'HEAD'});
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(pkg.length));
  assert.equal((await worker.fetch(`/update/win/pkg/${staleDigest}.crx3`)).status, 404, 'a package no release names');
  assert.equal((await worker.fetch(`/update/win/pkg/${digest}.zip`)).status, 404);
  assert.equal((await worker.fetch(`/update/win/pkg/${digest}.crx3`, {method: 'POST'})).status, 405);
  const none = await harness({publicSpkiHex: spkiHex, release: {appId: BROWSER, version: null}}); t.after(() => none.close());
  assert.equal((await none.getWorker().fetch(`/update/win/pkg/${digest}.crx3`)).status, 404, 'no release, no package');
});
test('the beta\'s logo is served for the install window, light, dark and legacy', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  // chrome/updater/app/app_install_win.cc asks AppLogoURL + `{escaped app id}{_light|_dark|}.bmp?lang=…`.
  const light = fs.readFileSync(path.join(workerRoot, 'assets/logo_light.bmp')), dark = fs.readFileSync(path.join(workerRoot, 'assets/logo_dark.bmp'));
  const server = await harness({publicSpkiHex: spkiHex, release: RELEASE, icons: {light: light.toString('base64'), dark: dark.toString('base64')}});
  t.after(() => server.close());
  const worker = server.getWorker();
  const get = async p => { const r = await worker.fetch(p); return {status: r.status, type: r.headers.get('content-type'), bytes: Buffer.from(await r.arrayBuffer())}; };
  const id = '%7b459fd3cf-456c-4a06-8b37-2084cf64ddce%7d';
  const l = await get(`/update/icons/${id}_light.bmp?lang=en`);
  assert.equal(l.status, 200); assert.equal(l.type, 'image/bmp'); assert.ok(l.bytes.equals(light));
  assert.ok((await get(`/update/icons/${id.toUpperCase()}_dark.bmp?lang=en`)).bytes.equals(dark), 'escapes in either case');
  assert.ok((await get(`/update/icons/${id}.bmp`)).bytes.equals(light), 'the legacy name gets the light logo');
  assert.equal((await get('/update/icons/%7b00000000-0000-0000-0000-000000000000%7d_light.bmp')).status, 404, 'another app');
  assert.equal((await get(`/update/icons/${id}_light.png`)).status, 404);
});
test('the staging server offers the release its deploy names (RELEASE_JSON), not the bundled one', {skip: !haveOpenSSL && 'needs OpenSSL 3.5+'}, async t => {
  const staged = {...RELEASE, version: '158.0.8127.950'};
  const server = await harness({publicSpkiHex: spkiHex, release: {appId: BROWSER, version: null}}, {RELEASE_JSON: JSON.stringify(staged)});
  t.after(() => server.close());
  const r = await check(server.getWorker(), [{appid: BROWSER, version: '158.0.8127.901', updatecheck: {}}]);
  assert.ok(proofOk(r));
  assert.equal(parse(r.text).apps[0].updatecheck.nextversion, '158.0.8127.950');
});
test('the staging server is its own Worker with no blanc.day route', () => {
  const toml = fs.readFileSync(path.join(workerRoot, 'wrangler.toml'), 'utf8');
  const staging = toml.slice(toml.indexOf('[env.staging]'));
  assert.ok(toml.includes('[env.staging]'));
  assert.match(staging, /^name = "blanc-update-staging"$/m);
  assert.match(staging, /^routes = \[\]$/m);
  assert.match(staging, /^workers_dev = true$/m);
  assert.match(staging, /\[\[env\.staging\.r2_buckets\]\]\nbinding = "PACKAGES"\nbucket_name = "blanc-windows-updates"/);
});
test.after(() => fs.rmSync(work, {recursive: true, force: true}));
