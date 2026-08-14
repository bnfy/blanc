'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicAddress, resolvePinnedTarget, pinnedLookup } = require('../../src/main/favicon-network');

test('favicon network policy rejects local, special-use, and documentation addresses', () => {
  for (const address of [
    '0.0.0.0', '10.2.3.4', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '198.18.0.1', '192.0.2.1', '203.0.113.1',
    '::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1',
  ]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('favicon target resolution pins a public answer and rejects mixed rebinding answers', async () => {
  const publicOnly = async () => [{ address: '8.8.8.8', family: 4 }];
  assert.deepEqual(
    await resolvePinnedTarget('https://icons.example/favicon.png', publicOnly),
    {
      url: new URL('https://icons.example/favicon.png'),
      address: '8.8.8.8',
      family: 4,
      addresses: [{ address: '8.8.8.8', family: 4 }],
    }
  );
  const rebound = async () => [
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  assert.equal(await resolvePinnedTarget('https://icons.example/favicon.png', rebound), null);
  assert.equal(await resolvePinnedTarget('https://localhost/favicon.png', publicOnly), null);
  assert.equal(await resolvePinnedTarget('file:///tmp/favicon.png', publicOnly), null);
});

test('pinned lookup answers both Node callback shapes without ever re-resolving', () => {
  // Node's autoSelectFamily (default-on since 20) invokes the socket's lookup
  // with `{all: true}` and requires an ARRAY callback; answering in the legacy
  // three-argument shape aborts every connection with "Invalid IP address:
  // undefined" before a single byte is sent. That exact mismatch shipped in
  // 1.2.1 and blanked every remote favicon.
  const target = {
    address: '2606:4700::1', family: 6,
    addresses: [
      { address: '2606:4700::1', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ],
  };
  const lookup = pinnedLookup(target);

  // Happy-eyeballs form: the COMPLETE policy-checked list, so Node can fall
  // back to the other approved family when the preferred one is unreachable.
  let allResult = null;
  lookup('icons.example', { all: true, family: 0 }, (err, addresses) => {
    assert.equal(err, null);
    allResult = addresses;
  });
  assert.deepEqual(allResult, [
    { address: '2606:4700::1', family: 6 },
    { address: '8.8.8.8', family: 4 },
  ]);

  // Legacy form can only carry one answer: the first pinned address.
  let legacyAddress = null;
  let legacyFamily = null;
  lookup('icons.example', { family: 0 }, (err, address, family) => {
    assert.equal(err, null);
    legacyAddress = address;
    legacyFamily = family;
  });
  assert.equal(legacyAddress, '2606:4700::1');
  assert.equal(legacyFamily, 6);
});

test('chrome and internal-page CSP never permit remote favicon loads', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  for (const file of [
    'src/renderer/index.html',
    'src/renderer/overlay.html',
    'src/renderer/pages/bookmarks.html',
    'src/renderer/pages/newtab.html',
  ]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const img = html.match(/img-src ([^;]+)/)?.[1] ?? '';
    assert.doesNotMatch(img, /https?:/, file);
  }
});
