'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareEcsRuntime } = require('./prepare-ecs-runtime.cjs');
const pin = require('../build/ecs-runtime.json');
const archName = context => require('builder-util').Arch[context.arch];
function evs(command, directory) {
  const python = process.env.BLANC_EVS_PYTHON || process.env.BLANC_ECS_EVS_PYTHON;
  if (!python) throw Error('ECS signing requires BLANC_EVS_PYTHON and an existing verified EVS account');
  execFileSync(python, ['-m', 'castlabs_evs.vmp', '--no-ask', command, '--name-hint', 'Blanc', directory], { stdio: 'inherit' });
}
async function beforePack(context) {
  require('./preflight-electron-runtime').verifyElectronRuntime({ root: context.packager.projectDir });
  if (context.packager.info.framework.version !== pin.version) throw Error('Unexpected ECS framework version');
  const release = process.env.BLANC_ECS_RELEASE === '1';
  const internal = process.env.BLANC_UBLOCK_INTERNAL_BUILD === '1';
  if (release === internal) throw Error('An ECS build is exactly one of internal qualification or the release pipeline');
  if (release && context.packager.config.extraMetadata.blancEcsUblockQualification) throw Error('Internal uBO qualification marker forbidden in an ECS release');
  const runtime = await prepareEcsRuntime(context.electronPlatformName, archName(context));
  Object.assign(context.packager.config.extraMetadata, { blancEcsArchiveSha256: runtime.archiveSha256,
    blancEcsFrameworkSha256: runtime.frameworkSha256, blancEcsTarget: `${runtime.platform}-${runtime.arch}`,
    ...(runtime.nativePatch ? { blancEcsNativePatch: runtime.nativePatch } : {}) });
  Object.assign(context.packager.info.metadata, context.packager.config.extraMetadata);
  require('./before-pack-ublock')(context, { runtimeCheck: version => {
    require('./check-ublock-runtime.cjs').checkRuntime();
    if (version !== pin.version) throw Error('ECS uBO qualification runtime differs from the reviewed input');
    // A public ECS build enables uBO only through its own reviewed record.
    if (release && require('../src/main/ublock-platforms.json').ecsRuntime !== pin.version) throw Error('ECS release runtime lacks a reviewed uBO runtime record');
  } });
}
async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = archName(context);
  const runtime = await prepareEcsRuntime(platform, arch);
  const resources = path.join(context.appOutDir, platform === 'darwin' ? 'Blanc.app/Contents/Resources' : 'resources');
  // Use the selected vendor's notices, never the development Electron package.
  await fs.copyFile(path.join(runtime.directory, 'LICENSE'), path.join(resources, 'LICENSE.electron.txt'));
  await fs.copyFile(path.join(runtime.directory, 'LICENSES.chromium.html'), path.join(resources, 'LICENSES.chromium.html'));
  if (platform === 'darwin') {
    const helper = path.join(context.appOutDir, 'Blanc.app/Contents/Frameworks/Blanc Helper.app/Contents/MacOS/Blanc Helper');
    await fs.rename(helper, path.join(path.dirname(helper), 'Blanc Core Helper'));
    execFileSync('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-arch', arch === 'x64' ? 'x86_64' : arch,
      path.join(__dirname, 'ecs-cdm-dispatch.c'), '-o', helper], { stdio: 'inherit' });
    const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
    const wire = { version: FuseVersion.V1 };
    const keys = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments',
      'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot', 'GrantFileProtocolExtraPrivileges'];
    for (const key of keys) wire[FuseV1Options[key]] = context.packager.config.electronFuses[key[0].toLowerCase() + key.slice(1)];
    await flipFuses(path.join(context.appOutDir, 'Blanc.app'), wire);
  } else if (platform === 'linux') {
    // Both natives must start on glibc 2.28 (linux-native-build.cjs): the
    // launcher links fully static, the preload comes from the pinned image.
    const { buildLauncher, assertLinuxBaseline } = require('./linux-native-build.cjs');
    await fs.copyFile(path.join(runtime.directory, 'blanc-cdm-preload.so'), path.join(context.appOutDir, 'blanc-cdm-preload.so'));
    assertLinuxBaseline(path.join(context.appOutDir, 'blanc-cdm-preload.so'), { kind: 'shared' });
    const launcher = buildLauncher(path.join(__dirname, 'ecs-linux-launcher.cc'), path.join(context.appOutDir, 'blanc-ecs-launcher'));
    assertLinuxBaseline(launcher, { kind: 'static' });
    await fs.copyFile(path.join(__dirname, 'ecs-linux-apprun.sh'), path.join(context.appOutDir, 'AppRun'));
    await fs.chmod(path.join(context.appOutDir, 'AppRun'), 0o755);
  }
  await require('./after-pack-app-icons')(context);
  if (platform === 'darwin') evs('sign-pkg', context.appOutDir);
}
async function afterSign(context) {
  await require('./after-sign-verify')(context);
  // EVS explicitly requires opposite order on the two platforms:
  // macOS: EVS then Apple; Windows: Authenticode then EVS.
  if (context.electronPlatformName === 'win32') evs('sign-pkg', context.appOutDir);
  if (['win32', 'darwin'].includes(context.electronPlatformName)) evs('verify-pkg', context.appOutDir);
}
module.exports = { beforePack, afterPack, afterSign };
