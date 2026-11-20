// W3 Task E1 (owner, 2026-11-19: "A, Sunrise"): the Windows beta's online
// installer and updater show Blanc's Sunrise, not Chromium's or Google's art.
// The images come from assets/sunrise-mark-4096.png through
// chromium/tools/windows-updater-art.sh and are pinned here by hash; each is
// the size and format Chromium's resource loader expects.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const lock = JSON.parse(fs.readFileSync(file('blanc/branding/win-beta/updater/art.lock.json'), 'utf8'));
// Each image's size, as Chromium's art that it replaces (or, for the served
// logos, the 48×48 square the progress window expects).
const SIZES = {
  'blanc/branding/win-beta/updater/background_light.bmp': [496, 282],
  'blanc/branding/win-beta/updater/background_dark.bmp': [496, 282],
  'blanc/branding/win-beta/updater/error.bmp': [100, 60],
  'blanc/branding/win-beta/updater/error_dark.bmp': [100, 60],
  'blanc/branding/win-beta/updater/splash.bmp': [120, 120],
  '../cloudflare/update-worker/assets/logo_light.bmp': [48, 48],
  '../cloudflare/update-worker/assets/logo_dark.bmp': [48, 48],
};
// A 24-bit Windows bitmap (BITMAPINFOHEADER): width, height, bit depth.
function bmp(bytes) {
  assert.equal(bytes.subarray(0, 2).toString('latin1'), 'BM');
  return {width: bytes.readInt32LE(18), height: Math.abs(bytes.readInt32LE(22)), bits: bytes.readUInt16LE(28), header: bytes.readUInt32LE(14)};
}

test('every Sunrise image for the updater is pinned and the size Chromium expects', () => {
  assert.deepEqual(Object.keys(lock.files).sort(), Object.keys(SIZES).sort());
  for (const [rel, [w, h]] of Object.entries(SIZES)) {
    const bytes = fs.readFileSync(file(rel));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), lock.files[rel], `${rel} matches the lock`);
    const info = bmp(bytes);
    assert.deepEqual([info.width, info.height, info.bits, info.header], [w, h, 24, 40], rel);
  }
  assert.equal(lock.source, crypto.createHash('sha256').update(fs.readFileSync(file('../assets/sunrise-mark-4096.png'))).digest('hex'),
    'made from the current Sunrise master');
});
test('the logo and error art sit on the window\'s own flat color (the window draws them opaque)', () => {
  // progress_wnd.cc draws SS_BITMAP statics without alpha: their corners must
  // equal the background bitmap at the window's middle.
  const pixel = (bytes, x, y) => {
    const {width, height} = bmp(bytes), row = Math.ceil(width * 3 / 4) * 4, at = bytes.readUInt32LE(10) + (height - 1 - y) * row + x * 3;
    return bytes.subarray(at, at + 3).toString('hex');
  };
  for (const theme of ['light', 'dark']) {
    const bg = fs.readFileSync(file(`blanc/branding/win-beta/updater/background_${theme}.bmp`));
    const middle = pixel(bg, 248, 200);
    const error = fs.readFileSync(file(`blanc/branding/win-beta/updater/${theme === 'light' ? 'error' : 'error_dark'}.bmp`));
    const logo = fs.readFileSync(file(`../cloudflare/update-worker/assets/logo_${theme}.bmp`));
    for (const [name, img] of [['error', error], ['logo', logo]]) assert.equal(pixel(img, 0, 0), middle, `${theme} ${name} corner`);
    assert.equal(pixel(bg, 248, 60), middle, `${theme} background is flat where the error art sits`);
  }
});

// Patch 0105: the Windows beta's updater resources name Blanc's art; every
// other build keeps Chromium's.
test('patch 0105 points the Windows beta\'s installer and updater at the Sunrise art', () => {
  const patch = fs.readFileSync(file('patches/0105-blanc-windows-updater-art.patch'), 'utf8');
  const lane = JSON.parse(fs.readFileSync(file('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf('0105-blanc-windows-updater-art.patch'), lane.indexOf('0104-blanc-skip-chromium-welcome.patch') + 1);
  const added = name => {
    const start = patch.indexOf(`+++ b/${name}\n`);
    assert.ok(start >= 0, `0105 patches ${name}`);
    const end = patch.indexOf('\n--- ', start);
    return patch.slice(start, end < 0 ? undefined : end).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  };
  const ui = added('chrome/updater/win/ui/resources/resources_en.rc');
  assert.match(ui, /#if defined\(BLANC_UPDATER_BRANDING\)/);
  for (const [id, path] of [['IDI_APP', 'blanc/branding/win/blanc.ico'], ['IDB_ERROR_ILLUSTRATION', 'blanc/branding/win-beta/updater/error.bmp'],
    ['IDB_ERROR_ILLUSTRATION_DARK', 'blanc/branding/win-beta/updater/error_dark.bmp'], ['IDB_BACKGROUND_LIGHT', 'blanc/branding/win-beta/updater/background_light.bmp'],
    ['IDB_BACKGROUND_DARK', 'blanc/branding/win-beta/updater/background_dark.bmp']])
    assert.match(ui, new RegExp(`^\\+${id}\\s+(ICON|BITMAP)\\s+"${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"$`, 'm'), id);
  const setup = added('chrome/updater/win/installer/installer.rc');
  assert.match(setup, /IDI_MINI_INSTALLER\s+ICON\s+"blanc\/branding\/win\/blanc\.ico"/);
  assert.match(setup, /IDB_LOGO\s+BITMAP\s+"blanc\/branding\/win-beta\/updater\/splash\.bmp"/);
  // The define, for the Windows beta only.
  for (const name of ['chrome/updater/win/ui/resources/BUILD.gn', 'chrome/updater/win/installer/BUILD.gn']) {
    assert.match(added(name), /if \(blanc_channel == "beta"\)/, name);
    assert.match(added(name), /BLANC_UPDATER_BRANDING/, name);
  }
});
