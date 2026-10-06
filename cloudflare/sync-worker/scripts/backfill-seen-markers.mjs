// One-shot (design 2026-10-05 §5): give every existing sync account a seen:
// marker BEFORE the daily cleanup is enabled; otherwise cleanup would treat
// every pre-budget account as inactive and delete it. Idempotent.
// Auth: wrangler's cached OAuth on the owner's machine.
//   node scripts/backfill-seen-markers.mjs           write markers
//   node scripts/backfill-seen-markers.mjs --verify  exit 1 unless every account has one
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMESPACE_ID = '0e6ba79c73d64d77bbb76886666c33d5';
const SEEN_TTL_SECONDS = 365 * 24 * 60 * 60;

const accountsOf = (blobNames) => [...new Set(blobNames
  .filter((name) => name.startsWith('blob:'))
  .map((name) => name.split(':')[1]))];

export function markersForBlobKeys(names, now) {
  const accounts = accountsOf(names);
  if (!accounts.length) throw new Error('no sync accounts found — refusing to write nothing');
  return accounts.map((accountId) => ({
    key: `seen:${accountId}`,
    value: JSON.stringify({ touchedAt: now }),
    expiration_ttl: SEEN_TTL_SECONDS,
  }));
}

export function verifyCounts(blobNames, seenNames) {
  const accounts = accountsOf(blobNames);
  const marked = new Set(seenNames.map((name) => name.slice('seen:'.length)));
  return {
    accounts: accounts.length,
    markers: marked.size,
    missing: accounts.filter((accountId) => !marked.has(accountId)),
  };
}

function listKeys(prefix) {
  // --remote is load-bearing: without it wrangler v4 lists a LOCAL simulated
  // namespace (empty) instead of production KV.
  const raw = execFileSync('npx', [
    'wrangler', 'kv', 'key', 'list', '--remote',
    `--namespace-id=${NAMESPACE_ID}`, `--prefix=${prefix}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw).map((key) => key.name);
}

function main() {
  const blobs = listKeys('blob:');
  if (process.argv.includes('--verify')) {
    const result = verifyCounts(blobs, listKeys('seen:'));
    console.log(JSON.stringify(result));
    process.exit(result.missing.length ? 1 : 0);
  }
  const markers = markersForBlobKeys(blobs, Date.now());
  const dir = mkdtempSync(join(tmpdir(), 'sync-seen-'));
  const file = join(dir, 'markers.json');
  try {
    writeFileSync(file, JSON.stringify(markers));
    console.log(`writing ${markers.length} seen: markers for ${blobs.length} blob keys`);
    execFileSync('npx', [
      'wrangler', 'kv', 'bulk', 'put', '--remote', file, `--namespace-id=${NAMESPACE_ID}`,
    ], { stdio: 'inherit' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
