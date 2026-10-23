'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync, spawn } = require('node:child_process');
const { extractFile } = require('@electron/asar');
const { withDiagnosticProfile } = require('./drm-diagnostics.cjs');

async function run(appPath) {
  const app = await fs.realpath(appPath);
  if (!app.endsWith('.app')) throw Error('Expected packaged diagnostic .app');
  const metadata = JSON.parse(extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json'));
  if (metadata.name !== 'blanc-ecs-drm-candidate') throw Error('Not a Blanc ECS diagnostic candidate');
  // Never bypass an invalid Apple signature to make the test launch.
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  await withDiagnosticProfile(profile => new Promise((resolve, reject) => {
    const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
    void ignored;
    const child = spawn(path.join(app, 'Contents/MacOS/Blanc ECS DRM Candidate'), [], {
      stdio: 'inherit', env: { ...env, BLANC_DRM_DIAGNOSTIC_PROFILE: profile },
    });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error(`Candidate exited ${code ?? signal}`)));
  }));
}
if (require.main === module) run(process.argv[2] || '').catch(error => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { run };
