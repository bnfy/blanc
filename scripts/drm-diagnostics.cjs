'use strict';
// Node owns cleanup after the Electron child exits.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
async function withDiagnosticProfile(run) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-drm-diagnostics-'));
  try { return await run(profile); }
  finally {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (await fs.lstat(profile).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    })) throw new Error('Diagnostic profile cleanup failed');
  }
}
async function launch() {
  return withDiagnosticProfile(profile => new Promise((resolve, reject) => {
    const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
    void ignored;
    const child = spawn(require('electron'), [path.join(__dirname, 'drm-diagnostics/main.cjs')], {
      stdio: 'inherit', env: { ...env, BLANC_DRM_DIAGNOSTIC_PROFILE: profile },
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Diagnostic Electron exited ${code ?? signal}`));
    });
  }));
}
if (require.main === module) launch().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { withDiagnosticProfile };
