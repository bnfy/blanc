'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const tooling = ['web-ext', '@devicefarmer/adbkit', 'node-forge'];

test('node-forge VEX remains limited to the reviewed, unused Android tooling', () => {
  const statement = readJson('security/openvex.json').statements.find(
    (entry) => entry.vulnerability.name === 'GHSA-86w9-cpqp-85rv' && entry.status === 'not_affected'
  );
  if (!statement) return; // Without the exception, the ordinary audit owns this finding.

  for (const file of [
    'package-lock.json', 'site/package-lock.json', 'cloudflare/tab-import-worker/package-lock.json',
  ]) {
    for (const key of Object.keys(readJson(file).packages)) {
      assert.equal(tooling.some((name) => key.endsWith(`node_modules/${name}`)), false,
        `${file}: tooling entered another dependency graph; re-review the VEX statement`);
    }
  }

  const lock = readJson('extensions/blanc-tab-import/package-lock.json');
  const reviewed = new Map([['web-ext', '10.6.0'], ['@devicefarmer/adbkit', '3.3.9'], ['node-forge', '1.4.0']]);
  for (const [name, version] of reviewed) {
    const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith(`node_modules/${name}`));
    assert.equal(entries.length, 1, `${name}: re-review the dependency chain`);
    assert.equal(entries[0][1].version, version, `${name}: re-review the dependency source`);
    assert.equal(entries[0][1].dev, true, `${name}: tooling must stay development-only`);
  }
  for (const [name, expectedParent] of [
    ['node-forge', 'node_modules/@devicefarmer/adbkit'],
    ['@devicefarmer/adbkit', 'node_modules/web-ext'],
  ]) {
    const parents = Object.entries(lock.packages)
      .filter(([, entry]) => [entry.dependencies, entry.optionalDependencies, entry.peerDependencies]
        .some((dependencies) => dependencies && name in dependencies))
      .map(([key]) => key);
    assert.deepEqual(parents, [expectedParent], `${name}: a new consumer needs reachability review`);
  }

  const companion = readJson('extensions/blanc-tab-import/package.json');
  assert.deepEqual(companion.scripts, {
    'lint:firefox': 'web-ext lint --source-dir web-extension',
    'build:firefox': 'web-ext build --source-dir web-extension --artifacts-dir dist/firefox --overwrite-dest',
    'sign:firefox': 'web-ext sign --source-dir web-extension --artifacts-dir dist/firefox-signed --channel listed',
    'prepare:safari': 'sh prepare-safari-companion.sh',
  }, 'new companion commands require re-review of the VEX execution boundary');

  const desktop = readJson('package.json');
  for (const pattern of desktop.build.files.filter((entry) => !entry.startsWith('!'))) {
    // The uBO payload is pinned, contains no Android bridge, and its two
    // reproduction scripts require only Node built-ins + the shipped host.
    assert.match(pattern, /^(?:src\/|adblock\/sources\/|ublock\/|scripts\/(?:check-ublock-package|build-ublock-adaptation)\.cjs$|package\.json$|LICENSE$|THIRD-PARTY-NOTICES\.md$|ASSET-LICENSE\.md$)/,
      'a broader desktop source allowlist requires VEX payload review');
  }
});
