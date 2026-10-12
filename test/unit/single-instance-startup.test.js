'use strict';
// #724: a launch that loses the single-instance lock hands its URLs to the
// running Blanc ('second-instance') and quits, but app.quit() doesn't stop
// app.whenReady(). The losing process went on to run Blanc's startup on the
// running instance's profile: it loaded the blocker from that profile's cache
// and failed creating a window whose name the running Blanc owns.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

test('the single-instance lock is requested once and a refused launch quits', () => {
  assert.match(main, /const ownsInstanceLock = acceptanceTestMode \|\| app\.requestSingleInstanceLock\(\);/);
  assert.match(main, /if \(!ownsInstanceLock\) \{\s*app\.quit\(\);\s*\} else \{/);
  assert.equal(main.match(/app\.requestSingleInstanceLock\(\)/g)?.length, 1);
});

test('a launch that lost the lock never runs Blanc startup', () => {
  const ready = main.indexOf('app.whenReady().then(');
  assert.notEqual(ready, -1, 'the startup handler was found');
  assert.equal(main.indexOf('app.whenReady()', ready + 1), -1, 'startup is registered in one place');
  const body = main.slice(ready, ready + 600);
  const handlerStart = body.indexOf('async () => {');
  assert.notEqual(handlerStart, -1, 'the startup handler body was found');
  const firstStatement = body.slice(handlerStart + 'async () => {'.length)
    .split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('//'));
  assert.equal(firstStatement, 'if (!ownsInstanceLock) return;');
});
