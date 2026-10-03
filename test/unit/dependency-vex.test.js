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

test('http-cache-semantics VEX remains limited to the reviewed, cache-free build tooling', () => {
  const statement = readJson('security/openvex.json').statements.find(
    (entry) => entry.vulnerability.name === 'GHSA-ch52-4w7c-c8xp' && entry.status === 'not_affected'
  );
  if (!statement) return; // Without the exception, the ordinary audit owns this finding.

  const entriesOf = (lock, name) => Object.entries(lock.packages).filter(([key]) => key.endsWith(`node_modules/${name}`));
  const consumersOf = (lock, name) => Object.entries(lock.packages)
    .filter(([, entry]) => [entry.dependencies, entry.optionalDependencies, entry.peerDependencies]
      .some((dependencies) => dependencies && name in dependencies))
    .map(([key]) => key);

  for (const file of ['cloudflare/tab-import-worker/package-lock.json', 'extensions/blanc-tab-import/package-lock.json']) {
    assert.deepEqual(entriesOf(readJson(file), 'http-cache-semantics'), [],
      `${file}: http-cache-semantics entered another dependency graph; re-review the VEX statement`);
  }

  // Desktop: development-only electron-builder download chain, pinned to the reviewed versions.
  const desktopLock = readJson('package-lock.json');
  for (const [key, version, consumer] of [
    ['node_modules/http-cache-semantics', '4.2.0', 'node_modules/cacheable-request'],
    ['node_modules/cacheable-request', '7.0.4', 'node_modules/got'],
    ['node_modules/got', '11.8.6', 'node_modules/app-builder-lib/node_modules/@electron/get'],
    ['node_modules/app-builder-lib/node_modules/@electron/get', '3.1.0', 'node_modules/app-builder-lib'],
  ]) {
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const entry = desktopLock.packages[key];
    assert.equal(entry?.version, version, `${key}: re-review the dependency source`);
    assert.equal(entry.dev, true, `${key}: build tooling must stay development-only`);
    if (name !== '@electron/get') {
      assert.deepEqual(entriesOf(desktopLock, name).map(([k]) => k), [key], `${name}: re-review the dependency chain`);
      assert.deepEqual(consumersOf(desktopLock, name), [consumer], `${name}: a new consumer needs reachability review`);
    }
  }
  const desktop = readJson('package.json');
  assert.equal(desktop.build.electronDownload, undefined,
    'build.electronDownload can pass a got cache option; re-review the VEX execution boundary');
  for (const pattern of desktop.build.files.filter((entry) => !entry.startsWith('!'))) {
    assert.match(pattern, /^(?:src\/|adblock\/sources\/|package\.json$|LICENSE$|THIRD-PARTY-NOTICES\.md$|ASSET-LICENSE\.md$)/,
      'a broader desktop source allowlist requires VEX payload review');
  }

  // Website: astro's remote-image revalidation is the only consumer, and the static site uses no images through it.
  const siteLock = readJson('site/package-lock.json');
  assert.deepEqual(consumersOf(siteLock, 'http-cache-semantics'), ['node_modules/astro'],
    'site: a new http-cache-semantics consumer needs reachability review');
  assert.equal(siteLock.packages['node_modules/astro']?.version, '7.3.2', 'site: re-review astro http-cache-semantics use');
  const astroConfig = fs.readFileSync(path.join(ROOT, 'site/astro.config.mjs'), 'utf8');
  assert.doesNotMatch(astroConfig, /\b(?:adapter|image)\s*:|\boutput\s*:\s*['"](?!static['"])/,
    'site: server output or image configuration requires VEX re-review');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const sources = walk(path.join(ROOT, 'site/src')).filter((file) => /\.(?:astro|[cm]?[jt]sx?|md|mdx)$/.test(file));
  assert.ok(sources.length > 0, 'site: source scan found no files');
  for (const file of sources) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /astro:assets|\bgetImage\b|<(?:Image|Picture)\b/,
      `${path.relative(ROOT, file)}: astro image processing requires VEX re-review`);
  }
});
