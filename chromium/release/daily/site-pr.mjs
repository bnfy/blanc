#!/usr/bin/env node
// The website PR for a published Blanc Beta, written from the public release
// (docs/chromium-beta-release.md, "Daily betas"; the runbook's lessons item 13).
// Run by Claude after verify-public. It changes, in a fresh worktree of
// origin/main on its own branch:
//   site/src/data/blanc-beta.json                the Download page tile
//   site/public/updates/chromium-beta/arm64.xml  the release appcast, byte for byte
//   cloudflare/ping-worker/src/dl.js             BETA_DOWNLOAD (/dl/beta)
//   security/audit-surface-inventory.json        dl.js's digest
//   docs/website-blanc-beta-<version>-claims.json the claims ledger
// and opens the PR. It refuses when the release's waivers differ from the
// limitations the page lists: then the page's text changes, which needs the
// owner's approval, so a person writes that PR.
//
//   node chromium/release/daily/site-pr.mjs chromium-beta-2.0.0-beta.N
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { check, equal, reason, sha256, assetName, validateRelease } from '../policy.mjs';
import { ROOT } from '../preflight.mjs';
import { COSIGN_IDENTITY, COSIGN_ISSUER, REPO } from '../release.mjs';
import { betaNumber } from '../standing.mjs';

// Each limitation the page lists, by the gate whose waiver it stands for.
export const LIMITATIONS = {
  'no-drm-handoff': 'Protected video, such as Netflix or Spotify.',
  'production-sync-real-device': 'Sync checked against the live Sync service.',
};
const STANDING_EVIDENCE = {
  'no-drm-handoff': "Listed under 'Not in this beta yet'. The beta ships without Widevine (enable_widevine = false); the no-drm-handoff gate is waived under the owner's standing decision of 2026-11-14 (release.json gateWaivers).",
  'production-sync-real-device': "Listed under 'Not in this beta yet'. production-sync-real-device is waived under the owner's standing decision of 2026-11-14 (release.json gateWaivers); the release notes keep the caution that Sync isn't checked end to end.",
};

const swap = (text, from, to, what) => {
  check(text.split(from).length === 2, `expected exactly one ${what}`);
  return text.replace(from, to);
};

// r: the public release.json; appcast: its appcast-arm64.xml text; dmg: {bytes, sha256};
// published: YYYY-MM-DD; files: the current contents on main.
export function siteFiles({ r, appcast, dmg, published, files }) {
  validateRelease(r);
  equal(r.arches, ['arm64'], 'the site offers the Apple Silicon beta only');
  const n = betaNumber(r.version), name = assetName(r, 'arm64');
  const url = `https://github.com/${REPO}/releases/download/${r.tag}/${name}`;
  check(appcast.includes(`<enclosure url="${url}" length="${dmg.bytes}"`), 'the appcast does not point at the published DMG');
  const before = JSON.parse(files.betaJson);
  check(betaNumber(before.version) < n, 'the site already names this beta or a later one');
  const prev = JSON.parse(files.prevLedger);
  equal(prev.release, before.version, 'the previous claims ledger is not the site\'s current beta');
  // The page lists exactly these limitations; a change in waivers changes its text.
  const shown = Object.entries(LIMITATIONS).filter(([, text]) => prev.claims.some(c => c.text === text)).map(([g]) => g).sort();
  equal(Object.keys(r.gateWaivers ?? {}).sort(), shown, 'the release\'s waivers differ from the limitations the page lists; the page text changes, so this PR needs the owner');

  const betaJson = JSON.stringify({
    version: r.version, build: r.build, tag: r.tag, published,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${r.tag}`,
    dmg: { name, url, bytes: dmg.bytes, sha256: dmg.sha256 },
    feed: before.feed, requirement: before.requirement,
  }, null, 2) + '\n';
  const oldUrl = before.dmg.url;
  const dlJs = swap(files.dlJs, `export const BETA_DOWNLOAD = '${oldUrl}';`, `export const BETA_DOWNLOAD = '${url}';`, 'BETA_DOWNLOAD');
  const inventory = swap(files.inventory, sha256(Buffer.from(files.dlJs)), sha256(Buffer.from(dlJs)), 'dl.js inventory digest');
  const requirement = `Apple Silicon Macs · macOS 13 or later · `;
  const ledger = {
    ...prev,
    release: r.version, tag: r.tag, sourceCommit: r.sourceCommit, publicRelease: published,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${r.tag}`,
    releaseEvidence: "The release's own acceptance.json (every gate passed or waived under the owner's standing decisions) and docs/chromium-beta-release.md on chromium/next.",
    ownerDecisions: { ...prev.ownerDecisions, decisions: [...prev.ownerDecisions.decisions,
      `Beta.${n} (standing decision, owner 2026-11-14): the tile, its text and both limitations stay as for beta.${betaNumber(before.version)}; only the release it names changes. Its release notes keep the caution that Sync isn't checked end to end.`] },
    claims: prev.claims.map(c => {
      if (c.text.startsWith(requirement)) return { text: `${requirement}${r.version}`,
        evidence: `release.json arches [arm64] under the owner's standing Intel waiver, minimumSystemVersion 13.0, version ${r.version}.` };
      const gate = Object.keys(LIMITATIONS).find(g => LIMITATIONS[g] === c.text);
      return gate ? { text: c.text, evidence: STANDING_EVIDENCE[gate] } : c;
    }),
  };
  check(ledger.claims.some(c => c.text === `${requirement}${r.version}`), 'the claims ledger has no requirement line');
  return {
    'site/src/data/blanc-beta.json': betaJson,
    'site/public/updates/chromium-beta/arm64.xml': appcast,
    'cloudflare/ping-worker/src/dl.js': dlJs,
    'security/audit-surface-inventory.json': inventory,
    [`docs/website-blanc-beta-${r.version}-claims.json`]: JSON.stringify(ledger, null, 2) + '\n',
  };
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  return { ok: result.status === 0, out: result.stdout ?? '' };
};
const must = (command, args, message, options) => { const r = run(command, args, options); check(r.ok, message); return r.out; };

function main(tag) {
  check(/^chromium-beta-2\.0\.0-beta\.[1-9]\d*$/.test(tag ?? ''), 'usage: site-pr.mjs chromium-beta-2.0.0-beta.N');
  const view = JSON.parse(must('gh', ['api', `repos/${REPO}/releases/tags/${tag}`], 'GitHub did not show the release'));
  check(view.draft === false && view.prerelease === true, 'the release is not a published pre-release');
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-site-pr-'));
  try {
    // Logged out, as anyone downloads them; the checksums verified against the pinned Sigstore identity.
    for (const name of ['release.json', 'appcast-arm64.xml', 'SHA256SUMS', 'SHA256SUMS.sigstore.json']) {
      const asset = view.assets.find(a => a.name === name);
      check(asset, `the release has no ${name}`);
      must('/usr/bin/curl', ['-fsSL', '--proto', '=https', '-o', path.join(fresh, name), asset.browser_download_url], 'a public download failed');
    }
    must('cosign', ['verify-blob', '--bundle', path.join(fresh, 'SHA256SUMS.sigstore.json'), '--certificate-identity', COSIGN_IDENTITY,
      '--certificate-oidc-issuer', COSIGN_ISSUER, path.join(fresh, 'SHA256SUMS')], 'the checksums did not verify against the pinned identity');
    const sums = Object.fromEntries(fs.readFileSync(path.join(fresh, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+\*?/).reverse()));
    for (const name of ['release.json', 'appcast-arm64.xml']) equal(sha256(fs.readFileSync(path.join(fresh, name))), sums[name], `${name} is not the signed one`);
    const r = JSON.parse(fs.readFileSync(path.join(fresh, 'release.json'), 'utf8'));
    equal(r.tag, tag, 'release.json names another tag');
    const appcast = fs.readFileSync(path.join(fresh, 'appcast-arm64.xml'), 'utf8');
    const dmgAsset = view.assets.find(a => a.name === assetName(r, 'arm64'));
    check(dmgAsset && /^[a-f0-9]{64}$/.test(sums[dmgAsset.name] ?? ''), 'the DMG is not in the signed checksums');
    const dmg = { bytes: dmgAsset.size, sha256: sums[dmgAsset.name] };
    const published = view.published_at.slice(0, 10);

    must('git', ['-C', ROOT, 'fetch', '-q', 'origin', 'main'], 'could not fetch main');
    const branch = `site/blanc-beta-${r.version}`, tree = path.join(fresh, 'main');
    must('git', ['-C', ROOT, 'worktree', 'add', '-q', '-b', branch, tree, 'origin/main'], 'could not make a worktree of main');
    try {
      const read = rel => fs.readFileSync(path.join(tree, rel), 'utf8');
      const before = JSON.parse(read('site/src/data/blanc-beta.json'));
      const out = siteFiles({ r, appcast, dmg, published, files: {
        betaJson: read('site/src/data/blanc-beta.json'), dlJs: read('cloudflare/ping-worker/src/dl.js'),
        inventory: read('security/audit-surface-inventory.json'), prevLedger: read(`docs/website-blanc-beta-${before.version}-claims.json`) } });
      for (const [rel, text] of Object.entries(out)) fs.writeFileSync(path.join(tree, rel), text);
      must('node', ['--test', 'test/unit/site-blanc-beta.test.js'], 'the site\'s beta tests failed', { cwd: tree });
      must('node', ['scripts/audit-surface-inventory.mjs', '--check'], 'the audit inventory check failed', { cwd: tree });
      must('git', ['-C', tree, 'add', ...Object.keys(out)], 'could not stage the files');
      const title = `Website: Blanc Beta ${r.version} on the Download page, its update feed and /dl/beta`;
      must('git', ['-C', tree, 'commit', '-q', '-m', `${title}\n\nGenerated by chromium/release/daily/site-pr.mjs from the public release ${r.tag}: the update feed is its appcast byte for byte, the Download tile and /dl/beta name its DMG, and the claims ledger records it under the owner's standing decisions. The page's text is unchanged.`], 'could not commit');
      must('git', ['-C', tree, 'push', '-q', '-u', 'origin', branch], 'could not push the branch');
      const body = `Blanc Beta ${r.version} was published as a pre-release: https://github.com/${REPO}/releases/tag/${r.tag}\n\n`
        + `- \`site/public/updates/chromium-beta/arm64.xml\`: the release's appcast, byte for byte (checked against the Sigstore-signed checksums).\n`
        + `- \`site/src/data/blanc-beta.json\` and \`BETA_DOWNLOAD\`: the ${dmg.bytes}-byte DMG, SHA-256 \`${dmg.sha256}\`.\n`
        + `- \`docs/website-blanc-beta-${r.version}-claims.json\`: the same claims; the waivers are the owner's standing decisions.\n\n`
        + `Generated by \`chromium/release/daily/site-pr.mjs\`. Deploy blanc-ping before the site.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n`;
      return must('gh', ['pr', 'create', '--repo', REPO, '--base', 'main', '--head', branch, '--title', title, '--body', body], 'could not open the PR').trim();
    } finally {
      run('git', ['-C', ROOT, 'worktree', 'remove', '--force', tree]);
    }
  } finally { fs.rmSync(fresh, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(main(process.argv[2])); }
  catch (error) { console.error(`Site PR stopped: ${reason(error)}.`); process.exitCode = 1; }
}
