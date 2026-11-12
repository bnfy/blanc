'use strict';
// The ECS probes accept the internal qualification package and the public
// release package, and refuse anything else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');
const { candidatePaths } = require('../desktop/ecs-candidate-paths.cjs');
const pin = require('../../build/ecs-runtime.json');
const base = require('../../package.json');

async function fixture(metadata) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ecs-paths-'));
  const source = path.join(root, 'src'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ productName: 'Blanc', version: base.version, ...metadata }));
  const app = path.join(root, process.platform === 'darwin' ? 'Blanc.app' : 'linux-unpacked');
  const resources = path.join(app, process.platform === 'darwin' ? 'Contents/Resources' : 'resources');
  fs.mkdirSync(resources, { recursive: true });
  await asar.createPackage(source, path.join(resources, 'app.asar'));
  if (process.platform === 'linux') fs.writeFileSync(path.join(root, `Blanc-${base.version}.AppImage`), '');
  return { root, app };
}
const publicPackage = { name: base.name, blancRuntime: 'ecs', blancEcsRuntime: pin.version, blancUblockBundled: true };

test('public ECS release packages and internal qualification packages are accepted; anything else is refused', async () => {
  const cases = [
    ['public release', publicPackage, true],
    ['internal qualification', { ...publicPackage, blancEcsUblockQualification: true, blancUblockInternalValidation: true }, true],
    ['public with a different ECS pin', { ...publicPackage, blancEcsRuntime: '44.9.4+wvcus' }, false],
    ['public under another package name', { ...publicPackage, name: 'someone-else' }, false],
    ['internal validation marker without the ECS qualification marker', { ...publicPackage, blancUblockInternalValidation: true }, false],
    ['official Electron package', { name: base.name, blancUblockBundled: true }, false],
  ];
  for (const [label, metadata, accepted] of cases) {
    const { root, app } = await fixture(metadata);
    try {
      if (accepted) {
        const paths = candidatePaths(app);
        assert.equal(paths.production, true, label);
        assert.equal(paths.publicRelease, label === 'public release', label);
      } else {
        assert.throws(() => candidatePaths(app), /Refusing to test a non-candidate app/, label);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});
