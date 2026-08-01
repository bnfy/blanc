const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const loadModule = () => import('../../scripts/prepare-staging-update-feed.mjs');

test('staging feed rewrites only the channel metadata name and copies referenced artifacts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-feed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'dist');
  const output = path.join(root, 'feed');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'latest-mac.yml'), [
    'version: 1.0.1-staging.1',
    'files:',
    '  - url: Blanc-1.0.1-staging.1-arm64-mac.zip',
    '    sha512: pretend',
    'path: Blanc-1.0.1-staging.1-arm64-mac.zip',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(source, 'Blanc-1.0.1-staging.1-arm64-mac.zip'), 'zip');
  fs.writeFileSync(path.join(source, 'Blanc-1.0.1-staging.1-arm64-mac.zip.blockmap'), 'map');

  const { prepareStagingFeed } = await loadModule();
  const result = prepareStagingFeed({
    sourceDir: source,
    outputDir: output,
    platform: 'mac',
    expectedVersion: '1.0.1-staging.1',
  });

  assert.equal(result.metadata, 'staging-mac.yml');
  assert.deepEqual(result.assets, [
    'Blanc-1.0.1-staging.1-arm64-mac.zip',
    'Blanc-1.0.1-staging.1-arm64-mac.zip.blockmap',
  ]);
  assert.equal(fs.existsSync(path.join(output, 'latest-mac.yml')), false);
  assert.equal(fs.readFileSync(path.join(output, 'staging-mac.yml'), 'utf8').includes('staging.1'), true);
});

test('staging feed fails closed on version mismatch, missing files, unsafe paths, or dirty output', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-feed-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'dist');
  fs.mkdirSync(source);
  const metadata = path.join(source, 'latest-mac.yml');
  const { prepareStagingFeed } = await loadModule();

  fs.writeFileSync(metadata, 'version: 1.0.1\npath: missing.zip\n');
  assert.throws(() => prepareStagingFeed({
    sourceDir: source,
    outputDir: path.join(root, 'missing'),
    platform: 'mac',
    expectedVersion: '1.0.1',
  }), /missing artifact/);

  for (const unsafe of ['../escape.zip', '..\\escape.zip']) {
    fs.writeFileSync(metadata, `version: 1.0.1\npath: ${unsafe}\n`);
    assert.throws(() => prepareStagingFeed({
      sourceDir: source,
      outputDir: path.join(root, `unsafe-${unsafe.includes('\\') ? 'win' : 'posix'}`),
      platform: 'mac',
      expectedVersion: '1.0.1',
    }), /unsafe/);
  }

  fs.writeFileSync(metadata, 'version: 1.0.1\npath: candidate.zip\n');
  fs.writeFileSync(path.join(source, 'candidate.zip'), 'zip');
  assert.throws(() => prepareStagingFeed({
    sourceDir: source,
    outputDir: path.join(root, 'version'),
    platform: 'mac',
    expectedVersion: '1.0.2',
  }), /does not match/);

  const dirty = path.join(root, 'dirty');
  fs.mkdirSync(dirty);
  fs.writeFileSync(path.join(dirty, 'keep'), 'user data');
  assert.throws(() => prepareStagingFeed({
    sourceDir: source,
    outputDir: dirty,
    platform: 'mac',
    expectedVersion: '1.0.1',
  }), /not empty/);
});
