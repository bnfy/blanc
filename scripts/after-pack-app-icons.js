// electron-builder afterPack hook: compile every user-selectable macOS
// colorway into a named Icon Composer stack inside one Assets.car. Selecting a
// colorway at runtime keeps macOS's own Light/Dark rendering instead of a flat
// PNG; for Clear and Tinted, app-icon.js falls back to the bundle icon.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const APP_ICON_ASSETS = require('../src/main/app-icon-assets');
const { verifyPackagedAdblock } = require('./verify-packaged-adblock');
const { verifyPackagedUblock } = require('./verify-packaged-ublock');
const { packageCompliance } = require('./package-compliance');
const { verifyPackagedCompliance } = require('./verify-packaged-compliance');
const { verifyPackagedCaptureRuntime } = require('./verify-packaged-capture-runtime');
const { verifyPackagedBrowserRole } = require('./verify-packaged-browser-role');

function iconComposerColor(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Invalid app-icon color: ${hex}`);
  const channels = [0, 2, 4].map((offset) =>
    (Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255).toFixed(5));
  return `extended-srgb:${channels.join(',')},1.00000`;
}

const solid = (hex) => ({ solid: iconComposerColor(hex) });

function createIconDocument({
  background,
  darkBackground = background,
  foreground,
  darkForeground = foreground,
  imageName = 'sunrise-mark.png',
  preserveColor = true,
  layerName = 'Sunrise',
  glass = false,
  specular,
  lighting,
  shadow = { kind: 'neutral', opacity: 0.25 },
  translucency = { enabled: false, value: 0.5 },
  tileImageName = null,
  darkTileImageName = null,
}) {
  const layer = {
    ...(!preserveColor ? {
      'fill-specializations': [
        { value: solid(foreground) },
        { appearance: 'dark', value: solid(darkForeground) },
        { appearance: 'tinted', value: solid('#FFFFFF') },
      ],
    } : {}),
    glass,
    'image-name': imageName,
    name: layerName,
  };
  return {
    fill: { 'automatic-gradient': iconComposerColor(background) },
    ...(darkBackground !== background ? {
      'fill-specializations': [{
        appearance: 'dark',
        value: { 'automatic-gradient': iconComposerColor(darkBackground) },
      }],
    } : {}),
    groups: [{
      layers: [layer],
      shadow,
      ...(specular !== undefined ? { specular } : {}),
      ...(lighting ? { lighting } : {}),
      translucency,
    },
    // The tile drawn as an image behind the mark, so no appearance recolors
    // it; a dark tile, when given, replaces it in Dark. Both hide in the
    // Clear and Tinted styles ('tinted'), where an opaque image would cover
    // the glass or tint background macOS draws there.
    ...(tileImageName ? [{
      layers: [
        ...(darkTileImageName ? [{
          glass: false,
          'image-name': darkTileImageName,
          name: 'DarkTile',
          'hidden-specializations': [
            { value: true },
            { appearance: 'dark', value: false },
            { appearance: 'tinted', value: true },
          ],
        }] : []),
        {
          glass: false,
          'image-name': tileImageName,
          name: 'Tile',
          'hidden-specializations': [
            ...(darkTileImageName ? [{ appearance: 'dark', value: true }] : []),
            { appearance: 'tinted', value: true },
          ],
        },
      ],
    }] : [])],
    'supported-platforms': { squares: ['macOS'] },
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code ?? `on signal ${signal}`}`));
    });
  });
}

module.exports = async function afterPackAppIcons(context) {
  const macAppPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(macAppPath, 'Contents/Resources')
    : path.join(context.appOutDir, 'resources');
  verifyPackagedAdblock(path.join(resourcesDir, 'app.asar'));
  verifyPackagedUblock(path.join(resourcesDir, 'app.asar'));
  verifyPackagedCaptureRuntime(path.join(resourcesDir, 'app.asar'), context.electronPlatformName);
  await packageCompliance(context);
  verifyPackagedCompliance(resourcesDir);

  if (context.electronPlatformName !== 'darwin') return;

  // Apple reviews the packaged Info.plist, and LaunchServices only offers Blanc
  // as a default browser when the built bundle claims both the web schemes and
  // HTML documents. Fail here rather than ship a bundle that cannot be default.
  verifyPackagedBrowserRole(macAppPath);

  const root = path.join(__dirname, '..');
  const sourceIcon = path.join(root, 'build/app-icons/Icon.icon');
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-app-icons-'));
  const outputDir = path.join(workDir, 'compiled');

  try {
    await fs.mkdir(outputDir);
    const iconPaths = [sourceIcon];

    for (const definition of Object.values(APP_ICON_ASSETS)) {
      if (definition.nativeName === 'Icon') continue; // committed default source
      const iconDir = path.join(workDir, `${definition.nativeName}.icon`);
      const assetsDir = path.join(iconDir, 'Assets');
      await fs.mkdir(assetsDir, { recursive: true });
      const imageDir = definition.imageDir
        ? path.join(root, definition.imageDir)
        : path.join(sourceIcon, 'Assets');
      const images = [
        definition.imageName ?? 'sunrise-mark.png',
        definition.tileImageName,
        definition.darkTileImageName,
      ].filter(Boolean);
      for (const imageName of images) {
        await fs.copyFile(path.join(imageDir, imageName), path.join(assetsDir, imageName));
      }
      await fs.writeFile(
        path.join(iconDir, 'icon.json'),
        `${JSON.stringify(createIconDocument(definition), null, 2)}\n`,
      );
      iconPaths.push(iconDir);
    }

    await run('/usr/bin/xcrun', [
      'actool',
      ...iconPaths,
      '--compile', outputDir,
      '--output-format', 'human-readable-text',
      '--notices',
      '--warnings',
      '--output-partial-info-plist', path.join(outputDir, 'assetcatalog_generated_info.plist'),
      '--app-icon', 'Icon',
      '--include-all-app-icons',
      '--enable-on-demand-resources', 'NO',
      '--development-region', 'en',
      '--target-device', 'mac',
      '--minimum-deployment-target', '26.0',
      '--platform', 'macosx',
    ]);

    await fs.copyFile(path.join(outputDir, 'Assets.car'), path.join(resourcesDir, 'Assets.car'));
    console.log(`after-pack-app-icons: compiled ${iconPaths.length} adaptive macOS colorways.`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
};

module.exports.createIconDocument = createIconDocument;
module.exports.iconComposerColor = iconComposerColor;
