'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addressSpaceOfHost,
  gatedScope,
  classifyRequest,
} = require('../../src/main/local-network-access');

const hostOf = (url) => new URL(url).hostname;

test('loopback hosts, as WHATWG URL normalizes them', () => {
  for (const url of [
    'http://localhost/', 'http://LOCALHOST:8769/', 'http://localhost./',
    'http://okta.localhost/', 'http://127.0.0.1/', 'http://127.255.0.9/',
    'http://0x7f.1/', 'http://2130706433/', 'http://[::1]/', 'http://[0:0:0:0:0:0:0:1]/',
    'http://[::ffff:127.0.0.1]/', 'http://0.0.0.0/', 'http://[::]/',
  ]) {
    assert.equal(addressSpaceOfHost(hostOf(url)), 'loopback', url);
  }
});

test('local (private network) hosts', () => {
  for (const url of [
    'http://10.0.0.1/', 'http://10.255.255.255/', 'http://172.16.0.1/', 'http://172.31.255.254/',
    'http://192.168.1.1/', 'http://169.254.10.10/', 'http://100.64.0.1/', 'http://100.127.255.1/',
    'http://[fd00::1]/', 'http://[fc12:3456::1]/', 'http://[fe80::1]/', 'http://[febf::1]/',
    'http://[::ffff:192.168.0.10]/', 'http://printer.local/', 'http://nas.local./', 'http://nas.home.arpa/', 'http://wiki.corp.internal/',
  ]) {
    assert.equal(addressSpaceOfHost(hostOf(url)), 'local', url);
  }
});

test('public hosts, including near misses of the private ranges', () => {
  for (const url of [
    'https://okta.com/', 'https://example.okta.com/', 'http://172.15.255.255/', 'http://172.32.0.1/',
    'http://192.169.0.1/', 'http://100.63.255.255/', 'http://100.128.0.1/', 'http://11.0.0.1/',
    'http://8.8.8.8/', 'http://[2001:4860:4860::8888]/', 'http://[fec0::1]/',
    'http://localhost.example.com/', 'http://local.example/', 'http://notlocalhost/', 'http://home.arpa.example/', 'http://internal.example/',
  ]) {
    assert.equal(addressSpaceOfHost(hostOf(url)), 'public', url);
  }
  assert.equal(addressSpaceOfHost(''), 'public');
  assert.equal(addressSpaceOfHost(undefined), 'public');
});

test('only inward moves are gated', () => {
  assert.equal(gatedScope('public', 'loopback'), 'loopback-network');
  assert.equal(gatedScope('public', 'local'), 'local-network');
  assert.equal(gatedScope('local', 'loopback'), 'loopback-network');
  assert.equal(gatedScope('local', 'local'), null);
  assert.equal(gatedScope('loopback', 'loopback'), null);
  assert.equal(gatedScope('loopback', 'local'), null);
  assert.equal(gatedScope('public', 'public'), null);
  assert.equal(gatedScope('local', 'public'), null);
});

const TOP = { frameOrigin: 'https://acme.okta.com', topOrigin: 'https://acme.okta.com' };
const req = (over = {}) => ({
  url: 'http://localhost:8769/probe',
  resourceType: 'xhr',
  initiatorOrigin: 'https://acme.okta.com',
  ...over,
});

test('a public page calling localhost prompts for its own origin', () => {
  assert.deepEqual(classifyRequest(req(), TOP), {
    scope: 'loopback-network', origin: 'https://acme.okta.com', mode: 'prompt',
  });
  assert.deepEqual(classifyRequest(req({ url: 'http://192.168.1.20/' }), TOP), {
    scope: 'local-network', origin: 'https://acme.okta.com', mode: 'prompt',
  });
});

test('every subresource type and subframes are gated; websockets too', () => {
  for (const resourceType of ['xhr', 'script', 'image', 'media', 'font', 'stylesheet', 'ping', 'object', 'other', 'subFrame', 'webSocket', 'cspReport']) {
    assert.equal(classifyRequest(req({ resourceType }), TOP)?.mode, 'prompt', resourceType);
  }
  assert.equal(classifyRequest(req({ url: 'ws://127.0.0.1:8769/', resourceType: 'webSocket' }), TOP)?.scope, 'loopback-network');
  assert.equal(classifyRequest(req({ url: 'wss://[::1]:8769/', resourceType: 'webSocket' }), TOP)?.scope, 'loopback-network');
});

test('main-frame navigations are never gated', () => {
  assert.equal(classifyRequest(req({ resourceType: 'mainFrame' }), TOP), null);
});

test('not gated: browser-started requests, non-web initiators, non-web targets, local pages', () => {
  assert.equal(classifyRequest(req({ initiatorOrigin: undefined }), TOP), null);
  assert.equal(classifyRequest(req({ initiatorOrigin: 'blanc://newtab' }), TOP), null);
  assert.equal(classifyRequest(req({ initiatorOrigin: 'chrome-extension://abc' }), TOP), null);
  assert.equal(classifyRequest(req({ url: 'blanc://newtab/' }), TOP), null);
  assert.equal(classifyRequest(req({ url: 'data:text/plain,hi' }), TOP), null);
  assert.equal(classifyRequest(req({ initiatorOrigin: 'http://localhost:3000' }), {
    frameOrigin: 'http://localhost:3000', topOrigin: 'http://localhost:3000',
  }), null);
  assert.equal(classifyRequest(req({ url: 'https://okta.com/x' }), TOP), null);
});

test('an opaque initiator (sandboxed frame) is refused without a prompt', () => {
  assert.deepEqual(classifyRequest(req({ initiatorOrigin: 'null' }), TOP), {
    scope: 'loopback-network', origin: null, mode: 'deny',
  });
  assert.deepEqual(classifyRequest(req({ initiatorOrigin: 'null' }), null), {
    scope: 'loopback-network', origin: null, mode: 'deny',
  }, 'no frame: assume public');
});

test('a sandboxed frame on a local page keeps reaching that page\'s local services', () => {
  const local = { frameOrigin: null, topOrigin: 'http://localhost:3000' };
  assert.equal(classifyRequest(req({ initiatorOrigin: 'null', url: 'http://localhost:3000/api' }), local), null);
  assert.deepEqual(
    classifyRequest(req({ initiatorOrigin: 'null' }), { frameOrigin: null, topOrigin: 'http://192.168.1.5' }),
    { scope: 'loopback-network', origin: null, mode: 'deny' },
    'local page, loopback target: still inward',
  );
});

test('frame details are read only for requests that could be gated', () => {
  let reads = 0;
  const lazy = () => { reads += 1; return TOP; };
  assert.equal(classifyRequest(req({ url: 'https://cdn.example/x.js' }), lazy), null);
  assert.equal(classifyRequest(req({ resourceType: 'mainFrame' }), lazy), null);
  assert.equal(reads, 0);
  assert.equal(classifyRequest(req(), lazy).mode, 'prompt');
  assert.equal(reads, 1);
});

test('same-origin subframes count as the page; cross-origin ones are refused', () => {
  assert.equal(classifyRequest(req(), {
    frameOrigin: 'https://acme.okta.com', topOrigin: 'https://acme.okta.com',
  }).mode, 'prompt');
  assert.deepEqual(classifyRequest(req({ initiatorOrigin: 'https://ads.example' }), {
    frameOrigin: 'https://ads.example', topOrigin: 'https://acme.okta.com',
  }), { scope: 'loopback-network', origin: 'https://acme.okta.com', mode: 'deny' });
});

test('with no frame (a worker, or a frame already gone) only a stored allow can apply', () => {
  assert.deepEqual(classifyRequest(req(), null), {
    scope: 'loopback-network', origin: 'https://acme.okta.com', mode: 'stored-only',
  });
  assert.deepEqual(classifyRequest(req(), { frameOrigin: null, topOrigin: null }), {
    scope: 'loopback-network', origin: 'https://acme.okta.com', mode: 'stored-only',
  });
});

test('a local page calling loopback is gated for the local page', () => {
  assert.deepEqual(classifyRequest(req({ initiatorOrigin: 'http://192.168.1.5' }), {
    frameOrigin: 'http://192.168.1.5', topOrigin: 'http://192.168.1.5',
  }), { scope: 'loopback-network', origin: 'http://192.168.1.5', mode: 'prompt' });
});
