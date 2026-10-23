'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function replaceExactly(source, before, after, label) {
  if (source.split(before).length !== 2) throw Error(`Candidate patch no longer matches exactly once: ${label}`);
  return source.replace(before, after);
}
function patchMain(source) {
  source = replaceExactly(source, '  externalUrlHandoff.openLocalFiles(paths);',
    "  require('./ecs-full-bootstrap.cjs').openLocalFiles(paths);", 'local HTML entrypoint');
  source = replaceExactly(source, '  const admittedLocalFile = allowLocalFile && isSupportedLocalHtmlUrl(url);',
    '  const admittedLocalFile = false; // Candidate: never admit raw file URLs into browser tabs.', 'raw file admission');
  source = replaceExactly(source, '  if (!ownsInstanceLock) return;\n  mainI18n.init();',
    "  if (!ownsInstanceLock) return;\n  await require('./ecs-full-bootstrap.cjs').ready;\n  mainI18n.init();", 'DRM startup gate');
  source = replaceExactly(source, '    maybeOpenWhatsNew().catch(() => {});',
    "    maybeOpenWhatsNew().catch(() => {});\n    require('./ecs-full-bootstrap.cjs').browserReady();", 'browser startup completion marker');
  return replaceExactly(source, '  Menu.setApplicationMenu(Menu.buildFromTemplate(template));',
    "  Menu.setApplicationMenu(Menu.buildFromTemplate(require('./ecs-full-bootstrap.cjs').decorateMenu(template)));", 'candidate menu');
}

async function buildFull(runtimeDir, { qualification = false, nativeValidation = false, stagingUpdater = false } = {}) {
  const platform = process.platform, arch = process.arch;
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw Error('Unsupported native target');
  if (qualification && platform !== 'darwin') throw Error('Production VMP signing is currently configured for macOS only');
  const runtime = await fs.realpath(runtimeDir);
  const version = (await fs.readFile(path.join(runtime, 'version'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+\+wvcus$/.test(version)) throw Error('Explicit stable ECS distribution required');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'blanc-ecs-full-'));
  const project = path.join(staging, 'source'); await fs.mkdir(project);
  console.log(`Full ECS staging: ${staging}`);
  const base = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  const productName = qualification || nativeValidation ? base.build.productName : 'Blanc ECS Candidate';
  if (qualification && productName !== 'Blanc') throw Error('CDM dispatcher requires the reviewed Blanc helper layout');
  if (qualification) execFileSync(process.execPath, ['scripts/preflight-mac-signing.mjs'], { cwd: root, stdio: 'inherit' });
  const sources = ['src', 'adblock', 'ublock', 'dark-reader', 'bangs', 'scripts', 'build', 'compliance',
    'package-lock.json', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD-PARTY-NOTICES.md'];
  for (const name of sources) await fs.cp(path.join(root, name), path.join(project, name), { recursive: true, verbatimSymlinks: true });
  await fs.mkdir(path.join(project, 'site'));
  for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(root, 'site', name), path.join(project, 'site', name));
  const patches = [];
  const patch = async (file, transform) => {
    const target = path.join(project, file), before = await fs.readFile(target, 'utf8'), after = transform(before);
    await fs.writeFile(target, after); patches.push({ file, before: hash(before), after: hash(after) });
  };
  await patch('src/main/main.js', patchMain);
  await patch('src/main/pages.js', source => {
    source = replaceExactly(source, '  protocol.registerSchemesAsPrivileged([',
      "  protocol.registerSchemesAsPrivileged([\n    { scheme: 'blanc-local-preview', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: false, bypassCSP: false, corsEnabled: true } },", 'local preview scheme');
    source = replaceExactly(source, 'net.fetch(pathToFileURL(branding).toString())',
      'net.fetch(pathToFileURL(branding).toString(), { bypassCustomProtocolHandlers: true })', 'trusted branding loader');
    return replaceExactly(source, 'net.fetch(pathToFileURL(resource).toString())',
      'net.fetch(pathToFileURL(resource).toString(), { bypassCustomProtocolHandlers: true })', 'trusted page loader');
  });
  await patch('src/main/chrome-protocol.js', source => replaceExactly(source,
    'net.fetch(pathToFileURL(resource).href)', 'net.fetch(pathToFileURL(resource).href, { bypassCustomProtocolHandlers: true })', 'trusted chrome loader'));
  if (!stagingUpdater) await patch('src/main/updater.js', () => "'use strict';\nmodule.exports = { setupAutoUpdater() {}, checkForUpdatesManually: async () => ({ enabled: false, reason: 'Isolated ECS candidate never updates' }) };\n");
  await patch('src/main/default-browser-status.js', () => "'use strict';\nmodule.exports = { canSetDefaultBrowser: () => false, createDefaultBrowserStatus: () => () => ({ isDefault: false, canSet: false }), requestDefaultBrowser: () => false };\n");
  for (const name of ['ecs-full-bootstrap.cjs', 'ecs-local-html.cjs', 'ecs-graphics-policy.cjs', 'ecs-drm-startup.cjs', 'ecs-updater-policy.cjs']) await fs.copyFile(path.join(__dirname, name), path.join(project, 'src/main', name));
  // Every adaptation is confined to this private tree. The original lockfile,
  // production runtime declaration, reviewed uBO matrix and entitlements stay untouched.
  const config = {
    ...base.build, appId: qualification ? base.build.appId : 'me.bnfy.blanc.ecs-full-candidate', productName,
    electronDist: runtime, electronVersion: version, npmRebuild: false,
    publish: stagingUpdater ? { provider: 'generic', url: 'http://127.0.0.1:1/disabled/', channel: 'staging' } : null,
    directories: { output: path.join(staging, 'dist') }, beforePack: null, afterSign: null,
    electronFuses: { ...base.build.electronFuses, grantFileProtocolExtraPrivileges: true },
    protocols: [], files: [...base.build.files, '!ublock{,/**/*}', '!scripts/check-ublock-package.cjs', '!scripts/build-ublock-adaptation.cjs'],
    mac: qualification ? { ...base.build.mac, target: ['dir'], notarize: false, bundleVersion: String(Number(base.build.mac.bundleVersion) + 1),
      extendInfo: { ...base.build.mac.extendInfo, CFBundleDisplayName: 'Blanc ECS Qualification', CFBundleDocumentTypes: [] } }
      : { target: ['dir'], identity: null, hardenedRuntime: false, icon: 'build/icon.png',
        extendInfo: { CFBundleDisplayName: 'Blanc ECS Candidate' } },
  };
  if (nativeValidation && platform === 'win32') {
    const required = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_ENDPOINT', 'AZURE_CODE_SIGNING_ACCOUNT', 'AZURE_CERT_PROFILE', 'AZURE_PUBLISHER_NAME'];
    if (required.some(key => !process.env[key])) throw Error('Native Windows validation requires complete Azure signing configuration');
    config.win = { ...base.build.win, azureSignOptions: { publisherName: process.env.AZURE_PUBLISHER_NAME,
      endpoint: process.env.AZURE_ENDPOINT, certificateProfileName: process.env.AZURE_CERT_PROFILE,
      codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT } };
  }
  const [major, minor] = base.version.split('.').map(Number);
  const metadata = { ...base, version: `${major}.${minor + 1}.0-ecs.1`, name: 'blanc-ecs-full-candidate', productName,
    main: 'src/main/ecs-full-bootstrap.cjs', blancEcsFullCandidate: true, blancEcsQualification: qualification,
    blancEcsStagingUpdater: stagingUpdater, blancEcsGraphicsPolicy: 'copy-video-frames', blancUblockBundled: false, build: config };
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify(metadata, null, 2));
  // Resolve the lock in the isolated tree, never mutate the working checkout's
  // dependencies and never run npm package lifecycle scripts. The packaged
  // framework is always the explicitly supplied ECS distribution.
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: project, stdio: 'inherit', shell: process.platform === 'win32' });
  // The binary is ignored/generated. Recreate it only in staging and require
  // exact agreement with the unchanged reviewed manifest.
  execFileSync(process.execPath, ['adblock/seed.mjs', '--prepare'], { cwd: project, stdio: 'inherit' });
  // Keep the original npm lock for dependency provenance. Override only the
  // staged SBOM's framework component with the actual verified ECS artifact.
  const framework = path.join(runtime, platform === 'darwin' ? 'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework' : platform === 'win32' ? 'electron.exe' : 'electron');
  const frameworkHash = hash(await fs.readFile(framework));
  await patch('scripts/compliance-model.js', source => replaceExactly(source,
    "  component.type = 'framework';", `  component.name = 'electron-castlabs';\n  component.version = ${JSON.stringify(version)};\n  component['bom-ref'] = 'framework:electron-castlabs:' + component.version;\n  delete component.purl;\n  component.hashes = [{ alg: 'SHA-256', content: ${JSON.stringify(frameworkHash)} }];\n  component.externalReferences = [{ type: 'distribution', url: 'https://github.com/castlabs/electron-releases' }];\n  component.type = 'framework';`, 'actual ECS SBOM component'));
  const stagedRequire = require('node:module').createRequire(path.join(project, 'package.json'));
  const generated = stagedRequire('./scripts/compliance-model').createComplianceArtifacts();
  for (const [file, content] of Object.entries(generated.files)) await fs.writeFile(path.join(project, file), content);
  // The hook bypasses only release-specific runtime pin/default-browser/icon
  // steps; its payload, capture and license checks still execute and fail closed.
  config.afterPack = async context => {
    const resources = path.join(context.appOutDir, platform === 'darwin' ? `${productName}.app/Contents/Resources` : 'resources');
    const asar = path.join(resources, 'app.asar');
    stagedRequire('./scripts/verify-packaged-adblock').verifyPackagedAdblock(asar);
    stagedRequire('./scripts/verify-packaged-ublock').verifyPackagedUblock(asar);
    stagedRequire('./scripts/verify-packaged-capture-runtime').verifyPackagedCaptureRuntime(asar, platform);
    await fs.copyFile(path.join(runtime, 'LICENSE'), path.join(resources, 'LICENSE.electron.txt'));
    await fs.copyFile(path.join(runtime, 'LICENSES.chromium.html'), path.join(resources, 'LICENSES.chromium.html'));
    await stagedRequire('./scripts/package-compliance').packageCompliance(context);
    stagedRequire('./scripts/verify-packaged-compliance').verifyPackagedCompliance(resources);
  };
  if (qualification || (nativeValidation && platform === 'darwin')) {
    // VMP seals the final fused framework before Apple's resource/code seal.
    // The EVS client reuses a valid cached signature; no force signing.
    const afterPayloads = config.afterPack;
    config.afterPack = async context => {
      await afterPayloads(context);
      const helper = path.join(context.appOutDir, `${productName}.app/Contents/Frameworks/Blanc Helper.app/Contents/MacOS/Blanc Helper`);
      // Electron discovers its enclosing app by the executable's " Helper"
      // suffix. Keep that suffix on the unmodified vendor launcher.
      await fs.rename(helper, path.join(path.dirname(helper), 'Blanc Core Helper'));
      execFileSync('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-arch', arch === 'x64' ? 'x86_64' : arch,
        path.join(project, 'scripts/ecs-cdm-dispatch.c'), '-o', helper], { stdio: 'inherit' });
      const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
      const map = { runAsNode: 'RunAsNode', enableCookieEncryption: 'EnableCookieEncryption',
        enableNodeOptionsEnvironmentVariable: 'EnableNodeOptionsEnvironmentVariable', enableNodeCliInspectArguments: 'EnableNodeCliInspectArguments',
        enableEmbeddedAsarIntegrityValidation: 'EnableEmbeddedAsarIntegrityValidation', onlyLoadAppFromAsar: 'OnlyLoadAppFromAsar',
        loadBrowserProcessSpecificV8Snapshot: 'LoadBrowserProcessSpecificV8Snapshot', grantFileProtocolExtraPrivileges: 'GrantFileProtocolExtraPrivileges' };
      const wire = { version: FuseVersion.V1 };
      for (const [key, name] of Object.entries(map)) wire[FuseV1Options[name]] = config.electronFuses[key];
      await flipFuses(path.join(context.appOutDir, `${productName}.app`), wire);
      if (!qualification) return;
      const evs = process.env.BLANC_ECS_EVS_PYTHON;
      if (!evs) throw Error('Qualification signing requires BLANC_ECS_EVS_PYTHON');
      execFileSync(evs, ['-m', 'castlabs_evs.vmp', '--no-ask', 'sign-pkg', '--name-hint', productName, context.appOutDir], { stdio: 'inherit' });
    };
    if (qualification) config.afterSign = async context => {
      await stagedRequire('./scripts/after-sign-verify')(context);
      execFileSync(process.env.BLANC_ECS_EVS_PYTHON, ['-m', 'castlabs_evs.vmp', '--no-ask', 'verify-pkg', '--name-hint', productName, context.appOutDir], { stdio: 'inherit' });
    };
  }
  const manifest = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    baseVersion: base.version, runtime: version, frameworkHash, patches, productionFuses: base.build.electronFuses,
    candidateFuses: config.electronFuses, graphicsPolicy: metadata.blancEcsGraphicsPolicy, qualification, nativeValidation, platform, arch,
    stagingUpdater, productionUpdater: false, vmpSigned: qualification,
    cdmDispatcher: platform === 'darwin' && (qualification || nativeValidation) ? { source: 'scripts/ecs-cdm-dispatch.c', sha256: hash(await fs.readFile(path.join(__dirname, 'ecs-cdm-dispatch.c'))),
      subtype: 'media.mojom.CdmServiceBroker', target: 'existing-plugin-helper', entitlementChanges: false } : null,
    optionalUblock: 'excluded pending ECS runtime review', notarized: false };
  await fs.writeFile(path.join(staging, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2));
  const { build, Platform, Arch } = require('electron-builder');
  const targetPlatform = { darwin: Platform.MAC, win32: Platform.WINDOWS, linux: Platform.LINUX }[platform];
  const targets = { darwin: ['dir'], win32: ['nsis'], linux: ['AppImage'] }[platform];
  await build({ projectDir: project, config, publish: 'never', targets: targetPlatform.createTarget(targets, Arch[arch]) });
  if (nativeValidation && platform === 'darwin') {
    // Fuses and the dispatcher invalidate the vendor ad-hoc seal. This seal
    // permits local/native smoke only; it is not Developer ID or notarization.
    const app = path.join(staging, 'dist', arch === 'arm64' ? 'mac-arm64' : 'mac', `${productName}.app`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  }
  if (process.env.BLANC_ECS_BUILD_RESULT) await fs.writeFile(process.env.BLANC_ECS_BUILD_RESULT, JSON.stringify({ staging, project, dist: path.join(staging, 'dist'), ...manifest }, null, 2));
  console.log(`Full candidate built: ${staging}/dist (${platform}/${arch})`);
  return staging;
}
if (require.main === module) buildFull(process.argv[2] || '', { qualification: process.argv.includes('--qualification'), nativeValidation: process.argv.includes('--native-validation'), stagingUpdater: process.argv.includes('--staging-updater') }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { patchMain, replaceExactly, buildFull };
