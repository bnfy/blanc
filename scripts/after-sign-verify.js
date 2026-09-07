// electron-builder afterSign hook: verifies the certificate that ACTUALLY
// signed Blanc.app is embedded in the app's provisioning profile, that the
// profile shipped in the bundle is byte-identical to the repo's, and that the
// signature carries the WebAuthn keychain-access-groups entitlement. This is
// the ground-truth counterpart to scripts/preflight-mac-signing.mjs (which
// predicts the identity before building): whatever identity electron-builder
// ended up selecting, a mismatch throws here and aborts the build before any
// dmg/zip artifact exists — nothing AMFI would kill can reach a release.
const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options });

const sha1Fingerprint = (der) => {
  const info = run('openssl', ['x509', '-inform', 'der', '-noout', '-fingerprint', '-sha1'], { input: der });
  return (info.match(/Fingerprint=([0-9A-F:]+)/i)?.[1] ?? '').replaceAll(':', '').toUpperCase();
};

const regexEscape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isUtf8 = (line, value) => new RegExp(
  `prim: UTF8STRING\\s+:${regexEscape(value)}\\s*$`
).test(line ?? '');
const depthOf = (line) => Number(line?.match(/\bd=(\d+)\b/)?.[1] ?? -1);

const derBooleanTrueFromLines = (lines, key) => {
  const keyIndex = lines.findIndex((line) => depthOf(line) === 3 && isUtf8(line, key));
  return keyIndex >= 0 && /prim: BOOLEAN\s+:255\s*$/.test(lines[keyIndex + 1] ?? '');
};

const derArrayContainsFromLines = (lines, key, value) => {
  const keyIndex = lines.findIndex((line) => depthOf(line) === 3 && isUtf8(line, key));
  if (keyIndex < 0) return false;
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const depth = depthOf(lines[index]);
    if (depth <= 2) return false;
    if (depth > 3 && isUtf8(lines[index], value)) return true;
  }
  return false;
};

module.exports = async function afterSignVerify(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const profileRel = pkg.build?.mac?.provisioningProfile;
  if (!profileRel) return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const fail = (message) => {
    throw new Error(`after-sign-verify: ${appPath}: ${message}`);
  };

  // The profile inside the bundle is what end-user Macs will validate — it
  // must be exactly the audited file from the repo.
  const embeddedPath = path.join(appPath, 'Contents', 'embedded.provisionprofile');
  let embedded;
  try {
    embedded = readFileSync(embeddedPath);
  } catch {
    fail('no Contents/embedded.provisionprofile in the signed app.');
  }
  if (!embedded.equals(readFileSync(path.join(root, profileRel)))) {
    fail(`the embedded provisioning profile differs from ${profileRel}.`);
  }

  const plist = run('security', ['cms', '-D', '-i', embeddedPath]);
  const certsKey = plist.indexOf('<key>DeveloperCertificates</key>');
  const certsXml = plist.slice(certsKey, plist.indexOf('</array>', certsKey));
  const profileFingerprints = [...certsXml.matchAll(/<data>([\s\S]*?)<\/data>/g)]
    .map((match) => sha1Fingerprint(Buffer.from(match[1].replace(/\s+/g, ''), 'base64')));

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'blanc-sign-verify-'));
  try {
    // Certificate/entitlement inspection alone does not prove that the
    // signature still seals the executable and bundle resources. Fail here,
    // before notarization or artifact creation, if AMFI would reject the app.
    try {
      run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath]);
    } catch (error) {
      const detail = String(error?.stderr || error?.message || error).trim();
      fail(`codesign verification failed${detail ? `: ${detail}` : '.'}`);
    }

    // codesign writes the chain as <prefix>0 (leaf), <prefix>1, ... — the
    // leaf is the certificate the app was signed with.
    run('codesign', ['--display', `--extract-certificates=${path.join(tmp, 'cert')}`, appPath]);
    const signer = sha1Fingerprint(readFileSync(path.join(tmp, 'cert0')));
    if (!profileFingerprints.includes(signer)) {
      fail([
        `signed by ${signer.slice(0, 8)}…, which the embedded profile does not authorize`,
        `(profile embeds: ${profileFingerprints.map((f) => `${f.slice(0, 8)}…`).join(', ')}).`,
        'AMFI would kill this build at spawn on every Mac. Regenerate the profile',
        'against the signing certificate.',
      ].join(' '));
    }

    // Modern macOS enforces the DER entitlement slot. Its legacy XML display
    // can warn or disappear even while the DER slot is valid, so query the
    // exact Mach-O representation AMFI consumes and require typed values.
    const derListings = new Map();
    let derSerial = 0;
    const derEntitlementsFor = (bundlePath) => {
      if (derListings.has(bundlePath)) return derListings.get(bundlePath);
      const outputPath = path.join(tmp, `entitlements-${derSerial++}.der`);
      run('codesign', [
        '--display',
        '--entitlements', outputPath,
        '--der',
        bundlePath,
      ]);
      const result = existsSync(outputPath)
        ? run('openssl', ['asn1parse', '-inform', 'DER', '-in', outputPath])
          .split(/\r?\n/).filter(Boolean)
        : [];
      derListings.set(bundlePath, result);
      return result;
    };
    const derBooleanTrue = (bundlePath, key) =>
      derBooleanTrueFromLines(derEntitlementsFor(bundlePath), key);
    const derArrayContains = (bundlePath, key, value) =>
      derArrayContainsFromLines(derEntitlementsFor(bundlePath), key, value);

    const { WEBAUTHN_KEYCHAIN_ACCESS_GROUP } = require(path.join(root, 'src/main/webauthn.js'));
    const grantsGroup = derArrayContains(
      appPath,
      'keychain-access-groups',
      WEBAUTHN_KEYCHAIN_ACCESS_GROUP
    );
    if (!grantsGroup) {
      fail(`the signature does not carry the ${WEBAUTHN_KEYCHAIN_ACCESS_GROUP} keychain-access-groups entitlement.`);
    }

    // The 1Password SDK dlopens a native bridge owned and signed by the
    // separately installed 1Password app. Electron's dedicated Plugin helper
    // is the only Blanc process allowed to do that. A broad entitlement would
    // turn a narrowly isolated integration into a process-wide weakening.
    const helpersDir = path.join(appPath, 'Contents', 'Frameworks');
    const pluginHelper = path.join(helpersDir, 'Blanc Helper (Plugin).app');
    const ordinaryHelpers = [
      appPath,
      path.join(helpersDir, 'Blanc Helper.app'),
      path.join(helpersDir, 'Blanc Helper (GPU).app'),
      path.join(helpersDir, 'Blanc Helper (Renderer).app'),
    ];
    for (const required of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation',
      'com.apple.security.cs.allow-unsigned-executable-memory',
    ]) {
      if (!derBooleanTrue(pluginHelper, required)) {
        fail(`the Plugin helper is missing ${required}.`);
      }
    }
    for (const bundlePath of ordinaryHelpers) {
      if (derBooleanTrue(
        bundlePath,
        'com.apple.security.cs.disable-library-validation'
      )) {
        fail(`${path.basename(bundlePath)} unexpectedly disables library validation.`);
      }
      for (const capability of [
        'com.apple.security.device.audio-input',
        'com.apple.security.device.camera',
      ]) {
        if (!derBooleanTrue(bundlePath, capability)) {
          fail(`${path.basename(bundlePath)} is missing ${capability}.`);
        }
      }
    }

    console.log(`after-sign-verify: ok — signed by ${signer.slice(0, 8)}…, profile embedded and authorizing, DER WebAuthn and ordinary-helper media entitlements present, Plugin JIT/runtime entitlements present, and Plugin is the sole library-validation exception.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

module.exports.derBooleanTrueFromLines = derBooleanTrueFromLines;
module.exports.derArrayContainsFromLines = derArrayContainsFromLines;
