'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file));

// scripts/build-clock-font.py's output from the pinned fontsource file. A
// change here must come from rerunning the script, never from editing the font.
const CLOCK_FONT_SHA256 = 'f327fc1ef274fbe54d9ba50784ad1968e90597de4633820d2f1508731f1b90e8';

test('the clock font is the reproducible Roboto Flex subset, with its licence', () => {
  const font = read('src/renderer/pages/roboto-flex-clock.woff2');
  assert.equal(crypto.createHash('sha256').update(font).digest('hex'), CLOCK_FONT_SHA256);
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  const licence = read('src/renderer/pages/roboto-flex-OFL.txt').toString('utf8');
  assert.match(licence, /SIL Open Font License, Version 1\.1/);
  assert.match(licence, /The Roboto Flex Project Authors/);
  const script = read('scripts/build-clock-font.py').toString('utf8');
  assert.match(script, /SOURCE_SHA256 = '5107a806ba9bb123c5ff2d9465905d04b767c694d125fd58103b88048a38a613'/);
});

test('the clock font is declared, recorded and shipped with its licence', () => {
  const css = read('src/renderer/pages/pages.css').toString('utf8');
  assert.match(css, /@font-face \{\s*font-family: "Blanc Clock Flex";\s*src: url\("roboto-flex-clock\.woff2"\) format\("woff2"\);\s*font-weight: 100 1000;\s*font-stretch: 25% 151%;/);
  const policy = JSON.parse(read('compliance/policy.json'));
  const entry = policy.assets?.find?.((asset) => asset.id === 'roboto-flex-clock-font')
    ?? JSON.stringify(policy).includes('"roboto-flex-clock-font"');
  assert.ok(entry, 'compliance policy lists the font');
  const notices = read('THIRD-PARTY-NOTICES.md').toString('utf8');
  assert.match(notices, /roboto-flex-clock\.woff2/);
  assert.match(notices, /declares no Reserved Font Name/);
});
