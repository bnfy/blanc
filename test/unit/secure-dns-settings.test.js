const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

const loaded = [];
function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  const settings = require('../../src/main/settings');
  loaded.push({ userData, settings });
  return settings;
}

function freshProfile(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `blanc-dns-${name}-`));
  t.after(() => {
    for (const { userData, settings } of loaded) if (userData === dir) settings.flushSettings();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return loadSettings(dir);
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

const NEXTDNS = 'https://dns.nextdns.io/abc123';
const PLAINTEXT = 'http://dns.example/dns-query';

const dns = (s) => ({ secureDns: s.secureDns, secureDnsTemplate: s.secureDnsTemplate });

test('a refused address refuses the provider change with it', (t) => {
  const settings = freshProfile(t, 'refused-pair');
  settings.setSettings({ secureDns: 'custom', secureDnsTemplate: NEXTDNS });
  settings.setSettings({ secureDns: 'cloudflare' });

  // Cloudflare is selected and an older valid address is still stored:
  // Custom with a refused address must keep Cloudflare, as the error line
  // says, not switch DNS to the old address.
  assert.deepEqual(
    dns(settings.setSettings({ secureDns: 'custom', secureDnsTemplate: PLAINTEXT })),
    { secureDns: 'cloudflare', secureDnsTemplate: NEXTDNS },
  );

  // A refused edit while Custom is selected keeps the address in use.
  settings.setSettings({ secureDns: 'custom', secureDnsTemplate: NEXTDNS });
  assert.deepEqual(
    dns(settings.setSettings({ secureDns: 'custom', secureDnsTemplate: 'https://dns.example/q#x' })),
    { secureDns: 'custom', secureDnsTemplate: NEXTDNS },
  );

  // Other keys in a refused DNS write still apply.
  const mixed = settings.setSettings({ secureDns: 'custom', secureDnsTemplate: PLAINTEXT, theme: 'dark' });
  assert.equal(mixed.theme, 'dark');
  assert.deepEqual(dns(mixed), { secureDns: 'custom', secureDnsTemplate: NEXTDNS });
});

test('a valid address still switches Custom on, and Custom alone reuses the stored one', (t) => {
  const settings = freshProfile(t, 'accepted');
  assert.deepEqual(
    dns(settings.setSettings({ secureDns: 'custom', secureDnsTemplate: NEXTDNS })),
    { secureDns: 'custom', secureDnsTemplate: NEXTDNS },
  );
  settings.setSettings({ secureDns: 'quad9' });
  assert.equal(settings.setSettings({ secureDns: 'custom' }).secureDns, 'custom');

  // Clearing the address while Custom is selected is still refused (F25).
  assert.deepEqual(
    dns(settings.setSettings({ secureDns: 'custom', secureDnsTemplate: '' })),
    { secureDns: 'custom', secureDnsTemplate: NEXTDNS },
  );
  assert.equal(Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'secureDns'), false);
});
