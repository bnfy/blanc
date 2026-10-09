'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createDefaultBrowserStatus } = require('../../src/main/default-browser-status');

const fakeApp = ({ packaged = true, http = false } = {}) => ({
  isPackaged: packaged,
  isDefaultProtocolClient: (scheme) => scheme === 'http' && http,
});

test('macOS and Linux read the http protocol client; Windows reads UserChoice', () => {
  assert.deepEqual(
    createDefaultBrowserStatus({ app: fakeApp({ http: true }), platform: 'darwin' })(),
    { isDefault: true, canSet: true },
  );
  assert.deepEqual(
    createDefaultBrowserStatus({ app: fakeApp({ http: true }), platform: 'linux' })(),
    { isDefault: true, canSet: false },
  );
  let asked = null;
  const win = createDefaultBrowserStatus({
    app: fakeApp({ http: true }),
    platform: 'win32',
    execFileSync: 'exec',
    isWindowsDefaultBrowser: (opts) => { asked = opts; return false; },
  });
  assert.deepEqual(win(), { isDefault: false, canSet: true });
  assert.deepEqual(asked, { execFileSync: 'exec' });
});

test('a development run can never set itself as the default', () => {
  assert.equal(createDefaultBrowserStatus({ app: fakeApp({ packaged: false }), platform: 'darwin' })().canSet, false);
});

test('pages.js uses the shared status and reports Make default to main', () => {
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pages, /createDefaultBrowserStatus\(\{ app, platform: process\.platform, execFileSync \}\)/);
  assert.doesNotMatch(pages, /isDefaultProtocolClient\('http'\)/);
  assert.match(pages, /hooks\.defaultBrowserChanged\?\.\(\);\s*return defaultBrowserStatus\(\);/);
});
