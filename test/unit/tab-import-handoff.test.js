'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  MAX_TAB_IMPORT_TABS,
  MAX_TAB_IMPORT_TITLE_LENGTH,
  decryptTabHandoffEnvelope,
  parseTabImportUrl,
  readBoundedResponseBytes,
  sanitizeTabHandoff,
  tabImportUrlsFromArgv,
} = require('../../src/main/tab-import-handoff');

const id = Buffer.alloc(16, 7).toString('base64url');
const key = Buffer.alloc(32, 9).toString('base64url');
const deepLink = `blanc-import://tabs?v=1&id=${id}&key=${key}`;

test('tab-import protocol accepts only an exact opaque v1 handoff', () => {
  assert.deepEqual(parseTabImportUrl(deepLink), { v: 1, id, key });
  for (const value of [
    `blanc-import://other?v=1&id=${id}&key=${key}`,
    `blanc-import://tabs/path?v=1&id=${id}&key=${key}`,
    `blanc-import://tabs?v=2&id=${id}&key=${key}`,
    `blanc-import://tabs?v=1&id=short&key=${key}`,
    `blanc-import://tabs?v=1&id=${id}&key=short`,
    `blanc-import://tabs?v=1&id=${id}&key=${key}&url=https://secret.test/`,
    `${deepLink}#extra`,
    'https://blancbrowser.com/import-tabs/',
    'not a url',
  ]) assert.equal(parseTabImportUrl(value), null, value);
});

test('argv extraction keeps import handoffs separate from ordinary web URLs', () => {
  assert.deepEqual(tabImportUrlsFromArgv([
    '/Applications/Blanc.app', 'https://example.test/', deepLink, null,
  ]), [deepLink]);
});

test('payload sanitizer preserves order, fragments, duplicates, and active tab', () => {
  const result = sanitizeTabHandoff({
    v: 1,
    sourceBrowser: 'firefox',
    tabs: [
      { url: 'https://example.test/path#one', title: '  First   tab  ' },
      { url: 'about:config', title: 'Internal' },
      { url: 'https://example.test/path#one', title: 'Duplicate', active: true },
      { url: 'https://user:secret@example.test/', title: 'Credentials' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skippedCount, 2);
  assert.deepEqual(result.value.tabs, [
    { url: 'https://example.test/path#one', title: 'First tab', active: false },
    { url: 'https://example.test/path#one', title: 'Duplicate', active: true },
  ]);
});

test('payload sanitizer fails closed on bad shape and ambiguous selection', () => {
  assert.equal(sanitizeTabHandoff({ v: 1, sourceBrowser: 'unknown', tabs: [{}] }).error, 'invalid-handoff');
  assert.equal(sanitizeTabHandoff({ v: 1, sourceBrowser: 'safari', tabs: [] }).error, 'empty');
  assert.equal(sanitizeTabHandoff({
    v: 1, sourceBrowser: 'safari', tabs: Array.from({ length: MAX_TAB_IMPORT_TABS + 1 }, () => ({ url: 'https://a.test/' })),
  }).error, 'too-many-tabs');
  assert.equal(sanitizeTabHandoff({
    v: 1, sourceBrowser: 'safari', tabs: [
      { url: 'https://a.test/', active: true }, { url: 'https://b.test/', active: true },
    ],
  }).error, 'multiple-active-tabs');
});

test('payload sanitizer selects the first surviving tab when active input is omitted', () => {
  const result = sanitizeTabHandoff({
    v: 1,
    sourceBrowser: 'chrome',
    tabs: [{ url: 'chrome://settings/' }, { url: 'https://valid.test/', title: '' }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.tabs, [
    { url: 'https://valid.test/', title: 'valid.test', active: true },
  ]);
});

test('titles are whitespace-normalized and bounded without changing URLs', () => {
  const title = `  ${'word '.repeat(100)}  `;
  const result = sanitizeTabHandoff({
    v: 1,
    sourceBrowser: 'edge',
    tabs: [{ url: 'https://valid.test/path#keep', title }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.tabs[0].title.length, MAX_TAB_IMPORT_TITLE_LENGTH);
  assert.equal(result.value.tabs[0].url, 'https://valid.test/path#keep');
});

test('URL bounds apply again after canonical percent-encoding', () => {
  const result = sanitizeTabHandoff({
    v: 1,
    sourceBrowser: 'safari',
    tabs: [
      { url: `https://valid.test/${'é'.repeat(800)}` },
      { url: 'https://kept.test/' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.value.tabs, [
    { url: 'https://kept.test/', title: 'kept.test', active: true },
  ]);
});

test('AES-GCM handoff decrypts and rejects tampering or a wrong key', async () => {
  const payload = { v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://a.test/', title: 'A', active: true }] };
  const keyBytes = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const expiresAt = Date.now() + 600_000;
  const additionalData = new TextEncoder().encode(JSON.stringify(['blanc-tab-handoff', 2, id, expiresAt]));
  const imported = await crypto.webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const encrypted = Buffer.from(await crypto.webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData }, imported, new TextEncoder().encode(JSON.stringify(payload))
  ));
  const envelope = {
    v: 2,
    expiresAt,
    algorithm: 'AES-GCM',
    iv: iv.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
  };
  assert.deepEqual(await decryptTabHandoffEnvelope(envelope, keyBytes.toString('base64url'), id), payload);
  await assert.rejects(
    decryptTabHandoffEnvelope(envelope, crypto.randomBytes(32).toString('base64url'), id),
    /decryption-failed/
  );
  const tampered = Buffer.from(encrypted);
  tampered[0] ^= 1;
  await assert.rejects(
    decryptTabHandoffEnvelope({ ...envelope, ciphertext: tampered.toString('base64url') }, keyBytes.toString('base64url'), id),
    /decryption-failed/
  );
  await assert.rejects(decryptTabHandoffEnvelope({ ...envelope, expiresAt: expiresAt + 1 }, keyBytes.toString('base64url'), id), /decryption-failed/);
  await assert.rejects(decryptTabHandoffEnvelope(envelope, keyBytes.toString('base64url'), crypto.randomBytes(16).toString('base64url')), /decryption-failed/);
  await assert.rejects(decryptTabHandoffEnvelope({ ...envelope, v: 1 }, keyBytes.toString('base64url'), id), /invalid-envelope/);
  await assert.rejects(decryptTabHandoffEnvelope(envelope, keyBytes.toString('base64url'), id, { now: () => expiresAt }), /invalid-expiry/);
  await assert.rejects(decryptTabHandoffEnvelope(envelope, keyBytes.toString('base64url'), id, { now: () => expiresAt - 600_001 }), /invalid-expiry/);
});

test('claim responses are read with a hard streaming byte cap', async () => {
  const small = new Response('1234');
  assert.equal((await readBoundedResponseBytes(small, 4)).toString(), '1234');
  await assert.rejects(readBoundedResponseBytes(new Response('12345'), 4), /invalid-envelope/);
  const oversizedHeader = new Response('x', { headers: { 'Content-Length': '500' } });
  await assert.rejects(readBoundedResponseBytes(oversizedHeader, 4), /invalid-envelope/);
});
