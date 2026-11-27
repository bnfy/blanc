'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

// Consumers with their own packaging trees still take the same Browser art.
async function distributionAssets(emit, master, classicTile) {
  const resize = (image, size) => sharp(image).resize(size, size).png().toBuffer();
  const root = path.join(__dirname, '..');
  const island = require('../chromium/blanc/island-assets.json');
  for (const [file, source] of Object.entries(island.brandFiles)) {
    await emit(`chromium/blanc/island/${file}`, await fs.readFile(path.join(root, source)));
  }
  const pages = require('../chromium/blanc/android/pages.json');
  for (const file of pages.brandFiles) {
    const bytes = await fs.readFile(path.join(root, 'src/renderer/pages', file));
    await emit(`chromium/blanc/android/pages/${file}`, bytes);
    if (pages.start.files.includes(file)) await emit(`chromium/blanc/android/pages/start/${file}`, bytes);
  }

  // These two browser-owned dialogs cannot fetch a renderer asset.
  const embedded = [
    ['chromium/blanc/browser/ui/blanc_extensions_branding.h', [
      await fs.readFile(path.join(root, 'src/renderer/pages/sunrise-mark.png')),
    ]],
    ['chromium/patches/0109-blanc-default-browser-dialog.patch', [
      await resize(master, 384), await resize(master, 48),
    ]],
  ];
  for (const [file, images] of embedded) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    const data = /data:image\/png;base64,[\w/+=]+/g;
    if (source.match(data)?.length !== images.length) throw new Error(`Unexpected number of logos in ${file}`);
    let index = 0;
    await emit(file, source.replace(data, () => 'data:image/png;base64,' + images[index++].toString('base64')));
  }

  const linux = 'chromium/blanc/branding/linux';
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await emit(`${linux}/product_logo_${size}.png`, await resize(master, size));
  }

  const base = 'extensions/blanc-tab-import';
  const safari = `${base}/safari/Blanc Tab Importer`;
  const host = `${safari}/Blanc Tab Importer`;
  for (const size of [16, 32, 48, 128]) {
    const icon = await resize(classicTile, size);
    await emit(`${base}/web-extension/icons/icon-${size}.png`, icon);
    await emit(`${safari}/Blanc Tab Importer Extension/Resources/icons/icon-${size}.png`, icon);
    if (size === 128) await emit(`${host}/Resources/Icon.png`, icon);
  }
  const appIcon = `${host}/Assets.xcassets/AppIcon.appiconset`;
  const catalog = JSON.parse(await fs.readFile(path.join(__dirname, '..', appIcon, 'Contents.json')));
  const dockIcon = path.join(__dirname, '../src/renderer/pages/icon-sunrise.png');
  for (const image of catalog.images) {
    const size = parseInt(image.size, 10) * parseInt(image.scale, 10);
    await emit(`${appIcon}/${image.filename}`, await resize(dockIcon, size));
  }
}

module.exports = { distributionAssets };
