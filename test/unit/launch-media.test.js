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
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const version = readme.match(/\*\*Current release:\*\* v(\d+\.\d+\.\d+)/)?.[1];

  assert.ok(version, 'README must declare the public release behind launch media');

  for (const [name, expected] of media) {
    assert.deepEqual(pngSize(path.join(PRODUCT_HUNT_DIR, name)), expected);
    assert.match(copy, new RegExp(`product-hunt/${name.replaceAll('.', '\\.')}`));
  }
  assert.match(provenance, new RegExp(`packaged public Blanc v${version.replaceAll('.', '\\.')}`));
  assert.match(provenance, /\.\.\/island-demo\.mp4/);
  assert.match(copy, /youtube\.com\/watch\?v=xqUFMUcCjT0/);
  assert.match(provenance, /youtube\.com\/watch\?v=xqUFMUcCjT0/);
  assert.match(provenance, /youtube-nocookie\.com\/embed\/xqUFMUcCjT0/);
  assert.match(provenance, /September 10 at 12:01 a\.m\. PT \(3:01 a\.m\. ET\)/);
  assert.match(provenance, /Pre-Launch Dashboard then reported `Scheduled`/);
  assert.notDeepEqual(
    fs.readFileSync(path.join(ROOT, PRODUCT_HUNT_DIR, 'island-resting-1270x760.png')),
    fs.readFileSync(path.join(ROOT, PRODUCT_HUNT_DIR, 'quick-switcher-1270x760.png')),
    'the two required Product Hunt gallery stills must show distinct states'
  );
});
