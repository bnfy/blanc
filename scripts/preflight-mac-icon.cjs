'use strict';
// Compile the actual production icon with the same implementation as packaging.
// actool --version alone cannot detect an incompatible host asset runtime.
const path = require('node:path');
const { generateAssetCatalogForIcon } = require('app-builder-lib/out/util/macosIconComposer');
const { build } = require('../package.json');
async function main() {
  const { assetCatalog, icnsFile } = await generateAssetCatalogForIcon(path.resolve(__dirname, '..', build.mac.icon));
  if (!assetCatalog.length || !icnsFile.length) throw Error('Icon compilation produced empty assets');
  console.log('Production Mac icon compiled successfully (asset catalog and ICNS).');
}
main().catch(error => { console.error(error); process.exit(1); });
