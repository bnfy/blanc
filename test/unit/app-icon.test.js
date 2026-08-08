const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const APP_ICON_ASSETS = require('../../src/main/app-icon-assets');
const {
  applyDockAppIcon,
  macOSMajorVersion,
  nativeIconNameFor,
  setWindowsAppUserModelId,
  windowsDevelopmentIconPath,
} = require('../../src/main/app-icon');
const {
  ICON_SIZES,
  WINDOWS_MARK_SCALE,
  WINDOWS_VISIBLE_SCALE,
} = require('../../scripts/build-windows-icons');

const image = (empty = false) => ({ isEmpty: () => empty });
const root = path.join(__dirname, '../..');

function harness({ packaged = true, namedEmpty = false, pathEmpty = false } = {}) {
  const calls = [];
  return {
    calls,
    app: {
      isPackaged: packaged,
      dock: { setIcon: (icon) => calls.push(['setIcon', icon]) },
    },
    nativeImage: {
      createFromNamedImage: (name) => {
        calls.push(['named', name]);
        return image(namedEmpty);
      },
      createFromPath: (file) => {
        calls.push(['path', file]);
        return image(pathEmpty);
      },
    },
  };
}

test('every selectable colorway has a named native icon stack', () => {
  const selectable = [
    'paper', 'ink', 'graphite', 'default', 'midnight', 'cream', 'forest', 'sage',
    'ember', 'plum', 'gold',
  ].sort();
  assert.deepEqual(Object.keys(APP_ICON_ASSETS).sort(), selectable);
  assert.equal(new Set(Object.values(APP_ICON_ASSETS).map((x) => x.nativeName)).size, selectable.length);
});

test('packaging wires the Icon Composer source and multi-colorway compiler', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.mac.icon, 'build/app-icons/Icon.icon');
  assert.equal(pkg.build.afterPack, 'scripts/after-pack-app-icons.js');

  const source = JSON.parse(fs.readFileSync(
    path.join(root, 'build/app-icons/Icon.icon/icon.json'),
    'utf8',
  ));
  const appearances = source.groups[0].layers[0]['fill-specializations']
    .map(({ appearance }) => appearance ?? 'default');
  assert.deepEqual(appearances, ['default', 'dark', 'tinted']);
});

test('packaging wires one fixed Windows ICO without colorway resources', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.appId, require('../../src/main/app-identity').APP_ID);
  assert.equal(pkg.build.win.icon, 'build/windows-icons/icon-paper.ico');
  assert.equal(pkg.build.win.extraResources, undefined);
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'build/windows-icons')).filter((file) => file.endsWith('.ico')),
    ['icon-paper.ico'],
  );

  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-paper.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), ICON_SIZES.length);
  const sizes = ICON_SIZES.map((_, index) => {
    const encoded = ico.readUInt8(6 + (index * 16));
    return encoded === 0 ? 256 : encoded;
  });
  assert.deepEqual(sizes, ICON_SIZES);
});

test('Windows ICOs fill the native icon canvas instead of retaining macOS margins', async () => {
  assert.equal(WINDOWS_VISIBLE_SCALE, 1);
  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-paper.ico'));
  const frameIndex = ICON_SIZES.indexOf(32);
  const entryOffset = 6 + (frameIndex * 16);
  const byteLength = ico.readUInt32LE(entryOffset + 8);
  const imageOffset = ico.readUInt32LE(entryOffset + 12);
  const { data, info } = await sharp(ico.subarray(imageOffset, imageOffset + byteLength))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const opaqueBounds = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!data[((y * info.width) + x) * info.channels + 3]) continue;
      opaqueBounds.minX = Math.min(opaqueBounds.minX, x);
      opaqueBounds.minY = Math.min(opaqueBounds.minY, y);
      opaqueBounds.maxX = Math.max(opaqueBounds.maxX, x);
      opaqueBounds.maxY = Math.max(opaqueBounds.maxY, y);
    }
  }
  assert.deepEqual(opaqueBounds, { minX: 0, minY: 0, maxX: 31, maxY: 31 });
});

test('Windows enlarges the Blanc mark without changing the full-size Paper tile', async () => {
  assert.equal(WINDOWS_MARK_SCALE, 1.1);
  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-paper.ico'));
  const frameIndex = ICON_SIZES.indexOf(256);
  const entryOffset = 6 + (frameIndex * 16);
  const byteLength = ico.readUInt32LE(entryOffset + 8);
  const imageOffset = ico.readUInt32LE(entryOffset + 12);
  const { data, info } = await sharp(ico.subarray(imageOffset, imageOffset + byteLength))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const darkBounds = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * info.channels;
      const [r, g, b, a] = data.subarray(offset, offset + 4);
      if (a < 128 || r >= 100 || g >= 100 || b >= 100) continue;
      darkBounds.minX = Math.min(darkBounds.minX, x);
      darkBounds.minY = Math.min(darkBounds.minY, y);
      darkBounds.maxX = Math.max(darkBounds.maxX, x);
      darkBounds.maxY = Math.max(darkBounds.maxY, y);
    }
  }
  const markHeightRatio = (darkBounds.maxY - darkBounds.minY + 1) / info.height;
  assert.ok(markHeightRatio >= 0.68 && markHeightRatio <= 0.72, markHeightRatio);
});

test('uses the adaptive named icon in a packaged macOS 26+ build', () => {
  const h = harness();
  const result = applyDockAppIcon({
    ...h,
    appIcon: 'default',
    platform: 'darwin',
    systemVersion: '26.5.1',
  });
  assert.deepEqual(result, { source: 'native', nativeName: 'Evergreen' });
  assert.equal(h.calls[0][0], 'named');
  assert.equal(h.calls[0][1], 'Evergreen');
  assert.equal(h.calls.some(([kind]) => kind === 'path'), false);
});

test('uses the flat PNG in dev and on pre-Tahoe macOS', () => {
  for (const [packaged, version] of [[false, '27.0'], [true, '15.7']]) {
    const h = harness({ packaged });
    const result = applyDockAppIcon({
      ...h,
      appIcon: 'ink',
      platform: 'darwin',
      systemVersion: version,
      iconsDirectory: '/icons',
    });
    assert.deepEqual(result, { source: 'png', appIcon: 'ink' });
    assert.deepEqual(h.calls[0], ['path', path.join('/icons', 'icon-ink.png')]);
  }
});

test('falls back to the PNG if the packaged asset catalog cannot resolve a name', () => {
  const h = harness({ namedEmpty: true });
  const result = applyDockAppIcon({
    ...h,
    appIcon: 'plum',
    platform: 'darwin',
    systemVersion: '27.0',
    iconsDirectory: '/icons',
  });
  assert.deepEqual(result, { source: 'png', appIcon: 'plum' });
  assert.deepEqual(h.calls.slice(0, 2), [
    ['named', 'Plum'],
    ['path', path.join('/icons', 'icon-plum.png')],
  ]);
});

test('unknown ids safely resolve to Paper', () => {
  assert.equal(nativeIconNameFor('not-an-icon'), 'Icon');
  assert.equal(macOSMajorVersion('26.4.1'), 26);
  assert.equal(macOSMajorVersion('n/a'), 0);
});

test('uses the fixed Paper ICO only for unpackaged Windows development', () => {
  assert.equal(windowsDevelopmentIconPath({
    app: { isPackaged: false },
    platform: 'win32',
    projectRoot: 'C:\\project',
  }), path.join('C:\\project', 'build/windows-icons/icon-paper.ico'));
  assert.equal(windowsDevelopmentIconPath({
    app: { isPackaged: true },
    platform: 'win32',
  }), null);
  assert.equal(windowsDevelopmentIconPath({
    app: { isPackaged: true },
    platform: 'darwin',
  }), null);
});

test('sets Blanc’s packaged Windows AppUserModelID before creating taskbar buttons', () => {
  const calls = [];
  assert.equal(setWindowsAppUserModelId({
    app: { isPackaged: true, setAppUserModelId: (id) => calls.push(id) },
    platform: 'win32',
  }), true);
  assert.deepEqual(calls, ['me.bnfy.bowser']);
  assert.equal(setWindowsAppUserModelId({
    app: { isPackaged: false, setAppUserModelId: () => calls.push('unexpected') },
    platform: 'win32',
  }), false);
  assert.equal(setWindowsAppUserModelId({
    app: { isPackaged: true, setAppUserModelId: () => calls.push('unexpected') },
    platform: 'darwin',
  }), false);
  assert.deepEqual(calls, ['me.bnfy.bowser']);
});

// The two macOS icon sources compose the tile DIFFERENTLY, and that is the trap
// this test exists to spring. The flat colorway PNGs paint their own 824px
// squircle inside a 1024 canvas, so their mark reads against 824. The Icon
// Composer document supplies only the mark — macOS paints the squircle itself,
// full-bleed at 1024 — so the same 522px mark reads ~19% smaller there. Matching
// the marks in CANVAS terms (which they did) still leaves the Dock icon visibly
// changing size between the quit-state bundle icon and the running app.
// Compare the fraction of the VISIBLE tile instead; that is what the eye sees.
// (scripts/build-windows-icons.js compensates for the same mismatch a third way,
// via WINDOWS_MARK_SCALE.)
async function markBoundsOf(image, isMark) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = { minX: info.width, minY: info.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * info.channels;
      const [r, g, b, a] = data.subarray(offset, offset + 4);
      if (!isMark(r, g, b, a)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return { ...bounds, width: bounds.maxX - bounds.minX + 1, height: bounds.maxY - bounds.minY + 1 };
}

test('the Icon Composer mark fills the same share of its tile as the flat colorways', async () => {
  const CANVAS = 1024;
  const opaque = (_r, _g, _b, a) => a > 24;
  const dark = (r, g, b, a) => a > 24 && (r + g + b) / 3 < 128;

  // Flat PNG: it draws its own squircle, so measure the mark against THAT.
  const flat = path.join(root, 'src/renderer/pages/icon-paper.png');
  const tile = await markBoundsOf(sharp(flat), opaque);
  const flatMark = await markBoundsOf(sharp(flat), dark);
  assert.equal(tile.height, 824, 'the flat colorways keep their 824px visible tile');
  const flatRatio = flatMark.height / tile.height;

  // Icon Composer: macOS paints the squircle full-bleed, so the tile IS the canvas.
  const svg = path.join(root, 'build/app-icons/Icon.icon/Assets/blanc-mark.svg');
  const composed = await markBoundsOf(sharp(svg).resize(CANVAS, CANVAS), opaque);
  const composedRatio = composed.height / CANVAS;

  assert.ok(
    Math.abs(composedRatio - flatRatio) < 0.01,
    `Icon Composer mark is ${(composedRatio * 100).toFixed(2)}% of its tile but the flat `
    + `colorways are ${(flatRatio * 100).toFixed(2)}% — the Dock icon would change size `
    + 'between the quit-state bundle icon and the running app. Rescale the transform in '
    + 'blanc-mark.svg (the canvas-relative sizes are SUPPOSED to differ by 1024/824).',
  );

  // The mark sits ~24px right of the tile's true center — a deliberate optical
  // adjustment, so the vector source has to carry it too or the mark visibly
  // shifts when the Dock swaps sources. Measured as a fraction of the tile,
  // since the two tiles are different sizes.
  const flatOffset = ((flatMark.minX + flatMark.maxX) / 2 - (tile.minX + tile.maxX) / 2) / tile.width;
  const composedOffset = ((composed.minX + composed.maxX) / 2 - (CANVAS - 1) / 2) / CANVAS;
  assert.ok(flatOffset > 0.02, 'the flat colorways still carry their optical offset');
  assert.ok(
    Math.abs(composedOffset - flatOffset) < 0.005,
    `Icon Composer mark sits at ${(composedOffset * 100).toFixed(2)}% of tile width off center `
    + `but the flat colorways sit at ${(flatOffset * 100).toFixed(2)}% — the mark would jump `
    + 'sideways when the Dock swaps sources. Adjust the translate in blanc-mark.svg.',
  );
  assert.ok(composed.height > 600 && composed.height < 700, 'mark stays within the icon safe area');
});

test('settings exposes icon colorways and Supporter only on macOS', () => {
  const renderer = fs.readFileSync(
    path.join(root, 'src/renderer/pages/settings.js'),
    'utf8',
  );
  assert.match(renderer, /const supportsNativeAppIcon = appIconPlatform\.startsWith\('Mac'\);/);
  assert.doesNotMatch(renderer, /supportsNativeAppIcon[^;]+startsWith\('Win'\)/);
  assert.match(renderer, /supports\('supporter'\) && supportsNativeAppIcon/);
});
