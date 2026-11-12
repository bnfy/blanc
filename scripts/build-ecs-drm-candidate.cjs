'use strict';

// Development-only packaging probe. Never changes package.json/node_modules,
// signs, publishes, installs or alters a production profile.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function candidateConfig(runtimeDir, output, productionFuses, control = false) {
  return {
    appId: 'me.bnfy.blanc.ecs-drm-candidate', productName: 'Blanc ECS DRM Candidate',
    electronDist: runtimeDir, npmRebuild: false, asar: true,
    files: ['main.cjs', 'drm-runtime.js', 'ecs-local-html.cjs', 'package.json', 'LICENSE', 'LICENSES.chromium.html'],
    directories: { output },
    electronFuses: { ...productionFuses, ...(control ? { grantFileProtocolExtraPrivileges: true } : {}) },
    // No claim that production entitlements are applied to this unsigned probe.
    mac: { identity: null, hardenedRuntime: true }, publish: null,
  };
}

async function buildCandidate(runtimeDir, { control = false } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw Error('This packaging probe has only been validated on macOS arm64');
  }
  const runtime = await fs.realpath(runtimeDir);
  const version = (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+\+wvcus$/.test(version)) throw Error('An explicitly supplied stable ECS distribution is required');
  await fs.access(path.join(runtime, 'Electron.app/Contents/MacOS/Electron'));
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-package-'));
  const project = path.join(staging, 'app');
  await fs.mkdir(project);
  for (const [source, destination] of [
    [path.join(__dirname, 'ecs-drm-candidate-main.cjs'), 'main.cjs'],
    [path.join(__dirname, 'ecs-local-html.cjs'), 'ecs-local-html.cjs'],
    [path.join(root, 'scripts/drm-runtime.js'), 'drm-runtime.js'],
    [path.join(runtime, 'LICENSE'), 'LICENSE'],
    [path.join(runtime, 'LICENSES.chromium.html'), 'LICENSES.chromium.html'],
  ]) await fs.copyFile(source, path.join(project, destination));
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({
    name: 'blanc-ecs-drm-candidate', version: '0.0.0-ecs-test.1', main: 'main.cjs',
    description: 'Isolated DRM packaging probe, not a Blanc release', author: metadata.author,
  }, null, 2));
  const config = { ...candidateConfig(runtime, path.join(staging, 'dist'), metadata.build.electronFuses, control), electronVersion: version };
  await fs.writeFile(path.join(staging, 'candidate.json'), JSON.stringify({ control, productionFuses: metadata.build.electronFuses, config }, null, 2));
  console.log(`Isolated staging: ${staging}`);
  const { build, Platform, Arch } = require('electron-builder');
  await build({ projectDir: project, targets: Platform.MAC.createTarget(['dir'], Arch.arm64), config });
  return staging;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0] || args.slice(1).some(arg => arg !== '--supported-fuses-control')) {
    console.error('Usage: node scripts/build-ecs-drm-candidate.cjs /absolute/ECS/distribution [--supported-fuses-control]');
    process.exitCode = 1;
  } else buildCandidate(args[0], { control: args.includes('--supported-fuses-control') })
    .then(staging => console.log(`Unsigned diagnostic package built: ${staging}/dist/mac-arm64`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { candidateConfig, buildCandidate };
