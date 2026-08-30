const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_HUNT_DIR = 'docs/superpowers/plans/assets/product-hunt';

function pngSize(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', relativePath);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('Product Hunt media matches the declared dimensions and launch wiring', () => {
  const media = [
    ['thumbnail-240x240.png', { width: 240, height: 240 }],
    ['island-resting-1270x760.png', { width: 1270, height: 760 }],
    ['quick-switcher-1270x760.png', { width: 1270, height: 760 }],
  ];
  const copy = fs.readFileSync(
    path.join(ROOT, 'docs/superpowers/plans/assets/launch-copy.md'),
    'utf8'
  );
  const provenance = fs.readFileSync(
    path.join(ROOT, PRODUCT_HUNT_DIR, 'README.md'),
    'utf8'
  );

  for (const [name, expected] of media) {
    assert.deepEqual(pngSize(path.join(PRODUCT_HUNT_DIR, name)), expected);
    assert.match(copy, new RegExp(`product-hunt/${name.replaceAll('.', '\\.')}`));
  }
  assert.match(provenance, /packaged public Blanc v1\.10\.0/);
  assert.match(provenance, /\.\.\/island-demo\.mp4/);
});
