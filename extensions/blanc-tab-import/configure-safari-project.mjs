import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.argv[2] || '');
const projectFile = path.join(
  projectRoot,
  'Blanc Tab Importer',
  'Blanc Tab Importer.xcodeproj',
  'project.pbxproj'
);
const expectedAppId = 'me.bnfy.blanc.tab-importer';
const expectedExtensionId = `${expectedAppId}.Extension`;
const generatedAppId = 'me.bnfy.blanc.Blanc-Tab-Importer';
const companionVersion = '0.1.0';

let project;
try {
  project = fs.readFileSync(projectFile, 'utf8');
} catch (error) {
  throw new Error(`Could not read generated Safari project: ${error.message}`);
}

const generatedCount = project.split(`PRODUCT_BUNDLE_IDENTIFIER = "${generatedAppId}";`).length - 1;
const extensionCount = project.split(`PRODUCT_BUNDLE_IDENTIFIER = "${expectedExtensionId}";`).length - 1;
if (generatedCount !== 2 || extensionCount !== 2) {
  throw new Error('Generated Safari bundle identifiers changed; review the Xcode project before release.');
}

project = project
  .replaceAll(
    `PRODUCT_BUNDLE_IDENTIFIER = "${generatedAppId}";`,
    `PRODUCT_BUNDLE_IDENTIFIER = "${expectedAppId}";`
  )
  .replaceAll('MARKETING_VERSION = 1.0;', `MARKETING_VERSION = ${companionVersion};`);

fs.writeFileSync(projectFile, project);
console.log(`Configured ${expectedAppId} ${companionVersion} with ${expectedExtensionId}.`);
