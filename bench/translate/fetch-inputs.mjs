// bench/translate/fetch-inputs.mjs
// Phase 0 research-only download: the pinned fr→en model from Mozilla's GCS
// bucket and the pinned Wikipedia revision. Production Blanc never fetches from
// these hosts (spec: Blanc-mirrored, approved artifacts only).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.cache');
mkdirSync(cache, { recursive: true });
const inputs = JSON.parse(readFileSync(path.join(here, 'inputs.json'), 'utf8'));
const UA = 'BlancTranslatePhase0/0 (https://blancbrowser.com)';
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'error' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function verify(label, buf, want) {
  const got = sha(buf);
  if (buf.length !== want.size || got !== want.sha256) {
    throw new Error(`${label}: expected ${want.sha256} (${want.size} bytes), got ${got} (${buf.length} bytes)`);
  }
}

const meta = { model: {} };
for (const [kind, f] of Object.entries(inputs.model.files)) {
  const gz = await get(`${inputs.model.baseUrl}/${f.path}`);
  const raw = gunzipSync(gz);
  verify(kind, raw, f);
  writeFileSync(path.join(cache, kind), raw);
  meta.model[kind] = { bytes: raw.length, gzBytes: gz.length };
  console.log(`ok ${kind}: ${raw.length} bytes (${gz.length} gzipped), sha256 verified`);
}

const html = await get(inputs.fixture.url);
verify('fixture (Wikipedia re-rendered this revision; re-pin only with owner approval)', html, inputs.fixture);
writeFileSync(path.join(cache, 'fixture.html'), html);
meta.fixture = { revid: inputs.fixture.revid, sha256: sha(html), bytes: html.length };
console.log(`ok fixture: revision ${inputs.fixture.revid}, ${html.length} bytes, sha256 verified`);

writeFileSync(path.join(cache, 'inputs-meta.json'), JSON.stringify(meta, null, 2) + '\n');
