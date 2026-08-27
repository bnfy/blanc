// One-shot: seed first:<hashedId> markers from existing seen:* markers so the
// new:day counter (src/first-seen.js) starts clean — run BEFORE deploying the
// markFirstSeen write path, else every existing install re-counts as new.
// Auth: wrangler cached OAuth on this machine. Idempotent (bulk put overwrites
// identical values; markFirstSeen only ever checks existence).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAMESPACE_ID = '2c71bddea5b842d49fee1c972b70e8d9';

// seen:<scope>:<bucket>:<id> -> Map id -> earliest bucket string. Buckets
// never contain ':' so the final segment is always the install token (same
// invariant handlePurgeLegacy relies on). Day/month buckets are mutually
// sortable as strings ('YYYY-MM' < 'YYYY-MM-DD'); week keys are skipped —
// every install also carries month markers (markActive writes all three).
export function earliestBucketById(keyNames) {
  const out = new Map();
  for (const name of keyNames) {
    const [tag, scope, bucket, id] = name.split(':');
    if (tag !== 'seen' || (scope !== 'day' && scope !== 'month') || !bucket || !id) continue;
    const prev = out.get(id);
    if (prev === undefined || bucket < prev) out.set(id, bucket);
  }
  return out;
}

function listKeys(prefix) {
  const raw = execFileSync('npx', [
    'wrangler', 'kv', 'key', 'list',
    `--namespace-id=${NAMESPACE_ID}`, `--prefix=${prefix}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw).map((k) => k.name);
}

function main() {
  const keys = [...listKeys('seen:day:'), ...listKeys('seen:month:')];
  const firsts = earliestBucketById(keys);
  const bulk = [...firsts].map(([id, bucket]) => ({ key: `first:${id}`, value: bucket }));
  if (!bulk.length) throw new Error('no seen markers found — refusing to write nothing');
  const file = new URL('./first-seen-bulk.json', import.meta.url);
  writeFileSync(file, JSON.stringify(bulk, null, 1));
  console.log(`writing ${bulk.length} first: markers from ${keys.length} seen keys`);
  execFileSync('npx', [
    'wrangler', 'kv', 'bulk', 'put', fileURLToPath(file),
    `--namespace-id=${NAMESPACE_ID}`,
  ], { stdio: 'inherit' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
