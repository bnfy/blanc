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
async function harness(options) {
  const root = fs.mkdtempSync(path.join(work, 'root-'));
  fs.writeFileSync(path.join(root, 'fixture.js'), `import {makeWorker} from ${JSON.stringify(path.join(workerRoot, 'src/worker.js'))};
export default makeWorker(${JSON.stringify(options)});\n`);
  fs.writeFileSync(path.join(root, 'wrangler.toml'), `name = "update-test"\nmain = "fixture.js"\ncompatibility_date = "2026-10-01"\ncompatibility_flags = ["webcrypto_modern_algorithms"]\n`);
  fs.writeFileSync(path.join(root, '.dev.vars'), `CUP_SEED=${seed.toString('base64')}\n`);
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
  assert.equal((await worker.fetch('/update/win/v4', {method: 'POST', body: '{}'})).status, 400, 'no CUP parameters');
  assert.equal((await worker.fetch('/elsewhere', {method: 'POST', body: '{}'})).status, 404);
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
  // The one production route: the address compiled into the updater (updater.gni).
  const routes = [...toml.matchAll(/pattern = "([^"]+)", zone_name = "([^"]+)"/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(routes, [['blanc.day/update/win/*', 'blanc.day']]);
  assert.equal(/^update_check_url = "([^"]+)"/m.exec(gni)[1], 'https://blanc.day/update/win/v4');
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
test.after(() => fs.rmSync(work, {recursive: true, force: true}));
