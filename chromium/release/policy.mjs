// Owner-approved beta identity and release policy; no release authorization.
import { isDeepStrictEqual } from 'node:util';
import { createHash, X509Certificate } from 'node:crypto';
export const ROOT_ID = 'me.bnfy.blanc.beta';
export const PRODUCT = 'Blanc Beta';
export const TEAM = 'XYGUCY4498';
export const CERT = '55283A84D3706D5A22386D5F002A0CD4845ECFD4';
export const FEED_ROOT = 'https://blanc.day/updates/chromium-beta/';
export const UPSTREAM = '681cd621e82e606d7536eae8ea2576afb3c7d65c';
export const CHROME_VERSION = '158.0.8127.2';
export const SPARKLE = '2.10.1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// The certificate's standard SHA-1 thumbprint: the identifier Keychain, codesign and the
// pinned identity all use. An identifier for matching the pin, not a security digest.
export const fingerprint = der => new X509Certificate(der).fingerprint.replaceAll(':', '');
// Every policy failure is a ReleaseCheckError whose message is fixed text plus, at most, a
// public name (a GN key, a gate). Messages never carry paths, argv, output or compared values,
// so the command-line tools can print them.
export class ReleaseCheckError extends Error {}
export const check = (condition, message) => { if (!condition) throw new ReleaseCheckError(message); };
export const equal = (actual, expected, message) => check(isDeepStrictEqual(actual, expected), message);
export const reason = error => error instanceof ReleaseCheckError ? error.message : 'unexpected error (details withheld)';
// GN arguments beyond the required ones, each added here only after review.
export const GN_REVIEWED_EXTRA = ['blanc_beta_version', 'blanc_beta_build', 'blanc_sparkle_stage', 'blanc_sparkle_public_key', 'blanc_sparkle_archive_sha256', 'blanc_beta_local_qualification', 'chrome_pgo_phase', 'symbol_level', 'mac_deployment_target', 'mac_min_system_version'];
export function base64(value, bytes) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    Buffer.from(value, 'base64').length === bytes && Buffer.from(value, 'base64').toString('base64') === value;
}
export function validateRelease(r, {allowLocalQualification = false} = {}) {
  check(r?.localQualification !== true || allowLocalQualification, 'local qualification is not a distributable release');
  check(r?.schema === 1, 'release schema must be 1');
  equal(r.bundleId, ROOT_ID, 'beta identity must not be the shipping identity');
  equal(r.product, PRODUCT, 'beta product');
  equal(r.userDataDir, PRODUCT, 'beta user-data folder');
  equal(r.launchScheme, 'blanc-beta', 'isolated beta launch scheme');
  equal(r.keychainGroup, `${TEAM}.${ROOT_ID}.webauthn`, 'isolated keychain group');
  equal(r.certificateSHA1, CERT, 'reviewed certificate fingerprint');
  equal(r.teamId, TEAM, 'Developer ID team');
  equal(r.upstream, UPSTREAM, 'reviewed upstream revision');
  equal(r.chromiumVersion, CHROME_VERSION, 'chrome/VERSION stays upstream');
  check(/^2\.0\.0-beta\.[1-9]\d*$/.test(r.version), 'version must be 2.0.0-beta.N');
  equal(r.tag, `chromium-beta-${r.version}`, 'tag must be outside stable semver tags');
  // Owner decision (2026-11-10): the app and the update feed both show the full beta version.
  equal(r.shortVersion, r.version, 'CFBundleShortVersionString must be the beta version shown in the feed');
  check(Number.isInteger(r.build) && r.build > 0 && r.build <= 9999, 'build must be integer 1..9999');
  check(Number.isInteger(r.previousBuild) && r.previousBuild >= 0 && r.build > r.previousBuild, 'build must increase');
  check(r.prerelease === true && r.makeLatest === false, 'GitHub pre-release and latest=false required');
  check(/^[a-f0-9]{40}$/.test(r.sourceCommit), 'source commit required');
  check(/^[a-f0-9]{64}$/.test(r.inputDigest), 'input digest required');
  check(Array.isArray(r.arches) && r.arches.length > 0 && r.arches.length === new Set(r.arches).size && r.arches.every(a => ['arm64', 'x64'].includes(a)), 'architecture set');
  check(r.arches.length === 2 || (typeof r.archWaiver === 'string' && r.archWaiver.trim().length >= 20), 'both architectures or recorded owner waiver required');
  // The owner's Intel waiver (2026-11-10) covers the first beta: beta.1 is the private
  // local-qualification build, and the first public beta is beta.2 (owner, 2026-11-13).
  if (['2.0.0-beta.1', '2.0.0-beta.2'].includes(r.version)) equal(r.arches, ['arm64'], 'the first beta is Apple Silicon only under the owner Intel waiver');
  equal(Object.keys(r.candidates).sort(), [...r.arches].sort(), 'candidate for every architecture');
  for (const arch of r.arches) {
    check(/^macos-[a-f0-9]{16}$/.test(r.candidates[arch]), 'candidate id');
    check(/^[a-f0-9]{64}$/.test(r.gnArgsSHA256?.[arch]), 'reviewed GN args digest per architecture');
  }
  equal(r.sparkle.version, SPARKLE, 'reviewed Sparkle version');
  check(base64(r.sparkle.publicKey, 32), '32-byte Sparkle Ed25519 public key required');
  check(/^[a-f0-9]{64}$/.test(r.sparkle.archiveSHA256), 'Sparkle distribution digest required');
  check(/^\d+\.\d+(?:\.\d+)?$/.test(r.minimumSystemVersion), 'minimum macOS version required');
  equal(r.minimumSystemVersion, '13.0', 'approved minimum macOS 13');
  check(/^[a-f0-9]{64}$/.test(r.profileSHA256), 'profile digest required');
  return r;
}
export function validateGN(text, arch, {allowLocalQualification = false} = {}) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, '').trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*(true|false|\d+|"[^"\r\n]*")$/);
    check(match && !Object.hasOwn(values, match[1]), 'GN input must use unique literal assignments; review expressions separately');
    values[match[1]] = JSON.parse(match[2]);
  }
  const required = {target_os:'mac', target_cpu:arch, is_official_build:true, is_debug:false, is_component_build:false, is_chrome_branded:false, blanc_channel:'beta', enable_widevine:false, bundle_widevine_cdm:false, enable_updater:false};
  for (const [key, value] of Object.entries(required)) equal(values[key], value, `official beta GN ${key}`);
  // Fail closed on anything else (sanitizers, dcheck_always_on, ...) until it is reviewed.
  const unreviewed = Object.keys(values).filter(key => !Object.hasOwn(required, key) && !GN_REVIEWED_EXTRA.includes(key));
  check(unreviewed.length === 0, `unreviewed GN argument: ${unreviewed[0]}`);
  check(/^2\.0\.0-beta\.[1-9]\d*$/.test(values.blanc_beta_version), 'explicit beta version GN argument');
  check(Number.isInteger(values.blanc_beta_build) && values.blanc_beta_build > 0 && values.blanc_beta_build <= 9999, 'explicit beta build GN argument');
  check(typeof values.blanc_sparkle_stage === 'string' && values.blanc_sparkle_stage.startsWith('/'), 'absolute immutable Sparkle stage required');
  check(base64(values.blanc_sparkle_public_key, 32), 'Sparkle GN public key required');
  check(/^[a-f0-9]{64}$/.test(values.blanc_sparkle_archive_sha256), 'Sparkle GN archive digest required');
  for (const [key, expected] of Object.entries({chrome_pgo_phase:0, symbol_level:0,
    mac_deployment_target:'13.0', mac_min_system_version:'13.0'}))
    if (Object.hasOwn(values,key)) equal(values[key],expected,`reviewed GN fallback ${key}`);
  if (Object.hasOwn(values,'blanc_beta_local_qualification')) {
    check(typeof values.blanc_beta_local_qualification === 'boolean', 'qualification GN must be boolean');
    check(!values.blanc_beta_local_qualification || (allowLocalQualification && arch === 'arm64'), 'local qualification GN is not distributable');
  }
  return values;
}
// chromium/release/ledger.json lists every beta build number already consumed, public or
// private. The next build must exceed them all, and previousBuild is read from it, not trusted.
export function validateLedger(ledger, r) {
  check(ledger?.schema === 1 && Array.isArray(ledger.builds), 'beta build ledger schema');
  let highest = 0;
  for (const entry of ledger.builds) {
    check(Number.isInteger(entry?.build) && entry.build > highest, 'ledger builds must be strictly increasing integers');
    check(typeof entry.version === 'string' && entry.version.length > 0, 'ledger entry version');
    check(entry.version !== r.version && entry.tag !== r.tag, 'version or tag already consumed in the ledger');
    highest = entry.build;
  }
  equal(r.previousBuild, highest, 'previousBuild must equal the highest build in the ledger');
  check(r.build > highest, 'build must exceed every build in the ledger');
}
export function validateProfile(p, certificates, r, now = Date.now()) {
  check(p.ProvisionsAllDevices === true && !('ProvisionedDevices' in p), 'all-devices Developer ID profile required');
  check(Array.isArray(p.Platform) && p.Platform.includes('OSX'), 'macOS profile required');
  check(Date.parse(p.ExpirationDate) > now, 'profile expired or invalid expiry');
  equal(p.TeamIdentifier, [TEAM], 'profile team');
  equal(p.Entitlements?.['com.apple.application-identifier'], `${TEAM}.${ROOT_ID}`, 'profile app identifier');
  equal(p.Entitlements?.['com.apple.developer.team-identifier'], TEAM, 'profile entitlement team');
  check(p.Entitlements?.['get-task-allow'] !== true && p.Entitlements?.['com.apple.security.get-task-allow'] !== true, 'development profile refused');
  // Apple issues Developer ID profiles with the team wildcard (TEAM.*), never the
  // exact WebAuthn group. The profile must cover the beta group and name no other
  // team; the exact group is enforced on the signed app's entitlements (verify.mjs).
  const groups = p.Entitlements?.['keychain-access-groups'];
  check(Array.isArray(groups) && groups.length > 0 && groups.every(g => g === r.keychainGroup || g === `${TEAM}.*`), 'profile must authorize the beta keychain group within the beta team only');
  check(certificates.some(c => c.fingerprint === r.certificateSHA1 && Date.parse(c.validTo) > now && Date.parse(c.validFrom) <= now && c.subject.includes('Developer ID Application:') && c.subject.includes(`OU=${TEAM}`)), 'profile lacks valid pinned Developer ID certificate');
}
export function validateIdentityList(text, r) {
  const matches = [...text.matchAll(/^\s*\d+\) ([A-F0-9]{40}) "([^"]+)"$/gm)].filter(m => m[1] === r.certificateSHA1);
  check(matches.length === 1 && matches[0][2].startsWith('Developer ID Application:') && matches[0][2].endsWith(`(${TEAM})`), 'exact usable Developer ID identity required');
}
export function assetName(r, arch) { return `Blanc-Beta-${r.version}-mac-${arch}.dmg`; }
export function feedURL(arch) { check(['arm64', 'x64'].includes(arch), 'feed architecture'); return `${FEED_ROOT}${arch}.xml`; }
export function assetURL(r, arch) { return `https://github.com/bnfy/blanc/releases/download/${r.tag}/${assetName(r, arch)}`; }
export function payloadNames(r) {
  return [...r.arches.flatMap(a => [assetName(r, a), `appcast-${a}.xml`]), 'release.json', 'acceptance.json', 'Blanc-Beta.cdx.json', 'NOTICES.txt'].sort();
}
