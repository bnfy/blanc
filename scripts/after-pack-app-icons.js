// electron-builder afterPack hook: compile every user-selectable macOS
// colorway into a named Icon Composer stack inside one Assets.car. Selecting a
// colorway at runtime therefore preserves macOS's own Default/Dark/Clear/Tinted
// rendering (and its live tint color) instead of replacing it with a flat PNG.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const APP_ICON_ASSETS = require('../src/main/app-icon-assets');
const { verifyPackagedAdblock } = require('./verify-packaged-adblock');
const { packageCompliance } = require('./package-compliance');
const { verifyPackagedCompliance } = require('./verify-packaged-compliance');

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
  imageName = 'blanc-mark.svg',
  preserveColor = false,
  layerName = 'Blanc mark',
}) {
  const layer = {
    ...(!preserveColor ? {
      'fill-specializations': [
        { value: solid(foreground) },
        { appearance: 'dark', value: solid(darkForeground) },
        { appearance: 'tinted', value: solid('#FFFFFF') },
      ],
    } : {}),
    glass: false,
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
      shadow: { kind: 'neutral', opacity: 0.25 },
      translucency: { enabled: false, value: 0.5 },
    }],
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
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents/Resources',
    )
    : path.join(context.appOutDir, 'resources');
  verifyPackagedAdblock(path.join(resourcesDir, 'app.asar'));
  await packageCompliance(context);
  verifyPackagedCompliance(resourcesDir);

  if (context.electronPlatformName !== 'darwin') return;

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
      const imageName = definition.imageName ?? 'blanc-mark.svg';
      await fs.copyFile(
        path.join(sourceIcon, 'Assets', imageName),
        path.join(assetsDir, imageName),
      );
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
