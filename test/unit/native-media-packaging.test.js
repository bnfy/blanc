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
