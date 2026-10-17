'use strict';
// Rename Device… from a device header in the Other devices drawer (spec
// 2026-10-16-island-lower-section-design.md §6, §7.1).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildDeviceContextMenu } = require('../../src/main/device-context-menu-model');

const t = (key) => ({ 'deviceMenu.rename': 'Rename Device…' })[key];

test('a device header menu offers Rename Device…', () => {
  assert.deepEqual(buildDeviceContextMenu(t), [{ id: 'rename', label: 'Rename Device…' }]);
});

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the panel records the right-clicked device header for main', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.match(overlay, /window\.__blancCtxDeviceId = [^;]*#islandDrawer \.island-ghead\[data-device-id\]/);
  assert.match(overlay, /window\.__blancCtxDeviceId == null/, 'a recorded header keeps the native menu');
});

test('the name prompt renames a device through the bridge', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.match(overlay, /purpose\.renameDeviceId != null/);
  assert.match(overlay, /kind: 'device'/);
  assert.match(overlay, /window\.browserAPI\.renameDevice\(prompt\.id, value\)/);
  assert.match(overlay, /blancI18n\.t\('prompt\.renameDevice'\)/);
});

// main.js cannot be required under node --test; lift the shipped function.
const mainSource = read('src/main/main.js');
const beginSource = mainSource.match(/function beginRenameDevice\([^)]*\) \{[\s\S]*?\n\}/)?.[0];

test('Rename Device… opens the panel with the device’s shown name', () => {
  assert.ok(beginSource, 'beginRenameDevice not found in main.js — update this test with it');
  const shown = [];
  const sandbox = {
    knownRemoteDevices: () => [{ deviceId: 'acceptance-remote-device', name: 'Work laptop' }],
    showOverlay: (mode, opts) => shown.push({ mode, opts }),
  };
  vm.runInNewContext(`${beginSource}\nthis.begin = beginRenameDevice;`, sandbox);
  sandbox.begin('acceptance-remote-device');
  sandbox.begin('gone-device');
  assert.deepEqual(JSON.parse(JSON.stringify(shown)), [{
    mode: 'panel',
    opts: { prefill: 'Work laptop', purpose: { renameDeviceId: 'acceptance-remote-device' } },
  }]);
});

test('main renames only devices it lists, through sync', () => {
  assert.match(mainSource, /chromeHandle\('chrome:rename-device', \(_e, id, name\) => sync\.renameRemoteDevice\(id, name, knownRemoteDevices\(\)\)\);/);
  assert.match(mainSource, /attachDeviceHeaderMenu\(rt\(\)\.overlayView\.webContents, \{/);
});
