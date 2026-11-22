// Windows and Linux share desktop build numbers in claim order on chromium/next.
// The claim commit records the source that was built. It never changes GN args.
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ReleaseCheckError, check} from './policy.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '../..');
const file = 'chromium/release/build-reservations.json';
const sequence = 'desktop-158';
const commitId = /^[0-9a-f]{40}$/;
const validBuild = n => Number.isInteger(n) && n >= 1 && n <= 9999;

export class ClaimTaken extends ReleaseCheckError {}

function validateEntry({build, sourceCommit, platforms, purpose}) {
  check(validBuild(build), 'claim build must be an integer 1..9999');
  check(typeof sourceCommit === 'string' && commitId.test(sourceCommit), 'claim needs a full source commit');
  check(Array.isArray(platforms) && platforms.length && new Set(platforms).size === platforms.length &&
    platforms.every(p => p === 'windows' || p === 'linux'), 'claim platforms must name Windows or Linux');
  check(purpose === 'release' || purpose === 'proof', 'claim purpose must be release or proof');
}

function entries(claims) {
  if (claims === null) return [];
  const rows = claims?.sequences?.[sequence];
  check(claims?.schema === 1 && Array.isArray(rows), 'invalid desktop build claims');
  for (const row of rows) validateEntry(row);
  return rows;
}

export function nextBuild({ledgers, claims = null}) {
  const released = ledgers.flat();
  check(released.every(validBuild), 'invalid build in desktop ledger');
  return Math.max(0, ...released, ...entries(claims).map(e => e.build)) + 1;
}

// Keep the release decision independent of later claims, even when another
// platform has since claimed a higher number. Windows relies on these messages.
export function claimProblem(claims, {build, sourceCommit, platform}) {
  const rows = claims?.sequences?.[sequence] ?? [];
  const own = rows.findIndex(e => e.build === build && e.sourceCommit === sourceCommit && (e.platforms ?? []).includes(platform));
  if (own < 0) return 'no claim names this build, its source commit and ' + platform;
  for (const earlier of rows.slice(0, own)) {
    if (earlier.build > build) return 'an earlier claim holds a higher build number';
    if (earlier.build === build && earlier.sourceCommit !== sourceCommit) return 'an earlier claim holds this build number for other source';
  }
  return null;
}

// Each caller fetches to a private ref and uses a private index. Concurrent
// claimers in the same checkout cannot overwrite one another's fetched tip,
// staged changes, or files. A normal fast-forward push arbitrates the claim.
function withFetchedTip({root = rootDirectory, git = 'git', remote = 'origin', branch = 'chromium/next'}, action) {
  const ref = 'refs/blanc/build-claims/' + randomUUID();
  const target = 'refs/heads/' + branch;
  function run(args, options) {
    return spawnSync(git, ['-C', root, ...args], {encoding: 'utf8', ...options});
  }
  function checked(args, message, options) {
    const result = run(args, options);
    check(result.status === 0, message);
    return result.stdout;
  }
  function fetchTip() {
    checked(['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--refmap=', '--', remote, '+' + target + ':' + ref], 'could not fetch the build claims branch');
    return checked(['rev-parse', '--verify', ref + '^{commit}'], 'could not resolve the fetched claims tip').trim();
  }
  function read(tip) {
    const listing = checked(['ls-tree', tip, '--', file], 'could not inspect the build claims tree');
    if (!listing) return null;
    check(listing.startsWith('100644 blob '), 'build claims must be a regular JSON file');
    const bytes = checked(['show', tip + ':' + file], 'could not read build claims');
    let claims;
    try { claims = JSON.parse(bytes); } catch { throw new ReleaseCheckError('build claims are not valid JSON'); }
    check(claims !== null, 'invalid desktop build claims');
    entries(claims);
    return claims;
  }
  try {
    const tip = fetchTip();
    return action({tip, fetchTip, read, target, remote, checked, run});
  } finally {
    checked(['update-ref', '-d', ref], 'could not remove the temporary claims ref');
  }
}

export function claimsAtTip(options = {}) {
  return withFetchedTip(options, ({read, tip}) => read(tip));
}

export function claimExact({build, sourceCommit, platforms, purpose}, options = {}) {
  const row = {build, sourceCommit, platforms, purpose};
  validateEntry(row);
  return withFetchedTip(options, ({tip, fetchTip, read, target, remote, checked, run}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-claim-'));
    const index = {env: {...process.env, GIT_INDEX_FILE: path.join(dir, 'index')}};
    try {
      for (;;) {
        const claims = read(tip) ?? {schema: 1, sequences: {[sequence]: []}};
        const rows = claims.sequences[sequence];
        if (platforms.every(platform => claimProblem(claims, {build, sourceCommit, platform}) === null)) {
          return {commit: tip, created: false};
        }
        if (rows.some(e => e.build > build || (e.build === build && e.sourceCommit !== sourceCommit))) {
          throw new ClaimTaken('an earlier claim holds a higher number or this build for other source');
        }
        checked(['merge-base', '--is-ancestor', sourceCommit, tip], 'claim source is not on the fetched branch');
        rows.push(row);
        const blob = checked(['hash-object', '-w', '--stdin'], 'could not write claim blob', {
          input: JSON.stringify(claims, null, 2) + '\n'
        }).trim();
        checked(['read-tree', tip], 'could not read the claims base tree', index);
        checked(['update-index', '--add', '--cacheinfo', '100644', blob, file], 'could not stage the claim', index);
        const tree = checked(['write-tree'], 'could not write the claim tree', index).trim();
        const commit = checked(['commit-tree', tree, '-p', tip, '-m', 'Fork: claim desktop build ' + build + ' for ' + platforms.join(', ')],
          'could not commit the build claim').trim();
        const push = run(['push', '--quiet', '--', remote, commit + ':' + target]);
        if (push.status === 0) return {commit, created: true};

        // A non-fast-forward is recoverable. A permission error, a rejected
        // hook or another failure with the same tip requires owner attention.
        const observed = fetchTip();
        check(observed !== tip, 'could not push the build claim');
        tip = observed;
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
}
