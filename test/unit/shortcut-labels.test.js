'use strict';

// Menu roles report accelerators like 'Command+H'; the Shortcuts sheet must
// show the platform glyphs, never the raw modifier names.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf('function formatAccelerator(');
const end = main.indexOf('\n}', start) + 2;
const source = start >= 0 ? main.slice(start, end) : null;

test('formatAccelerator is liftable from main.js', () => {
  assert.ok(source, 'formatAccelerator not found — update this test');
});

// Modifier words come from the interface catalog (F44); English here.
const { englishT } = require('../support/english-t');
const label = (platform, accelerator) => {
  const sandbox = { process: { platform }, mainI18n: { t: englishT } };
  vm.createContext(sandbox);
  return vm.runInContext(`${source}; formatAccelerator(${JSON.stringify(accelerator)})`, sandbox);
};

test('macOS labels use glyphs in ⌃⌥⇧⌘ order for every modifier spelling', () => {
  for (const [accelerator, expected] of [
    ['Command+H', '⌘H'],
    ['Command+Alt+H', '⌥⌘H'],
    ['Control+Command+F', '⌃⌘F'],
    ['CmdOrCtrl+Shift+T', '⇧⌘T'],
    ['Alt+CmdOrCtrl+Left', '⌥⌘←'],
  ]) assert.equal(label('darwin', accelerator), expected, accelerator);
});

test('Windows and Linux labels spell Ctrl for every control spelling', () => {
  for (const [accelerator, expected] of [
    ['CmdOrCtrl+Shift+T', 'Ctrl+Shift+T'],
    ['Control+Tab', 'Ctrl+Tab'],
    ['Alt+CmdOrCtrl+Left', 'Alt+Ctrl+←'], // arrow glyphs apply on every platform
  ]) assert.equal(label('win32', accelerator), expected, accelerator);
});
