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

test('settings exposes icon colorways and Supporter only on macOS', () => {
  const renderer = fs.readFileSync(
    path.join(root, 'src/renderer/pages/settings.js'),
    'utf8',
  );
  assert.match(renderer, /const supportsNativeAppIcon = appIconPlatform\.startsWith\('Mac'\);/);
  assert.doesNotMatch(renderer, /supportsNativeAppIcon[^;]+startsWith\('Win'\)/);
  assert.match(renderer, /supports\('supporter'\) && supportsNativeAppIcon/);
});
