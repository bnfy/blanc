'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const { captureRuntimeForPlatform } = require('../../src/main/capture-platform');
const { chromeResourcePath } = require('../../src/main/chrome-protocol');
const { captureMainworldSourceForPlatform } = require('../../src/main/capture-mainworld');

for (const platform of ['darwin', 'win32', 'linux']) {
  test(`${platform} selects one complete locked capture runtime`, () => {
    const runtime = captureRuntimeForPlatform(platform);
    assert.equal(runtime.revision, platform === 'darwin' ? 'fda425eb' : 'c26127eb');
    const lock = require('../../src/main/capture-runtime-lock.json');
    for (const [role, dir] of [['preload', 'main'], ['broker', 'main'], ['helper', 'renderer']]) {
      const member = `src/${dir}/${runtime[role]}`;
      const bytes = fs.readFileSync(path.join(ROOT, member));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), lock.files[member], `${platform} ${role} changed; reopen its platform evidence explicitly`);
    }
    const page = captureMainworldSourceForPlatform(platform);
    assert.match(page, /startAudioPlayout/);
    if (platform !== 'darwin') assert.match(page, /tryStartCanvasPipeline/);
    else {
      assert.doesNotMatch(page, /tryStartCanvasPipeline|createScriptProcessor|__blancAdapterConsumer/);
      assert.match(page, /wrapTrack\(event\.track/);
    }
    assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/display-capture-helper.js', platform), path.join(ROOT, 'src/renderer', runtime.helper));
    assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/display-capture-helper-playout.js', platform), null);
    assert.equal(chromeResourcePath('blanc-chrome://display-capture-helper/display-capture-helper.js?platform=linux', platform), null);
  });
}

test('runtime selection rejects unsupported platforms and page-supplied values', () => {
  for (const value of ['', 'darwin/../linux', '__proto__', {platform:'linux'}]) {
    assert.throws(() => captureRuntimeForPlatform(value), /Unsupported capture platform/);
  }
});

test('Windows retains its original runtime paths while Linux gets separate files', () => {
  const win = captureRuntimeForPlatform('win32');
  const linux = captureRuntimeForPlatform('linux');
  assert.equal(win.preload, 'capture-preload.js');
  assert.equal(win.broker, 'display-capture-broker.js');
  assert.equal(win.helper, 'display-capture-helper.js');
  for (const role of ['preload', 'broker', 'helper']) assert.notEqual(win[role], linux[role]);
});

test('main selects both broker and browsing preload through the platform policy', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  assert.match(main, /const CAPTURE_RUNTIME = captureRuntimeForPlatform\(\);/);
  assert.match(main, /require\('\.\/' \+ CAPTURE_RUNTIME\.broker\)/);
  assert.match(main, /filePath: path\.join\(__dirname, CAPTURE_RUNTIME\.preload\)/);
});

test('shared permission, relay, and capture dependencies cannot change silently', () => {
  const lock = require('../../src/main/capture-runtime-lock.json');
  assert.ok(Object.keys(lock.sharedFiles).length >= 14);
  for (const [file, expected] of Object.entries(lock.sharedFiles)) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
    assert.equal(hash, expected, `${file} changed; review the impact on all platforms`);
  }
});
