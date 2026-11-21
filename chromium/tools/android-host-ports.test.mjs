// Two emulators on the build server (chromium/android/server/README.md): each run's host-side ports
// follow its emulator, so two runs at once never share one, and the outbound check uses the
// emulator its run was given.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hostPort} from '../tests/android/support/host-ports.mjs';
import {pickEmulator} from '../tests/android/outbound-gate.mjs';

test('the first emulator, or none named, keeps the ports runs have always used', () => {
  assert.equal(hostPort(9333, {}), 9333);
  assert.equal(hostPort(9333, {ANDROID_SERIAL: 'emulator-5554'}), 9333);
});

test('the second emulator moves every host port up by 100, the third by 200', () => {
  assert.equal(hostPort(9333, {ANDROID_SERIAL: 'emulator-5556'}), 9433);
  assert.equal(hostPort(8765, {ANDROID_SERIAL: 'emulator-5556'}), 8865);
  assert.equal(hostPort(9333, {ANDROID_SERIAL: 'emulator-5558'}), 9533);
});

test('a phone over USB or Wi-Fi keeps the usual ports', () => {
  assert.equal(hostPort(9333, {ANDROID_SERIAL: '5B060DLCH000HD'}), 9333);
  assert.equal(hostPort(9333, {ANDROID_SERIAL: '192.168.86.249:37481'}), 9333);
});

const names = {'emulator-5554': 'android_36_google_apis_x64', 'emulator-5556': 'android_36_google_apis_x64',
  'emulator-5560': 'other_avd'};
const nameOf = serial => names[serial];

test('the outbound check runs on the emulator its run was given', () => {
  assert.equal(pickEmulator(Object.keys(names), nameOf, 'android_36_google_apis_x64', 'emulator-5556'), 'emulator-5556');
});

test('without one given, it takes the first emulator of that AVD, as before', () => {
  assert.equal(pickEmulator(Object.keys(names), nameOf, 'android_36_google_apis_x64', undefined), 'emulator-5554');
});

test('an emulator given that runs another AVD, or none at all, is refused', () => {
  assert.equal(pickEmulator(Object.keys(names), nameOf, 'android_36_google_apis_x64', 'emulator-5560'), undefined);
  assert.equal(pickEmulator(Object.keys(names), nameOf, 'android_36_google_apis_x64', 'emulator-5590'), undefined);
});

test('an emulator serial that is odd or below the first is refused, not given a made-up port', () => {
  assert.throws(() => hostPort(9333, {ANDROID_SERIAL: 'emulator-5555'}), /emulator-5555/);
  assert.throws(() => hostPort(9333, {ANDROID_SERIAL: 'emulator-5552'}), /emulator-5552/);
});
