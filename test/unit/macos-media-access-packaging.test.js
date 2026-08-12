'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

test('the packaged macOS app declares its microphone purpose', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const info = pkg.build?.mac?.extendInfo;

  // Without these keys macOS refuses to show system device consent, even once
  // Blanc has allowed a website's getUserMedia request.
  assert.equal(info.NSMicrophoneUsageDescription, 'Blanc allows websites you approve to use your microphone.');
});
