const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IOS_APP_ICONS, IOS_APP_ICON_DIR, packageDigest } = require('../../scripts/ios-app-icons');

const ROOT = path.resolve(__dirname, '..', '..');
const SHARED_PLATFORMS = { circles: ['watchOS'], squares: 'shared' };

const packageDir = (icon) => path.join(ROOT, IOS_APP_ICON_DIR, `${icon.nativeName}.icon`);
const iconDocument = (icon) => JSON.parse(fs.readFileSync(path.join(packageDir(icon), 'icon.json'), 'utf8'));
const byName = (name) => IOS_APP_ICONS.find((icon) => icon.nativeName === name);

test('the iPhone catalog is Gold (the standard icon) first, then Dawn, then the Mac icons', () => {
  assert.deepEqual(IOS_APP_ICONS.map((icon) => icon.id), [
    'sunrise-gold', 'sunrise-dawn', 'sunrise', 'sunrise-dark', 'sunrise-spectrum', 'sunrise-amber',
  ]);
  assert.deepEqual(IOS_APP_ICONS.map((icon) => icon.nativeName), [
    'AppIcon', 'SunriseDawn', 'Sunrise', 'SunriseDark', 'SunriseSpectrum', 'SunriseAmber',
  ]);
  assert.equal(IOS_APP_ICONS[1].label, 'Sunrise Dawn');
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema/schema.json'), 'utf8'));
  const labels = new Map(schema.appIcons.map((icon) => [icon.id, icon.label]));
  for (const icon of IOS_APP_ICONS.filter((icon) => icon.id !== 'sunrise-dawn')) {
    assert.equal(icon.label, labels.get(icon.id), icon.id);
  }
  assert.equal(labels.has('sunrise-dawn'), false, 'Dawn is iPhone-only and stays out of the shared schema');
});

test('every package exists and names only images it contains', () => {
  for (const icon of IOS_APP_ICONS) {
    const doc = iconDocument(icon);
    assert.deepEqual(doc['supported-platforms'], SHARED_PLATFORMS, icon.nativeName);
    assert.ok(doc.groups.length >= 1 && doc.groups.length <= 4, `${icon.nativeName} has 1–4 groups`);
    const named = doc.groups.flatMap((group) => group.layers.map((layer) => layer['image-name'])).sort();
    const present = fs.readdirSync(path.join(packageDir(icon), 'Assets')).filter((name) => !name.startsWith('.')).sort();
    assert.deepEqual(present, [...new Set(named)].sort(), `${icon.nativeName} assets`);
  }
});

test('Dawn and Gold glass groups match the spec appendix', () => {
  const layerNames = (doc) => doc.groups.map((group) => group.layers.map((layer) => layer.name));
  const dawn = iconDocument(byName('SunriseDawn'));
  assert.deepEqual(layerNames(dawn), [['Water'], ['Sun'], ['Rays'], ['Glow', 'Night', 'Sky']]);
  assert.deepEqual(dawn.groups[0].translucency, { enabled: true, value: 0.35 });
  assert.equal(dawn.groups[0]['blur-material'], 0.6);
  const gold = iconDocument(byName('AppIcon'));
  assert.deepEqual(layerNames(gold), [['Water'], ['Sun'], ['Rays'], ['Reflection', 'Glow', 'Tile']]);
});

test('Dawn and Gold glass layers are silhouettes of the mark, not full-canvas paint', async () => {
  const sharp = require('sharp');
  for (const name of ['AppIcon', 'SunriseDawn']) {
    const doc = iconDocument(byName(name));
    for (const layer of doc.groups.flatMap((group) => group.layers).filter((layer) => layer.glass)) {
      const file = path.join(packageDir(byName(name)), 'Assets', layer['image-name']);
      const { channels } = await sharp(file).metadata();
      assert.equal(channels, 4, `${name}/${layer.name} keeps its alpha`);
      const { channels: [, , , alpha] } = await sharp(file).stats();
      assert.ok(alpha.mean > 0 && alpha.mean < 0.15 * 255, `${name}/${layer.name} covers only the mark (alpha mean ${alpha.mean})`);
    }
  }
});

const PREVIEWS = path.join(ROOT, 'ios/Blanc/Blanc/Assets.xcassets');
const PREVIEW_LOCK = path.join(ROOT, 'ios/Blanc/app-icon-previews.lock.json');
const previewSet = (icon) => path.join(PREVIEWS, `AppIconPreview-${icon.nativeName}.imageset`);
const sha256 = (file) => require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('every preview imageset has a dark-appearance image', async () => {
  const sharp = require('sharp');
  for (const icon of IOS_APP_ICONS) {
    const { images } = JSON.parse(fs.readFileSync(path.join(previewSet(icon), 'Contents.json'), 'utf8'));
    const light = images.filter((image) => !image.appearances);
    const dark = images.filter((image) => JSON.stringify(image.appearances) === JSON.stringify([{ appearance: 'luminosity', value: 'dark' }]));
    assert.equal(light.length, 1, `${icon.nativeName} light`);
    assert.equal(dark.length, 1, `${icon.nativeName} dark`);
    for (const image of [...light, ...dark]) {
      assert.equal(image.idiom, 'universal');
      assert.equal(image.scale, '3x');
      const { width, height } = await sharp(path.join(previewSet(icon), image.filename)).metadata();
      assert.deepEqual([width, height], [180, 180], image.filename);
    }
  }
});

test('the previews lock matches every package', () => {
  const lock = JSON.parse(fs.readFileSync(PREVIEW_LOCK, 'utf8'));
  assert.deepEqual(Object.keys(lock.icons), IOS_APP_ICONS.map((icon) => icon.nativeName));
  for (const icon of IOS_APP_ICONS) {
    const entry = lock.icons[icon.nativeName];
    assert.equal(entry.package, packageDigest(packageDir(icon)),
      `${icon.nativeName} changed since its previews were rendered: run npm run ios:icon-previews on a Mac`);
    assert.equal(entry.light, sha256(path.join(previewSet(icon), `${icon.nativeName}.png`)), `${icon.nativeName} light preview`);
    assert.equal(entry.dark, sha256(path.join(previewSet(icon), `${icon.nativeName}-dark.png`)), `${icon.nativeName} dark preview`);
  }
});

test('reused packages match their Mac layers byte for byte', () => {
  const same = (packaged, source) => assert.deepEqual(
    fs.readFileSync(packaged), fs.readFileSync(path.join(ROOT, source)), path.relative(ROOT, packaged));
  for (const name of ['Sunrise', 'SunriseDark']) {
    same(path.join(packageDir(byName(name)), 'Assets/sunrise-mark.png'), 'build/app-icons/Icon.icon/Assets/sunrise-mark.png');
  }
  for (const name of ['SunriseSpectrum', 'SunriseAmber']) {
    const assets = path.join(packageDir(byName(name)), 'Assets');
    for (const file of fs.readdirSync(assets)) same(path.join(assets, file), `build/app-icons/colorways/${file}`);
  }
});

test('the Swift catalog and Xcode settings match the brand catalog', () => {
  const swift = fs.readFileSync(path.join(ROOT, 'ios/Blanc/Blanc/AppIconChoice.swift'), 'utf8');
  const rawValues = [...swift.matchAll(/^\s*case (\w+)(?: = "([^"]+)")?$/gm)]
    .map(([, name, raw]) => raw ?? name);
  assert.deepEqual(rawValues, IOS_APP_ICONS.map((icon) => icon.id), 'AppIconChoice cases in catalog order');
  for (const icon of IOS_APP_ICONS.slice(1)) assert.match(swift, new RegExp(`"${icon.nativeName}"`), icon.nativeName);

  const project = fs.readFileSync(path.join(ROOT, 'ios/Blanc/Blanc.xcodeproj/project.pbxproj'), 'utf8');
  const alternates = IOS_APP_ICONS.slice(1).map((icon) => icon.nativeName).join(' ');
  assert.equal(IOS_APP_ICONS[0].nativeName, 'AppIcon', 'the standard icon is the primary');
  const count = (needle) => project.split(needle).length - 1;
  assert.equal(count(`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "${alternates}";`), 2, 'both app configurations');
  assert.equal(count('ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;'), 2);
});

test('the iPhone icons are cut from the committed native layer, not an in-memory copy', () => {
  // brand:check tolerates one level of platform rounding in the native layer;
  // the grow ramp would multiply that into a stale iPhone package on Linux.
  const { iosAppIconFiles } = require('../../scripts/ios-app-icons');
  assert.equal(iosAppIconFiles.length, 0, 'iosAppIconFiles takes no layer argument');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/ios-app-icons.js'), 'utf8'),
    /build\/app-icons\/Icon\.icon\/Assets\/sunrise-mark\.png/);
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/build-brand-assets.js'), 'utf8'), /iosAppIconFiles\(\)/);
});

test('ASSET-LICENSE.md reserves the iPhone icon artwork', () => {
  const license = fs.readFileSync(path.join(ROOT, 'ASSET-LICENSE.md'), 'utf8');
  assert.match(license, /`ios\/Blanc\/Blanc\/AppIcons\/`/);
  assert.match(license, /`ios\/Blanc\/Blanc\/Assets\.xcassets\/AppIconPreview-\*\.imageset\/`/);
  assert.doesNotMatch(license, /AppIcon\.appiconset/);
});

test('package digests ignore dotfiles such as Finder\'s .DS_Store', () => {
  const os = require('node:os');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-icon-digest-'));
  try {
    fs.cpSync(packageDir(byName('Sunrise')), copy, { recursive: true });
    const before = packageDigest(copy);
    fs.writeFileSync(path.join(copy, '.DS_Store'), 'finder');
    fs.writeFileSync(path.join(copy, 'Assets', '.DS_Store'), 'finder');
    assert.equal(packageDigest(copy), before);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});
