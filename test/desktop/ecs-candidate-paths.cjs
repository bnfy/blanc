'use strict';
const path = require('node:path');
const { extractFile } = require('@electron/asar');
function candidatePaths(app) {
  const metadata = JSON.parse(extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json'));
  const full = metadata.blancEcsFullCandidate === true && metadata.name === 'blanc-ecs-full-candidate';
  if (!full && metadata.name !== 'blanc-ecs-drm-candidate') throw Error('Refusing to test a non-candidate app');
  const name = full ? metadata.productName : 'Blanc ECS DRM Candidate';
  if (typeof name !== 'string' || path.basename(name) !== name) throw Error('Invalid candidate executable name');
  return { full, executable: path.join(app, 'Contents/MacOS', name) };
}
module.exports = { candidatePaths };
