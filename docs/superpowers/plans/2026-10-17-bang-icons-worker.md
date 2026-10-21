# Bang Icons Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker at `blanc.day/bang-icons/<host>` that serves a cached icon for every host in Blanc's pinned bang list, so the redesigned `/bangs` page can show real site icons without the visitor's browser contacting anyone but blanc.day.

**Architecture:** The site publishes the allowed hosts as `site/public/bang-hosts.json` (written by the existing bang data generator). A new dependency-free Worker routed like `blanc-ping`'s `/dl/*` reads that list, refuses everything else, and on a cache miss looks for the site's own declared icon, then `/favicon.ico`, then DuckDuckGo's icon service. It keeps each result (or a miss) in one KV namespace and serves only sniffed raster bytes with locked-down headers. It does not resize: the page draws every icon at a fixed size, and the byte cap bounds the weight; resizing through Cloudflare's Images binding can come later if icons prove heavy. This is PR 2 of three in the design's *Order of work*; the page redesign is `docs/superpowers/plans/2026-10-17-bangs-page-redesign.md`.

**Tech Stack:** Cloudflare Workers (ES modules, no npm dependencies), Workers KV, wrangler; Node `node:test` unit tests with a fake KV and a stubbed `fetch`, as `test/unit/newsletter-worker.test.js` does.

**Spec:** `docs/superpowers/specs/2026-10-17-bangs-page-redesign-design.md` (sections *Icons*, *Where the icons come from*, *Privacy and policy*, decisions 4 to 7).

## Before you start

- The bang-chip change (PR 1, on `claude/bangs-prompt-chip-styling-48a7b1`) is merged to `main`. Branch this work from `main`.
- Every production action (creating the KV namespace, deploying the Worker, deploying the site, buying or changing a Cloudflare plan, console rules) needs the owner's explicit go-ahead at the time. Cloudflare console clicks are the owner's.

## Global Constraints

- Route only `blanc.day/bang-icons/*` and `www.blanc.day/bang-icons/*`; `workers_dev = false`.
- Answer only for hosts in `https://blanc.day/bang-hosts.json` that are not on the hold-back list; everything else is a 404. Never fetch an address a request names.
- Upstream fetches: no cookies, no `Referer`, `redirect: 'manual'`, at most 3 redirects, every hop through `isPublicUrl`, 5,000 ms timeout per fetch, HTML read capped at 262,144 bytes, image body capped at 102,400 bytes.
- Serve only bytes whose magic number is PNG, JPEG, GIF, WebP or ICO, with that sniffed type as `Content-Type`. Never SVG, never the upstream `Content-Type`.
- Every response carries `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Cross-Origin-Resource-Policy: same-site`.
- KV: a hit is kept 30 days (`expirationTtl: 2592000`), a miss 1 day (`86400`). Browser caching: hits `public, max-age=604800`, misses `public, max-age=86400`.
- Store nothing about visitors; Workers observability stays off.
- DuckDuckGo's service is `https://icons.duckduckgo.com/ip3/<host>.ico`.
- US spelling in code comments and docs.

## Review Focus

- A site that answers its icon URL with an HTML error page and status 200: must be a miss, not served. (Task 2 test `sniffImageType rejects HTML and SVG`; Task 4 test `a 200 HTML page is never served as an icon`.)
- A homepage that redirects to `http://127.0.0.1/`, `http://10.0.0.5/`, a `.local` name or `:8080`: refused at the hop. (Task 3 test `a redirect into a private address is refused`.)
- An icon larger than the cap, or a body that never ends: abandoned at 102,400 bytes or 5 s. (Task 3 test `an oversized icon is refused`.)
- `bang-hosts.json` unreachable when the Worker cold-starts: a 503 with `no-store`, never a cached 404 that hides a real host for a day. (Task 4 test `an unreachable host list answers 503 and caches nothing`.)
- Path tricks: `/bang-icons/`, `/bang-icons/WWW.YOUTUBE.COM`, `/bang-icons/www.youtube.com/../x`, `/bang-icons/www.youtube.com?x=1`: only the exact lowercase host form is served; query strings are ignored. (Task 2 test `hostFromPath accepts only one lowercase host`.)

---

### Task 1: Publish the allowed hosts from the bang data generator

**Files:**
- Modify: `site/scripts/build-bangs-data.mjs` (add an output beside `OUT_JSON`)
- Create (generated): `site/public/bang-hosts.json`
- Modify: `.gitattributes` (add `/site/public/bang-hosts.json text eol=lf` to the "/bangs page's pinned copies" block)
- Test: `test/unit/site-bangs-data.test.js`

**Interfaces:**
- Produces: `renderHosts(data) -> string` exported from `build-bangs-data.mjs`; the file `site/public/bang-hosts.json` with shape `{ "ref": string, "release": string|null, "count": number, "hosts": string[] }`, `hosts` being the sorted, de-duplicated, lowercase values of `entries[i][3]` (8,910 at v1.36.0). Task 4's Worker reads exactly this shape.

- [ ] **Step 1: Write the failing tests** in `test/unit/site-bangs-data.test.js`:
  - `the bang host list is every host in the data, once, sorted`: parse `site/public/bang-hosts.json`; assert `hosts` equals `[...new Set(data.entries.map((e) => e[3].toLowerCase()))].sort()`, `count === hosts.length`, `ref === data.ref`, `release === data.release`, and every host matches `/^[a-z0-9.-]+$/`.
  - Extend `the byte-checked bangs page files keep LF line endings on every checkout` to include `site/public/bang-hosts.json`.
- [ ] **Step 2: Run** `node --test test/unit/site-bangs-data.test.js`. Expected: FAIL (file missing).
- [ ] **Step 3: Implement** `renderHosts(data)` (JSON with two-space indent and a trailing newline, like `bangs.json`) and write it from `buildOutputs`, so `--check` compares it too. Add the `.gitattributes` line.
- [ ] **Step 4: Regenerate and run.** `npm run site:bangs` (reuses the pinned ref), then `npm run site:bangs:check` and `node --test test/unit/site-bangs-data.test.js`. Expected: both pass; `git diff --stat` shows only the generator, the new JSON, `.gitattributes` and the test.
- [ ] **Step 5: Commit** `git add site/scripts/build-bangs-data.mjs site/public/bang-hosts.json .gitattributes test/unit/site-bangs-data.test.js && git commit -m "Publish the bang host list for the icon server"`

### Task 2: Pure rules: paths, public addresses, image sniffing, icon candidates

**Files:**
- Create: `cloudflare/bang-icons-worker/package.json` (`{ "name": "blanc-bang-icons-worker", "private": true, "type": "module" }`)
- Create: `cloudflare/bang-icons-worker/src/rules.js`
- Test: `test/unit/bang-icons-worker.test.js` (CommonJS, importing the ESM modules with `await import(pathToFileURL(...))` as `newsletter-worker.test.js` does)

**Interfaces:**
- Produces, all from `src/rules.js`:
  - `LIMITS = { htmlBytes: 262144, imageBytes: 102400, redirects: 3, timeoutMs: 5000 }`
  - `hostFromPath(pathname: string) -> string|null`: `/bang-icons/<host>` with `<host>` matching `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/`, else `null`.
  - `isPublicUrl(url: URL) -> boolean`: `http:`/`https:` only; no username or password; port `''`, `'80'` or `'443'`; hostname not an IPv4 or IPv6 literal, not `localhost`, and not ending in `.localhost`, `.local`, `.internal`, `.home.arpa` or `.lan`.
  - `sniffImageType(bytes: Uint8Array) -> 'image/png'|'image/jpeg'|'image/gif'|'image/webp'|'image/x-icon'|null` by magic number (PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; GIF `GIF87a`/`GIF89a`; WebP `RIFF????WEBP`; ICO `00 00 01 00`).
  - `iconCandidates(html: string, pageUrl: string) -> string[]`: absolute http(s) URLs from `<link>` tags whose `rel` tokens include `icon`, `apple-touch-icon` or `apple-touch-icon-precomposed` (never `mask-icon`), skipping `type="image/svg+xml"` and hrefs ending in `.svg`; resolved against `pageUrl`; ordered by declared size (the largest number in `sizes`; `apple-touch-icon*` without `sizes` counts as 180, `icon` without `sizes` as 32): sizes ≥ 64 ascending first, then smaller ones descending; then `<origin>/favicon.ico`; de-duplicated.

- [ ] **Step 1: Write the failing tests** (one `test()` each):
  - `hostFromPath accepts only one lowercase host`: `'/bang-icons/www.youtube.com'` → `'www.youtube.com'`; `null` for `'/bang-icons/'`, `'/bang-icons/WWW.YOUTUBE.COM'`, `'/bang-icons/www.youtube.com/x'`, `'/bang-icons/..'`, `'/bang-icons/localhost'`, `'/other/www.youtube.com'`.
  - `isPublicUrl refuses private and odd destinations`: `true` for `https://www.youtube.com/` and `http://example.org:80/`; `false` for `ftp://example.org/`, `https://user:pw@example.org/`, `https://example.org:8443/`, `http://127.0.0.1/`, `http://10.0.0.5/`, `http://[::1]/`, `http://localhost/`, `http://printer.local/`, `http://nas.lan/`.
  - `sniffImageType rejects HTML and SVG`: the five magic numbers map to their types; `'<!doctype html>'` bytes, `'<svg xmlns='` bytes and an empty array give `null`.
  - `iconCandidates prefers a sharp declared icon and ends with favicon.ico`: for HTML holding `icon sizes=16x16 /16.png`, `icon sizes=192x192 /192.png`, `apple-touch-icon /touch.png`, `mask-icon /m.svg`, `icon type=image/svg+xml /i.svg`, `shortcut icon //cdn.example.org/s.ico` on `https://example.org/a/`, expect exactly `['https://example.org/touch.png', 'https://example.org/192.png', 'https://cdn.example.org/s.ico', 'https://example.org/16.png', 'https://example.org/favicon.ico']`.
- [ ] **Step 2: Run** `node --test test/unit/bang-icons-worker.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/rules.js`.** `iconCandidates` parses `<link …>` tags with a tag regex and an attribute regex (no HTML parser dependency; it only proposes URLs that later pass `isPublicUrl` and `sniffImageType`).
- [ ] **Step 4: Run** `node --test test/unit/bang-icons-worker.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `git add cloudflare/bang-icons-worker test/unit/bang-icons-worker.test.js && git commit -m "Bang icons: path, address, image and candidate rules"`

### Task 3: Finding an icon: capped fetches, the site first, then DuckDuckGo

**Files:**
- Create: `cloudflare/bang-icons-worker/src/find-icon.js`
- Test: `test/unit/bang-icons-worker.test.js`

**Interfaces:**
- Consumes: everything in Task 2's `rules.js`.
- Produces:
  - `fetchCapped(url: string, { limit: number, truncate: boolean, fetchImpl }) -> Promise<{ status: number, bytes: Uint8Array, finalUrl: string } | null>`: follows up to `LIMITS.redirects` redirects manually, returns `null` if any hop fails `isPublicUrl`, the timeout fires, or (when `truncate` is false) the body passes `limit`. With `truncate: true` it stops reading at `limit` and returns what it has. Sends `Accept` and `User-Agent: BlancIconFetcher/1.0 (+https://blanc.day/bangs)` only.
  - `findIcon(host: string, fetchImpl = fetch) -> Promise<{ bytes: Uint8Array, type: string, source: 'site'|'duckduckgo' } | null>`: fetches `https://<host>/` as HTML (truncated at `LIMITS.htmlBytes`), tries `iconCandidates` in order (at most 4 image fetches, each at `LIMITS.imageBytes`, status 200 and `sniffImageType` non-null), then `https://icons.duckduckgo.com/ip3/<host>.ico` under the same rules; `null` if nothing passes. If the homepage itself fails, it still tries `https://<host>/favicon.ico` and DuckDuckGo.

- [ ] **Step 1: Write the failing tests** with a stub `fetchImpl` that serves a map of URL → `Response` (and records calls):
  - `the site's declared icon wins`: homepage declares `apple-touch-icon /t.png`; `/t.png` serves PNG bytes → `{ source: 'site', type: 'image/png' }`, DuckDuckGo never called.
  - `favicon.ico, then DuckDuckGo, when the site declares nothing usable`: homepage declares only an SVG; `/favicon.ico` 404 → the DuckDuckGo ICO is returned with `source: 'duckduckgo'`.
  - `a redirect into a private address is refused`: homepage 302 → `http://10.0.0.5/`; no request is ever made to `10.0.0.5`, and the result comes from `/favicon.ico` or DuckDuckGo.
  - `an oversized icon is refused`: a 102,401-byte PNG body is skipped, the next candidate is used.
  - `nothing usable is a miss`: every fetch 404 → `null`.
- [ ] **Step 2: Run** `node --test test/unit/bang-icons-worker.test.js`. Expected: the five new tests FAIL.
- [ ] **Step 3: Implement `src/find-icon.js`.** Read bodies through the stream reader, counting bytes; use `AbortSignal.timeout(LIMITS.timeoutMs)` per request.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `git add cloudflare/bang-icons-worker/src/find-icon.js test/unit/bang-icons-worker.test.js && git commit -m "Bang icons: find a site's icon, then DuckDuckGo's"`

### Task 4: The Worker: allowlist, hold-back list, KV cache, headers

**Files:**
- Create: `cloudflare/bang-icons-worker/src/hosts.js`, `cloudflare/bang-icons-worker/src/index.js`, `cloudflare/bang-icons-worker/src/held-back.json`
- Create: `cloudflare/bang-icons-worker/wrangler.toml`
- Test: `test/unit/bang-icons-worker.test.js`

**Interfaces:**
- Consumes: `hostFromPath` (Task 2), `findIcon` (Task 3), Task 1's `bang-hosts.json` shape.
- Produces:
  - `allowedHosts(env, fetchImpl = fetch) -> Promise<Set<string>>` in `src/hosts.js`: fetches `env.HOSTS_URL`, keeps the set in module scope for 600,000 ms, throws if the fetch fails or the JSON lacks a `hosts` array.
  - `src/held-back.json`: `{ "reviewed": "YYYY-MM-DD", "hosts": [] }` (filled in Task 5).
  - `createWorker({ heldBack = heldBackJson.hosts, findIconImpl = findIcon } = {}) -> { fetch(request, env, ctx) }` and `export default createWorker()` in `src/index.js`, with KV binding `ICONS`, key `icon:<host>`, value the image bytes with metadata `{ type, source, fetchedAt }`, or an empty value with metadata `{ miss: true }`.
  - `wrangler.toml`: `name = "blanc-bang-icons"`, `main = "src/index.js"`, `compatibility_date = "2026-10-01"`, `workers_dev = false`, the two routes from *Global Constraints* with `zone_name = "blanc.day"`, `kv_namespaces = [{ binding = "ICONS", id = "<set in Task 6>" }]`, `[vars] HOSTS_URL = "https://blanc.day/bang-hosts.json"`, `[observability] enabled = false`.

- [ ] **Step 1: Write the failing tests** against the default export, with a `FakeKV` that stores `ArrayBuffer` values and metadata (`get(key, { type: 'arrayBuffer' })`, `getWithMetadata`, `put(key, value, { expirationTtl, metadata })`), a `ctx` whose `waitUntil` collects promises, and a stubbed global `fetch`:
  - `a known host is fetched once, then served from KV`: first request 200 `image/png` with the security headers and `Cache-Control: public, max-age=604800`; KV `put` used `expirationTtl: 2592000`; a second request makes no upstream fetch.
  - `an unknown or held-back host is a 404 without fetching anything`: a host absent from the list, and one passed in `createWorker({ heldBack: [...] })`, both 404 with no upstream call.
  - `a miss is remembered for a day`: `createWorker({ findIconImpl: async () => null })` gives 404 with `Cache-Control: public, max-age=86400`, KV `put` with `expirationTtl: 86400` and `{ miss: true }`; a second request makes no upstream fetch.
  - `a 200 HTML page is never served as an icon`: every candidate answers 200 `text/html` → 404.
  - `an unreachable host list answers 503 and caches nothing`: `HOSTS_URL` fetch fails → 503, `Cache-Control: no-store`, no KV writes.
  - `only GET and HEAD`: `POST` → 405.
- [ ] **Step 2: Run** the tests. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `hosts.js`, `index.js`, `wrangler.toml` and an empty `held-back.json`. KV writes go through `ctx.waitUntil`. HEAD returns the GET headers with no body.
- [ ] **Step 4: Run** `node --test test/unit/bang-icons-worker.test.js` and `npm run lint`. Expected: PASS, no lint warnings (`cloudflare/**/src` is already in the lint scope).
- [ ] **Step 5: Commit** `git add cloudflare/bang-icons-worker test/unit/bang-icons-worker.test.js && git commit -m "Bang icons Worker: allowlist, cache and headers"`

### Task 5: The reviewed hold-back list, a coverage check, and the README

**Files:**
- Modify: `cloudflare/bang-icons-worker/src/held-back.json`
- Create: `cloudflare/bang-icons-worker/scripts/check-icons.mjs`
- Create: `cloudflare/bang-icons-worker/README.md`
- Test: `test/unit/bang-icons-worker.test.js`

**Interfaces:**
- Consumes: Task 1's `site/public/bang-hosts.json`, `site/src/data/bangs.json` (`popular`, `entries`).
- Produces: `node cloudflare/bang-icons-worker/scripts/check-icons.mjs [--origin=https://blanc.day] [--popular]` which requests `/bang-icons/<host>` for the 19 popular hosts (`--popular`) or a given list, prints each status and type, and exits non-zero unless every popular host returns 200 with an image type.

- [ ] **Step 1: Write the failing test** `the hold-back list is reviewed and names only real bang hosts`: `held-back.json` has a `reviewed` date in `YYYY-MM-DD` form and at least one host, every host appears in `site/public/bang-hosts.json`, and none is a popular host.
- [ ] **Step 2: Run** the test. Expected: FAIL (empty list).
- [ ] **Step 3: Draft the list.** Scan `site/src/data/bangs.json` entries whose name or host contains any of `booru`, `porn`, `xxx`, `hentai`, `nsfw`, `rule34`, `e621`, `e-hentai`, `xvideos`, `xhamster`, `onlyfans`, `chaturbate`, `fapello`, `motherless`, `redtube`, `youporn`, `spankbang`, `literotica`, `f95zone`, then read the names of the rest of the hits by hand and add any adult or shock site the scan surfaced nearby. Write their hosts, sorted, with today's date as `reviewed`. The owner approves the list in the PR review; record that in the PR description.
- [ ] **Step 4: Write `check-icons.mjs` and the README.** The README covers: what the Worker does and refuses; creating the KV namespace (`npx wrangler kv namespace create ICONS`) and pasting its id; deploy (`npx wrangler deploy` from the Worker folder); that `bang-hosts.json` must be live on blanc.day first; the coverage check; how to pull an icon (add the host to `held-back.json`, redeploy, then delete its `icon:<host>` key with `npx wrangler kv key delete --binding ICONS icon:<host>`); and the owner's console items: the Workers Paid plan, a billing notification, and a rate rule on `blanc.day/bang-icons/*`.
- [ ] **Step 5: Run** `node --test test/unit/bang-icons-worker.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** `git add cloudflare/bang-icons-worker test/unit/bang-icons-worker.test.js && git commit -m "Bang icons: reviewed hold-back list, coverage check and runbook"`

### Task 6: Open the PR, then deploy and check (owner go-ahead at each step)

**Files:**
- Modify: `cloudflare/bang-icons-worker/wrangler.toml` (the real KV id)

- [ ] **Step 1: Full checks.** `npm run test:unit`, `npm run lint`, `npm run substrate:check`. Expected: all pass. Open the PR (Worker + host list). The PR touches `site/public/`, `cloudflare/` and `test/unit/`, so it is not website-only and every CI job runs.
- [ ] **Step 2: After merge, with the owner's go-ahead:** confirm the BNFY account is on Workers Paid (the owner upgrades in the dashboard if not); create the KV namespace; commit its id to `wrangler.toml` in a small follow-up PR or in the merged branch before merge (builder's call).
- [ ] **Step 3: With the owner's go-ahead:** deploy the site so `https://blanc.day/bang-hosts.json` is live (`npm run site:deploy` from a clean checkout of `main`, then confirm the Production deployment's source SHA as `site/CLAUDE.md` describes); then `npx wrangler deploy` in `cloudflare/bang-icons-worker`.
- [ ] **Step 4: Check.** `curl -sI https://blanc.day/bang-icons/www.youtube.com` → 200 `image/…` with the three security headers; `curl -sI https://blanc.day/bang-icons/not-a-bang.example` → 404; `node cloudflare/bang-icons-worker/scripts/check-icons.mjs --popular` → exit 0. If a popular host fails, fix it in `find-icon.js` (a new candidate rule or source), never by shipping icon files.
- [ ] **Step 5: Owner console items** from the README (billing notification, rate rule). Record the deployment, the check output and the console items in the PR or its follow-up.
