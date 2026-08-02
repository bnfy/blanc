const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  ROOT,
  createComplianceArtifacts,
  integrityHash,
  npmPurl,
  packageName,
  resolveDependencyPath,
} = require('../../scripts/compliance-model');
const {
  existingLicenseFiles,
  packageCompliance,
  resourcesDirectory,
  safeLicenseFilename,
} = require('../../scripts/package-compliance');

test('runtime SBOM covers npm closure, Electron, fonts, and blocker provenance', () => {
  const generated = createComplianceArtifacts();
  const sbom = generated.runtime.sbom;
  const refs = new Set(sbom.components.map((component) => component['bom-ref']));

  assert.equal(generated.runtime.runtimePackages.length, 30);
  assert.equal(sbom.components.length, 37);
  assert.ok(refs.has('pkg:npm/electron@43.2.0'));
  assert.ok(refs.has('asset:inter-font'));
  assert.ok(refs.has('asset:jetbrains-mono-font'));
  assert.ok(refs.has('asset:easylist-data'));
  assert.ok(refs.has('asset:easyprivacy-data'));
  assert.ok(refs.has('asset:ghostery-resources'));
  assert.ok(refs.has('asset:blanc-adblock-seed'));
  assert.equal([...refs].some((ref) => ref.includes('playwright')), false);
  assert.equal([...refs].some((ref) => ref.includes('electron-builder@')), false);

  const root = sbom.dependencies.find((item) => item.ref.startsWith('application:runtime:'));
  assert.ok(root.dependsOn.includes('pkg:npm/electron@43.2.0'));
  assert.ok(root.dependsOn.includes('asset:blanc-adblock-seed'));
  const seed = sbom.dependencies.find((item) => item.ref === 'asset:blanc-adblock-seed');
  assert.deepEqual(seed.dependsOn, [
    'asset:easylist-data',
    'asset:easyprivacy-data',
    'asset:ghostery-resources',
    'pkg:npm/%40ghostery/adblocker-electron@2.18.1',
  ]);
});

test('runtime license policy selects EasyList CC BY-SA and contains no strong-copyleft npm package', () => {
  const generated = createComplianceArtifacts();
  const expressions = generated.runtime.sbom.components.flatMap((component) =>
    component.licenses.map((choice) => choice.expression || choice.license.id));
  for (const expression of expressions) {
    assert.ok(
      generated.policy.runtimeAllowedLicenseExpressions.includes(expression),
      expression
    );
  }
  assert.equal(expressions.some((expression) => /(?:^|[^L])GPL/.test(expression)), false);
  assert.ok(expressions.includes('CC-BY-SA-3.0-or-later'));
  assert.ok(expressions.includes('MPL-2.0'));
});

test('committed compliance artifacts exactly match the deterministic model', () => {
  const generated = createComplianceArtifacts();
  for (const [relative, expected] of Object.entries(generated.files)) {
    assert.equal(fs.readFileSync(path.join(ROOT, relative), 'utf8'), expected, relative);
  }
  assert.match(generated.files['compliance/THIRD_PARTY_NOTICES.txt'], /The EasyList authors/);
  assert.match(generated.files['compliance/THIRD_PARTY_NOTICES.txt'], /LICENSES\.chromium\.html/);
});

test('both lock SBOMs include every unique locked name/version and audited missing metadata override', () => {
  const generated = createComplianceArtifacts();
  const root = JSON.parse(generated.files['compliance/root-lock-sbom.cdx.json']);
  const site = JSON.parse(generated.files['compliance/site-lock-sbom.cdx.json']);
  assert.equal(root.components.length, 364);
  assert.equal(site.components.length, 405);
  const axe = root.components.find((component) => component.name === 'axe-core');
  assert.deepEqual(axe.licenses, [{ license: { id: 'MPL-2.0' } }]);
  const zod = site.components.find((component) => component.name === 'zod-to-ts');
  assert.deepEqual(zod.licenses, [{ license: { id: 'MIT' } }]);
  assert.ok(zod.properties.some((item) =>
    item.name === 'blanc:licenseOverride' && item.value.includes('omits the license field')));
});

test('lock helpers resolve nested packages and convert integrity to CycloneDX hashes', () => {
  const lock = require('../../package-lock.json');
  assert.equal(packageName('node_modules/a/node_modules/@scope/pkg'), '@scope/pkg');
  assert.equal(npmPurl('@scope/pkg', '1.2.3'), 'pkg:npm/%40scope/pkg@1.2.3');
  assert.equal(
    resolveDependencyPath(lock.packages, 'node_modules/electron-updater', 'semver'),
    'node_modules/electron-updater/node_modules/semver'
  );
  assert.deepEqual(integrityHash('sha256-AA=='), [{ alg: 'SHA-256', content: '00' }]);
});

test('packaging helpers use platform resource roots and find only legal notice files', async (t) => {
  const context = {
    appOutDir: '/tmp/out',
    packager: { appInfo: { productFilename: 'Blanc' } },
  };
  assert.equal(
    resourcesDirectory({ ...context, electronPlatformName: 'darwin' }),
    '/tmp/out/Blanc.app/Contents/Resources'
  );
  assert.equal(
    resourcesDirectory({ ...context, electronPlatformName: 'win32' }),
    '/tmp/out/resources'
  );
  assert.equal(safeLicenseFilename('@scope/pkg', '1.2.3'), 'scope__pkg--1.2.3.txt');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-license-files-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'LICENSE'), 'a');
  fs.writeFileSync(path.join(dir, 'NOTICE.txt'), 'b');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  assert.deepEqual(
    (await existingLicenseFiles(dir)).map((file) => path.basename(file)),
    ['LICENSE', 'NOTICE.txt']
  );
});

test('after-pack compliance payload contains SBOM, framework notices, and every runtime license', async (t) => {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-compliance-'));
  t.after(() => fs.rmSync(appOutDir, { recursive: true, force: true }));
  const context = {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: { appInfo: { productFilename: 'Blanc' } },
  };
  // Electron-builder places these beside the unpacked app on Windows/Linux
  // and may already place them in Resources on macOS. The compliance hook
  // normalizes either layout into the packaged resources directory.
  fs.writeFileSync(path.join(appOutDir, 'LICENSE.electron.txt'), 'Electron MIT fixture\n');
  fs.writeFileSync(path.join(appOutDir, 'LICENSES.chromium.html'), '<html>Chromium fixture</html>\n');
  await packageCompliance(context);

  const resources = resourcesDirectory(context);
  assert.match(fs.readFileSync(path.join(resources, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), /EasyPrivacy/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(resources, 'runtime-sbom.cdx.json'))).components.length, 37);
  assert.equal(fs.readFileSync(path.join(resources, 'LICENSE.electron.txt'), 'utf8'), 'Electron MIT fixture\n');
  assert.equal(fs.readFileSync(path.join(resources, 'LICENSES.chromium.html'), 'utf8'), '<html>Chromium fixture</html>\n');

  const licenses = fs.readdirSync(path.join(resources, 'ThirdPartyLicenses'));
  assert.equal(licenses.length, 32, '30 runtime npm records plus two font licenses');
  assert.ok(licenses.includes('lazy-val--1.0.5.txt'));
  assert.ok(licenses.includes('inter-OFL.txt'));
  assert.ok(licenses.includes('jetbrains-mono-OFL.txt'));
});
