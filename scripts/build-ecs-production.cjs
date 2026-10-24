'use strict';
// ECS build using the ordinary production entrypoint, browser identity,
// profile layout and package hooks. Never calls a publisher: scripts/release.sh
// and the native release workflow stage its artifacts themselves.
//
// Default (qualification) mode writes dist-ecs/ with the internal uBO
// qualification markers. --release (used only by the release pipeline) writes
// dist/ with no internal markers, so uBO ships only under its public
// distribution clearance and the reviewed ECS runtime record.
const path = require('node:path');
const base = require('../package.json');
const pin = require('../build/ecs-runtime.json');
const hooks = require('./ecs-production-packaging.cjs');
const { prepareEcsRuntime } = require('./prepare-ecs-runtime.cjs');
function configuration({ release = false } = {}) {
  const config = { ...base.build, electronVersion: pin.version,
    electronDist: async options => (await prepareEcsRuntime(options.platformName, options.arch)).directory,
    directories: { output: path.join(__dirname, release ? '../dist' : '../dist-ecs') },
    extraMetadata: release ? { blancRuntime: 'ecs', blancEcsRuntime: pin.version }
      : { blancRuntime: 'ecs', blancEcsRuntime: pin.version, blancEcsUblockQualification: true },
    electronFuses: { ...base.build.electronFuses, grantFileProtocolExtraPrivileges: true },
    beforePack: hooks.beforePack, afterPack: hooks.afterPack, afterSign: hooks.afterSign,
  };
  if (process.platform === 'win32') {
    const keys = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_ENDPOINT',
      'AZURE_CODE_SIGNING_ACCOUNT', 'AZURE_CERT_PROFILE', 'AZURE_PUBLISHER_NAME'];
    if (keys.every(key => process.env[key])) config.win = { ...base.build.win, azureSignOptions: {
      publisherName: process.env.AZURE_PUBLISHER_NAME, endpoint: process.env.AZURE_ENDPOINT,
      certificateProfileName: process.env.AZURE_CERT_PROFILE, codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT,
    } };
    else if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) throw Error('A complete Windows signing configuration is required');
  }
  return config;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dir', '--arm64', '--x64', '--mac', '--win', '--linux', '--release'].includes(arg))) throw Error('Only explicit platform/architecture, --dir and --release are accepted; publication is forbidden');
  const release = args.includes('--release');
  const archArgs = args.filter(arg => ['--arm64', '--x64'].includes(arg));
  if (args.filter(arg => ['--mac', '--win', '--linux'].includes(arg)).length > 1) throw Error('Choose exactly one platform');
  // One release build must carry both Mac architectures so electron-builder
  // writes a single latest-mac.yml listing both; qualification builds stay
  // one architecture at a time.
  if (archArgs.length > 1 && !(release && args.includes('--mac'))) throw Error('Choose exactly one architecture');
  if (release && args.includes('--dir')) throw Error('Release builds produce installers, not --dir output');
  if (release && process.env.BLANC_UBLOCK_INTERNAL_BUILD === '1') throw Error('Internal uBlock validation cannot enter an ECS release build');
  if (release && process.env.BLANC_ECS_RELEASE_PIPELINE !== '1') throw Error('ECS release builds run only from the release pipeline');
  const { build, Platform, Arch } = require('electron-builder');
  const platform = args.includes('--win') ? Platform.WINDOWS : args.includes('--linux') ? Platform.LINUX
    : args.includes('--mac') ? Platform.MAC : { darwin: Platform.MAC, win32: Platform.WINDOWS, linux: Platform.LINUX }[process.platform];
  if (!platform) throw Error('Unsupported host platform');
  const arches = archArgs.length ? archArgs.map(arg => Arch[arg.slice(2)]) : [Arch[process.arch]];
  if (release) process.env.BLANC_ECS_RELEASE = '1';
  else process.env.BLANC_UBLOCK_INTERNAL_BUILD = '1';
  await build({ config: configuration({ release }), publish: 'never',
    targets: platform.createTarget(args.includes('--dir') ? ['dir'] : undefined, ...arches) });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { configuration };
