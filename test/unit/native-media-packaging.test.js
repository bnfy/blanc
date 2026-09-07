'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');

test('macOS package declares microphone and camera usage descriptions', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const info = pkg.build?.mac?.extendInfo ?? {};
  assert.match(info.NSMicrophoneUsageDescription ?? '', /microphone/i);
  assert.match(info.NSCameraUsageDescription ?? '', /camera/i);
});

test('hardened main and helper processes carry native media entitlements', () => {
  for (const filename of ['entitlements.mac.plist', 'entitlements.mac.inherit.plist']) {
    const source = fs.readFileSync(path.join(ROOT, 'build', filename), 'utf8');
    assert.match(source, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
    assert.match(source, /<key>com\.apple\.security\.device\.camera<\/key>\s*<true\/>/);
  }

  const verifier = fs.readFileSync(path.join(ROOT, 'scripts/after-sign-verify.js'), 'utf8');
  assert.match(verifier, /ordinaryHelpers[\s\S]*com\.apple\.security\.device\.audio-input/);
  assert.match(verifier, /ordinaryHelpers[\s\S]*com\.apple\.security\.device\.camera/);
});

test('every browsing session receives the native media permission gate', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
  assert.match(main, /createNativeMediaAccessGate\(\{/);
  assert.equal(
    [...main.matchAll(/\.\.\.nativeMediaPermissionOptions/g)].length,
    4,
    'Personal/named regular and private sessions must all share the native gate'
  );
});

test('packaged release gates exercise real macOS camera and cross-platform audio/video tracks', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts?.['test:packaged:native-camera'] ?? '', /--media=camera/);

  const nativeSmoke = fs.readFileSync(
    path.join(ROOT, 'test/desktop/packaged-native-media-smoke.mjs'),
    'utf8'
  );
  assert.match(nativeSmoke, /getVideoTracks/);
  assert.match(nativeSmoke, /videoWidth/);
  assert.match(nativeSmoke, /recorded or uploaded/);

  const packagedSmoke = fs.readFileSync(
    path.join(ROOT, 'test/desktop/packaged-media-smoke.mjs'),
    'utf8'
  );
  assert.match(packagedSmoke, /getUserMedia\(\{ audio: true, video: true \}\)/);
  assert.match(packagedSmoke, /liveAudioTracks > 0/);
  assert.match(packagedSmoke, /liveVideoTracks > 0/);

  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/release-windows-linux.yml'),
    'utf8'
  );
  assert.equal(
    [...workflow.matchAll(/Verify packaged microphone and camera permissions and live tracks/g)]
      .length,
    2,
    'Windows and Linux must both run the combined packaged media gate'
  );
});
