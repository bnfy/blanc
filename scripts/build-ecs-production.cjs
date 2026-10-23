'use strict';
// Unpublished integration build using the ordinary production entrypoint,
// browser identity, profile layout and package hooks. Never calls a publisher.
const path = require('node:path');
const base = require('../package.json');
const pin = require('../build/ecs-runtime.json');
const hooks = require('./ecs-production-packaging.cjs');
const { prepareEcsRuntime } = require('./prepare-ecs-runtime.cjs');
function configuration() {
  const config = { ...base.build, electronVersion: pin.version,
    electronDist: async options => (await prepareEcsRuntime(options.platformName, options.arch)).directory,
    directories: { output: path.join(__dirname, '../dist-ecs') },
    extraMetadata: { blancRuntime: 'ecs', blancEcsRuntime: pin.version, blancEcsUblockQualification: true },
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
  if (args.some(arg => !['--dir', '--arm64', '--x64', '--mac', '--win', '--linux'].includes(arg))) throw Error('Only explicit platform/architecture and --dir are accepted; publication is forbidden');
  if (args.filter(arg => ['--mac', '--win', '--linux'].includes(arg)).length > 1
    || args.filter(arg => ['--arm64', '--x64'].includes(arg)).length > 1) throw Error('Choose exactly one platform and architecture');
  const { build, Platform, Arch } = require('electron-builder');
  const platform = args.includes('--win') ? Platform.WINDOWS : args.includes('--linux') ? Platform.LINUX
    : args.includes('--mac') ? Platform.MAC : { darwin: Platform.MAC, win32: Platform.WINDOWS, linux: Platform.LINUX }[process.platform];
  if (!platform) throw Error('Unsupported host platform');
  const arch = args.includes('--x64') ? Arch.x64 : args.includes('--arm64') ? Arch.arm64 : Arch[process.arch];
  process.env.BLANC_UBLOCK_INTERNAL_BUILD = '1';
  await build({ config: configuration(), publish: 'never', targets: platform.createTarget(args.includes('--dir') ? ['dir'] : undefined, arch) });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { configuration };
