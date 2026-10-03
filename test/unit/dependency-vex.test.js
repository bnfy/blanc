'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const tooling = ['web-ext', '@devicefarmer/adbkit', 'node-forge'];

test('http-cache-semantics VEX stays within the reviewed static site and build downloads', () => {
  const statement = readJson('security/openvex.json').statements.find(
    (entry) => entry.vulnerability.name === 'GHSA-ch52-4w7c-c8xp' && entry.status === 'not_affected'
  );
  if (!statement) return;

  for (const [file, expectedParent, developmentOnly] of [
    ['package-lock.json', 'node_modules/cacheable-request', true],
    ['site/package-lock.json', 'node_modules/astro', false],
  ]) {
    const packages = readJson(file).packages;
    const entries = Object.entries(packages).filter(([key]) => key.endsWith('node_modules/http-cache-semantics'));
    assert.equal(entries.length, 1, `${file}: re-review additional copies`);
    assert.equal(entries[0][1].version, '4.2.0', `${file}: re-review the dependency source`);
    assert.equal(entries[0][1].dev === true, developmentOnly, `${file}: scope changed`);
    const parents = Object.entries(packages)
      .filter(([, entry]) => [entry.dependencies, entry.optionalDependencies, entry.peerDependencies]
        .some((dependencies) => dependencies && 'http-cache-semantics' in dependencies))
      .map(([key]) => key);
    assert.deepEqual(parents, [expectedParent], `${file}: a new consumer needs reachability review`);
  }
  for (const [file, reviewed] of [
    ['package-lock.json', {
      'node_modules/app-builder-lib': '26.15.3',
      'node_modules/app-builder-lib/node_modules/@electron/get': '3.1.0',
      'node_modules/got': '11.8.6',
      'node_modules/cacheable-request': '7.0.4',
    }],
    ['site/package-lock.json', { 'node_modules/astro': '7.3.2' }],
  ]) {
    const packages = readJson(file).packages;
    for (const [key, version] of Object.entries(reviewed)) {
      assert.equal(packages[key]?.version, version, `${key}: re-review the consumer source`);
      if (file === 'package-lock.json') assert.equal(packages[key].dev, true);
    }
  }
  for (const file of [
    'cloudflare/tab-import-worker/package-lock.json',
    'extensions/blanc-tab-import/package-lock.json',
  ]) {
    assert.equal(Object.keys(readJson(file).packages).some((key) => key.endsWith('node_modules/http-cache-semantics')), false,
      `${file}: the package entered another dependency graph`);
  }
  const config = fs.readFileSync(path.join(ROOT, 'site/astro.config.mjs'), 'utf8');
  assert.match(config, /output:\s*['"]static['"]/);
  assert.doesNotMatch(config, /\badapter\s*:/, 'server deployment requires a new reachability review');
  assert.match(readJson('package.json').scripts['site:deploy'], /wrangler pages deploy site\/dist/);

  // A new first-party consumer could bypass the reviewed transitive entrypoints.
  const inspect = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.wrangler'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(?:[cm]?js|ts|astro)$/.test(entry.name))
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'),
          /(?:require\s*\(\s*|import\s*\(\s*|from\s+|import\s*)['"](?:http-cache-semantics|cacheable-request|got)['"]/,
          `${path.relative(ROOT, file)}: direct cache consumer requires VEX re-review`);
    }
  };
  for (const directory of ['src', 'site/src', 'cloudflare', 'scripts']) inspect(path.join(ROOT, directory));
});

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
    assert.match(pattern, /^(?:src\/|adblock\/sources\/|package\.json$|LICENSE$|THIRD-PARTY-NOTICES\.md$|ASSET-LICENSE\.md$)/,
      'a broader desktop source allowlist requires VEX payload review');
  }
});
