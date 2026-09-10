'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PRELOAD = fs.readFileSync(
  path.join(__dirname, '../../src/main/capture-preload.js'),
  'utf8'
);
const isolated = PRELOAD.split('// <<< mainworld')[1] || '';

test('isolated policy does not fall back to page-controlled executeJavaScript', () => {
  assert.match(isolated, /readIsolatedPolicy/);
  assert.equal(isolated.includes('readMainWorldPolicy'), false);
  assert.doesNotMatch(isolated, /executeJavaScript\s*\(\s*`[\s\S]*permissionsPolicy/);
  assert.doesNotMatch(isolated, /executeJavaScript\s*\(\s*`[\s\S]*featurePolicy/);
  assert.match(
    isolated,
    /const displayCaptureAllowed = readIsolatedPolicy\(\);[\s\S]*if \(displayCaptureAllowed === true\)/
  );
});
