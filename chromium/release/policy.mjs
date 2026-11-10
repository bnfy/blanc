// Phase-one policy. These are proposed beta defaults, not a release authorization.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const ROOT_ID = 'me.bnfy.blanc.beta';
export const PRODUCT = 'Blanc Beta';
export const TEAM = 'XYGUCY4498';
export const CERT = '55283A84D3706D5A22386D5F002A0CD4845ECFD4';
export const FEED_ROOT = 'https://blanc.day/updates/chromium-beta/';
export const UPSTREAM = '681cd621e82e606d7536eae8ea2576afb3c7d65c';
export const CHROME_VERSION = '158.0.8127.2';
export const SPARKLE = '2.8.0';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fingerprint = bytes => createHash('sha1').update(bytes).digest('hex').toUpperCase();
export const check = (condition, message) => { if (!condition) throw new Error(message); };
export const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);
export function base64(value, bytes) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
    Buffer.from(value, 'base64').length === bytes && Buffer.from(value, 'base64').toString('base64') === value;
}
export function validateRelease(r) {
  check(r?.schema === 1, 'release schema must be 1');
  equal(r.bundleId, ROOT_ID, 'beta identity must not be the shipping identity');
  equal(r.product, PRODUCT, 'beta product');
  equal(r.userDataDir, PRODUCT, 'beta user-data folder');
  equal(r.keychainGroup, `${TEAM}.${ROOT_ID}.webauthn`, 'isolated keychain group');
  equal(r.certificateSHA1, CERT, 'reviewed certificate fingerprint');
  equal(r.teamId, TEAM, 'Developer ID team');
  equal(r.upstream, UPSTREAM, 'reviewed upstream revision');
  equal(r.chromiumVersion, CHROME_VERSION, 'chrome/VERSION stays upstream');
  check(/^1\.0\.0-beta\.[1-9]\d*$/.test(r.version), 'version must be 1.0.0-beta.N');
  equal(r.tag, `chromium-beta-${r.version}`, 'tag must be outside stable semver tags');
  equal(r.shortVersion, '1.0.0', 'CFBundleShortVersionString');
  check(Number.isInteger(r.build) && r.build > 0 && r.build <= 9999, 'build must be integer 1..9999');
  check(Number.isInteger(r.previousBuild) && r.previousBuild >= 0 && r.build > r.previousBuild, 'build must increase');
  check(r.prerelease === true && r.makeLatest === false, 'GitHub pre-release and latest=false required');
  check(/^[a-f0-9]{40}$/.test(r.sourceCommit), 'source commit required');
  check(/^[a-f0-9]{64}$/.test(r.inputDigest), 'input digest required');
  check(Array.isArray(r.arches) && r.arches.length > 0 && r.arches.length === new Set(r.arches).size && r.arches.every(a => ['arm64', 'x64'].includes(a)), 'architecture set');
  check(r.arches.length === 2 || (typeof r.archWaiver === 'string' && r.archWaiver.trim().length >= 20), 'both architectures or recorded owner waiver required');
  equal(Object.keys(r.candidates).sort(), [...r.arches].sort(), 'candidate for every architecture');
  for (const arch of r.arches) {
    check(/^macos-[a-f0-9]{16}$/.test(r.candidates[arch]), 'candidate id');
    check(/^[a-f0-9]{64}$/.test(r.gnArgsSHA256?.[arch]), 'reviewed GN args digest per architecture');
  }
  equal(r.sparkle.version, SPARKLE, 'reviewed Sparkle version');
  check(base64(r.sparkle.publicKey, 32), '32-byte Sparkle Ed25519 public key required');
  check(/^[a-f0-9]{64}$/.test(r.sparkle.archiveSHA256), 'Sparkle distribution digest required');
  check(/^\d+\.\d+(?:\.\d+)?$/.test(r.minimumSystemVersion), 'minimum macOS version required');
  check(Number(r.minimumSystemVersion.split('.')[0]) >= 13, 'pinned Chromium requires macOS 13 or newer');
  check(/^[a-f0-9]{64}$/.test(r.profileSHA256), 'profile digest required');
  return r;
}
export function validateGN(text, arch) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, '').trim();
    if (!cleaned) continue;
    const match = cleaned.match(/^([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*(true|false|\d+|"[^"\r\n]*")$/);
    check(match && !Object.hasOwn(values, match[1]), 'GN input must use unique literal assignments; review expressions separately');
    values[match[1]] = JSON.parse(match[2]);
  }
  for (const [key, value] of Object.entries({target_os:'mac', target_cpu:arch, is_official_build:true, is_debug:false, is_component_build:false, is_chrome_branded:false, blanc_channel:'beta', enable_widevine:false, bundle_widevine_cdm:false, enable_updater:false})) equal(values[key], value, `official beta GN ${key}`);
  return values;
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
