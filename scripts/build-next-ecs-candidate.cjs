'use strict';
const fs = require('node:fs/promises');
const { buildFull } = require('./build-full-ecs-candidate.cjs');
async function main() {
  if (process.platform !== 'linux') throw Error('Linux staging qualification only');
  const first = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  if (!first.nativeValidation || !first.nativeSecurityPatch || first.productionUpdater) throw Error('Not an isolated patched native candidate');
  await buildFull(first.runtimeDir, { nativeValidation: true, stagingUpdater: true,
    nativeSecurityPatch: first.nativeSecurityPatch, candidateSequence: 2 });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
