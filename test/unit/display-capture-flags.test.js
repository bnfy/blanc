'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
  LINUX_INPUT_VOLUME_FEATURE,
  captureDisabledFeatures,
  shouldPreferWaylandOzone,
  applyLinuxCaptureOzone,
} = require('../../src/main/display-capture-flags');

test('merges extras onto an existing comma list without duplicates', () => {
  assert.equal(
    mergeDisabledFeatures('FedCm', [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
  assert.equal(
    mergeDisabledFeatures(`FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`, [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
});

test('empty prior keeps only extras', () => {
  assert.equal(mergeDisabledFeatures('', ['FedCm', MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`);
});

test('capture flags stay platform-specific and preserve existing disables', () => {
  assert.deepEqual(captureDisabledFeatures('darwin'), [MAC_CATAP_LOOPBACK_FEATURE]);
  assert.deepEqual(captureDisabledFeatures('linux'), [LINUX_INPUT_VOLUME_FEATURE]);
  assert.deepEqual(captureDisabledFeatures('win32'), []);
  assert.equal(mergeDisabledFeatures(`Existing,FedCm,${LINUX_INPUT_VOLUME_FEATURE}`,
    ['FedCm', ...captureDisabledFeatures('linux')]), `Existing,FedCm,${LINUX_INPUT_VOLUME_FEATURE}`);
});

test('Wayland sessions prefer ozone wayland unless already pinned', () => {
  assert.equal(shouldPreferWaylandOzone('linux', { WAYLAND_DISPLAY: 'wayland-0' }, false), true);
  assert.equal(shouldPreferWaylandOzone('linux', { XDG_SESSION_TYPE: 'wayland' }, false), true);
  assert.equal(shouldPreferWaylandOzone('linux', { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, false), true);
  assert.equal(shouldPreferWaylandOzone('linux', { WAYLAND_DISPLAY: 'wayland-0' }, true), false);
  assert.equal(shouldPreferWaylandOzone('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, false), false);
  assert.equal(shouldPreferWaylandOzone('darwin', { WAYLAND_DISPLAY: 'wayland-0' }, false), false);
});

test('applyLinuxCaptureOzone appends only when preferred', () => {
  const switches = [];
  const commandLine = {
    hasSwitch: (name) => switches.some((row) => row[0] === name),
    getSwitchValue: (name) => switches.find((row) => row[0] === name)?.[1] || '',
    appendSwitch: (name, value) => { switches.push([name, value]); },
  };
  assert.equal(applyLinuxCaptureOzone(commandLine, {
    platform: 'linux',
    env: { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' },
  }), true);
  assert.deepEqual(switches, [['ozone-platform', 'wayland']]);
  assert.equal(applyLinuxCaptureOzone(commandLine, {
    platform: 'linux',
    env: { WAYLAND_DISPLAY: 'wayland-0' },
  }), false);
  assert.equal(applyLinuxCaptureOzone(commandLine, {
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' },
  }), false);
});
