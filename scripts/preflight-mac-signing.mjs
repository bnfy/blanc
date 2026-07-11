#!/usr/bin/env node
// Fails a macOS build early when build/embedded.provisionprofile can't
// authorize the signing identity electron-builder will pick from the
// keychain. keychain-access-groups (Touch ID passkeys) is a restricted
// entitlement: it is only honored when the embedded profile lists the exact
// certificate the app is signed with, and a mismatch surfaces only after a
// full build — as AMFI SIGKILLing the packaged app at spawn. Wired as npm's
// `predist`/`predist:dir` and called by scripts/release.sh; no-ops off macOS
// and when no profile is configured.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

if (process.platform !== 'darwin') process.exit(0);

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const profileRel = pkg.build?.mac?.provisioningProfile;
if (!profileRel) process.exit(0);

if (process.env.CSC_LINK) {
  console.log('preflight-mac-signing: CSC_LINK is set — the keychain is not the identity source, skipping.');
  process.exit(0);
}

function fail(message) {
  console.error(`preflight-mac-signing: ${message}`);
  process.exit(1);
}

const profilePath = path.join(root, profileRel);
if (!existsSync(profilePath)) fail(`configured provisioning profile is missing: ${profileRel}`);

const run = (cmd, args, input) => execFileSync(cmd, args, { input, encoding: 'utf8' });

let plist;
try {
  plist = run('security', ['cms', '-D', '-i', profilePath]);
} catch (error) {
  fail(`could not decode ${profileRel}: ${error.message}`);
}

const certsKey = plist.indexOf('<key>DeveloperCertificates</key>');
if (certsKey === -1) fail(`${profileRel} embeds no DeveloperCertificates`);
const certsXml = plist.slice(certsKey, plist.indexOf('</array>', certsKey));
const profileCerts = [...certsXml.matchAll(/<data>([\s\S]*?)<\/data>/g)].map((match) => {
  const der = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  const info = run('openssl', ['x509', '-inform', 'der', '-noout', '-fingerprint', '-sha1', '-subject'], der);
  return {
    fingerprint: (info.match(/Fingerprint=([0-9A-F:]+)/i)?.[1] ?? '').replaceAll(':', '').toUpperCase(),
    subject: info.match(/CN\s*=\s*([^,\n]+)/)?.[1] ?? '(unknown subject)',
  };
});
if (!profileCerts.length) fail(`${profileRel} embeds no DeveloperCertificates`);

const identityList = run('security', ['find-identity', '-v', '-p', 'codesigning']);
const identities = [...identityList.matchAll(/^\s*\d+\) ([0-9A-F]{40}) "(.+)"$/gm)]
  .map(([, fingerprint, label]) => ({ fingerprint, label }));

const matched = profileCerts.find((cert) =>
  identities.some((identity) => identity.fingerprint === cert.fingerprint));
if (matched) {
  console.log(`preflight-mac-signing: ok — ${profileRel} authorizes "${matched.subject}" (${matched.fingerprint.slice(0, 8)}…).`);
  process.exit(0);
}

fail([
  `${profileRel} does not embed any certificate matching a usable signing identity,`,
  'so the packaged app\'s restricted keychain-access-groups entitlement would be',
  'unauthorized and AMFI would kill it at spawn.',
  '',
  `  profile embeds:    ${profileCerts.map((c) => `${c.fingerprint.slice(0, 8)}… (${c.subject})`).join(', ') || '(none)'}`,
  `  keychain offers:   ${identities.map((i) => `${i.fingerprint.slice(0, 8)}… (${i.label})`).join(', ') || '(none)'}`,
  '',
  'Regenerate the profile on the Apple Developer portal against an installed',
  'certificate (or import the profile\'s cert + private key into the keychain).',
].join('\n'));
