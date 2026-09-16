'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { captureRuntimeForPlatform } = require('../src/main/capture-platform');
const ROOT = path.resolve(__dirname, '..');

function verifyCaptureRuntime(readMember, platform, {root = ROOT} = {}) {
  const runtime = captureRuntimeForPlatform(platform);
  const manifestPath = 'src/main/capture-runtime-lock.json';
  const lock = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  assert.equal(lock.baselines[platform], runtime.revision, 'capture baseline does not match platform selection');
  const members = [
    `src/main/${runtime.preload}`,
    `src/main/${runtime.broker}`,
    `src/renderer/${runtime.helper}`,
  ];
  for (const member of members) {
    const hash = crypto.createHash('sha256').update(readMember(member)).digest('hex');
    assert.equal(hash, lock.files[member], `${platform} capture runtime drift: ${member}`);
  }
  for (const [member, expected] of Object.entries(lock.sharedFiles)) {
    const hash = crypto.createHash('sha256').update(readMember(member)).digest('hex');
    assert.equal(hash, expected, `shared capture dependency drift (all platforms): ${member}`);
  }
  // Bind the packaged dispatch and the lock itself to the reviewed source.
  for (const member of [manifestPath, 'src/main/capture-platform.js', 'src/main/main.js', 'src/main/chrome-protocol.js']) {
    assert.ok(readMember(member).equals(fs.readFileSync(path.join(root, member))), `packaged capture dispatch mismatch: ${member}`);
  }
  return {platform, revision:runtime.revision, members};
}

function verifyPackagedCaptureRuntime(asarPath, platform) {
  const { extractFile } = require('@electron/asar');
  const result = verifyCaptureRuntime(member => extractFile(asarPath, member.split('/').join(path.sep)), platform);
  console.log(`packaged capture runtime: ${platform} ${result.revision} verified`);
  return result;
}

module.exports = { verifyCaptureRuntime, verifyPackagedCaptureRuntime };
