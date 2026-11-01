'use strict';
const path = require('node:path');
const { extractFile } = require('@electron/asar');
const fs = require('node:fs');
function candidatePaths(app) {
  const asar = path.join(app, process.platform === 'darwin' ? 'Contents/Resources/app.asar' : 'resources/app.asar');
  const metadata = JSON.parse(extractFile(asar, 'package.json'));
  // Production ECS: the internal qualification package, or the public release
  // package, which carries no internal markers but must name exactly the
  // pinned ECS runtime and Blanc's own package identity.
  const qualification = metadata.blancRuntime === 'ecs' && metadata.blancEcsUblockQualification === true;
  const publicRelease = metadata.blancRuntime === 'ecs'
    && metadata.blancEcsUblockQualification === undefined && metadata.blancUblockInternalValidation === undefined
    && metadata.blancEcsRuntime === require('../../build/ecs-runtime.json').version
    && metadata.name === require('../../package.json').name;
  const production = qualification || publicRelease;
  const full = production || (metadata.blancEcsFullCandidate === true && metadata.name === 'blanc-ecs-full-candidate');
  if (!full && metadata.name !== 'blanc-ecs-drm-candidate') throw Error('Refusing to test a non-candidate app');
  const name = full ? metadata.productName : 'Blanc ECS DRM Candidate';
  if (typeof name !== 'string' || path.basename(name) !== name) throw Error('Invalid candidate executable name');
  if (process.platform === 'darwin') return { full, production, publicRelease, asar, executable: path.join(app, 'Contents/MacOS', name), launchEnv: {} };
  if (process.platform === 'win32' && production) return { full, production, publicRelease, asar, executable: path.join(app, `${name}.exe`), launchEnv: {} };
  if (process.platform !== 'linux' || !full) throw Error('This probe supports full Linux and macOS candidates only');
  const fuseExecutable = path.join(app, metadata.name);
  const images = fs.readdirSync(path.dirname(app)).filter(file => file === `Blanc-${metadata.version}.AppImage`);
  if (images.length !== 1) throw Error('Exact candidate AppImage is required');
  return { full, production, publicRelease, asar, fuseExecutable, executable: path.join(path.dirname(app), images[0]), launchEnv: { APPIMAGE_EXTRACT_AND_RUN: '1' },
    profileEnv: profile => fs.existsSync(path.join(app, 'blanc-ecs-launcher')) ? {} : require('../../scripts/ecs-linux-preload-env.cjs').linuxPreloadEnv(app, profile) };
}
module.exports = { candidatePaths };
