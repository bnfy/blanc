#!/usr/bin/env node
// The fork's exact-tag hosted smoke check (docs/chromium-beta-release.md §8),
// run by .github/workflows/chromium-beta-smoke.yml on a GitHub-hosted Mac of
// the release's architecture, from the release's own tag:
//
//   node chromium/release/public-smoke.mjs TAG OUT_DIR [--feed]
//
// From a fresh, logged-out download of every public asset: the exact asset
// set, manifest, checksums and both appcasts' EdDSA signatures over the DMGs
// (manifest.mjs); GitHub showing a published pre-release that is not the
// latest, with an Electron release still latest; each DMG of this runner's
// architecture through verify.mjs (signatures, Developer ID leaf, stapled
// ticket, entitlements, profile, layout, notices, embedded blocker); and the
// app, copied off the read-only image, launching and opening a loopback page.
// --feed also requires blanc.day's live beta feed to equal the release's
// appcast (after feed promotion). Sigstore's pinned identity is verified on
// the owner's Mac (release.mjs verify-public), where cosign is installed.
// Writes OUT_DIR/smoke.json and exits 1 on any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {check, equal, reason, sha256, validateRelease, assetName, feedURL} from './policy.mjs';
import {verifyManifest} from './manifest.mjs';
import {verifyArtifact} from './verify.mjs';
import {launchBeta} from './launch-beta.mjs';

const REPO = 'bnfy/blanc';
export const TAG = /^chromium-beta-2\.0\.0-beta\.[1-9]\d*$/;

export function realIO() {
  const headers = process.env.GH_TOKEN ? {authorization: `Bearer ${process.env.GH_TOKEN}`} : {};
  return {
    arch: os.arch() === 'arm64' ? 'arm64' : 'x64',
    api: async route => { const res = await fetch(`https://api.github.com/${route}`, {headers: {...headers, accept: 'application/vnd.github+json'}}); check(res.ok, `GitHub answered ${res.status} for ${route.split('/').slice(-2).join('/')}`); return res.json(); },
    // Public asset URLs, without credentials, as anyone downloads them.
    download: async (url, file) => { const res = await fetch(url, {redirect: 'follow'}); check(res.ok, 'a public download failed'); fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); },
    text: async url => { const res = await fetch(url, {redirect: 'error'}); check(res.ok, 'the live feed did not answer'); return Buffer.from(await res.arrayBuffer()); },
    verifyArtifact, verifyManifest,
    launch: async (dmg, home) => {
      const mount = path.join(home, 'mount'), copy = path.join(home, 'Blanc Beta.app');
      fs.mkdirSync(mount);
      const run = (cmd, args) => { const r = spawnSync(cmd, args, {stdio: 'ignore'}); check(r.status === 0, `${path.basename(cmd)} failed`); };
      run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
      try { run('/usr/bin/ditto', [path.join(mount, 'Blanc Beta.app'), copy]); }
      finally { run('/usr/bin/hdiutil', ['detach', mount]); }
      return launchBeta({app: copy, home, settle: 30000});
    },
  };
}

// GitHub's view: published, a pre-release, not latest; the latest is still
// a stable (Electron, vX.Y.Z) release.
export function releaseState(view, latest, r) {
  const failures = [];
  if (view.draft) failures.push('the release is still a draft');
  if (!view.prerelease) failures.push('the release is not marked a pre-release');
  if (latest.tag_name === r.tag) failures.push('the beta is GitHub\'s latest release');
  if (!/^v\d+\.\d+\.\d+$/.test(latest.tag_name ?? '')) failures.push(`the latest release is ${latest.tag_name}, not a stable one`);
  return failures;
}

export async function smoke(tag, out, {feed = false, io = realIO()} = {}) {
  check(TAG.test(tag), 'a chromium-beta-2.0.0-beta.N tag is required');
  const result = {schema: 1, tag, arch: io.arch, checks: [], failures: []};
  const step = async (name, fn) => {
    try { const detail = await fn(); result.checks.push({name, result: 'pass', ...(detail ? {detail} : {})}); }
    catch (error) { result.checks.push({name, result: 'fail'}); result.failures.push(`${name}: ${reason(error)}`); }
  };
  const dir = path.join(out, 'assets');
  fs.mkdirSync(dir, {recursive: true});
  let r;
  await step('every public asset downloads logged out', async () => {
    const view = await io.api(`repos/${REPO}/releases/tags/${tag}`);
    for (const asset of view.assets) {
      check(/^[\w.-]+$/.test(asset.name), 'unexpected asset name');
      await io.download(asset.browser_download_url, path.join(dir, asset.name));
    }
    r = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8'));
    validateRelease(r); equal(r.tag, tag, 'release.json names this tag');
    result.release = {version: r.version, build: r.build, sourceCommit: r.sourceCommit};
    return {assets: view.assets.length};
  });
  if (!r) return finish(result, out);
  await step('the exact asset set, manifest, checksums and appcast signatures', async () => { io.verifyManifest(dir, r); });
  await step('GitHub shows a published pre-release that is not latest', async () => {
    const failures = releaseState(await io.api(`repos/${REPO}/releases/tags/${tag}`), await io.api(`repos/${REPO}/releases/latest`), r);
    check(failures.length === 0, failures.join('; '));
  });
  if (!r.arches.includes(io.arch)) result.failures.push(`this runner is ${io.arch}, which the release does not ship`);
  else {
    const dmg = path.join(dir, assetName(r, io.arch));
    await step(`the ${io.arch} DMG passes verify.mjs`, async () => { io.verifyArtifact(dmg, r, io.arch); return {dmgSHA256: sha256(fs.readFileSync(dmg))}; });
    await step(`the ${io.arch} app launches and opens a page`, async () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-smoke-'));
      try {
        const launched = await io.launch(dmg, home);
        check(launched.requests.some(q => / \/$/.test(q)), 'the app did not open its page');
        check(!launched.quitOnItsOwn, 'the app quit on its own');
      } finally { fs.rmSync(home, {recursive: true, force: true}); }
    });
    if (feed) await step(`blanc.day's ${io.arch} feed is the release appcast`, async () => {
      equal(sha256(await io.text(feedURL(io.arch))), sha256(fs.readFileSync(path.join(dir, `appcast-${io.arch}.xml`))), 'the live feed differs from the release appcast');
    });
  }
  return finish(result, out);
}

function finish(result, out) {
  result.status = result.failures.length ? 'fail' : 'pass';
  fs.writeFileSync(path.join(out, 'smoke.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [tag, out, ...flags] = process.argv.slice(2);
  try {
    check(tag && out && flags.every(f => f === '--feed'), 'usage: public-smoke.mjs TAG OUT_DIR [--feed]');
    check(process.platform === 'darwin', 'macOS required');
    fs.mkdirSync(out, {recursive: true});
    const result = await smoke(tag, out, {feed: flags.includes('--feed')});
    for (const c of result.checks) console.log(`${c.result} ${c.name}`);
    for (const f of result.failures) console.log(`FAIL ${f}`);
    if (result.status !== 'pass') process.exitCode = 1;
  } catch (error) { console.error(`Beta smoke stopped: ${reason(error)}`); process.exitCode = 1; }
}
