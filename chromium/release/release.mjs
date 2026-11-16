#!/usr/bin/env node
// The Blanc Beta release, as ordered stages run one at a time by the owner in a
// foreground Terminal (docs/chromium-beta-release.md §10). Each stage checks the
// one before it and records what it made in WORK/state.json, so a run can stop
// and resume without redoing or racing anything. The irreversible stages (the
// tag and draft, publication) ask for a typed confirmation first, and once a tag
// or draft exists nothing before it can run again: fix forward with a new build.
//
//   node chromium/release/release.mjs status WORK
//   node chromium/release/release.mjs <stage> WORK
//
// WORK is a private, owner-only folder outside Git holding release.json,
// local-inputs.json (preflight's format plus "unsigned": {arch: app} and
// "sparkle": the extracted pinned Sparkle folder) and, before the manifest
// stage, payloads/ (acceptance.json, Blanc-Beta.cdx.json, NOTICES.txt,
// release-notes.md) and evidence/<arch>/<gate>.evidence. Nothing here prints
// command arguments, environment or raw output: failures are fixed messages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CERT, ROOT_ID, base64, check, equal, reason, sha256, validateRelease, assetName, payloadNames} from './policy.mjs';
import {preflight, ROOT} from './preflight.mjs';
import {signApp, submitNotary} from './operator.mjs';
import {verifyArtifact} from './verify.mjs';
import {generateAppcast, validateAppcast} from './appcast.mjs';
import {makeManifest, readPayloads, verifyManifest, verifyEvidenceFiles} from './manifest.mjs';

export const REPO = 'bnfy/blanc';
// Pinned independently of any bundle (docs/release-verification.md).
export const COSIGN_IDENTITY = 'anthony@bnfy.me';
export const COSIGN_ISSUER = 'https://github.com/login/oauth';
export const COSIGN_REDIRECT = 'http://127.0.0.1:49197/auth/callback';
export const STAGES = ['preflight', 'sign', 'notarize-app', 'dmg', 'notarize-dmg', 'sparkle', 'manifest',
  'draft', 'sigstore', 'publish', 'verify-public'];
// From here on the release exists outside this Mac; earlier stages never run again.
const POINT_OF_NO_RETURN = STAGES.indexOf('draft');
const EXTRA_PAYLOADS = ['acceptance.json', 'Blanc-Beta.cdx.json', 'NOTICES.txt'];

// The real world: commands with captured output, and the owner at the keyboard.
// Left by scripts/sparkle-key-make.command until the update key has a
// verified 1Password copy (sparkle-key-backup.command): nothing is drafted
// or published while the key exists only in one Mac's Keychain.
export const KEY_BACKUP_PENDING = path.join(os.homedir(), 'Projects/Blanc/records/sparkle-production/BACKUP-PENDING');
const keyBackedUp = io => check(!(io.keyBackupPending ?? (() => fs.existsSync(KEY_BACKUP_PENDING)))(),
  'the update key is not yet backed up to 1Password (run sparkle-key-backup.command)');
export function realIO() {
  return {
    // interactive: the command gets this Terminal (stdio inherited), for a sign-in it must
    // show; its output is then not captured.
    exec(command, args, {input, env, cwd, interactive = false} = {}) {
      const result = interactive
        ? spawnSync(command, args, {cwd, env: env ?? process.env, stdio: 'inherit'})
        : spawnSync(command, args, {input, cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
      return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
    },
    async confirm(phrase) {
      check(process.stdin.isTTY, 'a foreground Terminal is required to confirm');
      const rl = readline.createInterface({input: process.stdin, output: process.stdout});
      try { return (await rl.question(`Type exactly "${phrase}" to continue: `)).trim() === phrase; } finally { rl.close(); }
    },
    env: process.env,
  };
}
// The update key normally stays in the login Keychain (sign_update --account). Over SSH,
// where Keychain can't ask (owner, 2026-11-14: the beta runs from the MacBook Pro), the
// owner's wrapper sends the 1Password copy, the seed generate_keys -x exports, as SSH
// environment, because every stage needs a real terminal for stdin. It leaves this
// process's environment as the module loads, so no command run here inherits it, and
// reaches sign_update only on stdin, never argv or a file. validateAppcast still checks
// every signature against the pinned public key.
const SPARKLE_KEY = process.env.BLANC_SPARKLE_KEY;
delete process.env.BLANC_SPARKLE_KEY;
export const takeSparkleKey = () => SPARKLE_KEY;
export function sparkleSigning(dmg, key) {
  if (key === undefined) return {args: ['--account', ROOT_ID, '-p', dmg]};
  const seed = String(key).trim();
  check(base64(seed, 32) || base64(seed, 64), 'the update key from the environment is not a Sparkle private key');
  return {args: ['--ed-key-file', '-', '-p', dmg], input: `${seed}\n`};
}
const must = (io, command, args, message, options) => {
  const result = io.exec(command, args, options);
  check(result.status === 0, message);
  return result.stdout;
};

export function load(work) {
  check(path.isAbsolute(work) && fs.statSync(work).isDirectory(), 'absolute release work folder required');
  check(!path.resolve(work).startsWith(path.resolve(ROOT) + path.sep), 'release work folder must be outside the repository');
  check((fs.statSync(work).mode & 0o077) === 0, 'release work folder must be owner-only (chmod 700)');
  const releaseBytes = fs.readFileSync(path.join(work, 'release.json'));
  const r = validateRelease(JSON.parse(releaseBytes));
  const inputs = JSON.parse(fs.readFileSync(path.join(work, 'local-inputs.json')));
  const stateFile = path.join(work, 'state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {schema: 1, release: sha256(releaseBytes), done: {}};
  equal(state.release, sha256(releaseBytes), 'release.json changed after the run began; start a new build');
  return {work, r, inputs, state, save: () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', {mode: 0o600})};
}
export function nextStage(state) { return STAGES.find(stage => !state.done[stage]) ?? null; }
// A stage runs only in order, and only once after the point of no return.
export function admit(state, stage) {
  const index = STAGES.indexOf(stage);
  check(index >= 0, 'unknown stage');
  for (const before of STAGES.slice(0, index)) check(state.done[before], `run ${before} first`);
  const published = STAGES.slice(POINT_OF_NO_RETURN).some(s => state.done[s]);
  check(!state.done[stage] || (!published && index < POINT_OF_NO_RETURN),
    'this stage already ran and the release exists outside this Mac; never rerun it, fix forward with a new build');
  check(!(published && index < POINT_OF_NO_RETURN), 'the tag or draft exists; earlier stages cannot run again');
}
const paths = (ctx, arch) => {
  const dir = path.join(ctx.work, 'signed', arch);
  return {dir, app: path.join(dir, 'Blanc Beta.app'), zip: path.join(dir, 'Blanc-Beta-notary.zip'),
    root: path.join(dir, 'dmg-root'), dmg: path.join(dir, assetName(ctx.r, arch)), signature: path.join(dir, 'ed-signature.txt')};
};
const assets = ctx => path.join(ctx.work, 'assets');
const notaryEnv = io => {
  check(io.env.APPLE_ID && io.env.APPLE_APP_SPECIFIC_PASSWORD && io.env.APPLE_TEAM_ID,
    'run this stage inside op run --env-file=.env.1password --no-masking');
  return io.env;
};
const staple = (io, file) => {
  must(io, '/usr/bin/xcrun', ['stapler', 'staple', file], 'stapling failed');
  must(io, '/usr/bin/xcrun', ['stapler', 'validate', file], 'stapled ticket did not validate');
};

// GitHub and Git must answer that the tag and every release (drafts included)
// are absent. An error, an auth failure or a timeout is not absence.
export function confirmAbsent(io, r) {
  const local = io.exec('/usr/bin/git', ['-C', ROOT, 'rev-parse', '-q', '--verify', `refs/tags/${r.tag}`]);
  check(local.status === 1 && !local.stdout.trim(), 'the tag exists locally or Git did not answer');
  const remote = io.exec('/usr/bin/git', ['-C', ROOT, 'ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${r.tag}`]);
  check(remote.status === 2, 'the tag exists on GitHub or GitHub did not answer');
  const releases = io.exec('gh', ['api', '--paginate', `repos/${REPO}/releases`, '--jq', '.[].tag_name']);
  check(releases.status === 0, 'GitHub did not list releases; absence is not established');
  check(!releases.stdout.split('\n').map(s => s.trim()).includes(r.tag), 'a release or draft with this tag exists');
}
function sameBytes(dir, other, names) {
  for (const name of names) equal(sha256(fs.readFileSync(path.join(other, name))), sha256(fs.readFileSync(path.join(dir, name))), `downloaded ${name} differs from the approved bytes`);
}
const scratch = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export const RUN = {
  async preflight(ctx) {
    const result = preflight(ctx.r, {inputs: ctx.inputs});
    for (const arch of ctx.r.arches) check(path.isAbsolute(ctx.inputs.unsigned?.[arch] ?? ''), `absolute unsigned app for ${arch} required`);
    check(fs.existsSync(path.join(ctx.inputs.sparkle ?? '', 'bin/sign_update')), 'extracted pinned Sparkle folder with bin/sign_update required');
    return {inputDigest: result.inputDigest};
  },
  async sign(ctx) {
    const out = {};
    for (const arch of ctx.r.arches) {
      const p = paths(ctx, arch);
      signApp(ctx.inputs.unsigned[arch], ctx.r, arch, p.app, ctx.inputs.profile);
      out[arch] = 'signed';
    }
    return out;
  },
  async 'notarize-app'(ctx, io) {
    const env = notaryEnv(io), out = {};
    for (const arch of ctx.r.arches) {
      const p = paths(ctx, arch);
      check(!fs.existsSync(p.zip), 'a notarization archive already exists; inspect it privately');
      must(io, '/usr/bin/ditto', ['-c', '-k', '--keepParent', p.app, p.zip], 'could not pack the app for notarization');
      out[arch] = submitNotary(p.zip, env, (c, a, o) => io.exec(c, a, {...o, env})).id;
      staple(io, p.app);
    }
    return out;
  },
  async dmg(ctx, io) {
    const out = {};
    for (const arch of ctx.r.arches) {
      const p = paths(ctx, arch);
      check(!fs.existsSync(p.dmg) && !fs.existsSync(p.root), 'a DMG or its folder already exists');
      fs.mkdirSync(p.root);
      must(io, '/usr/bin/ditto', [p.app, path.join(p.root, 'Blanc Beta.app')], 'could not copy the stapled app');
      fs.symlinkSync('/Applications', path.join(p.root, 'Applications'));
      must(io, '/usr/bin/hdiutil', ['create', '-fs', 'HFS+', '-format', 'UDZO', '-volname', 'Blanc Beta', '-srcfolder', p.root, p.dmg], 'could not make the DMG');
      must(io, '/usr/bin/codesign', ['--force', '--sign', CERT, '--timestamp', '--identifier', assetName(ctx.r, arch).replace(/\.dmg$/, ''), p.dmg], 'could not sign the DMG');
      must(io, '/usr/bin/codesign', ['--verify', '--strict', p.dmg], 'the DMG signature did not verify');
      out[arch] = 'signed';
    }
    return out;
  },
  async 'notarize-dmg'(ctx, io) {
    const env = notaryEnv(io), out = {};
    for (const arch of ctx.r.arches) {
      const p = paths(ctx, arch);
      const id = submitNotary(p.dmg, env, (c, a, o) => io.exec(c, a, {...o, env})).id;
      staple(io, p.dmg);
      (io.verifyArtifact ?? verifyArtifact)(p.dmg, ctx.r, arch);
      must(io, '/usr/sbin/spctl', ['--assess', '--type', 'execute', p.app], 'Gatekeeper refused the app');
      // The bytes signed and published from here on; never change them again.
      out[arch] = {notarization: id, dmgSHA256: sha256(fs.readFileSync(p.dmg))};
    }
    return out;
  },
  async sparkle(ctx, io) {
    const out = {};
    fs.mkdirSync(assets(ctx), {recursive: true});
    for (const arch of ctx.r.arches) {
      const p = paths(ctx, arch), bytes = fs.readFileSync(p.dmg);
      equal(sha256(bytes), ctx.state.done['notarize-dmg'][arch].dmgSHA256, 'the DMG changed after notarization');
      // -p prints only the archive's public signature.
      const {args, input} = sparkleSigning(p.dmg, takeSparkleKey());
      const signature = must(io, path.join(ctx.inputs.sparkle, 'bin/sign_update'), args, 'Sparkle could not sign the DMG', {input}).trim();
      const xml = generateAppcast(ctx.r, arch, bytes, signature);
      validateAppcast(xml, ctx.r, arch, bytes, signature);
      fs.writeFileSync(p.signature, signature + '\n', {mode: 0o600});
      fs.copyFileSync(p.dmg, path.join(assets(ctx), assetName(ctx.r, arch)), fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(path.join(assets(ctx), `appcast-${arch}.xml`), xml, {flag: 'wx'});
      out[arch] = sha256(Buffer.from(xml));
    }
    return out;
  },
  async manifest(ctx) {
    const dir = assets(ctx), payloads = path.join(ctx.work, 'payloads');
    fs.copyFileSync(path.join(ctx.work, 'release.json'), path.join(dir, 'release.json'), fs.constants.COPYFILE_EXCL);
    for (const name of EXTRA_PAYLOADS) fs.copyFileSync(path.join(payloads, name), path.join(dir, name), fs.constants.COPYFILE_EXCL);
    check(fs.existsSync(path.join(payloads, 'release-notes.md')), 'release notes (payloads/release-notes.md) required');
    verifyEvidenceFiles(JSON.parse(fs.readFileSync(path.join(dir, 'acceptance.json'))), ctx.r, path.join(ctx.work, 'evidence'));
    const {json, checksums} = makeManifest(ctx.r, readPayloads(dir, ctx.r));
    fs.writeFileSync(path.join(dir, 'RELEASE-MANIFEST.json'), json, {flag: 'wx'});
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), checksums, {flag: 'wx'});
    return {manifestSHA256: sha256(Buffer.from(json)), checksumsSHA256: sha256(Buffer.from(checksums))};
  },
  async draft(ctx, io) {
    keyBackedUp(io);
    const dir = assets(ctx), r = ctx.r;
    const names = [...payloadNames(r), 'RELEASE-MANIFEST.json', 'SHA256SUMS'];
    equal(sha256(fs.readFileSync(path.join(dir, 'SHA256SUMS'))), ctx.state.done.manifest.checksumsSHA256, 'assets changed after the manifest');
    confirmAbsent(io, r);
    check(await io.confirm(`tag and draft ${r.tag}`), 'not confirmed; nothing was created');
    confirmAbsent(io, r); // again, immediately before creating anything
    must(io, '/usr/bin/git', ['-C', ROOT, 'tag', r.tag, r.sourceCommit], 'could not create the tag');
    must(io, '/usr/bin/git', ['-C', ROOT, 'push', 'origin', `refs/tags/${r.tag}`], 'could not push the tag');
    must(io, 'gh', ['release', 'create', r.tag, '--repo', REPO, '--verify-tag', '--draft', '--prerelease', '--latest=false',
      '--title', `Blanc Beta ${r.version}`, '--notes-file', path.join(ctx.work, 'payloads', 'release-notes.md'),
      ...names.map(name => path.join(dir, name))], 'could not create the draft; the tag exists, so fix forward');
    const fresh = scratch('blanc-beta-draft-');
    try {
      must(io, 'gh', ['release', 'download', r.tag, '--repo', REPO, '--dir', fresh], 'could not download the draft');
      equal(fs.readdirSync(fresh).sort(), [...names].sort(), 'the draft holds unexpected assets');
      sameBytes(dir, fresh, names);
    } finally { fs.rmSync(fresh, {recursive: true, force: true}); }
    return {tag: r.tag, sourceCommit: r.sourceCommit};
  },
  async sigstore(ctx, io) {
    const dir = assets(ctx), sums = path.join(dir, 'SHA256SUMS'), bundle = path.join(dir, 'SHA256SUMS.sigstore.json');
    check(!fs.existsSync(bundle), 'a Sigstore bundle already exists; it was authorized once, do not sign again');
    console.log('Safari opens for the GitHub approval; complete the fresh page immediately, never in Blanc.');
    must(io, 'cosign', ['sign-blob', '--yes', '--oidc-redirect-url', COSIGN_REDIRECT, '--bundle', bundle, sums],
      // Interactive: without a terminal cosign falls back to a device-code sign-in whose
      // code nobody sees (2026-11-14), instead of opening Safari.
      'Sigstore signing did not complete', {env: {...io.env, PATH: `${path.join(ROOT, 'scripts/release-bin')}:${io.env.PATH}`}, interactive: true});
    must(io, 'cosign', ['verify-blob', '--bundle', bundle, '--certificate-identity', COSIGN_IDENTITY,
      '--certificate-oidc-issuer', COSIGN_ISSUER, sums], 'the Sigstore bundle did not verify against the pinned identity');
    (io.verifyManifest ?? verifyManifest)(dir, ctx.r);
    must(io, 'gh', ['release', 'upload', ctx.r.tag, bundle, '--repo', REPO], 'could not upload the Sigstore bundle');
    return {bundleSHA256: sha256(fs.readFileSync(bundle))};
  },
  async publish(ctx, io) {
    keyBackedUp(io);
    const r = ctx.r;
    check(await io.confirm(`publish ${r.tag}`), 'not confirmed; the draft stays private');
    must(io, 'gh', ['release', 'edit', r.tag, '--repo', REPO, '--draft=false', '--prerelease', '--latest=false'], 'could not publish the draft');
    const view = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/tags/${r.tag}`], 'GitHub did not show the release'));
    check(view.draft === false && view.prerelease === true, 'GitHub does not show a published pre-release');
    // Stable updaters and the site read /latest: it must still be an Electron release.
    const latest = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/latest`], 'GitHub did not show the latest release'));
    check(!String(latest.tag_name).startsWith('chromium-beta-'), 'the beta became the latest release; restore the stable release as latest now');
    return {published: true, latest: latest.tag_name};
  },
  async 'verify-public'(ctx, io) {
    const r = ctx.r, fresh = scratch('blanc-beta-public-'), out = {};
    try {
      const view = JSON.parse(must(io, 'gh', ['api', `repos/${REPO}/releases/tags/${r.tag}`], 'GitHub did not show the release'));
      // Logged out: plain HTTPS from the public asset URLs, as anyone downloads them.
      for (const asset of view.assets) {
        check(/^[\w.-]+$/.test(asset.name), 'unexpected asset name');
        must(io, '/usr/bin/curl', ['-fsSL', '--proto', '=https', '-o', path.join(fresh, asset.name), asset.browser_download_url], 'a public download failed');
      }
      (io.verifyManifest ?? verifyManifest)(fresh, r);
      must(io, '/usr/bin/shasum', ['-a', '256', '-c', path.join(fresh, 'SHA256SUMS')], 'checksums did not match', {cwd: fresh});
      must(io, 'cosign', ['verify-blob', '--bundle', path.join(fresh, 'SHA256SUMS.sigstore.json'), '--certificate-identity', COSIGN_IDENTITY,
        '--certificate-oidc-issuer', COSIGN_ISSUER, path.join(fresh, 'SHA256SUMS')], 'the public Sigstore bundle did not verify');
      for (const arch of r.arches) {
        (io.verifyArtifact ?? verifyArtifact)(path.join(fresh, assetName(r, arch)), r, arch);
        out[arch] = sha256(fs.readFileSync(path.join(fresh, assetName(r, arch))));
        equal(out[arch], ctx.state.done['notarize-dmg'][arch].dmgSHA256, 'the public DMG is not the notarized one');
      }
    } finally { fs.rmSync(fresh, {recursive: true, force: true}); }
    return {publicDMG: out, next: 'feed promotion is a website PR (docs/chromium-beta-release.md §10.8)'};
  },
};

export async function runStage(stage, work, io = realIO()) {
  const ctx = load(work);
  admit(ctx.state, stage);
  const result = await RUN[stage](ctx, io);
  ctx.state.done[stage] = {at: new Date().toISOString(), ...result};
  ctx.save();
  return {stage, next: nextStage(ctx.state)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [stage, work] = process.argv.slice(2);
  try {
    check(process.platform === 'darwin', 'macOS required');
    check(stage && work && process.argv.length === 4, `usage: release.mjs status|${STAGES.join('|')} WORK`);
    if (stage === 'status') {
      const {state} = load(path.resolve(work));
      console.log(JSON.stringify({done: Object.keys(state.done), next: nextStage(state)}));
    } else {
      check(process.stdin.isTTY, 'run release stages from a foreground Terminal');
      console.log(JSON.stringify(await runStage(stage, path.resolve(work))));
    }
  } catch (error) {
    console.error(`Beta release stopped: ${reason(error)}.`);
    process.exitCode = 1;
  }
}
