'use strict';

// Blanc for Android's launcher icon (scripts/android-app-icons.js). brand:check
// guards the bytes; this guards the shape every launcher relies on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { ANDROID_RES_DIR, DENSITIES, ADAPTIVE_DP, SAFE_ZONE_DP, LEGACY_DP } = require('../../scripts/android-app-icons');

const ROOT = path.join(__dirname, '../..');
const res = (...parts) => path.join(ROOT, ANDROID_RES_DIR, ...parts);

test('every density has its legacy icon and adaptive layers at the right size', async () => {
  const expected = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
  assert.deepEqual(DENSITIES.map(([density]) => density), Object.keys(expected));
  for (const [density, [legacy, adaptive]] of Object.entries(expected)) {
    for (const [file, size] of [['app_icon.png', legacy], ['app_icon_foreground.png', adaptive], ['app_icon_monochrome.png', adaptive]]) {
      const { width, height } = await sharp(res(`mipmap-${density}`, file)).metadata();
      assert.deepEqual([width, height], [size, size], `${density}/${file}`);
    }
  }
  assert.equal(LEGACY_DP, 48);
});

test('the mark stays inside the 66dp safe zone on every layer', async () => {
  for (const [density] of DENSITIES) {
    for (const file of ['app_icon_foreground.png', 'app_icon_monochrome.png']) {
      const { data, info } = await sharp(res(`mipmap-${density}`, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const center = info.width / 2;
      const radius = (SAFE_ZONE_DP / ADAPTIVE_DP) * info.width / 2;
      let opaque = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          if (data[((y * info.width + x) * 4) + 3] <= 8) continue;
          opaque += 1;
          assert.ok(Math.hypot(x + 0.5 - center, y + 0.5 - center) <= radius, `${density}/${file} has artwork outside the safe zone at ${x},${y}`);
        }
      }
      assert.ok(opaque > info.width * info.height * 0.05, `${density}/${file} is nearly empty`);
    }
  }
});

// Android uses only the monochrome layer's alpha; one color keeps it honest
// (compositing may round an edge pixel by one).
test('the monochrome layer is one ink color', async () => {
  const { data } = await sharp(res('mipmap-xxxhdpi', 'app_icon_monochrome.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128) assert.ok([0, 1, 2].every((c) => Math.abs(data[i + c] - 14) <= 1), `pixel ${i / 4} is ${data.slice(i, i + 3).join(',')}`);
  }
});

test('the adaptive icon names its three layers', () => {
  const xml = fs.readFileSync(res('mipmap-anydpi-v26', 'app_icon.xml'), 'utf8');
  assert.match(xml, /<background android:drawable="@color\/app_icon_background"\/>/);
  assert.match(xml, /<foreground android:drawable="@mipmap\/app_icon_foreground"\/>/);
  assert.match(xml, /<monochrome android:drawable="@mipmap\/app_icon_monochrome"\/>/);
  assert.match(fs.readFileSync(res('values', 'app_icon_background.xml'), 'utf8'), /<color name="app_icon_background">#F7F0E5<\/color>/);
});
