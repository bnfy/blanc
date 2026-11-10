#!/usr/bin/env node
// Read-only verification of an already signed/stapled artifact. Never signs or launches it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { X509Certificate } from 'node:crypto';
import { ROOT_ID, PRODUCT, TEAM, check, equal, reason, validateRelease, validateProfile, sha256, fingerprint, feedURL, assetName } from './policy.mjs';
import { run, profileAt, readPlist, derEntitlements } from './native.mjs';
const media = Object.fromEntries(['device.audio-input', 'device.bluetooth', 'device.camera', 'device.print', 'device.usb', 'personal-information.location', 'personal-information.photos-library'].map(k => [`com.apple.security.${k}`, true]));
export function entitlements(role, r) {
  if (role === 'app') return {...media, 'keychain-access-groups': [r.keychainGroup], 'com.apple.application-identifier': `${TEAM}.${ROOT_ID}`, 'com.apple.developer.team-identifier': TEAM};
  if (role === 'jit') return {'com.apple.security.cs.allow-jit': true};
  return {};
}
export function parts(r) {
  const framework = `Contents/Frameworks/${PRODUCT} Framework.framework`;
  const helpers = `${framework}/Versions/${r.chromiumVersion}/Helpers`;
  const sparkle = 'Contents/Frameworks/Sparkle.framework';
  return [
    {path: '.', id: ROOT_ID, role: 'app', runtime: true},
    {path: framework, id: `${ROOT_ID}.framework`, role: 'none', runtime: false},
    ...['', ' (Renderer)', ' (GPU)', ' (Aperitif)', ' (Aperitif Renderer)', ' (Aperitif GPU)', ' (Alerts)', ' (Aperitif Alerts)'].map(suffix => ({
      path: `${helpers}/${PRODUCT} Helper${suffix}.app`,
      id: /Alerts/.test(suffix) ? `${ROOT_ID}.framework.AlertNotificationService` : `${ROOT_ID}.helper${/Renderer/.test(suffix) ? '.renderer' : ''}`,
      role: /Renderer|GPU/.test(suffix) ? 'jit' : 'none', runtime: true,
    })),
    ...['chrome_crashpad_handler', 'app_mode_loader', 'web_app_shortcut_copier'].map(name => ({path: `${helpers}/${name}`, id: name === 'web_app_shortcut_copier' ? `${ROOT_ID}.${name}` : name, role: 'none', runtime: true})),
    {path: sparkle, id: 'org.sparkle-project.Sparkle', role: 'none', runtime: false},
    {path: `${sparkle}/Versions/B/Autoupdate`, id: 'org.sparkle-project.Sparkle.Autoupdate', role: 'none', runtime: true},
    {path: `${sparkle}/Versions/B/Updater.app`, id: 'org.sparkle-project.Sparkle.Updater', role: 'none', runtime: true},
    {path: `${sparkle}/Versions/B/XPCServices/Installer.xpc`, id: 'org.sparkle-project.InstallerLauncher', role: 'none', runtime: true},
    {path: `${sparkle}/Versions/B/XPCServices/Downloader.xpc`, id: 'org.sparkle-project.DownloaderService', role: 'none', runtime: true},
  ];
}
export const NOTICES = ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'ASSET-LICENSE.md', 'Chromium-LICENSE', 'Chromium-credits.html', 'Sparkle-LICENSE', 'THIRD_PARTY_NOTICES.txt'];
export function validateAppInfo(info, r, arch, {allowLocalQualification = false} = {}) {
  const local = r.localQualification === true;
  check(!local || allowLocalQualification, 'local qualification artifact is not distributable');
  equal(info.BlancLocalQualification === true, local, 'compiled local qualification marker');
  equal(info.CFBundleIdentifier, ROOT_ID, 'beta app ID');
  equal(info.CFBundleName, PRODUCT, 'beta name'); equal(info.CFBundleDisplayName, PRODUCT, 'beta display name');
  equal(info.CFBundleExecutable, PRODUCT, 'beta executable');
  equal(info.CrProductDirName, PRODUCT, 'isolated profile directory');
  equal(info.CFBundleVersion, String(r.build), 'Sparkle build');
  equal(info.CFBundleShortVersionString, r.shortVersion, 'marketing version');
  equal(info.SUFeedURL, local ? 'http://127.0.0.1:49262/arm64.xml' : feedURL(arch), 'architecture-specific beta feed');
  equal(info.SUPublicEDKey, r.sparkle.publicKey, 'embedded EdDSA trust anchor');
  equal(info.SUVerifyUpdateBeforeExtraction, true, 'verify update before extraction');
  equal(info.LSMinimumSystemVersion, r.minimumSystemVersion, 'minimum macOS');
  check(info.SUEnableInstallerLauncherService !== true && info.SUEnableDownloaderService !== true, 'browser is not App Sandbox; do not enable sandbox services');
  const schemes = (info.CFBundleURLTypes || []).flatMap(t => t.CFBundleURLSchemes || []).sort();
  equal(schemes, ['blanc-beta', 'file', 'http', 'https'], 'only isolated direct-launch scheme plus browser schemes');
  check(!Object.keys(info).some(k => /^(?:KS|SUFeedURLOverride)/.test(k)), 'Google updater or feed override metadata refused');
}
export function validatePart(observed, expected, r) {
  equal(observed.identifier, expected.id, 'code identity');
  equal(observed.fingerprint, r.certificateSHA1, 'actual leaf fingerprint');
  equal(observed.team, TEAM, 'actual signing team');
  check(observed.authority.startsWith('Developer ID Application:') && observed.authority.endsWith(`(${TEAM})`), 'Developer ID Application authority');
  check(observed.timestamp === true, 'secure timestamp required');
  if (expected.runtime) check(observed.runtime === true, 'hardened runtime required');
  equal(observed.entitlements, entitlements(expected.role, r), 'exact per-part DER entitlements');
}
export function inspectTree(app) {
  const root = fs.realpathSync(app), files = [], bundles = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, e.name), relative = path.relative(root, full);
      check(!/widevine|widevinecdm/i.test(relative), 'Widevine payload forbidden');
      if (e.name === 'embedded.provisionprofile') check(relative === 'Contents/embedded.provisionprofile', 'helpers must not embed provisioning profiles');
      if (e.isSymbolicLink()) {
        const target = fs.realpathSync(full);
        check(target === root || target.startsWith(root + path.sep), 'bundle symlink escapes app');
      } else if (e.isDirectory()) {
        if (/\.(app|xpc|framework)$/.test(e.name)) bundles.push(full);
        walk(full);
      } else if (e.isFile()) files.push(full);
      else check(false, 'unexpected bundle entry type');
    }
  }
  walk(root); return {root, files, bundles};
}
export function macho(file) {
  const fd = fs.openSync(file, 'r'), bytes = Buffer.alloc(4);
  try { fs.readSync(fd, bytes, 0, 4, 0); } finally { fs.closeSync(fd); }
  return ['feedface','feedfacf','cefaedfe','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca'].includes(bytes.toString('hex'));
}
function signatureDescription(file) {
  // codesign writes display data to stderr, not stdout. Capture, never log it.
  return run('/usr/bin/codesign', ['--display', '--verbose=4', file], undefined, {stream: 'stderr'});
}
function signatureFields(description, certificate) {
  return {identifier: description.match(/^Identifier=(.+)$/m)?.[1], team: description.match(/^TeamIdentifier=(.+)$/m)?.[1], authority: description.match(/^Authority=(.+)$/m)?.[1] || '', timestamp: /^Timestamp=.+$/m.test(description), runtime: /flags=.*\bruntime\b/.test(description), fingerprint: fingerprint(certificate)};
}
export function validateLayout(app, r, tree) {
  const expected = parts(r), realParts = new Set(expected.map(p => fs.realpathSync(path.join(app, p.path))));
  for (const bundle of tree.bundles) check(realParts.has(fs.realpathSync(bundle)), 'unreviewed nested bundle');
  for (const part of expected.filter(p => /\.(app|xpc|framework)$/.test(p.path))) {
    const plistPath = part.path.endsWith('.framework') ? 'Resources/Info.plist' : 'Contents/Info.plist';
    const nestedInfo = readPlist(path.join(app, part.path, plistPath));
    equal(nestedInfo.CFBundleIdentifier, part.id, 'nested plist identity');
    if (part.id === 'org.sparkle-project.Sparkle') equal(nestedInfo.CFBundleShortVersionString, r.sparkle.version, 'packaged Sparkle version');
    if (part.id === `${ROOT_ID}.framework`) equal(nestedInfo.CFBundleShortVersionString, r.chromiumVersion, 'Chromium framework version');
  }
  for (const notice of NOTICES) {
    const stat = fs.statSync(path.join(app, 'Contents/Resources/notices', notice));
    check(stat.isFile() && stat.size > 0, 'missing packaged notice');
  }
  return expected;
}
// Explicit local-only inspection. No signer lookup, profile install, Gatekeeper,
// notarization ticket check, launch or network operation occurs in this mode.
export function verifyLocalApp(app, r, arch) {
  validateRelease(r, {allowLocalQualification:true});
  check(r.localQualification === true && arch === 'arm64', 'local qualification descriptor required');
  check(process.platform === 'darwin', 'macOS verification required');
  check(app.endsWith('.app'), 'local inspection requires an app directory');
  const tree = inspectTree(app), info = readPlist(path.join(app,'Contents/Info.plist'));
  validateAppInfo(info,r,arch,{allowLocalQualification:true});
  const expected = validateLayout(app,r,tree);
  const ids = expected.filter(p=>p.path.endsWith('.app')||p.path.endsWith('.xpc')||p.path.endsWith('.framework')).map(p=>p.id);
  let binaries = 0;
  for (const file of tree.files.filter(macho)) {
    const arches = run('/usr/bin/lipo',['-archs',file]).trim().split(/\s+/);
    check(arches.includes('arm64'),'local native payload lacks Apple Silicon');
    binaries++;
  }
  const framework = path.join(app,`Contents/Frameworks/${PRODUCT} Framework.framework/Versions/${r.chromiumVersion}/${PRODUCT} Framework`);
  check(run('/usr/bin/otool',['-L',framework]).includes('Sparkle.framework/Versions/B/Sparkle'), 'Sparkle native linkage missing');
  const notices = Object.fromEntries(NOTICES.map(name=>[name,sha256(fs.readFileSync(path.join(app,'Contents/Resources/notices',name)))]));
  return {candidate:r.candidates[arch],build:r.build,version:r.version,arch,
    status:'local-layout-and-architecture-verified',localQualification:true,binaries,nestedIds:ids,notices,
    developerId:'NOT RUN',notarization:'NOT RUN',gatekeeper:'NOT RUN (Apple contact prohibited)',acceptance:'NOT RUN'};
}
export function verifyApp(app, r, arch, scratch) {
  validateRelease(r); check(r.arches.includes(arch), 'unselected architecture');
  const tree = inspectTree(app), info = readPlist(path.join(app, 'Contents/Info.plist'));
  validateAppInfo(info, r, arch);
  const embedded = path.join(app, 'Contents/embedded.provisionprofile');
  equal(sha256(fs.readFileSync(embedded)), r.profileSHA256, 'embedded profile digest');
  const profile = profileAt(embedded); validateProfile(profile.data, profile.certificates, r);
  const expected = validateLayout(app, r, tree);
  // Notices presence alone is not license completeness; the candidate's compliance gate audits contents.
  const coveredExecutables = new Set(); let serial = 0;
  function inspect(file, expectedPart) {
    run('/usr/bin/codesign', ['--verify', '--strict', file]);
    const prefix = path.join(scratch, `cert-${serial}`), der = path.join(scratch, `entitlements-${serial++}.der`);
    run('/usr/bin/codesign', ['--display', `--extract-certificates=${prefix}`, file]);
    const cert = new X509Certificate(fs.readFileSync(prefix + '0'));
    check(Date.parse(cert.validTo) > Date.now(), 'signer certificate expired');
    // codesign display writes to stderr; obtain it without logging raw subprocess output.
    const description = signatureDescription(file);
    run('/usr/bin/codesign', ['--display', '--entitlements', der, '--der', file]);
    const listing = fs.existsSync(der) ? run('/usr/bin/openssl', ['asn1parse', '-inform', 'DER', '-in', der]) : '';
    validatePart({...signatureFields(description, cert.raw), entitlements: derEntitlements(listing)}, expectedPart, r);
    const executable = description.match(/^Executable=(.+)$/m)?.[1];
    check(executable, 'signed executable missing'); coveredExecutables.add(fs.realpathSync(executable));
    const archs = run('/usr/bin/lipo', ['-archs', executable]).trim().split(/\s+/);
    check(archs.includes(arch === 'x64' ? 'x86_64' : 'arm64'), 'binary architecture mismatch');
  }
  // One deep pass over the whole app; each part below is then verified and inspected on its own.
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  for (const part of expected) inspect(path.join(app, part.path), part);
  for (const file of tree.files.filter(macho)) {
    if (coveredExecutables.has(fs.realpathSync(file))) continue;
    // Chromium's remaining Libraries are pinned by their source-defined basenames.
    const name = path.basename(file), allowed = ['libaperitif.dylib','libvk_swiftshader.dylib','libvulkan.dylib','libEGL.dylib','libGLESv2.dylib'];
    check(allowed.includes(name) && file.includes(`/${PRODUCT} Framework.framework/Versions/${r.chromiumVersion}/Libraries/`), 'unreviewed native code payload');
    inspect(file, {id: name.replace('.dylib',''), role: 'none', runtime: false});
  }
  run('/usr/bin/xcrun', ['stapler', 'validate', app]);
  return {candidate: r.candidates[arch], build: r.build, arch, status: 'signature-and-layout-verified', gatekeeper: 'NOT RUN (may contact Apple)', acceptance: 'NOT RUN'};
}
export function verifyArtifact(artifact, r, arch) {
  validateRelease(r); check(r.arches.includes(arch), 'unselected architecture');
  check(process.platform === 'darwin', 'macOS verification required');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-verify-')); let mounted = false;
  const mount = path.join(scratch, 'mount');
  try {
    let app = artifact;
    if (artifact.endsWith('.dmg')) {
      const prefix = path.join(scratch, 'dmg-cert');
      run('/usr/bin/codesign', ['--verify', '--strict', artifact]);
      run('/usr/bin/codesign', ['--display', `--extract-certificates=${prefix}`, artifact]);
      validatePart({...signatureFields(signatureDescription(artifact), fs.readFileSync(prefix + '0')), entitlements: {}}, {id: assetName(r,arch).replace(/\.dmg$/, ''), role:'none', runtime:false}, r);
      run('/usr/bin/xcrun', ['stapler', 'validate', artifact]);
      run('/usr/bin/hdiutil', ['verify', artifact]);
      fs.mkdirSync(mount);
      run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, artifact]); mounted = true;
      const apps = fs.readdirSync(mount).filter(n => n.endsWith('.app'));
      equal(apps, [`${PRODUCT}.app`], 'DMG must contain only beta app'); app = path.join(mount, apps[0]);
    } else check(artifact.endsWith('.app'), 'expected .app or .dmg');
    return verifyApp(app, r, arch, scratch);
  } finally {
    // If detach fails, preserve the directory; never recursively remove a live mount.
    if (mounted) run('/usr/bin/hdiutil', ['detach', mount]);
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const local = process.argv[2] === '--local';
    const args = process.argv.slice(local ? 3 : 2);
    check(args.length === 3, 'usage: verify.mjs [--local] RELEASE.json ARCH APP_OR_DMG');
    const descriptor = JSON.parse(fs.readFileSync(args[0]));
    console.log(JSON.stringify((local ? verifyLocalApp : verifyArtifact)(path.resolve(args[2]), descriptor, args[1])));
  } catch (error) { console.error(`Beta artifact verification failed: ${reason(error)}. Nothing signed, launched or published.`); process.exitCode = 1; }
}
