const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');

const APP_ICON_ASSETS = require('../../src/main/app-icon-assets');
const { createIconDocument } = require('../../scripts/after-pack-app-icons');
const {
  applyDockAppIcon,
  macOSMajorVersion,
  nativeIconNameFor,
  setWindowsAppUserModelId,
  windowsDevelopmentIconPath,
} = require('../../src/main/app-icon');
const {
  ICON_SIZES,
  SOURCE_ICON,
  WINDOWS_PIXEL_DELTA_TOLERANCE,
  WINDOWS_VISIBLE_SCALE,
  createIco,
  sameIcoPixels,
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
    'sunrise', 'sunrise-dark',
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
  assert.equal(source.groups[0].layers[0]['image-name'], 'sunrise-mark.png');
  assert.equal(source.groups[0].layers[0]['fill-specializations'], undefined);
  assert.equal(source['fill-specializations'][0].appearance, 'dark');
  assert.equal(
    source['fill-specializations'][0].value['automatic-gradient'],
    'extended-srgb:0.10980,0.10196,0.08627,1.00000',
  );

  const generated = createIconDocument(APP_ICON_ASSETS.sunrise);
  assert.deepEqual(generated['fill-specializations'], source['fill-specializations']);
  assert.equal(generated.groups[0].layers[0]['image-name'], 'sunrise-mark.png');
});

test('packaging wires fixed Sunrise icons on Windows and Linux', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.appId, require('../../src/main/app-identity').APP_ID);
  assert.equal(pkg.build.win.icon, 'build/windows-icons/icon-sunrise.ico');
  assert.equal(pkg.build.linux.icon, 'build/icon.png');
  assert.equal(pkg.build.win.extraResources, undefined);
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'build/windows-icons')).filter((file) => file.endsWith('.ico')),
    ['icon-sunrise.ico'],
  );

  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-sunrise.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), ICON_SIZES.length);
  const sizes = ICON_SIZES.map((_, index) => {
    const encoded = ico.readUInt8(6 + (index * 16));
    return encoded === 0 ? 256 : encoded;
  });
  assert.deepEqual(sizes, ICON_SIZES);
});

test('Windows ICOs use the transparent Sunrise mark at the largest uncropped taskbar scale', async () => {
  assert.equal(
    path.relative(root, SOURCE_ICON),
    'build/windows-icons/sunrise-mark-simplified.png',
  );
  assert.equal(WINDOWS_VISIBLE_SCALE, 1);
  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-sunrise.ico'));
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
  assert.equal(opaqueBounds.minX, 0);
  assert.equal(opaqueBounds.maxX, 31);
  assert.ok(opaqueBounds.minY <= 2, `top inset is ${opaqueBounds.minY}px`);
  assert.ok(opaqueBounds.maxY >= 29, `bottom edge is ${opaqueBounds.maxY}px`);

  for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) {
    assert.equal(data[((y * info.width) + x) * info.channels + 3], 0, `corner ${x},${y} is transparent`);
  }
});

test('Windows ICO carries the gold Sunrise artwork', async () => {
  const ico = fs.readFileSync(path.join(root, 'build/windows-icons/icon-sunrise.ico'));
  const frameIndex = ICON_SIZES.indexOf(256);
  const entryOffset = 6 + (frameIndex * 16);
  const byteLength = ico.readUInt32LE(entryOffset + 8);
  const imageOffset = ico.readUInt32LE(entryOffset + 12);
  const { data, info } = await sharp(ico.subarray(imageOffset, imageOffset + byteLength))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let goldPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * info.channels;
      const [r, g, b, a] = data.subarray(offset, offset + 4);
      if (a >= 128 && r > 100 && g > 50 && b < 120 && r > g + 20) goldPixels += 1;
    }
  }
  assert.ok(goldPixels > 1_000, `expected Sunrise gold pixels, got ${goldPixels}`);
});

test('Windows icon checks compare rendered frames across platform-specific PNG encoders', async () => {
  assert.equal(WINDOWS_PIXEL_DELTA_TOLERANCE, 3);
  const image = {
    create: { width: 16, height: 16, channels: 4, background: '#c6922e' },
  };
  const [storedPng, regeneratedPng, changedPng] = await Promise.all([
    sharp(image).png({ compressionLevel: 0 }).toBuffer(),
    sharp(image).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
    sharp({ create: { width: 16, height: 16, channels: 4, background: '#d6922e' } })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer(),
  ]);
  assert.equal(storedPng.equals(regeneratedPng), false, 'fixture uses different PNG encodings');
  assert.equal(
    await sameIcoPixels(createIco([{ size: 16, png: storedPng }]), createIco([{ size: 16, png: regeneratedPng }])),
    true,
  );
  assert.equal(
    await sameIcoPixels(createIco([{ size: 16, png: storedPng }]), createIco([{ size: 16, png: changedPng }])),
    false,
  );
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

test('uses an explicit candidate icon only for an unpackaged macOS preview', () => {
  const previewPath = '/candidate/quiet-horizon.png';
  const dev = harness({ packaged: false });
  const devResult = applyDockAppIcon({
    ...dev,
    appIcon: 'paper',
    developmentPreviewPath: previewPath,
    platform: 'darwin',
  });
  assert.deepEqual(devResult, { source: 'development-preview', path: previewPath });
  assert.equal(dev.calls.length, 2);
  assert.deepEqual(dev.calls[0], ['path', previewPath]);
  assert.equal(dev.calls[1][0], 'setIcon');

  const packaged = harness({ packaged: true });
  const packagedResult = applyDockAppIcon({
    ...packaged,
    appIcon: 'paper',
    developmentPreviewPath: previewPath,
    platform: 'darwin',
    systemVersion: '26.0',
  });
  assert.deepEqual(packagedResult, { source: 'native', nativeName: 'Paper' });
  assert.deepEqual(packaged.calls[0], ['named', 'Paper']);
});

test('uses the dark candidate in dark appearance and keeps packaged adaptation native', () => {
  const lightPath = '/candidate/sunrise.png';
  const darkPath = '/candidate/sunrise-dark.png';
  const dev = harness({ packaged: false });
  const devResult = applyDockAppIcon({
    ...dev,
    appIcon: 'sunrise',
    developmentPreviewPath: lightPath,
    developmentDarkPreviewPath: darkPath,
    darkAppearance: true,
    platform: 'darwin',
  });
  assert.deepEqual(devResult, { source: 'development-preview', path: darkPath });
  assert.deepEqual(dev.calls[0], ['path', darkPath]);

  const packaged = harness({ packaged: true });
  const packagedResult = applyDockAppIcon({
    ...packaged,
    appIcon: 'sunrise',
    darkAppearance: true,
    platform: 'darwin',
    systemVersion: '26.0',
  });
  assert.deepEqual(packagedResult, { source: 'native', nativeName: 'Icon' });
  assert.deepEqual(packaged.calls[0], ['named', 'Icon']);
});

test('the flat Sunrise fallback follows appearance while Sunrise Dark stays dark', () => {
  const adaptive = harness({ packaged: false });
  const adaptiveResult = applyDockAppIcon({
    ...adaptive,
    appIcon: 'sunrise',
    darkAppearance: true,
    platform: 'darwin',
    iconsDirectory: '/icons',
  });
  assert.deepEqual(adaptiveResult, { source: 'png', appIcon: 'sunrise-dark' });
  assert.deepEqual(adaptive.calls[0], ['path', path.join('/icons', 'icon-sunrise-dark.png')]);

  const explicit = harness({ packaged: false });
  const explicitResult = applyDockAppIcon({
    ...explicit,
    appIcon: 'sunrise-dark',
    darkAppearance: false,
    platform: 'darwin',
    iconsDirectory: '/icons',
  });
  assert.deepEqual(explicitResult, { source: 'png', appIcon: 'sunrise-dark' });
  assert.deepEqual(explicit.calls[0], ['path', path.join('/icons', 'icon-sunrise-dark.png')]);
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

test('unknown ids safely resolve to Sunrise', () => {
  assert.equal(nativeIconNameFor('not-an-icon'), 'Icon');
  assert.equal(macOSMajorVersion('26.4.1'), 26);
  assert.equal(macOSMajorVersion('n/a'), 0);
});

test('uses the fixed Sunrise ICO only for unpackaged Windows development', () => {
  assert.equal(windowsDevelopmentIconPath({
    app: { isPackaged: false },
    platform: 'win32',
    projectRoot: 'C:\\project',
  }), path.join('C:\\project', 'build/windows-icons/icon-sunrise.ico'));
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

// Flat PNGs paint an 824px tile inside the 1024px canvas. Icon Composer paints
// the native tile itself, so its artwork layer must occupy the same fraction of
// 1024 that the flat artwork occupies of 824. This prevents an apparent size
// jump between the flat fallback and the adaptive packaged icon.
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

test('the adaptive Sunrise artwork matches the flat icon scale and omits the detached baseline', async () => {
  const CANVAS = 1024;
  const opaque = (_r, _g, _b, a) => a > 250;
  const gold = (r, g, b, a) => a > 24 && r > 75 && r > b + 45 && g > b + 15;

  const flat = path.join(root, 'src/renderer/pages/icon-sunrise.png');
  const internalMark = path.join(root, 'src/renderer/pages/sunrise-mark.png');
  assert.ok(fs.statSync(internalMark).size > 0, 'the internal Sunrise mark must be generated');
  const tile = await markBoundsOf(sharp(flat), opaque);
  const flatMark = await markBoundsOf(sharp(flat), gold);
  assert.equal(tile.height, 824, 'the flat Sunrise icon keeps its 824px visible tile');
  const flatRatio = flatMark.height / tile.height;

  const nativeLayer = path.join(root, 'build/app-icons/Icon.icon/Assets/sunrise-mark.png');
  const composed = await markBoundsOf(sharp(nativeLayer), gold);
  const composedRatio = composed.height / CANVAS;

  assert.ok(
    Math.abs(composedRatio - flatRatio) < 0.01,
    `Icon Composer artwork is ${(composedRatio * 100).toFixed(2)}% of its tile but the flat `
    + `Sunrise artwork is ${(flatRatio * 100).toFixed(2)}% — the Dock icon would change size.`,
  );

  const flatOffset = ((flatMark.minX + flatMark.maxX) / 2 - (tile.minX + tile.maxX) / 2) / tile.width;
  const composedOffset = ((composed.minX + composed.maxX) / 2 - (CANVAS - 1) / 2) / CANVAS;
  assert.ok(
    Math.abs(composedOffset - flatOffset) < 0.005,
    `Icon Composer artwork sits at ${(composedOffset * 100).toFixed(2)}% of tile width off center `
    + `but the flat icon sits at ${(flatOffset * 100).toFixed(2)}%.`,
  );
  assert.ok(composed.height > 780 && composed.height < 820, 'artwork stays large within the icon safe area');

  const { data, info } = await sharp(nativeLayer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let lowestRow = -1;
  let lowestMinX = info.width;
  let lowestMaxX = -1;
  for (let y = 0; y < info.height; y += 1) {
    let rowMinX = info.width;
    let rowMaxX = -1;
    for (let x = 0; x < info.width; x += 1) {
      if (data[((y * info.width) + x) * info.channels + 3] <= 24) continue;
      rowMinX = Math.min(rowMinX, x);
      rowMaxX = Math.max(rowMaxX, x);
    }
    if (rowMaxX >= 0) {
      lowestRow = y;
      lowestMinX = rowMinX;
      lowestMaxX = rowMaxX;
    }
  }
  assert.ok(lowestRow > 0);
  assert.ok(lowestMaxX - lowestMinX < 100, 'the removed detached baseline must not return');
});

test('settings exposes icon colorways only on macOS; Patron activation is cross-platform', () => {
  const renderer = fs.readFileSync(
    path.join(root, 'src/renderer/pages/settings.js'),
    'utf8',
  );
  assert.match(renderer, /const supportsNativeAppIcon = appIconPlatform\.startsWith\('Mac'\);/);
  assert.doesNotMatch(renderer, /supportsNativeAppIcon[^;]+startsWith\('Win'\)/);
  // Colorways stay macOS-only; Patron checkout + license activation must remain
  // available on every platform (workspaces and founding keys are not Dock-bound).
  assert.match(renderer, /supports\('appIcon'\) \|\| !supportsNativeAppIcon/);
  assert.match(renderer, /if \(supports\('supporter'\)\)/);
  assert.doesNotMatch(renderer, /supports\('supporter'\)\s*&&\s*supportsNativeAppIcon/);
});
