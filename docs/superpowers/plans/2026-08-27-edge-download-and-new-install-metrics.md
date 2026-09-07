# Edge Download Counting & New-Install Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure real new-user acquisition two independent ways — un-blockable download-click counting at the site's edge (`blancbrowser.com/dl/<target>`), and exact new-installs-per-day derived from the telemetry the app already sends — replacing the two contaminated signals we lean on today (GA4 download_click events, which ad blockers eat, and GitHub download deltas, which auto-update inflates).

**Architecture:** Both metrics live in the existing `blanc-ping` Cloudflare Worker and its `PINGS` KV namespace. A new `GET /dl/<target>` route, mapped onto `blancbrowser.com/dl/*` via a zone route, bumps a per-day/per-target KV counter and 302s to the latest GitHub release artifact (resolved via a KV-cached GitHub API call). A new `first:` marker per hashed install id turns each install's first-ever ping into a `new:day:*` counter bump. Both surface as new blocks in the existing bearer-gated `GET /stats`, which the daily digest already reads.

**Tech Stack:** Cloudflare Workers + Workers KV (existing `blanc-ping` worker), Astro marketing site (`site/`), `node --test` unit tests in `test/unit/`, `wrangler` CLI (cached-OAuth auth).

## Global Constraints

- **Privacy:** the `/dl` counter stores a bare count only — no IP, no user agent, no cookie, nothing per-user. Phase B touches only the HMAC'd install id; the raw install id is never stored (2026-07-11 audit rule, unchanged).
- **Never promise an artifact the release lacks:** the mac-x64 card ships hidden and is revealed only when the release actually contains an x64 dmg (current releases do NOT — v1.9.1 ships arm64 dmg only). `/dl/mac-x64` must degrade to the releases page, never 500.
- **KV counters are best-effort, non-atomic** — same tolerance as the existing `bump()` (documented in `cloudflare/ping-worker/src/index.js`).
- **Counter keys never expire:** `dl:*` and `new:day:*` follow the `active:*` convention — they ARE the growth history. Only cache/marker keys carry TTLs or informational values.
- **Auth/deploys:** `wrangler` works via cached OAuth on this Mac (the 1Password "Cloudflare API Token blancbrowser" item holds a DEAD token — do not use it). Worker deploy: `npx wrangler deploy` from `cloudflare/ping-worker/`. Site deploy: `npm run site:deploy` (already includes `--branch=main`). **All deploy steps are operator-gated — get an explicit go-ahead before each.**
- **No-JS fallback:** every download link on the site must work with JavaScript disabled (static hrefs must be real destinations).
- Tests run with `npm run test:unit` (`node --test` over `test/unit/`). New pure logic must be unit-tested there.
- KV namespace id (for fallback bindings / backfill): `2c71bddea5b842d49fee1c972b70e8d9`, binding name `PINGS`.
- **Known uncertainty:** whether a Workers zone route intercepts a path on a hostname served by a Cloudflare Pages custom domain. Task 1 probes this FIRST; if Pages wins, the fallback is a Pages Function (`site/functions/dl/[target].js`) bound to the same KV namespace, and Tasks 2–4's logic moves there unchanged.

---

## Phase A — `/dl/<target>` edge download counting

### Task 1: Zone-route probe with a safe stub redirect

Prove `blancbrowser.com/dl/*` can reach the worker at all, using a stub that is already correct fallback behavior (302 to the releases page, no counting yet).

**Files:**
- Modify: `cloudflare/ping-worker/wrangler.toml`
- Modify: `cloudflare/ping-worker/src/index.js` (fetch dispatch, ~line 404)

**Interfaces:**
- Produces: route `GET /dl/*` reaching the worker; constant `RELEASES_LATEST_PAGE`.

- [ ] **Step 1: Add the zone routes to wrangler.toml**

Append after the `kv_namespaces` block:

```toml
# blancbrowser.com is a Pages project; these routes carve /dl/* out of it so
# download clicks are counted at the edge (no JS, no ad-blocker exposure).
routes = [
  { pattern = "blancbrowser.com/dl/*", zone_name = "blancbrowser.com" },
  { pattern = "www.blancbrowser.com/dl/*", zone_name = "blancbrowser.com" }
]
```

- [ ] **Step 2: Add the stub dispatch to src/index.js**

Add above the `export default` block:

```js
const RELEASES_LATEST_PAGE = 'https://github.com/bnfy/blanc/releases/latest';
```

Add inside `fetch()`, after the `/stats` line:

```js
    if (request.method === 'GET' && url.pathname.startsWith('/dl/')) {
      return new Response(null, {
        status: 302,
        headers: { Location: RELEASES_LATEST_PAGE, 'Cache-Control': 'no-store' },
      });
    }
```

- [ ] **Step 3: Deploy (operator-gated)**

Run from `cloudflare/ping-worker/`: `npx wrangler deploy`
Expected: deploy succeeds and lists the two routes.

- [ ] **Step 4: Probe the route**

Run: `curl -s -o /dev/null -D - "https://blancbrowser.com/dl/win"` (GET, not `-I` — HEAD is unhandled by design)
Expected: `HTTP/2 302` with `location: https://github.com/bnfy/blanc/releases/latest`.
**If instead the Pages 404 page answers:** the zone route does not intercept Pages. STOP, revert wrangler.toml's routes block, and switch Tasks 2–4 to the Pages-Function fallback (same handler code in `site/functions/dl/[target].js`, KV binding `PINGS` → namespace `2c71bddea5b842d49fee1c972b70e8d9` added to the Pages project; note the binding is dashboard-side, one-time). Record the outcome either way.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/wrangler.toml cloudflare/ping-worker/src/index.js
git commit -m "feat(ping-worker): route blancbrowser.com/dl/* to a stub releases redirect"
```

### Task 2: Pure download-resolution module (`dl.js`)

**Files:**
- Create: `cloudflare/ping-worker/src/dl.js`
- Test: `test/unit/ping-worker-dl.test.js`

**Interfaces:**
- Produces: `DL_TARGETS: Set<string>`, `pickAsset(assets, target) -> asset|null`, `dlCountKey(dayBucket, target) -> string`, `groupDlCounts(flatMap) -> {day: {target: count}}`. Consumed by Tasks 3–4.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/ping-worker-dl.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('ping-worker dl pure logic', async (t) => {
  const { DL_TARGETS, pickAsset, dlCountKey, groupDlCounts } =
    await import('../../cloudflare/ping-worker/src/dl.js');

  const v191 = [
    { name: 'Blanc-1.9.1-arm64-mac.zip', browser_download_url: 'u1' },
    { name: 'Blanc-1.9.1-arm64.dmg', browser_download_url: 'u2' },
    { name: 'Blanc-1.9.1-arm64.dmg.blockmap', browser_download_url: 'u3' },
    { name: 'Blanc-1.9.1.AppImage', browser_download_url: 'u4' },
    { name: 'Blanc-Setup-1.9.1.exe', browser_download_url: 'u5' },
    { name: 'SHA256SUMS', browser_download_url: 'u6' },
  ];

  await t.test('targets are exactly the four site cards (no ambiguous mac)', () => {
    assert.deepStrictEqual([...DL_TARGETS].sort(), ['linux', 'mac-arm64', 'mac-x64', 'win']);
  });

  await t.test('pickAsset mirrors site.js per-platform selection', () => {
    assert.strictEqual(pickAsset(v191, 'mac-arm64').browser_download_url, 'u2');
    assert.strictEqual(pickAsset(v191, 'win').browser_download_url, 'u5');
    assert.strictEqual(pickAsset(v191, 'linux').browser_download_url, 'u4');
  });

  await t.test('pickAsset returns null for an artifact the release lacks', () => {
    assert.strictEqual(pickAsset(v191, 'mac-x64'), null); // v1.9.1 ships no x64 dmg
    assert.strictEqual(pickAsset(v191, 'mac'), null);
    assert.strictEqual(pickAsset(null, 'win'), null);
  });

  await t.test('dlCountKey shape', () => {
    assert.strictEqual(dlCountKey('2026-08-28', 'win'), 'dl:2026-08-28:win');
  });

  await t.test('groupDlCounts reshapes readMap output by day', () => {
    assert.deepStrictEqual(
      groupDlCounts({ '2026-08-28:win': 3, '2026-08-28:linux': 1, '2026-08-29:win': 2 }),
      { '2026-08-28': { win: 3, linux: 1 }, '2026-08-29': { win: 2 } }
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/ping-worker-dl.test.js`
Expected: FAIL (Cannot find module `.../src/dl.js`).

- [ ] **Step 3: Implement `src/dl.js`**

```js
// Pure logic for the blancbrowser.com/dl/* counted download redirect.
// No Workers APIs here — unit-tested by test/unit/ping-worker-dl.test.js.

// The four site download targets. Mirrors site/src/scripts/site.js pickAsset:
// a Mac UA can't reveal arm64 vs x64, so there is deliberately no '/dl/mac' —
// generic Mac CTAs go to /download where both artifacts are explicit.
export const DL_TARGETS = new Set(['mac-arm64', 'mac-x64', 'win', 'linux']);

// Pick the artifact for a target from a release's assets
// ([{name, browser_download_url}]). Returns null when the release has no such
// artifact (e.g. releases that intentionally omit mac-x64) — callers must then
// fall back to the releases page rather than promising a file that isn't there.
export function pickAsset(assets, target) {
  if (!Array.isArray(assets)) return null;
  const named = assets.filter((a) => typeof a?.name === 'string');
  if (target === 'mac-arm64' || target === 'mac-x64') {
    const dmgs = named.filter((a) => a.name.endsWith('.dmg'));
    if (target === 'mac-x64') return dmgs.find((a) => !a.name.includes('arm64')) || null;
    return dmgs.find((a) => a.name.includes('arm64')) || null;
  }
  if (target === 'win') return named.find((a) => a.name.endsWith('.exe')) || null;
  if (target === 'linux') return named.find((a) => a.name.endsWith('.AppImage')) || null;
  return null;
}

// KV counter key for one day's clicks on one target: dl:2026-08-28:win
// Never expires — dl:* counters are growth history (active:* convention).
export function dlCountKey(dayBucket, target) {
  return `dl:${dayBucket}:${target}`;
}

// Reshape readMap('dl:') output ({'2026-08-28:win': 3, ...}) into
// {'2026-08-28': {win: 3, ...}, ...} for /stats.
export function groupDlCounts(flat) {
  const out = {};
  for (const [key, count] of Object.entries(flat)) {
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    (out[key.slice(0, sep)] ??= {})[key.slice(sep + 1)] = count;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/ping-worker-dl.test.js` — Expected: PASS.
Then run the full suite: `npm run test:unit` — Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/src/dl.js test/unit/ping-worker-dl.test.js
git commit -m "feat(ping-worker): pure /dl target resolution + counter key logic"
```

### Task 3: Full `/dl` handler — resolve, count, redirect

**Files:**
- Modify: `cloudflare/ping-worker/src/index.js`

**Interfaces:**
- Consumes: `DL_TARGETS`, `pickAsset`, `dlCountKey` from `./dl.js`; existing `bump(kv, key)` and `dayBucket(d)` in index.js.
- Produces: `GET /dl/<target>` behavior relied on by the site (Task 5) and KV keys `dl:<day>:<target>` read by Task 4. Cache key `dlcache:release` (value `{fetchedAt, assets}` — stored WITHOUT TTL, staleness judged by `fetchedAt`).

- [ ] **Step 1: Add the import and handler**

At the top of `src/index.js`:

```js
import { DL_TARGETS, pickAsset, dlCountKey } from './dl.js';
```

Above `export default`, replacing nothing (the Task 1 stub dispatch gets replaced in Step 2):

```js
const RELEASE_CACHE_KEY = 'dlcache:release';
const RELEASE_CACHE_FRESH_MS = 10 * 60 * 1000;

// Resolve the latest release's assets, KV-cached. The cache entry is stored
// WITHOUT a TTL and carries its own fetchedAt: when GitHub is unreachable or
// rate-limits (unauthenticated Workers egress IPs are shared, 60 req/hr/IP),
// a stale entry keeps /dl serving artifacts instead of dumping every click
// on the releases page.
async function latestReleaseAssets(env, now) {
  let cached = null;
  try {
    cached = JSON.parse((await env.PINGS.get(RELEASE_CACHE_KEY)) ?? 'null');
  } catch { /* corrupt cache reads as absent */ }
  if (cached && now.getTime() - cached.fetchedAt < RELEASE_CACHE_FRESH_MS) return cached.assets;
  try {
    const res = await fetch('https://api.github.com/repos/bnfy/blanc/releases/latest', {
      headers: { 'User-Agent': 'blanc-ping-worker', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const release = await res.json();
    const assets = (release.assets ?? [])
      .map((a) => ({ name: a.name, browser_download_url: a.browser_download_url }));
    if (!assets.length) throw new Error('empty asset list');
    await env.PINGS.put(RELEASE_CACHE_KEY, JSON.stringify({ fetchedAt: now.getTime(), assets }));
    return assets;
  } catch (err) {
    console.warn('release resolve failed:', err.message);
    return cached?.assets ?? null;
  }
}

// GET /dl/<target> — counted download redirect for blancbrowser.com. Bumps
// one KV counter per click (a bare count: no IP, no UA, nothing per-user)
// and 302s to the latest release artifact. ANY failure degrades to the
// releases page so a person always reaches the file; unknown targets
// redirect without counting.
async function handleDownload(request, env, ctx, now, target) {
  const redirect = (to) => new Response(null, {
    status: 302,
    headers: { Location: to, 'Cache-Control': 'no-store' },
  });
  if (!DL_TARGETS.has(target)) return redirect(RELEASES_LATEST_PAGE);
  ctx.waitUntil(
    bump(env.PINGS, dlCountKey(dayBucket(now), target))
      .catch((err) => console.error('dl count failed:', err.message))
  );
  const assets = await latestReleaseAssets(env, now);
  const asset = assets ? pickAsset(assets, target) : null;
  return redirect(asset ? asset.browser_download_url : RELEASES_LATEST_PAGE);
}
```

- [ ] **Step 2: Replace the Task 1 stub dispatch**

In `fetch()`, replace the stub `/dl/` block with:

```js
    if (request.method === 'GET' && url.pathname.startsWith('/dl/')) {
      return handleDownload(request, env, ctx, now, url.pathname.slice('/dl/'.length));
    }
```

- [ ] **Step 3: Run the unit suite** — `npm run test:unit` — Expected: PASS.

- [ ] **Step 4: Deploy (operator-gated)** — `npx wrangler deploy` from `cloudflare/ping-worker/`.

- [ ] **Step 5: Verify every target live**

```bash
for t in mac-arm64 mac-x64 win linux nonsense; do
  echo "== $t"; curl -s -o /dev/null -D - "https://blancbrowser.com/dl/$t" | grep -i '^\(HTTP\|location\)'
done
```

Expected: all 302. `mac-arm64` → `...arm64.dmg`, `win` → `...exe`, `linux` → `...AppImage`; `mac-x64` and `nonsense` → the releases/latest page (no x64 dmg exists today).

- [ ] **Step 6: Verify counting (and that `nonsense` did NOT count)**

Wait ~30 s for KV, then:
`npx wrangler kv key list --namespace-id=2c71bddea5b842d49fee1c972b70e8d9 --prefix=dl:`
Expected: exactly four keys for today (`dl:<today>:mac-arm64|mac-x64|win|linux`), none for `nonsense`.

- [ ] **Step 7: Commit**

```bash
git add cloudflare/ping-worker/src/index.js
git commit -m "feat(ping-worker): counted /dl redirects with KV-cached release resolution"
```

### Task 4: Expose `siteDownloads` in `/stats`

**Files:**
- Modify: `cloudflare/ping-worker/src/index.js` (`handleStats`)

**Interfaces:**
- Consumes: `groupDlCounts` from `./dl.js` (add to the existing import), `readMap`.
- Produces: `/stats` response gains `siteDownloads: { byDay: { 'YYYY-MM-DD': { 'mac-arm64': n, ... } } }` — consumed by the digest (Task 10).

- [ ] **Step 1: Extend the import** — `import { DL_TARGETS, pickAsset, dlCountKey, groupDlCounts } from './dl.js';`

- [ ] **Step 2: Read and attach the block in `handleStats`**

Add `readMap(env.PINGS, 'dl:')` as a ninth member of the existing `Promise.all` array (destructure as `dlFlat`). Note the prefix cannot collide with `dlcache:release` (`'dl:'` requires a colon as the third character). Then add to the `stats` object after `retention`:

```js
    siteDownloads: {
      byDay: groupDlCounts(dlFlat),
    },
```

- [ ] **Step 3: Run unit suite** — `npm run test:unit` — Expected: PASS.

- [ ] **Step 4: Deploy (operator-gated) and verify**

`npx wrangler deploy`, then (token via the digest's perl-alarm 1Password read, fallback documented there):

```bash
curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://blanc-ping.bnfy-441.workers.dev/stats" | jq '.siteDownloads'
```

Expected: today's four Task 3 probe clicks, e.g. `{"2026-08-2X": {"mac-arm64":1,"mac-x64":1,"win":1,"linux":1}}`.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/src/index.js
git commit -m "feat(ping-worker): surface /dl click counts in /stats"
```

### Task 5: Point the site at `/dl` (and stop bypassing the counter)

The current `site.js` REWRITES card hrefs to direct GitHub asset URLs — left in place it would silently bypass the counter for every JS-enabled visitor. This task makes `/dl/<target>` the one true href.

**Files:**
- Modify: `site/src/pages/download.astro:20,25,30,35` (the four `platform-card` hrefs only — leave the two prose links to GitHub releases untouched)
- Modify: `site/src/scripts/site.js:44-70` (the release-fetch block) and the CTA block

**Interfaces:**
- Consumes: live `GET /dl/<target>` (Task 3).
- Produces: counted clicks for all visitors; CTAs that no longer depend on the GitHub API.

- [ ] **Step 1: Change the four card hrefs in download.astro**

`id="dl-mac-arm64"` → `href="/dl/mac-arm64"`; `id="dl-mac-x64"` → `href="/dl/mac-x64"` (keep `hidden`); `id="dl-win"` → `href="/dl/win"`; `id="dl-linux"` → `href="/dl/linux"`. Keep every `data-*` attribute exactly as-is (GA `download_click` events stay — harmless, and their undercount vs `/dl` becomes a measurable ad-blocker rate).

- [ ] **Step 2: Rewrite the site.js release-fetch block**

Replace the whole `fetch('https://api.github.com/...')` chain (keep `pickAsset` above it — still used) with:

```js
  // The card hrefs are static /dl/<target> counted redirects and are never
  // rewritten — pointing them at direct asset URLs would bypass the edge
  // counter. The release fetch survives only to reveal/hide option cards so
  // no card ever promises an artifact the current release lacks.
  fetch('https://api.github.com/repos/bnfy/blanc/releases/latest')
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((release) => {
      links.forEach((link) => {
        if (link.parentElement !== downloadOptions) return;
        link.hidden = !pickAsset(release.assets, link.dataset.platform);
      });
    })
    .catch(() => { /* Cards keep their static hidden/visible state. */ });

  // CTAs need no release data any more: the counted redirect resolves the
  // artifact server-side. Generic 'mac' stays on /download (arm64 vs x64
  // can't be told from a UA — see pickAsset).
  if (os && os !== 'mac') {
    ctas.forEach((cta) => {
      cta.href = '/dl/' + os;
      cta.dataset.platform = os;
    });
  }
```

- [ ] **Step 3: Build and verify statically**

Run: `npm run site:build`
Then: `grep -c '"/dl/' site/dist/download/index.html` — Expected: 4.
And: `grep -c 'releases/latest' site/dist/download/index.html` — Expected: still ≥ 2 (the prose fallback links survive).

- [ ] **Step 4: Verify behavior in the dev server**

Start the site preview (launch.json `site-4331` entry if 4321 is taken), load `/download`, and confirm: visible cards link to `/dl/...`, the mac-x64 card stays hidden today, and clicking the Windows card lands on the `.exe` download via the 302.

- [ ] **Step 5: Commit**

```bash
git add site/src/pages/download.astro site/src/scripts/site.js
git commit -m "feat(site): route download clicks through counted /dl redirects"
```

### Task 6: Deploy the site and verify end-to-end (operator-gated)

**Files:** none (deploy + verification only)

- [ ] **Step 1: Deploy** — `npm run site:deploy` (production deploys are approval-gated; confirm with the operator first).
- [ ] **Step 2: Verify production deployment** — `npx wrangler pages deployment list --project-name=blancbrowser` shows the new deployment as `Production` on branch `main`.
- [ ] **Step 3: End-to-end** — fetch `https://blancbrowser.com/download` (cache-busting query if needed), confirm the served HTML carries `/dl/` hrefs; then click through one target with `curl -s -o /dev/null -D -` and re-check `/stats.siteDownloads` incremented.
- [ ] **Step 4: Record** — note in the commit/PR description that GA4 `download_click` now undercounts `/dl` clicks by exactly the blocked-visitor share, which is itself a useful number.

---

## Phase B — new installs per day from the ping

### Task 7: `markFirstSeen` module

**Files:**
- Create: `cloudflare/ping-worker/src/first-seen.js`
- Test: `test/unit/ping-worker-first-seen.test.js`

**Interfaces:**
- Consumes: caller passes the existing `bump` as `bumpFn` (avoids a circular import with index.js).
- Produces: `markFirstSeen(kv, hashedId, day, bumpFn) -> Promise<boolean>`; KV keys `first:<hashedId>` (value = first-seen bucket string, informational; NO TTL) and `new:day:<YYYY-MM-DD>` counters (NO TTL). Consumed by Tasks 8–9.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/ping-worker-first-seen.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}
async function bump(kv, key) {
  const current = parseInt((await kv.get(key)) ?? '0', 10);
  await kv.put(key, String(current + 1));
}

test('markFirstSeen', async (t) => {
  const { markFirstSeen } = await import('../../cloudflare/ping-worker/src/first-seen.js');

  await t.test('first ever ping counts the install as new and marks it', async () => {
    const kv = fakeKv();
    assert.strictEqual(await markFirstSeen(kv, 'abc123', '2026-08-28', bump), true);
    assert.strictEqual(kv.store.get('new:day:2026-08-28'), '1');
    assert.strictEqual(kv.store.get('first:abc123'), '2026-08-28');
  });

  await t.test('subsequent pings are no-ops, even on later days', async () => {
    const kv = fakeKv();
    await markFirstSeen(kv, 'abc123', '2026-08-28', bump);
    assert.strictEqual(await markFirstSeen(kv, 'abc123', '2026-08-29', bump), false);
    assert.strictEqual(kv.store.get('new:day:2026-08-29'), undefined);
    assert.strictEqual(kv.store.get('first:abc123'), '2026-08-28');
  });

  await t.test('a backfilled marker suppresses counting entirely', async () => {
    const kv = fakeKv();
    await kv.put('first:old1', '2026-07'); // coarse month value from backfill
    assert.strictEqual(await markFirstSeen(kv, 'old1', '2026-08-28', bump), false);
    assert.strictEqual(kv.store.get('new:day:2026-08-28'), undefined);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/unit/ping-worker-first-seen.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/first-seen.js`**

```js
// New-install counting: an install is "new" on the day its HASHED id is first
// ever seen. first:<id> never expires — it IS the memory that the install
// exists (value = first-seen bucket, informational only; backfill writes
// coarse month values). new:day:* counters never expire — growth history,
// same convention as active:*. Counter-before-marker ordering matches
// markActive in index.js: a crash between the two risks a one-off overcount,
// never a permanently lost count.
export async function markFirstSeen(kv, hashedId, day, bumpFn) {
  const firstKey = `first:${hashedId}`;
  if ((await kv.get(firstKey)) !== null) return false;
  await bumpFn(kv, `new:day:${day}`);
  await kv.put(firstKey, day);
  return true;
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/unit/ping-worker-first-seen.test.js`, then `npm run test:unit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/src/first-seen.js test/unit/ping-worker-first-seen.test.js
git commit -m "feat(ping-worker): first-seen marker for new-install counting"
```

### Task 8: Backfill `first:` markers for every known install — BEFORE the write path ships

Without this, every existing install's next ping after deploy would count as "new" and the first days of the series would be garbage. Every active install has `seen:month:*` markers (400-day TTL; `markActive` writes day+week+month together), so months are a complete roster; day markers (90-day TTL) refine recency. Week markers can be ignored. Historical `new:day` counters are NOT reconstructed — the series is forward-accurate from deploy day (YAGNI; monthly history remains derivable from month markers if ever wanted).

**Files:**
- Create: `cloudflare/ping-worker/scripts/backfill-first-seen.mjs`
- Test: `test/unit/ping-worker-backfill-first-seen.test.js`

**Interfaces:**
- Consumes: `wrangler kv key list` / `wrangler kv bulk put` (cached-OAuth), namespace `2c71bddea5b842d49fee1c972b70e8d9`.
- Produces: one `first:<hashedId>` key per known install; exported pure `earliestBucketById(keyNames) -> Map<string,string>` for the test.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/ping-worker-backfill-first-seen.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('earliestBucketById', async () => {
  const { earliestBucketById } =
    await import('../../cloudflare/ping-worker/scripts/backfill-first-seen.mjs');
  const m = earliestBucketById([
    'seen:month:2026-08:aaa',
    'seen:month:2026-07:aaa',
    'seen:day:2026-08-25:aaa',
    'seen:day:2026-08-25:bbb',
    'seen:month:2026-08:bbb',
    'seen:week:2026-W35:ccc', // week-only ids are skipped (months are the roster)
  ]);
  assert.strictEqual(m.get('aaa'), '2026-07'); // earliest month beats later day
  assert.strictEqual(m.get('bbb'), '2026-08'); // 'YYYY-MM' sorts before 'YYYY-MM-DD'
  assert.strictEqual(m.has('ccc'), false);
  assert.strictEqual(m.size, 2);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/unit/ping-worker-backfill-first-seen.test.js` — Expected: FAIL.

- [ ] **Step 3: Implement the script**

```js
// cloudflare/ping-worker/scripts/backfill-first-seen.mjs
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
// every install also carries month markers.
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
```

- [ ] **Step 4: Run tests** — `node --test test/unit/ping-worker-backfill-first-seen.test.js`, then `npm run test:unit` — Expected: PASS.

- [ ] **Step 5: Run the backfill (operator-gated — it writes production KV)**

Run: `node cloudflare/ping-worker/scripts/backfill-first-seen.mjs`
Expected: "writing N first: markers" with N ≈ the all-time unique-install count (monthly actives suggest low hundreds; if N is 0 or wildly off, STOP and investigate before deploying Task 9).
Verify: `npx wrangler kv key list --namespace-id=2c71bddea5b842d49fee1c972b70e8d9 --prefix=first: | jq length` equals N. Delete the generated `first-seen-bulk.json` (it holds only hashed ids, but it's scratch — don't commit it).

- [ ] **Step 6: Commit**

```bash
git add cloudflare/ping-worker/scripts/backfill-first-seen.mjs test/unit/ping-worker-backfill-first-seen.test.js
git commit -m "feat(ping-worker): backfill first-seen markers from existing seen keys"
```

### Task 9: Wire `markFirstSeen` into the ping path and expose `newInstalls` in `/stats`

Deploy ONLY after Task 8's backfill has verified — the gap between backfill and deploy means a genuinely-new install pinging in between counts on its next ping instead; acceptable and self-correcting.

**Files:**
- Modify: `cloudflare/ping-worker/src/index.js` (`handlePing` work array + `handleStats`)

**Interfaces:**
- Consumes: `markFirstSeen` from `./first-seen.js`; existing `bump`, `dayBucket`, `readMap`, `pickRecent`.
- Produces: `/stats` gains `newInstalls: { byDay: { 'YYYY-MM-DD': n } }` (last 60 days) — consumed by the digest (Task 10).

- [ ] **Step 1: Import and wire the write path**

Add `import { markFirstSeen } from './first-seen.js';` at the top. In `handlePing`, inside the existing `if (hashedId)` block, add as the first pushed entry:

```js
      markFirstSeen(env.PINGS, hashedId, dayBucket(now), bump),
```

(Cost: one KV read per install per launch-day at most — the `event:` dedup and `markActive` reads already dwarf it.)

- [ ] **Step 2: Extend `handleStats`**

Add `readMap(env.PINGS, 'new:day:')` to the `Promise.all` (destructure as `newByDay`; the prefix cannot collide — no other key family starts `new:`), and add to the `stats` object:

```js
    newInstalls: {
      byDay: pickRecent(newByDay, 60),
    },
```

- [ ] **Step 3: Run unit suite** — `npm run test:unit` — Expected: PASS.

- [ ] **Step 4: Deploy (operator-gated) and verify**

`npx wrangler deploy`, then curl `/stats` (as in Task 4): Expected: `newInstalls.byDay` present (likely `{}` on day one — every backfilled install is suppressed; a nonzero same-day count would mean the backfill missed installs).
Next-day check: `newInstalls.byDay` shows a small plausible number, and it must NOT approximate the day's whole DAU (that would mean backfill failure).

- [ ] **Step 5: Commit**

```bash
git add cloudflare/ping-worker/src/index.js
git commit -m "feat(ping-worker): count new installs per day, expose in /stats"
```

### Task 10: Teach the daily digest both new metrics

Only after Tasks 4 and 9 are live. The digest task file is `/Users/anthonyjloria/.claude/scheduled-tasks/blanc-daily-analytics/SKILL.md` (not in this repo — edit in place, no commit).

**Files:**
- Modify: `/Users/anthonyjloria/.claude/scheduled-tasks/blanc-daily-analytics/SKILL.md`

- [ ] **Step 1: Add to section 1's extraction list**

After the `launches.byPlatform` paragraph (added 2026-08-27), append:

```
Also extract `newInstalls.byDay` (yesterday's value = new installs — the
growth headline; valid on release days too, unlike GitHub deltas) and
`siteDownloads.byDay` (yesterday's per-target download clicks counted at
blancbrowser.com/dl/* — un-blockable, auto-update-free). Report both in the
digest table. If `newInstalls.byDay` for yesterday is absent, report 0 —
absent means no counter was written, i.e. no new installs. On days when both
are healthy, the GitHub download delta becomes corroboration only.
```

- [ ] **Step 2: Add both to the push-notification guidance in section 5** — the title's headline number becomes new installs when nonzero: `"Blanc daily: <N> new installs, <N> DAU"`.

- [ ] **Step 3: Verify** — re-read the edited sections; confirm next morning's digest reports both rows sanely.

---

## Self-review notes

- **Spec coverage:** edge counting (Tasks 1–6), new-installs (7–9), digest consumption (10). GA4 is deliberately untouched (decision: don't proxy analytics on a privacy browser's site).
- **Fallback path:** Task 1 Step 4 carries the Pages-Function plan B with the exact KV namespace id.
- **Type consistency:** `pickAsset`/`dlCountKey`/`groupDlCounts` (dl.js), `markFirstSeen(kv, hashedId, day, bumpFn)`, `earliestBucketById(keyNames)` — names match across tasks.
- **Known accepted noise:** `/dl` counts bots/prefetchers that issue GETs; monitor and add a `Purpose: prefetch`/UA filter only if the series looks inflated. HEAD requests 404 (uncounted) by design.
