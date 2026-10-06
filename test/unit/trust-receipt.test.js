const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildTrustReceipt,
  inspectLocalSignature,
  macAppPath,
  parseMacIdentity,
} = require('../../src/main/trust-receipt');

test('mac signature parsing requires the exact app identity', () => {
  assert.equal(macAppPath('/Applications/Blanc.app/Contents/MacOS/Blanc'), '/Applications/Blanc.app');
  assert.deepEqual(parseMacIdentity([
    'Executable=/Applications/Blanc.app/Contents/MacOS/Blanc',
    'Identifier=me.bnfy.bowser',
    'Authority=Developer ID Application: Anthony Loria (XYGUCY4498)',
    'TeamIdentifier=XYGUCY4498',
  ].join('\n')), {
    publisher: 'Developer ID Application: Anthony Loria (XYGUCY4498)',
    teamId: 'XYGUCY4498',
    bundleId: 'me.bnfy.bowser',
  });
});

test('development and Linux builds do not claim a locally verified publisher signature', async () => {
  assert.equal((await inspectLocalSignature({ platform: 'darwin', packaged: false })).status, 'development');
  assert.equal((await inspectLocalSignature({ platform: 'linux', packaged: true })).status, 'manifest-backed');
});

test('trust receipt exposes bounded choices and no sync handle or credentials', () => {
  const receipt = buildTrustReceipt({
    appInfo: { version: '1.21.0', bundleBuild: '1210', electron: '44.4.3', chromium: '142', node: '22', platform: 'darwin', architecture: 'arm64', packaged: true },
    signature: { status: 'verified', expectedPublisher: 'expected', observedPublisher: 'expected' },
    blocker: { date: '2026-07-09', combinedSha256: 'abc', lists: [{ file: 'easylist.txt', sha256: 'def' }] },
    sync: { enabled: true, handle: 'must-not-leak', accountId: 'must-not-leak', syncTabs: true },
    choices: { usagePing: false, searchSuggestions: true, secureDns: 'quad9', secureDnsTemplate: 'must-not-leak' },
    diagnostics: { count: 2 },
    links: [{ id: 'release', label: 'Matching release', url: 'must-not-leak' }],
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.sync.openTabsEnabled, true);
  assert.equal(receipt.choices.crashLedger.automaticUpload, false);
  assert.doesNotMatch(serialized, /must-not-leak/);
});

test('settings bridge and main expose only a fixed trust-link enum', () => {
  const root = path.resolve(__dirname, '../..');
  const pages = fs.readFileSync(path.join(root, 'src/main/pages.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/tab-preload.js'), 'utf8');
  assert.match(preload, /trustReceipt: \(\) => invoke\('pages:settings:trust-receipt'\)/);
  assert.match(preload, /openTrustLink: \(kind\) => invoke\('pages:settings:open-trust-link', kind\)/);
  assert.match(pages, /Object\.hasOwn\(trustLinks, kind\)/);
  assert.match(pages, /shell\.openExternal\(trustLinks\[kind\]\)/);
  assert.match(pages, /releases\/tag\/v\$\{release\}/);
  assert.match(pages, /releases\/download\/v\$\{release\}\/Blanc-\$\{release\}\.cdx\.json/);
  assert.doesNotMatch(pages, /open-trust-link[^\n]+openExternal\([^)]*kind/);
});
