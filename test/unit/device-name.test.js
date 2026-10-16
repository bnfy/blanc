'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { humanDeviceName, deviceName, readComputerName } = require('../../src/main/device-name');

// The name other devices see for this one. os.hostname() is whatever the
// network assigned (a router hands out "mac.lan"), so a Mac prefers its
// computer name and every platform drops a local-network suffix.

test('a Mac is named by its computer name, not the DHCP hostname', () => {
  assert.equal(
    humanDeviceName({ platform: 'darwin', hostname: 'mac.lan', computerName: 'MacBook Pro M5' }),
    'MacBook Pro M5'
  );
});

test('without a computer name the hostname loses its local suffix', () => {
  assert.equal(humanDeviceName({ platform: 'darwin', hostname: 'MacBook-Neo.local', computerName: '' }), 'MacBook-Neo');
  assert.equal(humanDeviceName({ platform: 'linux', hostname: 'studio.lan' }), 'studio');
  assert.equal(humanDeviceName({ platform: 'linux', hostname: 'box.localdomain' }), 'box');
  assert.equal(humanDeviceName({ platform: 'win32', hostname: 'DESKTOP-4F2' }), 'DESKTOP-4F2');
});

test('a dotted host that is not a local suffix stays whole', () => {
  assert.equal(humanDeviceName({ platform: 'linux', hostname: 'build.example.com' }), 'build.example.com');
});

test('the computer name only applies on macOS and is capped like every entry name', () => {
  assert.equal(humanDeviceName({ platform: 'win32', hostname: 'PC', computerName: 'Ignored' }), 'PC');
  const long = 'x'.repeat(120);
  assert.equal(humanDeviceName({ platform: 'darwin', hostname: 'h', computerName: long }).length, 80);
  assert.equal(humanDeviceName({ platform: 'linux', hostname: long }).length, 80);
});

test('an empty hostname still yields a name', () => {
  assert.equal(humanDeviceName({ platform: 'linux', hostname: '' }), 'unknown device');
});

test('readComputerName asks scutil and returns an empty string on any failure', () => {
  const calls = [];
  const ok = readComputerName((file, args) => { calls.push([file, args]); return 'Mac Studio\n'; });
  assert.equal(ok, 'Mac Studio');
  assert.deepEqual(calls, [['scutil', ['--get', 'ComputerName']]]);
  assert.equal(readComputerName(() => { throw new Error('no scutil'); }), '');
});

test('deviceName reads the computer name once per launch and the hostname fresh', () => {
  let execCalls = 0;
  let host = 'mac.lan';
  const opts = {
    platform: 'darwin',
    hostname: () => host,
    exec: () => { execCalls += 1; return 'MacBook Pro M5'; },
    cache: {},
  };
  assert.equal(deviceName(opts), 'MacBook Pro M5');
  assert.equal(deviceName(opts), 'MacBook Pro M5');
  assert.equal(execCalls, 1);

  const fallback = { platform: 'darwin', hostname: () => host, exec: () => { throw new Error('x'); }, cache: {} };
  assert.equal(deviceName(fallback), 'mac');
  host = 'MacBook-Pro-M5.local';
  assert.equal(deviceName(fallback), 'MacBook-Pro-M5', 'a hostname change shows on the next publish');
});
