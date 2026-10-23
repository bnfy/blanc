'use strict';
const fs = require('node:fs');
const path = require('node:path');
function linuxPreloadEnv(appDir, profile) {
  const shim = path.join(appDir, 'blanc-cdm-preload.so');
  if (!fs.existsSync(shim)) return {};
  if (/[:\s]/.test(shim) || !path.isAbsolute(profile) || fs.lstatSync(profile).isSymbolicLink()
      || JSON.parse(fs.readFileSync(path.join(profile, 'ecs-candidate-profile.json'))).candidate !== true) {
    throw Error('CDM preload requires an explicitly marked isolated profile and safe absolute shim path');
  }
  const root = path.join(profile, 'WidevineCdm');
  const versions = fs.existsSync(root) ? fs.readdirSync(root).filter(v => /^\d+(?:\.\d+){3}$/.test(v)) : [];
  versions.sort((a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  });
  let library = '';
  for (const version of versions) {
    const dir = path.join(root, version);
    const file = path.join(dir, '_platform_specific/linux_x64/libwidevinecdm.so');
    if (!fs.existsSync(file)) continue;
    const real = fs.realpathSync(file);
    if (real !== file || !fs.statSync(real).isFile()) throw Error('CDM preload refuses redirected component paths');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.version !== version) throw Error('CDM preload component manifest/version mismatch');
    library = real; break;
  }
  return { LD_PRELOAD: shim, BLANC_ECS_CDM_PRELOAD_PATH: library };
}
module.exports = { linuxPreloadEnv };
