# Continue Past Certificate Warnings on Local Addresses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner prefers inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user continue past a certificate warning on a local or private-network `https:` address for the rest of the session, with the warning state bound to the loaded document (bnfy/blanc#544).

**Architecture:** A pure, main-process-only exception store keyed by `Session` object and origin decides eligibility and matches later requests by origin, fingerprint, error and a validity snapshot. The tab's `certificate-error` handler consults it; a pure commit-time function derives the document's "Not secure" record, which follows the document through Reopen Closed Tab adoption. The error page gets an Advanced disclosure with an argument-free IPC; the island gets a `certificate-exception` state and a Stop allowing action.

**Tech Stack:** Electron 44.5.1 main process (CommonJS), `node --test` unit tests, Cucumber + Playwright-Electron desktop acceptance, the `browser-api` contract checker.

**Spec:** `docs/superpowers/specs/2026-10-05-certificate-continue-local-design.md` (revision 3, approved 2026-10-05; Task 1 adds the per-entry addendum approved with plan revision 2). Read it first; this plan argues from it.

**Plan revision 2 (2026-10-05):** replaced the origin-wide `continuedOrigins` + observer rule, which could label a restored unsafe document secure after a trusted load on the same host, with per-history-entry marks (Task 3b). Electron 44's `NavigationEntry` exposes only `url`, `title` and `pageState`, with no stable entry id, so Blanc mirrors the entry list by position and resolves every ambiguity toward Not secure.

## Global Constraints

- Hosts eligible: `https:` only, and `isLocalNetworkHost(hostname)` true (spec §3.1). Public hosts keep today's page byte-for-byte.
- Errors eligible (allowlist, compared after stripping `net::`): `ERR_CERT_AUTHORITY_INVALID`, `ERR_CERT_COMMON_NAME_INVALID`, `ERR_CERT_SELF_SIGNED_LOCAL_NETWORK`, `ERR_CERT_DATE_INVALID`, `ERR_CERT_WEAK_SIGNATURE_ALGORITHM`, `ERR_CERT_VALIDITY_TOO_LONG`, `ERR_CERT_NON_UNIQUE_NAME`. Never `ERR_CERT_INVALID`, never `ERR_CERT_REVOKED`.
- A host that passed verification earlier in this run is ineligible (spec §3.3).
- Exceptions live only in memory, per `Session` object; never persisted, synced, sent over IPC, written to `session.json`, or logged.
- Per-session cap: 64 origins; eviction calls `onEvict(session)` → `session.closeAllConnections()`.
- `setCertificateVerifyProc` keeps returning `-3`. Never call `callback(true)` without `event.preventDefault()` first.
- The error page never decides eligibility and never names a URL or fingerprint over IPC.
- User-visible copy (exact): panel text and link per spec §4.3; site-info title "Not secure"; summary "You chose to continue even though this site's certificate isn't trusted. Blanc will warn you again after it restarts."; island hint "you continued past a certificate warning"; button "Stop allowing".
- Do not claim parity with Chrome's HSTS rule anywhere (spec §3.3).
- The not-secure mark belongs to a navigation-history entry, never to an origin or a session-wide verification record. When Blanc cannot tell which entry committed, it keeps the mark (fails toward Not secure).
- Policy guards change in the same commit as the behavior they pin (`test/unit/site-security.test.js`, the F39 acceptance step).
- Work happens in the worktree `.claude/worktrees/cert-continue` on branch `spec/certificate-continue-local` (rename to `feat/certificate-continue-local` before opening the PR). Run `npm ci` there first: the worktree has no `node_modules` and `npm ci` also regenerates the ignored adblock seed some unit tests need.
- CSS in stylesheets, not inline styles. Hairline `:focus-visible` on new controls, no thick rings.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/main/site-security.js` | modify | `isLocalNetworkHost`; observer's verified-this-run set; `certificateErrorQuery({ canContinue })`; `buildSiteInfo` `certificate-exception` state |
| `src/main/certificate-exceptions.js` | create | Pure store, eligibility, validity snapshot |
| `src/main/certificate-history.js` | create | Pure per-history-entry marks: which entries loaded past a warning |
| `src/main/tab-view.js` | modify | `certificate-error` allow path; commit-time recompute in `did-navigate` |
| `src/main/closed-tabs.js` | modify | Carry the document record in the entry `seed` |
| `src/main/main.js` | modify | Store instance + wiring; tab defaults; site-info input; continue + forget handlers; profile `clear`; `pageSurfaces.owns` for `error` |
| `src/main/pages.js` | modify | `pages:error:continue-unsafe` handler |
| `src/main/tab-preload.js` | modify | `errorPage.continueUnsafe` for host `error` |
| `src/main/preload.js` | modify | `siteInfoForgetCertificateException` |
| `src/renderer/pages/error.js`, `pages.css` | modify | Advanced disclosure, built only when `continue=1` |
| `src/renderer/overlay.js`, `renderer.js`, `styles.css` | modify | `certificate-exception` glyph, hint, Stop allowing |
| `browser-api/bridges.json`, `browser-api/contract.json`, `browser-api/generated/*` | modify | Contract entries (generated files via `npm run browser-api:build`) |
| `src/main/test-hook.js` | modify | Test-only cap setter and continue/forget drivers |
| `test/desktop/support/{hooks,context,fixtures-server}.js`, `world.js` | modify | `nas.home.arpa` fixture with swappable certificate and a same-origin script |
| `test/desktop/steps/site-certificate-safety.steps.js`, `test/desktop/cucumber.mjs` | modify | New steps; runnable ids |
| `spec/features.md`, `spec/acceptance/site-certificate-safety.feature` | modify | F39 contract and scenarios |
| `test/unit/site-security.test.js`, `test/unit/certificate-exceptions.test.js` (new), `test/unit/certificate-history.test.js` (new), `test/unit/closed-tabs.test.js` | modify/create | Unit coverage |

---

### Task 0: Worktree setup

- [ ] **Step 1: Install dependencies in the worktree**

Run (from `.claude/worktrees/cert-continue`): `npm ci`
Expected: completes; `ls src/main/assets/adblock-engine-seed.bin` exists.

- [ ] **Step 2: Baseline the suites before any change**

Run: `npm run test:unit 2>&1 | tail -5` and `npm run browser-api:check 2>&1 | tail -3`
Expected: both pass. Record the unit test count; later tasks compare against it. If anything already fails, stop and compare against `origin/main` before blaming this work (see memory "Local acceptance env failures").

---

### Task 1: Ratify the contract in `spec/` (spec-first)

**Files:**
- Modify: `spec/features.md:896-899`
- Modify: `spec/acceptance/site-certificate-safety.feature`
- Modify: `docs/superpowers/specs/2026-10-05-certificate-continue-local-design.md` (two corrections found while planning)

**Interfaces:** Produces scenario ids `@F39-1` (existing, retitled), `@F39-2`…`@F39-6` used by Task 8.

- [ ] **Step 1: Replace F39 in `spec/features.md`**

Replace the two bullet lines under `## F39 — Certificate safety` with:

```markdown
- Invalid certificates are rejected with a safety interstitial and certificate
  problem details.
- **Public sites:** no way past the warning is offered.
- **Local and private-network `https:` addresses** (loopback, RFC 1918,
  link-local, 100.64.0.0/10, IPv6 unique-local and link-local, single-label
  names, `.local`, `.lan`, `.internal`, `.home.arpa`): an **Advanced**
  disclosure offers **Continue to <host:port> (unsafe)** for an allowlisted set
  of certificate errors (untrusted issuer, name mismatch, local self-signed,
  date, weak signature, validity too long, non-unique name). Revoked and
  generic-invalid certificates, and hosts already verified as trusted during
  the current run, keep the hard stop.
- The choice lasts until the app quits, is never stored or synced, and applies
  only to that origin and that exact certificate while its validity status is
  unchanged. Private browsing keeps its own, separate choices.
- A page loaded after continuing reports **Not secure** until that document is
  replaced, even if the choice is later withdrawn; **Stop allowing** withdraws
  it.
- This does not reproduce Chromium's HSTS refusal: platforms that cannot read
  the engine's HSTS state must not claim it.
```

- [ ] **Step 2: Rewrite the acceptance feature**

Replace the whole of `spec/acceptance/site-certificate-safety.feature` with:

```gherkin
Feature: Certificate safety

  @desktop @F39-1
  Scenario: A public site's invalid certificate offers no way through
    Given I navigate to a site with an untrusted certificate
    Then Blanc shows a certificate safety interstitial
    And the site information reports a certificate problem
    And no certificate bypass is offered

  @desktop @F39-2
  Scenario: A local address can be continued past for the session
    Given I navigate to a local address with an untrusted certificate
    Then Blanc shows a certificate safety interstitial
    When I open Advanced and continue to the local address
    Then the local page loads with its same-origin script
    And the site information reports that I continued past a warning

  @desktop @F39-3
  Scenario: A different certificate on the same local address warns again
    Given I continued past the warning on the local address
    When the local address starts presenting a different certificate
    And I reload the local tab
    Then Blanc shows a certificate safety interstitial for the local tab

  @desktop @F39-4
  Scenario: Stop allowing in one tab leaves another open page marked not secure
    Given two tabs continued past the warning on the local address
    When I stop allowing the local address from the first tab
    Then the first tab shows the certificate safety interstitial
    And the second tab still reports that I continued past a warning
    When I reload the second tab
    Then the second tab shows the certificate safety interstitial

  @desktop @F39-5
  Scenario: Private tabs keep their own certificate choices
    Given I continued past the warning on the local address
    When I open the local address in a private tab
    Then the private tab shows the certificate safety interstitial

  @desktop @F39-6
  Scenario: A reopened page keeps its not-secure state, and eviction does not clear it
    Given I continued past the warning on the local address
    When I close the local tab and reopen it straight away
    Then the reopened tab shows the same page without loading it again
    And the reopened tab still reports that I continued past a warning
    When the local address's choice is evicted
    Then the reopened tab still reports that I continued past a warning

  @desktop @F39-7
  Scenario: Going back to a page loaded past a warning still reports it after a trusted load on the same host
    Given I continued past the warning on the lab address
    When the lab address starts presenting a trusted certificate
    And I stop allowing the lab address without reloading
    And I navigate the lab tab to another page on the same address
    Then the lab tab reports a secure connection
    When I go back in the lab tab
    Then the lab tab still reports that I continued past a warning
    When I go forward in the lab tab
    Then the lab tab reports a secure connection
```

(The old file put both tags on the `Feature:` line; moving them onto scenarios keeps `@F39-1` selecting exactly the original scenario.)

- [ ] **Step 3: Correct two spec details found while planning**

In the design spec §4.5, change "next to the existing `tab.certificateError` reset at `tab-view.js:369`" to "in the `did-navigate` handler (`tab-view.js:335`); `tab-view.js:369` is the `did-start-navigation` reset of `certificateError`". Append to §4.5's bullet list:

```markdown
- **The mark belongs to a history entry (plan revision 2).** A commit can
  arrive without a new `certificate-error`: a back/forward cache restore, or
  a request on an already-open connection. An origin-wide memory cannot
  handle that safely, because a later trusted load on the same host would
  clear it while an older entry still holds the unsafe document. Electron 44
  exposes no stable navigation-entry id (`NavigationEntry` is only `url`,
  `title`, `pageState`), so each tab keeps `certificateEntryMarks`
  (`{ urls, marks, index }`), a mirror of its navigation history by position,
  where `marks[i]` is the not-secure record of the document entry `i`
  committed, or `null`.
- On every main-frame cross-document commit, Blanc reads
  `navigationHistory.getAllEntries()` and `getActiveIndex()` and updates the
  mirror with a pure function (`commitEntryMarks`, `certificate-history.js`):
  - **Fresh record:** the commit's own load was allowed by an exception
    (`pendingCertificateException`, same origin), or the store still holds an
    exception for the committed origin (a pooled connection). Either marks
    the committed entry.
  - **Traversal:** the active index changed, the entry count did not, and
    the mirror's URL at the new index equals the committed URL. Without a
    fresh record, a traversal restores that entry's stored mark. A new load
    always creates or replaces an entry, so a trusted load never inherits a
    mark and never clears another entry's mark.
  - **Ambiguous cases fail toward Not secure.** A new load of exactly the
    URL already in the next forward slot looks like a traversal and keeps
    that slot's mark. If Chromium pruned entries from the front at its entry
    cap, the mirror realigns by one position; if it cannot realign, every
    entry whose origin carried a mark is marked.
- The session-wide certificate observer is not consulted: a host-scoped
  trusted-verification record says nothing about which document an entry
  holds.
- `certificateEntryMarks` and `documentCertificateException` travel in the
  Reopen Closed Tab `seed`: live-view adoption keeps the same
  `navigationHistory`, so the mirror stays valid. Snapshot and URL restores
  build a new WebContents whose entries reload from the network, so they
  start with an empty mirror.
```

And in §6, replace the `spec/parity-matrix.md` bullet with: "`spec/parity-matrix.md` has no F39 row today; none is added."

- [ ] **Step 4: Confirm the dry-run still resolves**

Run: `npm run test:acceptance:dry 2>&1 | tail -5`
Expected: PASS (the runnable profile still selects only `@F39-1`, whose steps are unchanged).

- [ ] **Step 5: Commit**

```bash
git add spec/features.md spec/acceptance/site-certificate-safety.feature docs/superpowers/specs/2026-10-05-certificate-continue-local-design.md
git commit -m "Ratify continuing past local certificate warnings in F39"
```

---

### Task 2: Local-host classifier and verified-this-run tracking

**Files:**
- Modify: `src/main/site-security.js`
- Test: `test/unit/site-security.test.js`

**Interfaces:**
- Produces: `isLocalNetworkHost(hostname: string) → boolean` (accepts `URL.hostname` form, including bracketed IPv6); observer method `wasVerifiedThisRun(browsingSession, url: string) → boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/site-security.test.js` (and add `isLocalNetworkHost` to the destructured require at the top):

```js
test('local-network hosts: private, link-local, CGNAT, IPv6 and local-use names', () => {
  const yes = [
    'localhost', 'app.localhost', '127.0.0.1', '[::1]',
    '10.0.0.0', '10.255.255.255',
    '172.16.0.0', '172.31.255.255',
    '192.168.0.1', '192.168.255.255',
    '169.254.1.1',
    '100.64.0.0', '100.127.255.255',
    '[fd00::1]', '[fc00::]', 'fd12:3456::1', '[fe80::1]', '[febf::1]',
    'proxmox', 'nas.local', 'router.lan', 'svc.internal', 'nas.home.arpa', 'NAS.HOME.ARPA',
  ];
  const no = [
    '', 'example.com', '8.8.8.8', '172.15.255.255', '172.32.0.0',
    '100.63.255.255', '100.128.0.0', '192.169.0.1', '11.0.0.1',
    '[2001:db8::1]', '[fec0::1]', 'badcert.test', 'lan.example.com',
    'local.example.com', 'home.arpa.example.com', '256.1.1.1', '10.0.0',
  ];
  for (const host of yes) assert.equal(isLocalNetworkHost(host), true, host);
  for (const host of no) assert.equal(isLocalNetworkHost(host), false, host);
});

test('observer remembers hosts verified this run even after a later failure', () => {
  const observer = createCertificateObserver();
  let proc;
  const browsingSession = { setCertificateVerifyProc: (fn) => { proc = fn; } };
  const other = { setCertificateVerifyProc: () => {} };
  observer.observe(browsingSession);
  observer.observe(other);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'https://nas.home.arpa/'), false);
  proc({ hostname: 'nas.home.arpa', verificationResult: 'OK' }, () => {});
  proc({ hostname: 'nas.home.arpa', verificationResult: 'net::ERR_CERT_AUTHORITY_INVALID' }, () => {});
  assert.equal(observer.get(browsingSession, 'https://nas.home.arpa/'), null);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'https://nas.home.arpa:8006/x'), true);
  assert.equal(observer.wasVerifiedThisRun(other, 'https://nas.home.arpa/'), false);
  assert.equal(observer.wasVerifiedThisRun(browsingSession, 'not a url'), false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/unit/site-security.test.js`
Expected: FAIL — `isLocalNetworkHost is not a function`.

- [ ] **Step 3: Implement**

In `src/main/site-security.js`, after `isLoopbackHost`:

```js
const LOCAL_USE_SUFFIXES = ['.local', '.lan', '.internal', '.home.arpa'];

function ipv4Octets(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((n) => Number.isInteger(n) && n <= 255) ? octets : null;
}

function isLocalNetworkHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  if (!host) return false;
  if (isLoopbackHost(host)) return true;
  const v4 = ipv4Octets(host);
  if (v4) {
    const [a, b] = v4;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (/^\d+(\.\d+)*$/.test(host)) return false; // malformed numeric, never a name
  const v6 = host.replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    const first = parseInt(v6.split(':')[0] || '0', 16);
    if (!Number.isFinite(first)) return false;
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  if (!host.includes('.')) return true; // single-label intranet name
  return LOCAL_USE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
```

In `createCertificateObserver`, add a `verified = new WeakMap()` beside `records`; in `observe`, create `const verifiedHosts = new Set(); verified.set(browsingSession, verifiedHosts);` and inside the `verificationResult === 'OK'` branch add `verifiedHosts.add(hostname);` (never deleted). Add:

```js
  function wasVerifiedThisRun(browsingSession, url) {
    try {
      const parsed = new URL(unwrapViewSource(url));
      return verified.get(browsingSession)?.has(parsed.hostname.toLowerCase()) === true;
    } catch {
      return false;
    }
  }

  return { observe, get, wasVerifiedThisRun };
```

Export `isLocalNetworkHost`.

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/site-security.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/site-security.js test/unit/site-security.test.js
git commit -m "Classify local-network hosts and remember verified hosts per run"
```

---

### Task 3: The exception store

**Files:**
- Create: `src/main/certificate-exceptions.js`
- Test: `test/unit/certificate-exceptions.test.js`

**Interfaces:**
- Consumes: `isLocalNetworkHost` (Task 2).
- Produces:
  - `ELIGIBLE_CERTIFICATE_ERRORS: ReadonlySet<string>`
  - `originKey(url: string) → string | null` (`https://host:port`, port defaulted to 443)
  - `isTimeValid(certificate: {validFrom, validTo}, now: number) → boolean`
  - `createCertificateExceptions({ cap = 64, onEvict = () => {} } = {}) → { isEligible, allow, matches, get, forget, clear, setCapForTest }`
    - `isEligible({ url, error, certificate, verifiedThisRun }) → boolean`
    - `allow(session, { url, error, certificate, now }) → boolean`
    - `matches(session, { url, error, certificate, now }) → boolean`
    - `get(session, url) → { error, certificate } | null`
    - `forget(session, url) → boolean`; `clear(session) → void`; `setCapForTest(n) → void`
  - `certificate` everywhere is the `sanitizeCertificate` shape: `{ subject, issuer, validFrom, validTo, fingerprint }` (ms epochs).

- [ ] **Step 1: Write the failing tests**

Create `test/unit/certificate-exceptions.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ELIGIBLE_CERTIFICATE_ERRORS, originKey, isTimeValid,
  createCertificateExceptions,
} = require('../../src/main/certificate-exceptions');

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const cert = (over = {}) => ({
  subject: 'nas.home.arpa', issuer: 'nas.home.arpa', fingerprint: 'sha256/AAA',
  validFrom: NOW - DAY, validTo: NOW + DAY, ...over,
});
const URL_A = 'https://nas.home.arpa:8006/';
const ERR = 'net::ERR_CERT_AUTHORITY_INVALID';
const eligible = { url: URL_A, error: ERR, certificate: cert(), verifiedThisRun: false };

test('origin keys default the port and lower-case the host', () => {
  assert.equal(originKey('https://NAS.home.arpa/x'), 'https://nas.home.arpa:443');
  assert.equal(originKey('https://[fd00::1]:8443/'), 'https://[fd00::1]:8443');
  assert.equal(originKey('http://nas.home.arpa/'), null);
  assert.equal(originKey('nonsense'), null);
});

test('eligibility follows host, error allowlist, certificate shape and run history', () => {
  const store = createCertificateExceptions();
  assert.equal(store.isEligible(eligible), true);
  for (const error of ELIGIBLE_CERTIFICATE_ERRORS) {
    assert.equal(store.isEligible({ ...eligible, error: `net::${error}` }), true, error);
  }
  for (const error of ['net::ERR_CERT_INVALID', 'net::ERR_CERT_REVOKED',
    'net::ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN', 'net::ERR_CERT_KNOWN_INTERCEPTION_BLOCKED', '']) {
    assert.equal(store.isEligible({ ...eligible, error }), false, error);
  }
  assert.equal(store.isEligible({ ...eligible, url: 'https://example.com/' }), false);
  assert.equal(store.isEligible({ ...eligible, url: 'http://nas.home.arpa/' }), false);
  assert.equal(store.isEligible({ ...eligible, verifiedThisRun: true }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: cert({ fingerprint: null }) }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: cert({ validTo: null }) }), false);
  assert.equal(store.isEligible({ ...eligible, certificate: null }), false);
});

test('matches requires origin, fingerprint, error, session and unchanged validity', () => {
  const store = createCertificateExceptions();
  const s1 = {}; const s2 = {};
  assert.equal(store.allow(s1, { url: URL_A, error: ERR, certificate: cert(), now: NOW }), true);
  const req = { url: 'https://nas.home.arpa:8006/js/app.js', error: ERR, certificate: cert(), now: NOW };
  assert.equal(store.matches(s1, req), true);
  assert.equal(store.matches(s2, req), false, 'other session (private/profile)');
  assert.equal(store.matches(s1, { ...req, url: 'https://nas.home.arpa:8007/' }), false, 'port');
  assert.equal(store.matches(s1, { ...req, url: 'https://other.home.arpa:8006/' }), false, 'host');
  assert.equal(store.matches(s1, { ...req, certificate: cert({ fingerprint: 'sha256/BBB' }) }), false, 'fingerprint');
  assert.equal(store.matches(s1, { ...req, error: 'net::ERR_CERT_COMMON_NAME_INVALID' }), false, 'error');
  assert.deepEqual(store.get(s1, URL_A), { error: ERR, certificate: cert() });
  assert.equal(store.get(s2, URL_A), null);
});

test('crossing validTo ends the match even though the error string is unchanged', () => {
  const store = createCertificateExceptions();
  const s = {};
  const c = cert({ validTo: NOW + 1000 });
  store.allow(s, { url: URL_A, error: ERR, certificate: c, now: NOW });
  assert.equal(store.matches(s, { url: URL_A, error: ERR, certificate: c, now: NOW + 1000 }), true);
  assert.equal(store.matches(s, { url: URL_A, error: ERR, certificate: c, now: NOW + 1001 }), false);
});

test('crossing validFrom ends a match made while not yet valid', () => {
  const store = createCertificateExceptions();
  const s = {};
  const c = cert({ validFrom: NOW + 1000, validTo: NOW + DAY });
  store.allow(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW });
  assert.equal(store.matches(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW + 999 }), true);
  assert.equal(store.matches(s, { url: URL_A, error: 'net::ERR_CERT_DATE_INVALID', certificate: c, now: NOW + 1000 }), false);
  assert.equal(isTimeValid(c, NOW + 1000), true);
});

test('allow refuses ineligible input; forget and clear are scoped', () => {
  const store = createCertificateExceptions();
  const s1 = {}; const s2 = {};
  assert.equal(store.allow(s1, { url: 'https://example.com/', error: ERR, certificate: cert(), now: NOW }), false);
  store.allow(s1, { url: URL_A, error: ERR, certificate: cert(), now: NOW });
  store.allow(s1, { url: 'https://10.0.0.2/', error: ERR, certificate: cert(), now: NOW });
  store.allow(s2, { url: URL_A, error: ERR, certificate: cert(), now: NOW });
  assert.equal(store.forget(s1, URL_A), true);
  assert.equal(store.forget(s1, URL_A), false);
  assert.ok(store.get(s1, 'https://10.0.0.2/'));
  store.clear(s1);
  assert.equal(store.get(s1, 'https://10.0.0.2/'), null);
  assert.ok(store.get(s2, URL_A), 'clear leaves other sessions');
});

test('the cap evicts the oldest origin and reports the session', () => {
  const evicted = [];
  const store = createCertificateExceptions({ cap: 2, onEvict: (s) => evicted.push(s) });
  const s = {};
  for (const host of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
    store.allow(s, { url: `https://${host}/`, error: ERR, certificate: cert(), now: NOW });
  }
  assert.equal(store.get(s, 'https://10.0.0.1/'), null);
  assert.ok(store.get(s, 'https://10.0.0.3/'));
  assert.deepEqual(evicted, [s]);
  store.setCapForTest(1);
  assert.equal(store.get(s, 'https://10.0.0.2/'), null, 'lowering the cap evicts immediately');
  assert.equal(evicted.length, 2);
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/unit/certificate-exceptions.test.js`
Expected: FAIL — `Cannot find module '../../src/main/certificate-exceptions'`.

- [ ] **Step 3: Implement**

Create `src/main/certificate-exceptions.js`:

```js
'use strict';

// Session-only "continue anyway" choices for local-network certificate
// failures (spec 2026-10-05-certificate-continue-local-design.md). Pure: no
// electron. Entries are main-process secrets — never persist, sync, log, or
// send them over IPC.
const { isLocalNetworkHost } = require('./site-security');

const ELIGIBLE_CERTIFICATE_ERRORS = new Set([
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_CERT_COMMON_NAME_INVALID',
  'ERR_CERT_SELF_SIGNED_LOCAL_NETWORK',
  'ERR_CERT_DATE_INVALID',
  'ERR_CERT_WEAK_SIGNATURE_ALGORITHM',
  'ERR_CERT_VALIDITY_TOO_LONG',
  'ERR_CERT_NON_UNIQUE_NAME',
]);
const DEFAULT_CAP = 64;

function errorCode(error) {
  return String(error ?? '').replace(/^net::/, '');
}

function originKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return `https://${parsed.hostname.toLowerCase()}:${parsed.port || '443'}`;
  } catch {
    return null;
  }
}

function hasDates(certificate) {
  return Number.isFinite(certificate?.validFrom) && Number.isFinite(certificate?.validTo);
}

function isTimeValid(certificate, now) {
  return now >= certificate.validFrom && now <= certificate.validTo;
}

function createCertificateExceptions({ cap = DEFAULT_CAP, onEvict = () => {} } = {}) {
  const bySession = new WeakMap();
  // Sessions that ever held an entry, so setCapForTest can re-apply a lowered
  // cap (WeakMap is not iterable). Electron sessions live for the process.
  const touchedSessions = new Set();
  let limit = cap;

  function entriesFor(browsingSession, create) {
    let entries = bySession.get(browsingSession);
    if (!entries && create) {
      entries = new Map();
      bySession.set(browsingSession, entries);
    }
    return entries ?? null;
  }

  function enforceCap(browsingSession, entries) {
    let evicted = false;
    while (entries.size > limit) {
      entries.delete(entries.keys().next().value);
      evicted = true;
    }
    if (evicted) onEvict(browsingSession);
  }

  function isEligible({ url, error, certificate, verifiedThisRun }) {
    const key = originKey(url);
    if (!key || verifiedThisRun !== false) return false;
    if (!ELIGIBLE_CERTIFICATE_ERRORS.has(errorCode(error))) return false;
    if (typeof certificate?.fingerprint !== 'string' || !certificate.fingerprint) return false;
    if (!hasDates(certificate)) return false;
    return isLocalNetworkHost(new URL(url).hostname);
  }

  function allow(browsingSession, { url, error, certificate, now }) {
    if (!isEligible({ url, error, certificate, verifiedThisRun: false })) return false;
    const entries = entriesFor(browsingSession, true);
    touchedSessions.add(browsingSession);
    const key = originKey(url);
    entries.delete(key);
    entries.set(key, {
      fingerprint: certificate.fingerprint,
      error: errorCode(error),
      timeValidAtAllow: isTimeValid(certificate, now),
      certificate: { ...certificate },
    });
    enforceCap(browsingSession, entries);
    return true;
  }

  function matches(browsingSession, { url, error, certificate, now }) {
    const entry = entriesFor(browsingSession, false)?.get(originKey(url));
    if (!entry || !certificate || !hasDates(certificate)) return false;
    return entry.fingerprint === certificate.fingerprint &&
      entry.error === errorCode(error) &&
      entry.timeValidAtAllow === isTimeValid(certificate, now);
  }

  function get(browsingSession, url) {
    const entry = entriesFor(browsingSession, false)?.get(originKey(url));
    return entry ? { error: `net::${entry.error}`, certificate: { ...entry.certificate } } : null;
  }

  function forget(browsingSession, url) {
    return entriesFor(browsingSession, false)?.delete(originKey(url)) === true;
  }

  function clear(browsingSession) {
    bySession.delete(browsingSession);
  }

  function setCapForTest(n) {
    limit = n;
    for (const browsingSession of touchedSessions) {
      const entries = bySession.get(browsingSession);
      if (entries) enforceCap(browsingSession, entries);
    }
  }

  return { isEligible, allow, matches, get, forget, clear, setCapForTest };
}

module.exports = {
  ELIGIBLE_CERTIFICATE_ERRORS,
  originKey,
  isTimeValid,
  createCertificateExceptions,
};
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/certificate-exceptions.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/certificate-exceptions.js test/unit/certificate-exceptions.test.js
git commit -m "Add the session-only certificate exception store"
```

---

### Task 3b: Per-history-entry marks

**Files:**
- Create: `src/main/certificate-history.js`
- Test: `test/unit/certificate-history.test.js`

**Interfaces:**
- Consumes: `originKey` (Task 3).
- Produces:
  - `emptyEntryMarks() → { urls: string[], marks: Array<Record|null>, index: number }` (`index` is −1 when empty)
  - `freshCertificateRecord({ committedUrl, pending, stored }) → Record | null`
  - `commitEntryMarks(prior, { entryUrls, activeIndex, committedUrl, freshRecord }) → { state, record }`
  - `cloneEntryMarks(state) → state` (new arrays; records are shared and never mutated)
  - `Record` is `{ origin: string, certificate }` (the `sanitizeCertificate` shape).

- [ ] **Step 1: Write the failing tests**

Create `test/unit/certificate-history.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  emptyEntryMarks, freshCertificateRecord, commitEntryMarks, cloneEntryMarks,
} = require('../../src/main/certificate-history');

const cert = { subject: 'nas', issuer: 'nas', validFrom: 1, validTo: 2, fingerprint: 'sha256/AAA' };
const ORIGIN = 'https://nas.home.arpa:443';
const MARK = { origin: ORIGIN, certificate: cert };
const A = 'https://nas.home.arpa/one';
const B = 'https://nas.home.arpa/two';
const C = 'https://nas.home.arpa/three';

function commit(prior, entryUrls, activeIndex, freshRecord = null) {
  return commitEntryMarks(prior, { entryUrls, activeIndex, committedUrl: entryUrls[activeIndex], freshRecord });
}

test('fresh record: pending for the committed origin, else a stored exception, else nothing', () => {
  assert.deepEqual(freshCertificateRecord({ committedUrl: A, pending: { url: B, certificate: cert }, stored: null }), MARK);
  assert.deepEqual(freshCertificateRecord({ committedUrl: A, pending: null, stored: { certificate: cert } }), MARK);
  assert.equal(freshCertificateRecord({ committedUrl: A, pending: { url: 'https://10.0.0.1/', certificate: cert }, stored: null }), null);
  assert.equal(freshCertificateRecord({ committedUrl: 'blanc://error/?x', pending: { url: A, certificate: cert }, stored: { certificate: cert } }), null);
});

test('a trusted same-host load gets its own entry; Back restores the unsafe entry and Forward does not', () => {
  let r = commit(emptyEntryMarks(), [A], 0, MARK);
  assert.deepEqual(r.record, MARK);
  r = commit(r.state, [A, B], 1);                // new trusted load, same host
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [MARK, null]);
  r = commit(r.state, [A, B], 0);                // Back (traversal, no request)
  assert.deepEqual(r.record, MARK);
  r = commit(r.state, [A, B], 1);                // Forward
  assert.equal(r.record, null);
});

test('a new load from the middle replaces forward entries and their marks', () => {
  let r = commit(emptyEntryMarks(), [A], 0);
  r = commit(r.state, [A, B], 1, MARK);
  r = commit(r.state, [A, B], 0);                // Back to A
  r = commit(r.state, [A, C], 1);                // new load replaces B
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [null, null]);
});

test('reload and replace at the same index recompute instead of inheriting', () => {
  let r = commit(emptyEntryMarks(), [A], 0, MARK);
  r = commit(r.state, [A], 0);                   // reload after Stop allowing
  assert.equal(r.record, null);
});

test('ambiguous: a new load of the URL already in the forward slot keeps its mark', () => {
  let r = commit(emptyEntryMarks(), [A], 0);
  r = commit(r.state, [A, B], 1, MARK);
  r = commit(r.state, [A, B], 0);
  r = commit(r.state, [A, B], 1);                // Forward, or a new load of B
  assert.deepEqual(r.record, MARK, 'fails toward Not secure');
});

test('front pruning at the entry cap realigns marks by one position', () => {
  const urls = Array.from({ length: 50 }, (_, i) => `https://site${i}.test/`);
  const marked = 'https://nas.home.arpa/p10';
  urls[10] = marked;
  const prior = { urls, marks: urls.map((u) => (u === marked ? MARK : null)), index: 49 };
  const next = [...urls.slice(1), 'https://site50.test/'];
  const r = commit(prior, next, 49);
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks[9], MARK);
  assert.equal(r.state.marks.filter(Boolean).length, 1);
});

test('an unresolvable history marks every entry of a marked origin', () => {
  const prior = { urls: [A, 'https://other.test/'], marks: [MARK, null], index: 1 };
  const r = commit(prior, ['https://x.test/', C, 'https://y.test/'], 2);
  assert.equal(r.record, null);
  assert.deepEqual(r.state.marks, [null, MARK, null]);
});

test('clone copies arrays so a closed entry and a live tab never share state', () => {
  const r = commit(emptyEntryMarks(), [A], 0, MARK);
  const copy = cloneEntryMarks(r.state);
  copy.marks[0] = null;
  assert.deepEqual(r.state.marks[0], MARK);
  assert.deepEqual(cloneEntryMarks(null), emptyEntryMarks());
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/unit/certificate-history.test.js`
Expected: FAIL — `Cannot find module '../../src/main/certificate-history'`.

- [ ] **Step 3: Implement**

Create `src/main/certificate-history.js`:

```js
'use strict';

// Which navigation-history entries hold a document loaded past a certificate
// warning (certificate spec §4.5, plan revision 2). Electron exposes no
// stable entry id, so this mirrors the entry list by position. Every case it
// cannot resolve keeps the mark: it fails toward "Not secure". Pure.
const { originKey } = require('./certificate-exceptions');

function emptyEntryMarks() {
  return { urls: [], marks: [], index: -1 };
}

function cloneEntryMarks(state) {
  if (!state || !Array.isArray(state.urls)) return emptyEntryMarks();
  return { urls: [...state.urls], marks: [...state.marks], index: state.index };
}

function freshCertificateRecord({ committedUrl, pending, stored }) {
  const origin = originKey(committedUrl);
  if (!origin) return null;
  if (pending && originKey(pending.url) === origin) return { origin, certificate: pending.certificate };
  if (stored) return { origin, certificate: stored.certificate };
  return null;
}

// Chromium's per-tab navigation entry cap (content::kMaxSessionHistoryEntries).
const MAX_ENTRIES = 50;

// Chromium never rewrites entries below the lower of the old and new active
// index, except when it prunes one entry from the front at its entry cap.
// Returns the prior mirror in new coordinates, or null when unresolvable.
function alignPrior(prior, entryUrls, activeIndex) {
  if (!prior || prior.index < 0) return emptyEntryMarks();
  for (const shift of [0, 1]) {
    const atCap = entryUrls.length === prior.urls.length && entryUrls.length >= MAX_ENTRIES;
    if (shift === 1 && !atCap) continue;
    const stable = Math.min(prior.index - shift, activeIndex);
    let aligned = true;
    for (let j = 0; j < stable; j++) {
      if (prior.urls[j + shift] !== entryUrls[j]) { aligned = false; break; }
    }
    if (aligned) {
      return { urls: prior.urls.slice(shift), marks: prior.marks.slice(shift), index: prior.index - shift };
    }
  }
  return null;
}

function commitEntryMarks(prior, { entryUrls, activeIndex, committedUrl, freshRecord }) {
  const urls = [...entryUrls];
  const aligned = alignPrior(prior, urls, activeIndex);
  if (!aligned) {
    const byOrigin = new Map();
    for (const mark of prior?.marks ?? []) if (mark) byOrigin.set(mark.origin, mark);
    const marks = urls.map((url) => byOrigin.get(originKey(url)) ?? null);
    if (freshRecord) marks[activeIndex] = freshRecord;
    return { state: { urls, marks, index: activeIndex }, record: marks[activeIndex] ?? null };
  }
  const traversal = aligned.index !== activeIndex &&
    aligned.urls.length === urls.length &&
    aligned.urls[activeIndex] === committedUrl;
  const record = freshRecord ?? (traversal ? aligned.marks[activeIndex] ?? null : null);
  const marks = urls.map((url, j) => {
    if (j === activeIndex) return record;
    return aligned.urls[j] === url ? aligned.marks[j] ?? null : null;
  });
  return { state: { urls, marks, index: activeIndex }, record };
}

module.exports = { emptyEntryMarks, cloneEntryMarks, freshCertificateRecord, commitEntryMarks };
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/certificate-history.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/certificate-history.js test/unit/certificate-history.test.js
git commit -m "Track which history entries loaded past a certificate warning"
```

---

### Task 4: Warning-page query flag and the `certificate-exception` site-info state

**Files:**
- Modify: `src/main/site-security.js` (`certificateErrorQuery`, `buildSiteInfo`)
- Test: `test/unit/site-security.test.js:57-66` (policy guard rewritten)

**Interfaces:**
- Produces: `certificateErrorQuery(record, fallback = {}, { canContinue = false } = {})` adds `continue=1` only when `canContinue === true`; `buildSiteInfo(url, { …, certificateException = null })` returns `state: 'certificate-exception'` when `certificateException` is set and there is no `certificateError`.

- [ ] **Step 1: Rewrite the policy test and add the state test**

Replace the test titled `certificate query is dedicated, display-only, and contains no bypass` with:

```js
test('certificate query offers continue only when main says the failure is eligible', () => {
  const record = {
    url: 'https://bad.test/', error: 'net::ERR_CERT_DATE_INVALID',
    certificate: { subject: 'bad.test', issuer: 'Expired CA', validTo: 1000 },
  };
  const publicQuery = certificateErrorQuery(record, { code: -201, desc: 'certificate error' });
  assert.equal(publicQuery.get('kind'), 'certificate');
  assert.equal(publicQuery.get('subject'), 'bad.test');
  assert.match(certificateErrorMessage(publicQuery.get('certError')), /expired/);
  assert.equal(publicQuery.has('continue'), false);
  assert.doesNotMatch(publicQuery.toString(), /proceed|bypass|raw|fingerprint/i);

  const localQuery = certificateErrorQuery(
    { ...record, url: 'https://192.168.1.5:8006/' }, { code: -202 }, { canContinue: true });
  assert.equal(localQuery.get('continue'), '1');
  assert.doesNotMatch(localQuery.toString(), /fingerprint/i);
});

test('site info reports a document loaded past a certificate warning', () => {
  const certificate = { subject: 'nas.home.arpa', issuer: 'nas.home.arpa', validFrom: 1, validTo: 2, fingerprint: 'sha256/AAA' };
  const info = buildSiteInfo('https://nas.home.arpa:8006/', {
    certificateException: { origin: 'https://nas.home.arpa:8006', certificate },
  });
  assert.equal(info.state, 'certificate-exception');
  assert.equal(info.title, 'Not secure');
  assert.equal(info.summary,
    'You chose to continue even though this site’s certificate isn’t trusted. Blanc will warn you again after it restarts.');
  assert.deepEqual(info.certificate, certificate);
  const errored = buildSiteInfo('https://nas.home.arpa:8006/', {
    certificateError: { url: 'https://nas.home.arpa:8006/', error: 'net::ERR_CERT_AUTHORITY_INVALID', certificate },
    certificateException: { origin: 'https://nas.home.arpa:8006', certificate },
  });
  assert.equal(errored.state, 'certificate-error', 'a live error outranks a stale document record');
});
```

Match the file's existing apostrophe style: `buildSiteInfo` uses `’` (U+2019) in "Chromium’s"; use `’` in the new summary in both test and source.

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/unit/site-security.test.js`
Expected: FAIL — `localQuery.get('continue')` is `null`; state is `secure`.

- [ ] **Step 3: Implement**

`certificateErrorQuery`: add the third parameter and, after building the `URLSearchParams`, `if (canContinue === true) query.set('continue', '1'); return query;` (assign the params to `const query` first).

`buildSiteInfo`: add `certificateException = null` to the options; after the `if (certificateError) { … }` block insert:

```js
  if (certificateException) {
    return {
      ...base,
      certificate: certificateException.certificate ?? base.certificate,
      state: 'certificate-exception',
      title: 'Not secure',
      summary: 'You chose to continue even though this site’s certificate isn’t trusted. Blanc will warn you again after it restarts.',
    };
  }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/site-security.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/site-security.js test/unit/site-security.test.js
git commit -m "Flag eligible certificate failures and model the not-secure document state"
```

---

### Task 5: Main-process wiring — allow path, commit recompute, reopen seed, profile clear

**Files:**
- Modify: `src/main/tab-view.js:117,174` (deps), `:335-351` (`did-navigate`), `:444-454` (handler)
- Modify: `src/main/closed-tabs.js:91-100` (`seed`)
- Modify: `src/main/main.js` — store instance near `:310`; `initTabView` deps near `:5460`; tab defaults near `:5556`; `did-fail-load` eligibility via `tab-view.js:429-434`; site-info input near `:3971`; `clearNamedProfileSessions` near `:8421`
- Test: `test/unit/closed-tabs.test.js`, `test/unit/tab-view.test.js`

**Interfaces:**
- Consumes: Task 2 observer `wasVerifiedThisRun`; Task 3 store; Task 3b `freshCertificateRecord`, `commitEntryMarks`, `cloneEntryMarks`, `emptyEntryMarks`; Task 4 `certificateErrorQuery(..., { canContinue })`, `buildSiteInfo({ certificateException })`.
- Produces (tab record fields, main-only): `pendingCertificateException: {url, certificate} | null`, `documentCertificateException: {origin, certificate} | null`, `certificateEntryMarks: {urls, marks, index}`. New `initTabView` deps: `certificateExceptions`, `certificateObserver`. Main exports nothing new.

- [ ] **Step 1: Write the failing closed-tabs test**

Append to `test/unit/closed-tabs.test.js`:

```js
test('the not-secure document record and entry marks ride in the seed, never in the projection', () => {
  const certificate = { subject: 'nas', issuer: 'nas', validFrom: 1, validTo: 2, fingerprint: 'sha256/AAA' };
  const record = { origin: 'https://nas.home.arpa:443', certificate };
  const marks = { urls: ['https://nas.home.arpa/'], marks: [record], index: 0 };
  const entry = buildTabEntry(baseTab({
    url: 'https://nas.home.arpa/', documentCertificateException: record, certificateEntryMarks: marks,
  }), SNAP, {}, 0);
  assert.deepEqual(entry.seed.documentCertificateException, record);
  assert.deepEqual(entry.seed.certificateEntryMarks, marks);
  assert.notEqual(entry.seed.certificateEntryMarks.marks, marks.marks, 'copied, not shared');
  const projected = JSON.stringify(projectEntries([entry]));
  assert.doesNotMatch(projected, /sha256|certificate|nas\.home/);
  const plain = buildTabEntry(baseTab(), SNAP, {}, 0);
  assert.equal(plain.seed.documentCertificateException, null);
  assert.deepEqual(plain.seed.certificateEntryMarks, { urls: [], marks: [], index: -1 });
});
```

(`projectEntries` returns the title; the base tab title is `'A'`, so the URL host never appears.)

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/unit/closed-tabs.test.js`
Expected: FAIL — `entry.seed.documentCertificateException` is `undefined`.

- [ ] **Step 3: Implement the seed**

In `buildTabEntry`'s `seed`, after `navEpoch`:

```js
      // The page was loaded past a certificate warning; adoption must keep
      // saying so (certificate spec §4.6). Main-only, like the snapshot.
      documentCertificateException: tab.documentCertificateException ?? null,
      certificateEntryMarks: cloneEntryMarks(tab.certificateEntryMarks),
```

Add `const { cloneEntryMarks } = require('./certificate-history');` to `closed-tabs.js` (pure module; no electron). Run: `node --test test/unit/closed-tabs.test.js` → PASS. `main.js:6346` already does `Object.assign(tab, entry.seed)`; update its trailing comment to list the two new fields.

- [ ] **Step 4: Wire the store into main and tab-view**

`main.js`, beside `const certificateObserver = createCertificateObserver();` (`:310`):

```js
const certificateExceptions = createCertificateExceptions({
  onEvict: (browsingSession) => { browsingSession.closeAllConnections?.().catch?.(() => {}); },
});
```

and `const { createCertificateExceptions } = require('./certificate-exceptions');` with the other requires.

Tab defaults (beside `certificateError: null`, `:5556`):

```js
    // In-memory only (certificate spec §4.5): the request allowed past a
    // local certificate warning, and the committed document it produced.
    pendingCertificateException: null,
    documentCertificateException: null,
    certificateEntryMarks: emptyEntryMarks(),
```

Add `'certificateExceptions', 'certificateObserver'` to `initTabView`'s `required` list and to the destructuring in `wireTabView`; pass both from `main.js`'s `initTabView({ … })` call (next to `sanitizeCertificate, certificateErrorQuery` at `:5460`).

- [ ] **Step 5: Replace the certificate-error handler** (`tab-view.js:441-454`)

```js
  // Chromium remains authoritative. A local failure the user chose to
  // continue past (certificate spec §4.2) is allowed only on an exact
  // origin+fingerprint+error+validity match; everything else is rejected.
  wc.on('certificate-error', boundToTab((event, failedUrl, error, certificate, callback, isMainFrame) => {
    if (tab.sleeping || tab.view?.webContents !== wc) return callback(false);
    const sanitized = sanitizeCertificate(certificate);
    if (certificateExceptions.matches(wc.session, { url: failedUrl, error, certificate: sanitized, now: Date.now() })) {
      if (isMainFrame) tab.pendingCertificateException = { url: failedUrl, certificate: sanitized };
      event.preventDefault();
      return callback(true);
    }
    if (isMainFrame) {
      tab.certificateError = { url: failedUrl, error, certificate: sanitized };
    }
    callback(false);
  }));
```

- [ ] **Step 6: Offer continue only when eligible** (`tab-view.js:429-434`)

```js
    const canContinue = !!tab.certificateError && certificateExceptions.isEligible({
      url: tab.certificateError.url,
      error: tab.certificateError.error,
      certificate: tab.certificateError.certificate,
      verifiedThisRun: certificateObserver.wasVerifiedThisRun(wc.session, tab.certificateError.url),
    });
    const q = tab.certificateError
      ? certificateErrorQuery(tab.certificateError, {
          url: validatedURL,
          code: errorCode,
          desc: errorDescription,
        }, { canContinue })
      : new URLSearchParams({ url: validatedURL, code: String(errorCode), desc: errorDescription });
```

- [ ] **Step 7: Recompute on commit** (`did-navigate`, after `tab.navEpoch++;` at `:337`)

```js
    const nav = wc.navigationHistory;
    const { state: entryMarks, record: documentException } = commitEntryMarks(tab.certificateEntryMarks, {
      entryUrls: nav.getAllEntries().map((entry) => entry.url),
      activeIndex: nav.getActiveIndex(),
      committedUrl: url,
      freshRecord: freshCertificateRecord({
        committedUrl: url,
        pending: tab.pendingCertificateException,
        stored: certificateExceptions.get(wc.session, url),
      }),
    });
    tab.pendingCertificateException = null;
    tab.certificateEntryMarks = entryMarks;
    tab.documentCertificateException = documentException;
```

with `const { commitEntryMarks, freshCertificateRecord } = require('./certificate-history');` at the top of `tab-view.js` (pure, consistent with the module's other pure imports), and `emptyEntryMarks` required in `main.js` for the tab defaults. The session-wide certificate observer is deliberately **not** consulted here: a host-scoped trusted record says nothing about which document an entry holds. `did-navigate-in-page` is untouched.

- [ ] **Step 8: Feed site info** (`main.js` near `:3976`)

```js
      const siteInfo = buildSiteInfo(targetUrl, {
        certificateRecord,
        certificateError: tab.certificateError,
        certificateException: tab.documentCertificateException,
        blockedCount: rest.blockedCount,
      });
```

- [ ] **Step 9: Clear on profile deletion** (`clearNamedProfileSessions`, before the `Promise.all`)

```js
  certificateExceptions.clear(owned.normal);
  certificateExceptions.clear(owned.private);
```

- [ ] **Step 10: Guard the wiring with a lift test**

Append to `test/unit/tab-view.test.js` (it already reads `tab-view.js` source for lift tests):

```js
test('certificate-error allows only through the exception store and never by default', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/main/tab-view.js'), 'utf8');
  const handler = source.slice(source.indexOf("wc.on('certificate-error'"), source.indexOf("wc.once('destroyed'"));
  assert.match(handler, /certificateExceptions\.matches\(wc\.session/);
  assert.match(handler, /event\.preventDefault\(\);\s*return callback\(true\);/);
  assert.equal((handler.match(/callback\(true\)/g) ?? []).length, 1);
});
```

- [ ] **Step 11: Run unit tests and lint**

Run: `npm run test:unit 2>&1 | tail -5 && npm run lint`
Expected: PASS, count = baseline + new tests.

- [ ] **Step 12: Commit**

```bash
git add src/main/tab-view.js src/main/closed-tabs.js src/main/main.js test/unit/closed-tabs.test.js test/unit/tab-view.test.js
git commit -m "Allow requests past local certificate warnings by exact match and bind the warning to the document"
```

---

### Task 6: Warning page Advanced disclosure and the continue IPC

**Files:**
- Modify: `src/renderer/pages/error.js`, `src/renderer/pages/pages.css`
- Modify: `src/main/tab-preload.js` (new `host === 'error'` branch)
- Modify: `src/main/pages.js` (handler), `src/main/main.js` (`pageSurfaces.owns` near `:9374`; `errorPage` hook)
- Modify: `browser-api/bridges.json` (move `error` from `unexposedHosts` into `hosts`; add member)
- Test: `test/unit/browser-api-bridges.test.js` via `npm run browser-api:check`; unit test for the main handler logic

**Interfaces:**
- Produces: `window.bowserPages.errorPage.continueUnsafe() → Promise<{ ok: true } | { ok: false, error: 'not-eligible' | 'no-certificate-error' }>`; channel `pages:error:continue-unsafe`; main helper `continueUnsafeForSender(wc)` (same shape) exposed to pages.js as `hooks.errorPage.continueUnsafe(wc)` and to the test hook in Task 8.

- [ ] **Step 1: Bridge contract first**

In `browser-api/bridges.json` → `bowserPages`: remove `"error"` from `unexposedHosts` (leave `[]`), add `"error"` to `hosts`, and add to `members`:

```json
      {
        "name": "errorPage.continueUnsafe",
        "kind": "invoke",
        "channel": "pages:error:continue-unsafe",
        "hosts": ["error"],
        "params": [],
        "returns": "unknown",
        "doc": "Continue past this tab's certificate warning for the session. Takes no arguments: main reads the tab's own recorded failure and re-checks eligibility."
      }
```

Run: `npm run browser-api:check 2>&1 | tail -5`
Expected: FAIL — the preload does not expose `errorPage.continueUnsafe` and no handler exists.

- [ ] **Step 2: Preload branch** (`tab-preload.js`, beside `host === 'mahjong'`)

```js
  } else if (host === 'error') {
    api = {
      errorPage: { continueUnsafe: () => invoke('pages:error:continue-unsafe') },
    };
```

- [ ] **Step 3: Handler** (`pages.js`, after the mahjong handler at `:498`)

```js
  // The warning page names nothing: main resolves the sender's own tab and
  // its recorded certificate failure (certificate spec §4.4).
  handleEvent('pages:error:continue-unsafe', ['error'], (event) =>
    hooks.errorPage?.continueUnsafe?.(event.sender) ?? { ok: false, error: 'no-certificate-error' });
```

- [ ] **Step 4: Ownership and the main helper** (`main.js`)

In `pageSurfaces.owns`, change `if (host !== 'newtab' && host !== 'mahjong') return false;` to `if (host !== 'newtab' && host !== 'mahjong' && host !== 'error') return false;`.

Add near the other certificate helpers:

```js
function continueUnsafeForSender(wc) {
  const tabId = tabIdByWebContentsId.get(wc?.id);
  const tab = tabId ? tabs.get(tabId) : null;
  const failure = tab?.certificateError;
  if (!tab || liveContents(tab) !== wc || !failure) return { ok: false, error: 'no-certificate-error' };
  const input = { url: failure.url, error: failure.error, certificate: failure.certificate };
  const verifiedThisRun = certificateObserver.wasVerifiedThisRun(wc.session, failure.url);
  if (!certificateExceptions.isEligible({ ...input, verifiedThisRun })) return { ok: false, error: 'not-eligible' };
  certificateExceptions.allow(wc.session, { ...input, now: Date.now() });
  queueTabNavigation(wc, {
    isCurrent: () => liveContents(tab) === wc,
    run: (contents) => contents.loadURL(failure.url),
  });
  return { ok: true };
}
```

(`queueTabNavigation` is already imported in `main.js` for `tab-view.js`'s use; if it is not in scope there, import it from the same module `tab-view.js` gets it from — check with `grep -n "queueTabNavigation" src/main/*.js`.) Pass `errorPage: { continueUnsafe: continueUnsafeForSender }` in the `setupPages` hooks object beside `pageSurfaces`.

- [ ] **Step 5: Error page UI** (`error.js`, inside `if (certificateFailure) { … }` after `details.hidden = !shown;`)

Build the disclosure only when eligible, so a public warning's DOM contains no Advanced/Continue text at all (the `@F39-1` step reads every `a,button`, hidden or not):

```js
    if (params.get('continue') === '1' && /^https:\/\//i.test(url)) {
      let label = url;
      try { label = new URL(url).host; } catch { /* keep the raw url */ }
      const nav = document.querySelector('.newtab-links');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'advanced-toggle';
      toggle.textContent = 'Advanced';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'advancedPanel');
      nav.append(toggle);

      const panel = document.createElement('div');
      panel.id = 'advancedPanel';
      panel.className = 'advanced-panel';
      panel.hidden = true;
      const warning = document.createElement('p');
      warning.className = 'section-hint';
      warning.textContent = 'This site’s certificate isn’t trusted, so Blanc can’t confirm who you’re talking to. ' +
        'Someone on your network could be impersonating it. Only continue if you know this device — ' +
        'for example, a router, NAS or server on your own network.';
      const proceed = document.createElement('button');
      proceed.type = 'button';
      proceed.id = 'continueUnsafe';
      proceed.className = 'continue-unsafe';
      proceed.textContent = `Continue to ${label} (unsafe)`;
      proceed.addEventListener('click', async () => {
        proceed.disabled = true;
        const result = await window.bowserPages?.errorPage?.continueUnsafe?.().catch(() => null);
        if (!result?.ok) proceed.disabled = false;
      });
      panel.append(warning, proceed);
      nav.after(panel);

      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) proceed.focus();
      };
      toggle.addEventListener('click', () => setOpen(panel.hidden));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
      });
    }
```

`pages.css`, after the `.newtab-links` rules (`:1546`):

```css
.newtab-links .advanced-toggle {
  min-height: 34px;
  padding: 7px 13px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  cursor: pointer;
}
.newtab-links .advanced-toggle:hover { color: var(--text); }
.advanced-panel {
  width: min(440px, calc(100vw - 64px));
  margin: 16px auto 0;
  text-align: left;
}
.advanced-panel[hidden] { display: none; }
.continue-unsafe {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--danger);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.continue-unsafe:disabled { opacity: 0.5; cursor: default; }
.advanced-toggle:focus-visible,
.continue-unsafe:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
```

If `--danger` is not defined in `pages.css`'s `:root` (it is in `styles.css`), check with `grep -n -- "--danger" src/renderer/pages/pages.css`; if absent, add it to both theme scopes in `pages.css` with the same values as `styles.css`, and update `tokens/tokens.json` + `npm run tokens:build` so `substrate:check` stays green.

- [ ] **Step 6: Regenerate and check the bridge**

Run: `npm run browser-api:build && npm run browser-api:check 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 7: Unit test the main helper's refusal paths**

`continueUnsafeForSender` closes over main.js state, so test the pure part it relies on (already covered in Task 3) plus a lift assertion that it re-checks eligibility before `allow`:

Append to `test/unit/site-security.test.js`:

```js
test('main re-checks eligibility before recording a continue', () => {
  const source = require('node:fs').readFileSync(require.resolve('../../src/main/main.js'), 'utf8');
  const start = source.indexOf('function continueUnsafeForSender(');
  assert.ok(start > 0, 'continueUnsafeForSender exists');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  assert.ok(body.indexOf('isEligible(') < body.indexOf('.allow('), 'eligibility before allow');
  assert.match(body, /wasVerifiedThisRun\(wc\.session/);
  assert.doesNotMatch(body, /args|\.\.\.rest|event\.args/, 'takes nothing from the page');
});
```

Run: `npm run test:unit 2>&1 | tail -3` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/pages/error.js src/renderer/pages/pages.css src/main/tab-preload.js src/main/pages.js src/main/main.js browser-api test/unit/site-security.test.js
git commit -m "Offer Advanced → Continue on local certificate warnings"
```

---

### Task 7: Island site info — state, glyph, hint, Stop allowing

**Files:**
- Modify: `browser-api/contract.json` (`SiteInfo.state` union; new invoke member)
- Modify: `src/main/preload.js` (member), `src/main/main.js` (`chromeHandle`)
- Modify: `src/renderer/overlay.js:473-476, 1282-1302`, `src/renderer/renderer.js:683-684, 787`, `src/renderer/styles.css:1482-1483, 1511`

**Interfaces:**
- Produces: `browserAPI.siteInfoForgetCertificateException() → Promise<boolean>`; channel `chrome:site-info-forget-certificate-exception`; main helper `forgetActiveCertificateException() → boolean` (also used by the test hook).

- [ ] **Step 1: Contract first**

In `browser-api/contract.json`: change the `SiteInfo.state` type to `"'neutral' | 'certificate-error' | 'certificate-exception' | 'secure' | 'local' | 'insecure' | 'internal'"`, and add beside `allowAdsOnActiveSite`:

```json
    {
      "name": "siteInfoForgetCertificateException",
      "group": "blocking",
      "kind": "invoke",
      "channel": "chrome:site-info-forget-certificate-exception",
      "params": [],
      "returns": "boolean",
      "doc": "Stop allowing the active tab's origin past its certificate warning for this session, close that session's connections, and reload the tab. Resolves false when there was nothing to forget."
    },
```

Use whichever `group` value the contract defines for site/shield controls if `blocking` is not the closest fit (check `grep -n '"group"' browser-api/contract.json | sort | uniq -c`).

Run: `npm run browser-api:check 2>&1 | tail -5`
Expected: FAIL — member not exposed / channel absent.

- [ ] **Step 2: Preload and handler**

`preload.js`, beside `allowAdsOnActiveSite`:

```js
  siteInfoForgetCertificateException: () => ipcRenderer.invoke('chrome:site-info-forget-certificate-exception'),
```

`main.js`, beside `chromeHandle('chrome:adblock-exempt-active', …)`:

```js
function forgetActiveCertificateException() {
  const tab = tabs.get(rt().activeTabId);
  const wc = liveContents(tab);
  const origin = tab?.documentCertificateException?.origin;
  if (!wc || !origin) return false;
  const forgotten = certificateExceptions.forget(wc.session, origin);
  wc.session.closeAllConnections?.().catch?.(() => {});
  wc.reload();
  return forgotten;
}
chromeHandle('chrome:site-info-forget-certificate-exception', () => forgetActiveCertificateException());
```

The reload is a same-index commit, so `commitEntryMarks` recomputes the entry from a fresh record; with the exception forgotten and connections closed, the reload fails verification and shows the warning. Other entries in this tab's history, and other tabs, keep their marks until their documents are replaced (spec §4.5).

- [ ] **Step 3: Overlay card**

`overlay.js:474`: treat `certificate-exception` like the other warnings:

```js
    panelSiteInfo.innerHTML = ['insecure', 'certificate-error', 'certificate-exception'].includes(siteInfo?.state)
      ? ICONS.insecure
      : siteInfo?.state === 'local' ? ICONS.local : ICONS.secure;
```

In the card footer (before `footer.append(protection, settingsButton);`):

```js
    const footerActions = [protection];
    if (info.state === 'certificate-exception') {
      const stopButton = document.createElement('button');
      stopButton.type = 'button';
      stopButton.className = 'site-info-settings site-info-stop-allowing';
      stopButton.textContent = 'Stop allowing';
      stopButton.addEventListener('click', () => {
        window.browserAPI.closeOverlay();
        window.browserAPI.siteInfoForgetCertificateException();
      });
      footerActions.push(stopButton);
    }
    footerActions.push(settingsButton);
    footer.append(...footerActions);
```

Island hint (`:1300`):

```js
    islandHint.textContent = info.state === 'certificate-error'
      ? 'Blanc did not offer a bypass'
      : info.state === 'certificate-exception'
        ? 'you continued past a certificate warning'
        : 'connection details are supplied by Chromium';
```

The existing `'Blanc did not offer a bypass'` hint becomes false for local warnings, so replace it with `'this certificate could not be verified'` (verify nothing pins the old text: `grep -rn "did not offer a bypass" test spec` must return nothing). The snippet above then reads:

```js
    islandHint.textContent = info.state === 'certificate-error'
      ? 'this certificate could not be verified'
      : info.state === 'certificate-exception'
        ? 'you continued past a certificate warning'
        : 'connection details are supplied by Chromium';
```

- [ ] **Step 4: Pill badge** (`renderer.js:683-684` and `:787`)

```js
    const securityWarning = ['insecure', 'certificate-error', 'certificate-exception'].includes(tab?.siteInfo?.state);
```

`:787` keeps opening the island only for `certificate-error` (the warning page is the tab; for `certificate-exception` the badge opens the site-info card like `insecure`). No change there.

- [ ] **Step 5: Styles** (`styles.css`)

Extend the two danger selectors:

```css
.site-info-button.insecure,
.site-info-button.certificate-error,
.site-info-button.certificate-exception { color: var(--danger); }
```

```css
.site-info-card.certificate-error .site-info-state,
.site-info-card.certificate-exception .site-info-state { background: var(--danger); }
```

and add `.site-info-stop-allowing { color: var(--danger); }` after `.site-info-settings`.

- [ ] **Step 6: Regenerate and check**

Run: `npm run browser-api:build && npm run browser-api:check && npm run substrate:check && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add browser-api src/main/preload.js src/main/main.js src/renderer/overlay.js src/renderer/renderer.js src/renderer/styles.css
git commit -m "Show the not-secure state and Stop allowing in the island"
```

---

### Task 8: Desktop acceptance scenarios F39-2…F39-7

**Files:**
- Modify: `test/desktop/support/fixtures-server.js` (`startSecure` returns `setCertificate`; `/asset/probe.js`)
- Modify: `test/desktop/support/hooks.js:70,129-143,333`, `context.js`, `world.js`
- Modify: `src/main/test-hook.js` (drivers), `src/main/main.js` (pass refs)
- Modify: `test/desktop/steps/site-certificate-safety.steps.js`, `test/desktop/cucumber.mjs:54`

**Interfaces:**
- Consumes: `continueUnsafeForSender` (Task 6), `forgetActiveCertificateException` (Task 7), `certificateExceptions.setCapForTest` (Task 3).
- Produces: test-hook methods `continueUnsafeInTab(id)`, `forgetCertificateExceptionInTab(id)`, `forgetCertificateExceptionOnly(id)`, `setCertificateExceptionCap(n)`, `resetCertificateExceptionsForTest()`, `tabWebContentsId(id)`; world helper `localFixtureUrl(name, query, host)`; context `localFixturesBase`, `localFixturesPort`, `localFixtures` handle.

- [ ] **Step 1: Fixture server**

In `fixtures-server.js` `startSecure`, serve a same-origin script and allow certificate swaps:

```js
function startSecure({ key, cert }) {
  const server = https.createServer({ key, cert }, (req, res) => {
    if (workspaceResponse(req, res)) return;
    if ((req.url || '').startsWith('/asset/probe.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end('window.__subresourceLoaded = true;');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageBody(req));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        setCertificate: (next) => { server.setSecureContext(next); server.closeAllConnections(); },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
```

In `pageBody`, when `raw.includes('probe=1')`, append `<script src="/asset/probe.js"></script>` before `</body>` (follow the existing string-building style).

- [ ] **Step 2: Harness**

`hooks.js`: generate three more key/cert pairs with the existing `openssl` invocation pattern, each with `-addext subjectAltName=DNS:nas.home.arpa,DNS:lab.home.arpa`:

- `localA` and `localB`: self-signed, **not** in the SPKI allowlist (two different keys, so different fingerprints).
- `localTrusted`: its SPKI hash is computed exactly like `secureSpkiHash` and appended to the flag: `--ignore-certificate-errors-spki-list=${secureSpkiHash},${localTrustedSpkiHash}`.

Start `localFixturesHandle = await fixtures.startSecure(localA)`; set `ctx.localFixturesPort = localFixturesHandle.port`, `ctx.localFixturesBase = \`https://nas.home.arpa:${localFixturesHandle.port}\``, `ctx.localFixtures = { handle: localFixturesHandle, certA: localA, certB: localB, certTrusted: localTrusted }`; append `, MAP nas.home.arpa 127.0.0.1, MAP lab.home.arpa 127.0.0.1` to `--host-resolver-rules`; close the handle in the `AfterAll` beside `untrustedFixturesHandle`. `context.js`: add `localFixturesBase: null, localFixturesPort: null, localFixtures: null`. `world.js`:

```js
  /** HTTPS on a local-use name with its own key, absent from the SPKI
   *  allowlist unless the trusted pair is swapped in (F39-2..7). */
  localFixtureUrl(name, query = '', host = 'nas.home.arpa') {
    return `https://${host}:${ctx.localFixturesPort}/site/${encodeURIComponent(name)}${query}`;
  }
```

`lab.home.arpa` is used **only** by F39-7: its trusted load records the host as verified for the rest of the run (spec §3.3), which would make later scenarios' Continue ineligible on that name.

**Each scenario must start with a fresh exception store and the A certificate.** Add a `Before({ tags: '@F39-2 or @F39-3 or @F39-4 or @F39-5 or @F39-6 or @F39-7' })` hook that calls `this.call('resetCertificateExceptionsForTest')` and `ctx.localFixtures.handle.setCertificate(ctx.localFixtures.certA)`.

- [ ] **Step 3: Test-hook drivers** (`test-hook.js`, beside `executeTab`; refs passed from `main.js`'s `install({ … })`)

```js
    continueUnsafeInTab(id) {
      const wc = tabs.get(id)?.view?.webContents;
      return wc ? refs.continueUnsafeForSender(wc) : { ok: false, error: 'no-tab' };
    },
    forgetCertificateExceptionInTab(id) {
      setActiveTab(id, { focusContent: false });
      return refs.forgetActiveCertificateException();
    },
    forgetCertificateExceptionOnly(id) {
      const tab = tabs.get(id);
      const wc = tab?.view?.webContents;
      const origin = tab?.documentCertificateException?.origin;
      if (!wc || !origin) return false;
      const forgotten = refs.certificateExceptions.forget(wc.session, origin);
      return wc.session.closeAllConnections().then(() => forgotten);
    },
    setCertificateExceptionCap(n) { refs.certificateExceptions.setCapForTest(Number(n)); },
    resetCertificateExceptionsForTest() {
      for (const tab of tabs.values()) {
        const wc = tab.view?.webContents;
        if (wc) refs.certificateExceptions.clear(wc.session);
      }
      refs.certificateExceptions.setCapForTest(64);
    },
    tabWebContentsId(id) { return tabs.get(id)?.view?.webContents?.id ?? null; },
```

In `main.js`'s `install({ … })` add `continueUnsafeForSender, forgetActiveCertificateException, certificateExceptions,`.

- [ ] **Step 4: Steps**

Append to `test/desktop/steps/site-certificate-safety.steps.js` (add `When` to the cucumber import):

```js
const { ctx } = require('../support/context');

async function waitForCertificatePage(world, tabId) {
  await world.waitForState((state) => state.tabs.some((tab) =>
    tab.id === tabId && tab.loadedUrl.startsWith('blanc://error/') && tab.loadedUrl.includes('kind=certificate')),
  { timeout: 10_000 });
}
async function waitForSiteState(world, tabId, expected) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const payload = await world.call('serializedTabsPayload');
    const state = payload.find((entry) => entry.id === tabId)?.siteInfo?.state;
    if (state === expected) return;
    if (Date.now() > deadline) throw new Error(`tab ${tabId} site state ${state}, expected ${expected}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function continueLocal(world, tabId) {
  await waitForCertificatePage(world, tabId);
  const result = await world.call('continueUnsafeInTab', tabId);
  assert.deepEqual(result, { ok: true });
  await waitForSiteState(world, tabId, 'certificate-exception');
}

Given('I navigate to a local address with an untrusted certificate', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('local', '?probe=1'));
  await waitForCertificatePage(this, this.localTabId);
  this.untrustedCertificateTabId = this.localTabId; // reuse the interstitial step
});

When('I open Advanced and continue to the local address', async function () {
  const clicked = await this.call('executeTab', this.localTabId, `(() => {
    const toggle = document.querySelector('.advanced-toggle');
    if (!toggle) return 'no-toggle';
    toggle.click();
    const proceed = document.getElementById('continueUnsafe');
    if (!proceed || document.getElementById('advancedPanel').hidden) return 'no-panel';
    if (!/^Continue to nas\\.home\\.arpa:\\d+ \\(unsafe\\)$/.test(proceed.textContent)) return proceed.textContent;
    proceed.click();
    return 'clicked';
  })()`);
  assert.equal(clicked, 'clicked');
});

Then('the local page loads with its same-origin script', async function () {
  await waitForSiteState(this, this.localTabId, 'certificate-exception');
  const loaded = await this.call('executeTab', this.localTabId, 'window.__subresourceLoaded === true');
  assert.equal(loaded, true);
});

Then('the site information reports that I continued past a warning', async function () {
  const payload = await this.call('serializedTabsPayload');
  const tab = payload.find((entry) => entry.id === this.localTabId);
  assert.equal(tab?.siteInfo?.state, 'certificate-exception');
  assert.equal(tab?.siteInfo?.title, 'Not secure');
});

Given('I continued past the warning on the local address', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('local', '?probe=1'));
  await continueLocal(this, this.localTabId);
});

When('the local address starts presenting a different certificate', function () {
  ctx.localFixtures.handle.setCertificate(ctx.localFixtures.certB);
});

When('I reload the local tab', async function () {
  await this.call('executeTab', this.localTabId, 'location.reload()');
});

Then('Blanc shows a certificate safety interstitial for the local tab', async function () {
  await waitForCertificatePage(this, this.localTabId);
});

Given('two tabs continued past the warning on the local address', async function () {
  this.localTabId = await this.call('openTab', this.localFixtureUrl('one'));
  await continueLocal(this, this.localTabId);
  this.secondLocalTabId = await this.call('openTab', this.localFixtureUrl('two'));
  await waitForSiteState(this, this.secondLocalTabId, 'certificate-exception');
});

When('I stop allowing the local address from the first tab', async function () {
  assert.equal(await this.call('forgetCertificateExceptionInTab', this.localTabId), true);
});

Then('the first tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.localTabId);
});

Then('the second tab still reports that I continued past a warning', async function () {
  const payload = await this.call('serializedTabsPayload');
  assert.equal(payload.find((entry) => entry.id === this.secondLocalTabId)?.siteInfo?.state, 'certificate-exception');
});

When('I reload the second tab', async function () {
  await this.call('executeTab', this.secondLocalTabId, 'location.reload()');
});

Then('the second tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.secondLocalTabId);
});

When('I open the local address in a private tab', async function () {
  this.privateLocalTabId = await this.call('openTab', this.localFixtureUrl('private'), { private: true });
});

Then('the private tab shows the certificate safety interstitial', async function () {
  await waitForCertificatePage(this, this.privateLocalTabId);
});

When('I close the local tab and reopen it straight away', async function () {
  this.closedWebContentsId = await this.call('tabWebContentsId', this.localTabId);
  await this.call('closeTab', this.localTabId);
  await this.call('reopenClosed');
  await this.waitForState((state) => state.activeTabId !== this.localTabId, { timeout: 5_000 });
  this.localTabId = (await this.call('state')).activeTabId;
});

Then('the reopened tab shows the same page without loading it again', async function () {
  assert.equal(await this.call('tabWebContentsId', this.localTabId), this.closedWebContentsId);
});

Then('the reopened tab still reports that I continued past a warning', async function () {
  await waitForSiteState(this, this.localTabId, 'certificate-exception');
});

When("the local address's choice is evicted", async function () {
  await this.call('setCertificateExceptionCap', 0);
});

Given('I continued past the warning on the lab address', async function () {
  this.labTabId = await this.call('openTab', this.localFixtureUrl('lab-one', '', 'lab.home.arpa'));
  await continueLocal(this, this.labTabId);
});

When('the lab address starts presenting a trusted certificate', function () {
  ctx.localFixtures.handle.setCertificate(ctx.localFixtures.certTrusted);
});

When('I stop allowing the lab address without reloading', async function () {
  assert.equal(await this.call('forgetCertificateExceptionOnly', this.labTabId), true);
});

When('I navigate the lab tab to another page on the same address', async function () {
  const target = this.localFixtureUrl('lab-two', '', 'lab.home.arpa');
  await this.call('executeTab', this.labTabId, `location.href = ${JSON.stringify(target)}`);
});

Then('the lab tab reports a secure connection', async function () {
  await waitForSiteState(this, this.labTabId, 'secure');
});

When('I go back in the lab tab', async function () {
  await this.call('executeTab', this.labTabId, 'history.back()');
});

When('I go forward in the lab tab', async function () {
  await this.call('executeTab', this.labTabId, 'history.forward()');
});

Then('the lab tab still reports that I continued past a warning', async function () {
  await waitForSiteState(this, this.labTabId, 'certificate-exception');
});
```

Check that `state()` exposes `activeTabId` (`grep -n "activeTabId" src/main/test-hook.js`); use the field it does expose if named differently. Scenario F39-2's interstitial step reads `this.untrustedCertificateTabId`, hence the alias in the first Given.

- [ ] **Step 5: Positive control before trusting the new scenarios**

Each new scenario must be shown able to fail before its pass is trusted:

- Temporarily make `commitEntryMarks` return `record: freshRecord` (ignore stored marks on traversal). Run `@F39-7`: it must FAIL at "the lab tab still reports that I continued past a warning". Restore.
- Temporarily drop `certificateEntryMarks` and `documentCertificateException` from `buildTabEntry`'s seed. Run `@F39-6`: it must FAIL at "the reopened tab still reports". Restore.
- Temporarily make `forgetActiveCertificateException` skip both `forget` and `closeAllConnections`. Run `@F39-4`: it must FAIL at "the first tab shows the certificate safety interstitial". Restore.

Run one scenario (macOS local) with: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F39-7"` (prefix `xvfb-run -a` on Linux).

- [ ] **Step 6: Make them runnable and run the whole F39 set**

`cucumber.mjs:54`: replace `'@F39-1',` with `'@F39-1', '@F39-2', '@F39-3', '@F39-4', '@F39-5', '@F39-6', '@F39-7',`.

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F39-1 or @F39-2 or @F39-3 or @F39-4 or @F39-5 or @F39-6 or @F39-7"`
Expected: 7 scenarios passed. Then `npm run test:acceptance:dry` → PASS.

- [ ] **Step 7: Commit**

```bash
git add test/desktop src/main/test-hook.js src/main/main.js
git commit -m "Cover local certificate continue, Stop allowing, private isolation, reopen and Back in acceptance"
```

---

### Task 9: Full verification and PR

- [ ] **Step 1: Every gate**

Run: `npm run lint && npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Then the full desktop suite: `npm run test:acceptance:desktop`. Compare any failure against `origin/main` before blaming this branch (known local flakes are recorded in memory).

- [ ] **Step 2: Packaged check on this Mac**

Run `npm run dist:dir`, launch the packaged app with a scratch `--user-data-dir`, and visit a real self-signed local device (or `openssl s_server -accept 8443 -www` with a self-signed cert, reached at `https://127.0.0.1:8443/`). Confirm: Advanced → Continue loads it; the island shows Not secure; Stop allowing returns the warning; `https://expired.badssl.com/` still has no Advanced link. Screenshot before/after per the before/after proof format.

- [ ] **Step 3: Rename the branch, push, open the PR**

```bash
git branch -m spec/certificate-continue-local feat/certificate-continue-local
git fetch origin && git rebase origin/main
git push -u origin feat/certificate-continue-local
gh pr create --title "Let users continue past certificate warnings on local addresses" --body-file <(…)
```

PR body: link #544, the spec and this plan; state the accepted HSTS limitation verbatim from spec §3.3; list the gates run with their results; say Linux packaged confirmation is still pending (the reporter's platform) and ask in #544 only after the owner approves posting.
