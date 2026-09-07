const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('staging feed renames metadata and copies only validated referenced artifacts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-feed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'dist');
  const output = path.join(root, 'feed');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'latest-mac.yml'), 'version: 1.11.0-staging.1\npath: Blanc.zip\n');
  fs.writeFileSync(path.join(source, 'Blanc.zip'), 'zip');
  fs.writeFileSync(path.join(source, 'Blanc.zip.blockmap'), 'map');
  const { prepareStagingFeed } = await import('../../scripts/prepare-staging-update-feed.mjs');
  const result = prepareStagingFeed({
    sourceDir: source, outputDir: output, platform: 'mac', expectedVersion: '1.11.0-staging.1',
  });
  assert.equal(result.metadata, 'staging-mac.yml');
  assert.deepEqual(result.assets, ['Blanc.zip', 'Blanc.zip.blockmap']);
  assert.equal(fs.existsSync(path.join(output, 'latest-mac.yml')), false);
});

test('staging feed rejects missing, traversing, mismatched, and dirty inputs', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'dist');
  fs.mkdirSync(source);
  const metadata = path.join(source, 'latest-mac.yml');
  const { prepareStagingFeed } = await import('../../scripts/prepare-staging-update-feed.mjs');
  fs.writeFileSync(metadata, 'version: 1.11.0\npath: missing.zip\n');
  assert.throws(() => prepareStagingFeed({ sourceDir: source, outputDir: path.join(root, 'a'), platform: 'mac' }), /missing/);
  fs.writeFileSync(metadata, 'version: 1.11.0\npath: ..\\escape.zip\n');
  assert.throws(() => prepareStagingFeed({ sourceDir: source, outputDir: path.join(root, 'b'), platform: 'mac' }), /unsafe/);
  fs.writeFileSync(metadata, 'version: 1.11.0\npath: candidate.zip\n');
  fs.writeFileSync(path.join(source, 'candidate.zip'), 'zip');
  assert.throws(() => prepareStagingFeed({ sourceDir: source, outputDir: path.join(root, 'c'), platform: 'mac', expectedVersion: '1.12.0' }), /does not match/);
  const dirty = path.join(root, 'dirty');
  fs.mkdirSync(dirty);
  fs.writeFileSync(path.join(dirty, 'keep'), 'data');
  assert.throws(() => prepareStagingFeed({ sourceDir: source, outputDir: dirty, platform: 'mac' }), /not empty/);

  fs.writeFileSync(metadata, 'version: 1.11.0\nfiles:\n  - url: candidate.zip\n  - url: absent.zip\n');
  const partial = path.join(root, 'partial');
  assert.throws(
    () => prepareStagingFeed({ sourceDir: source, outputDir: partial, platform: 'mac' }),
    /missing artifact/
  );
  assert.deepEqual(fs.readdirSync(partial), [], 'a failed copy leaves no partial staging feed');
});
