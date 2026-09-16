'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decryptTabHandoffEnvelope } = require('../../src/main/tab-import-handoff');

const extensionModel = import('../../extensions/blanc-tab-import/web-extension/handoff.mjs');
const ROOT = path.resolve(__dirname, '../..');

test('Safari packaged resources match the shared extension byte for byte', () => {
  const shared = path.join(ROOT, 'extensions/blanc-tab-import/web-extension');
  const resources = path.join(ROOT, 'extensions/blanc-tab-import/safari/Blanc Tab Importer/Blanc Tab Importer Extension/Resources');
  for (const name of fs.readdirSync(shared, { recursive: true })) {
    if (name === 'manifest.json' || !fs.statSync(path.join(shared, name)).isFile()) continue;
    assert.deepEqual(fs.readFileSync(path.join(resources, name)), fs.readFileSync(path.join(shared, name)), name);
  }
  assert.deepEqual(fs.readFileSync(path.join(resources, 'manifest.json')),
    fs.readFileSync(path.join(ROOT, 'extensions/blanc-tab-import/manifest.safari.json')));
});

test('Firefox manifest has only reviewed access and accurately declares selected-tab data', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions/blanc-tab-import/web-extension/manifest.json'), 'utf8'
  ));
  assert.deepEqual(manifest.permissions, ['tabs']);
  assert.deepEqual(manifest.host_permissions, ['https://tabs.blancbrowser.com/*']);
  assert.equal(manifest.incognito, 'not_allowed');
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, [
    'browsingActivity',
    'websiteContent',
  ]);
});

test('Safari manifest keeps the same least-privilege API and relay access', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'extensions/blanc-tab-import/manifest.safari.json'), 'utf8'
  ));
  assert.deepEqual(manifest.permissions, ['tabs']);
  assert.deepEqual(manifest.host_permissions, ['https://tabs.blancbrowser.com/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.browser_specific_settings, undefined);
});

test('generated Safari companion uses a separate, valid parent-child bundle family', () => {
  const project = fs.readFileSync(path.join(
    ROOT,
    'extensions/blanc-tab-import/safari/Blanc Tab Importer/Blanc Tab Importer.xcodeproj/project.pbxproj'
  ), 'utf8');
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = "me\.bnfy\.blanc\.tab-importer";/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = "me\.bnfy\.blanc\.tab-importer\.Extension";/);
  assert.doesNotMatch(project, /me\.bnfy\.bowser/);
  assert.doesNotMatch(project, /me\.bnfy\.blanc\.Blanc-Tab-Importer/);
});

test('popup stays in the current window, refuses private windows, and never selects over 100', () => {
  const popup = fs.readFileSync(
    path.join(ROOT, 'extensions/blanc-tab-import/web-extension/popup.js'), 'utf8'
  );
  assert.match(popup, /windows\.getCurrent\(\)/);
  assert.match(popup, /currentWindow:\s*true/);
  assert.match(popup, /currentWindow\?\.incognito/);
  assert.match(popup, /index\s*<\s*MAX_TABS/);
  assert.doesNotMatch(popup, /allWindowIds|windowId:\s*undefined/);
});

test('companion sanitizer keeps current-window order and rejects private/internal/credential URLs', async () => {
  const { sanitizeExtensionTabs } = await extensionModel;
  const result = sanitizeExtensionTabs([
    { id: 1, url: 'https://a.test/#one', title: ' A ', active: false },
    { id: 2, url: 'about:config', title: 'Internal' },
    { id: 3, url: 'https://user:pass@b.test/', title: 'Secret' },
    { id: 4, url: 'https://c.test/', title: 'Private', incognito: true },
    { id: 5, url: 'https://a.test/#one', title: 'Again', active: true },
  ]);
  assert.equal(result.skippedCount, 3);
  assert.deepEqual(result.tabs, [
    { id: 1, url: 'https://a.test/#one', title: 'A', active: false },
    { id: 5, url: 'https://a.test/#one', title: 'Again', active: true },
  ]);
});

test('companion encryption yields a desktop-compatible payload without plaintext metadata', async () => {
  const { encryptSelectedTabs } = await extensionModel;
  const encrypted = await encryptSelectedTabs({
    sourceBrowser: 'firefox',
    tabs: [{ id: 1, url: 'https://a.test/', title: 'A', active: false }],
  });
  assert.deepEqual(await decryptTabHandoffEnvelope(encrypted.envelope, encrypted.key, encrypted.id), {
    v: 1,
    sourceBrowser: 'firefox',
    tabs: [{ url: 'https://a.test/', title: 'A', active: true }],
  });
  assert.doesNotMatch(JSON.stringify(encrypted.envelope), /a\.test|"A"/);
});

test('companion rejects canonical URL expansion and oversized encrypted metadata', async () => {
  const { encryptSelectedTabs, sanitizeExtensionTabs } = await extensionModel;
  const clean = sanitizeExtensionTabs([
    { id: 1, url: `https://valid.test/${'é'.repeat(800)}` },
    { id: 2, url: 'https://kept.test/', active: true },
  ]);
  assert.equal(clean.skippedCount, 1);
  assert.equal(clean.tabs[0].url, 'https://kept.test/');

  const longUrl = `https://large.test/${'a'.repeat(2028)}`;
  await assert.rejects(encryptSelectedTabs({
    sourceBrowser: 'firefox',
    tabs: Array.from({ length: 100 }, (_, index) => ({
      id: index,
      url: longUrl,
      title: '🟠'.repeat(200),
      active: index === 0,
    })),
  }), /too-large/);
});

test('companion upload sends only the encrypted envelope and returns a fragment capability', async () => {
  const { stageEncryptedHandoff } = await extensionModel;
  const encrypted = {
    id: 'BwcHBwcHBwcHBwcHBwcHBw',
    key: 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk',
    envelope: { v: 2, expiresAt: Date.now() + 600_000, algorithm: 'AES-GCM', iv: 'CAgICAgICAgICAgI', ciphertext: 'AQEBAQEBAQEBAQEBAQEBAQ' },
  };
  let request = null;
  const launch = await stageEncryptedHandoff(encrypted, async (url, init) => {
    request = { url, init };
    return new Response('{}', { status: 201 });
  });
  assert.equal(request.url, `https://tabs.blancbrowser.com/v1/handoffs/${encrypted.id}`);
  assert.deepEqual(JSON.parse(request.init.body), encrypted.envelope);
  assert.equal(launch, `https://blancbrowser.com/import-tabs/#v=1&id=${encrypted.id}&key=${encrypted.key}`);
});

test('companion upload exposes actionable clock/expiry failure', async () => {
  const { stageEncryptedHandoff } = await extensionModel;
  await assert.rejects(stageEncryptedHandoff({ id: 'id', envelope: {} }, async () => new Response(null, { status: 422 })), /invalid-expiry/);
});
