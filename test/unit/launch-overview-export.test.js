const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

test('overview has a separate duration gate without relaxing the short demo', () => {
  const short = fs.readFileSync(path.join(root, 'scripts/export-launch-demo.sh'), 'utf8');
  const overview = fs.readFileSync(path.join(root, 'scripts/export-launch-overview.sh'), 'utf8');
  assert.match(short, /seconds >= 18 && seconds <= 24/);
  assert.match(overview, /seconds >= 40 && seconds <= 44/);
  assert.match(overview, /scale=1920:1200/);
  assert.match(overview, /fps=30/);
  assert.match(overview, /-an -c:v libx264/);
  assert.match(overview, /-color_primaries bt709 -color_trc bt709 -colorspace bt709/);
  assert.match(overview, /incomplete source color metadata; do not guess/);
  assert.match(overview, /review output already exists/);
  assert.match(overview, /owner approval is required before upload/);
});
