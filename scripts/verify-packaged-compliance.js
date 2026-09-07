'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, createComplianceArtifacts } = require('./compliance-model');
const { safeLicenseFilename } = require('./package-compliance');

function verifyPackagedCompliance(resourcesDir) {
  if (!resourcesDir) throw new Error('packaged resources directory is required');
  const generated = createComplianceArtifacts();
  const notice = fs.readFileSync(path.join(resourcesDir, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
  const sbom = fs.readFileSync(path.join(resourcesDir, 'runtime-sbom.cdx.json'), 'utf8');
  assert.equal(notice, generated.files['compliance/THIRD_PARTY_NOTICES.txt'], 'packaged notices are stale');
  assert.equal(sbom, generated.files['compliance/runtime-sbom.cdx.json'], 'packaged runtime SBOM is stale');
  assert.equal(
    fs.readFileSync(path.join(resourcesDir, 'LICENSE.blanc.txt'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'),
    'packaged Blanc license is stale'
  );

  const parsed = JSON.parse(sbom);
  assert.equal(parsed.bomFormat, 'CycloneDX');
  assert.equal(parsed.specVersion, '1.6');
  assert.equal(parsed.metadata.component.version, require('../package.json').version);

  const expectedLicenses = new Set(generated.runtime.runtimePackages.map(({ component }) =>
    safeLicenseFilename(component.name, component.version)));
  for (const asset of generated.policy.assets.filter((item) => item.licenseFile)) {
    expectedLicenses.add(path.basename(asset.licenseFile));
  }
  const licenseDir = path.join(resourcesDir, 'ThirdPartyLicenses');
  const actualLicenses = new Set(fs.readdirSync(licenseDir));
  assert.deepEqual(actualLicenses, expectedLicenses, 'packaged runtime license inventory is incomplete');
  for (const file of expectedLicenses) {
    assert.ok(fs.statSync(path.join(licenseDir, file)).size > 0, `packaged license is empty: ${file}`);
  }
  for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    assert.ok(fs.statSync(path.join(resourcesDir, file)).size > 0, `packaged framework notice is missing: ${file}`);
  }
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'compliance/runtime-sbom.cdx.json'), 'utf8'),
    sbom,
    'packaged runtime SBOM differs from the release input'
  );
  console.log(`verify-packaged-compliance: ok — ${expectedLicenses.size} license records.`);
}

if (require.main === module) {
  try {
    verifyPackagedCompliance(path.resolve(process.argv[2] || ''));
  } catch (error) {
    console.error(`verify-packaged-compliance: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyPackagedCompliance };
