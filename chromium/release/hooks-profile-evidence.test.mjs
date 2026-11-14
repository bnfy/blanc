// The official-hooks-absent and profile-coexistence evidence pass only on a
// beta with no test switch in its binaries or behaviour, that keeps to its
// own folders and refuses every reserved one. Fake launchers stand in for
// the browser; nothing here launches an app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as hooks from './hooks-evidence.mjs';
import * as profile from './profile-evidence.mjs';

const release = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
function fakeApp(binaryText = 'nothing to see') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-hp-ev-'));
  const app = path.join(base, 'Blanc Beta.app');
  fs.mkdirSync(path.join(app, 'Contents/MacOS'), {recursive: true});
  const macho = Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(`\0${binaryText}\0`)]);
  fs.writeFileSync(path.join(app, 'Contents/MacOS/Blanc Beta'), macho);
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleVersion</key><string>${release.build}</string><key>CrProductDirName</key><string>Blanc Beta</string></dict></plist>\n`);
  return {app, done: () => fs.rmSync(base, {recursive: true, force: true})};
}

test('switch names count only as whole C strings in Mach-O files', () => {
  const bytes = Buffer.from('\0blanc-test-\0x\0blanc-testing\0blanc-test\0');
  assert.equal(hooks.hasCString(bytes, 'blanc-test'), true);
  assert.equal(hooks.hasCString(Buffer.from('\0blanc-test-version-x\0'), 'blanc-test-version'), false);
  const clean = fakeApp(), dirty = fakeApp('blanc-sync-endpoint');
  fs.writeFileSync(path.join(clean.app, 'Contents/notes.txt'), '\0blanc-test\0');
  assert.deepEqual(hooks.staticScan(clean.app).found, [], 'only Mach-O files are scanned');
  assert.deepEqual(hooks.staticScan(dirty.app).found, [{file: 'Contents/MacOS/Blanc Beta', name: 'blanc-sync-endpoint'}]);
  clean.done(); dirty.done();
});

test('hooks evidence fails on a switch in a binary or one that takes effect', async () => {
  const quiet = async ({home, args}) => { args(1); return {requests: ['localhost:1 /'], quitOnItsOwn: false}; };
  const a = fakeApp();
  const good = await hooks.collect(release, a.app, {run: quiet});
  assert.equal(good.status, 'pass', good.failures.join('; '));
  const loud = async ({home, args}) => { args(1); return {requests: ['localhost:1 /', '127.0.0.1:1 /telemetry'], quitOnItsOwn: false}; };
  assert.match((await hooks.collect(release, a.app, {run: loud})).failures.join('\n'), /collector heard \/telemetry/);
  const writes = async ({home, args}) => { args(1); fs.writeFileSync(path.join(home, 'test-browser-home', 'x'), ''); return {requests: ['localhost:1 /']}; };
  assert.match((await hooks.collect(release, a.app, {run: writes})).failures.join('\n'), /test data home was written/);
  const dead = async ({args}) => { args(1); return {requests: []}; };
  assert.match((await hooks.collect(release, a.app, {run: dead})).failures.join('\n'), /did not open its page/);
  a.done();
  const b = fakeApp('blanc-test-browser-home');
  assert.match((await hooks.collect(release, b.app, {run: quiet})).failures.join('\n'), /names the test switch --blanc-test-browser-home/);
  b.done();
});

// A fake beta that behaves as the guard should, unless told otherwise.
function fakeBeta({leak, open, foreign} = {}) {
  return async ({home, args = []}) => {
    const dir = args.find(a => a.startsWith('--user-data-dir=') || a.startsWith('--disk-cache-dir='));
    if (args.length) {
      if (leak && dir) fs.writeFileSync(path.join(dir.split('=')[1].replace(/\/(Default|inner)$/, ''), 'touched'), '');
      return open ? {requests: ['localhost:1 /'], quitOnItsOwn: false} : {requests: [], quitOnItsOwn: true, exitCode: 1};
    }
    const own = path.join(home, 'Library/Application Support/Blanc Beta');
    fs.mkdirSync(path.join(own, 'Default'), {recursive: true}); fs.writeFileSync(path.join(own, 'Local State'), '{}');
    if (foreign) fs.mkdirSync(path.join(home, 'Library/Application Support/Chromium'));
    return {requests: ['localhost:1 /'], quitOnItsOwn: false};
  };
}

test('profile evidence passes a beta that keeps to its own folder and refuses the rest', async () => {
  const a = fakeApp(), realBeta = fs.mkdtempSync(path.join(os.tmpdir(), 'real-beta-'));
  const good = await profile.collect(release, a.app, {run: fakeBeta(), realBeta});
  assert.equal(good.status, 'pass', good.failures.join('; '));
  assert.equal(Object.keys(good.scenarios).length, 1 + profile.REFUSALS('/h').length);
  assert.match((await profile.collect(release, a.app, {run: fakeBeta({open: true}), realBeta})).failures.join('\n'), /electron-profile: the beta opened its page/);
  assert.match((await profile.collect(release, a.app, {run: fakeBeta({leak: true}), realBeta})).failures.join('\n'), /electron-profile: changed Library\/Application Support\/Blanc/);
  assert.match((await profile.collect(release, a.app, {run: fakeBeta({foreign: true}), realBeta})).failures.join('\n'), /default: created Library\/Application Support\/Chromium/);
  const touchesReal = async opts => { fs.writeFileSync(path.join(realBeta, 'x'), String(Math.random())); return fakeBeta()(opts); };
  assert.match((await profile.collect(release, a.app, {run: touchesReal, realBeta})).failures.join('\n'), /real Blanc Beta folder changed/);
  a.done(); fs.rmSync(realBeta, {recursive: true, force: true});
});
