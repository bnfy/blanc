# Continue past a certificate warning on local addresses — design

**Date:** 2026-10-05
**Status:** approved for implementation — revision 3, plus the plan-revision-2 per-entry addendum in §4.5 (round 1: HSTS on local names, expiry under a higher-priority error, document-bound warning state; round 2: Reopen Closed Tab live-view adoption, `clear()` for profile deletion, stored-entry shape). Design approved for implementation planning on round 2, conditional on these round-2 changes.
**Trigger:** [bnfy/blanc#544](https://github.com/bnfy/blanc/issues/544). A
Blanc 1.27.0 user on Linux cannot reach their self-hosted Proxmox server at
`https://192.168.x.x:8006` because it uses a self-signed certificate. Blanc
shows "Your connection isn't private" and offers no way through. The reporter
tried Chrome's `thisisunsafe` phrase, which Blanc has never supported.

**Owner decision (2026-10-05):** "It should be up to the user if they want to
bypass the missing certificate warning and browse the unsecure site anyway."
That reverses F39's "No certificate bypass is offered" rule. Four follow-up
choices were made in the same session:

| Question | Decision |
| --- | --- |
| How long is the choice remembered? | Until Blanc quits. Nothing is written to disk or synced. |
| Private tabs? | Offered. A private-tab choice applies only to private tabs; a normal-tab choice never reaches private tabs. |
| How visible? | Behind an **Advanced** disclosure. **Back to safety** stays the primary action. |
| Which sites? | Local and private-network addresses only. Public sites keep today's hard stop. |

## 1. Current behavior

- `src/main/tab-view.js:444-454` handles every tab's `certificate-error`
  event. For main-frame failures it stores bounded presentation data on
  `tab.certificateError`, then always calls `callback(false)`.
- `did-fail-load` (`tab-view.js:423-440`) loads
  `blanc://error/?kind=certificate&…`, built by `certificateErrorQuery`
  (`src/main/site-security.js:144-157`).
- `src/renderer/pages/error.html` / `error.js` render the warning with
  **Try again** and **Back to safety** only.
- `site-security.js:56-88` installs a `setCertificateVerifyProc` that
  always returns `-3`, delegating to Chromium and keeping Certificate
  Transparency. This design does not change it.
- The policy is pinned in `spec/features.md` (F39),
  `spec/acceptance/site-certificate-safety.feature`,
  `test/desktop/steps/site-certificate-safety.steps.js:31-35`, and
  `test/unit/site-security.test.js:57-66`. Issue #193 (shipped in v1.11.0
  through PR #238) introduced it.

## 2. Electron facts this design relies on

Verified against Electron v44.5.1 source, the version Blanc ships:

1. **No HSTS signal.** `App::AllowCertificateError`
   (`shell/browser/api/electron_api_app.cc:737-757`) receives Chromium's
   `strict_enforcement` flag and drops it. The emitted event carries only
   URL, error string, certificate, callback and `isMainFrame`. Blanc cannot
   tell whether a host declared HSTS, which is why Chrome's "never bypass an
   HSTS site" rule cannot be copied and the local-only scope was chosen. The
   local-only scope **narrows** that exposure but does not close it; §3.3
   states the remaining gap.
2. **Same event object.** `lib/browser/api/web-contents.ts:111-118` routes
   the app event to `webContents.emit(name, event, …)` with the same `event`.
   Calling `event.preventDefault()` in the tab handler suppresses Electron's
   default deny (`electron_api_app.cc:754-756`). Allowing therefore requires
   `event.preventDefault()` followed by `callback(true)`.
3. **No Chromium-side memory.** `ElectronBrowserContext::GetSSLHostStateDelegate`
   (`shell/browser/electron_browser_context.cc:665-668`) returns `nullptr`.
   Chromium never caches an "allowed" decision, so every failing request,
   including subresources, asks Blanc again. Blanc's own store is therefore
   the single source of truth, and forgetting an exception takes effect on the
   next request. Already-open connections may still be reused, so forgetting
   also calls `session.closeAllConnections()`.

## 3. Scope

### 3.1 Eligible hosts

A certificate failure may offer **Continue** only when the failing URL is
`https:` and its hostname is a local or private-network address. A new pure
function `isLocalNetworkHost(hostname)` in `site-security.js` decides:

- **Loopback:** everything `isLoopbackHost` already accepts (`localhost`,
  `*.localhost`, `127.0.0.0/8`, `::1`).
- **Private IPv4:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **Link-local IPv4:** `169.254.0.0/16`.
- **Shared address space IPv4:** `100.64.0.0/10` (carrier-grade NAT; also used
  by Tailscale and similar overlay networks, a common home-lab case).
- **IPv6:** unique-local `fc00::/7` and link-local `fe80::/10`, in bracketed
  URL form.
- **Local-use names:** single-label hosts (no dot, e.g. `proxmox`), and names
  ending in `.local`, `.lan`, `.internal` or `.home.arpa`.

Everything else, including public IP literals and every public domain, stays
ineligible: the warning page looks exactly as it does today. `.test` is
deliberately not on the list; the existing `badcert.test` acceptance fixture
keeps proving the public hard stop.

**Known limitation (DNS).** A local-use name is trusted by its spelling, not
by where it resolves. A hostile DNS server could point `router.lan` at a
public address. Reaching that state already requires control of the user's
resolver, and the user still has to choose Continue on a page that says the
site may be impersonated.

### 3.2 Eligible errors

Only these Chromium errors may be continued past:

- `ERR_CERT_AUTHORITY_INVALID` (self-signed or private CA — the #544 case)
- `ERR_CERT_COMMON_NAME_INVALID` (name mismatch, e.g. visiting by IP)
- `ERR_CERT_SELF_SIGNED_LOCAL_NETWORK` (Chromium's dedicated local
  self-signed error, where the shipped Chromium reports it)
- `ERR_CERT_DATE_INVALID` (expired or not yet valid)
- `ERR_CERT_WEAK_SIGNATURE_ALGORITHM`
- `ERR_CERT_VALIDITY_TOO_LONG`
- `ERR_CERT_NON_UNIQUE_NAME`

Any other error keeps the hard stop. The list is an allowlist so a future
Chromium error defaults to blocked.

**Why the generic `ERR_CERT_INVALID` is excluded.** Chromium reports a single
prioritized error for a certificate that may have several problems
(`MapCertStatusToNetError`, `net/cert/cert_status_flags.cc`). `CERT_STATUS_INVALID`
is checked first, before pinning, known-interception and `CERT_STATUS_REVOKED`.
A revoked certificate that is also malformed therefore surfaces as
`ERR_CERT_INVALID`, so allowing that error could let a revoked certificate
through. The same ordering puts `ERR_CERT_AUTHORITY_INVALID` and
`ERR_CERT_COMMON_NAME_INVALID` ahead of `ERR_CERT_DATE_INVALID`, which is why
§4.1 checks validity dates itself instead of trusting the error string.

### 3.3 Remaining HSTS gap (accepted limitation)

Local names can carry HSTS. A host such as `nas.home.arpa` that was once
served with a certificate from a private CA the device trusts can send
`Strict-Transport-Security`, and Chromium records it
(`net/http/transport_security_state.cc`, dynamic STS state, which Chromium
persists across restarts). If that host later presents an untrusted
certificate, Chrome would refuse to let the user through; Blanc cannot see
that state (§2.1) and would offer Continue.

Mitigation, partial by design: the existing certificate observer
(`createCertificateObserver`, `site-security.js:51`) gains a per-session set
of hostnames that passed verification (`verificationResult === 'OK'`) during
this run. Unlike the observer's display records, the set is not cleared when a
later verification fails. A host in that set is **ineligible**: a device that
presented a trusted certificate earlier in the session and now presents an
untrusted one keeps the hard stop. This covers the attack window in which
HSTS matters most (a trusted device suddenly failing) for the current run
only. It does not cover HSTS learned in an earlier run, and the spec, the
F39 text and the release notes must not claim parity with Chrome's HSTS rule.

## 4. Design

### 4.1 Exception store (main process only)

New pure module `src/main/certificate-exceptions.js`, no
`require('electron')`, unit-tested:

```js
createCertificateExceptions() → {
  isEligible({ url, error, certificate, verifiedThisRun }) → boolean,
  allow(browsingSession, { url, error, certificate, now }) → boolean,
  matches(browsingSession, { url, error, certificate, now }) → boolean,
  get(browsingSession, url) → { error, certificate } | null,  // commit-time recompute
  forget(browsingSession, url) → boolean,   // Stop allowing: one origin
  clear(browsingSession) → void,            // profile deletion: every origin
}
```

- Storage is a `WeakMap<Session, Map<originKey, {fingerprint, error, timeValidAtAllow, certificate}>>`,
  where `certificate` is the already-sanitized display record (subject,
  issuer, validity, fingerprint) from `sanitizeCertificate`.
  `originKey` is `https://<lowercased host>:<effective port>`.
- Keying on the session object gives the separation the owner chose:
  the normal session, the private session, and each named profile's sessions
  have independent maps. Nothing crosses between them.
- `isEligible` requires an `https:` local host (§3.1), an allowlisted error
  (§3.2), a fingerprint, finite `validFrom`/`validTo` values, and
  `verifiedThisRun === false` (§3.3). A certificate without dates or a
  fingerprint is ineligible.
- `allow` records the fingerprint, the error, and a **validity snapshot**:
  whether `now` fell inside `[validFrom, validTo]` when the user chose
  Continue (`timeValidAtAllow`).
- `matches` requires the same origin key, the **same certificate
  fingerprint**, the same error, **and** an unchanged validity snapshot:
  `isTimeValid(certificate, now) === timeValidAtAllow`. The date check is
  explicit because a self-signed certificate that expires keeps reporting
  `ERR_CERT_AUTHORITY_INVALID` (§3.2), so the error string alone would never
  change. Crossing `validTo` (or `validFrom`, for a not-yet-valid
  certificate) therefore brings the warning back even though the error is
  identical. `now` is injected so tests control the clock.
- At most one exception per origin; a newer `allow` replaces it. A
  per-session cap of 64 origins evicts the oldest; eviction calls the
  injected `onEvict(browsingSession)` hook, which main wires to
  `session.closeAllConnections()` so a pooled connection cannot outlive its
  exception (§4.5 explains why open documents keep their warning).
- It lives only in memory: never persisted, synced, sent over IPC, written to
  `session.json`, or included in crash/telemetry data. Quitting Blanc clears
  it, which matches "until Blanc quits" for both normal and private sessions
  (Blanc's private session already keeps its cookies until quit).
- Named-profile deletion (`clearNamedProfileSessions`, `main.js:8421`) calls
  `clear(session)` for both the deleted profile's normal and private sessions,
  alongside the existing `clearStorageData`/`clearCache`/`clearAuthCache`.
  `forget` needs a URL and is reserved for Stop allowing. Because the map is a
  `WeakMap`, this is belt and braces.

### 4.2 The tab's certificate-error handler

`tab-view.js` gains the store through its existing `deps` and changes the
handler to:

```js
wc.on('certificate-error', boundToTab((event, failedUrl, error, certificate, callback, isMainFrame) => {
  if (tab.sleeping || tab.view?.webContents !== wc) return callback(false);
  const sanitized = sanitizeCertificate(certificate);
  if (certificateExceptions.matches(wc.session, { url: failedUrl, error, certificate: sanitized, now: Date.now() })) {
    if (isMainFrame) tab.pendingCertificateException = { url: failedUrl, certificate: sanitized };
    event.preventDefault();
    return callback(true);
  }
  if (isMainFrame) tab.certificateError = { url: failedUrl, error, certificate: sanitized };
  callback(false);
}));
```

- An exception applies to every request to that exact origin with that exact
  certificate, main frame or subresource. This is required: a Proxmox page
  loads its scripts from the same origin, and with no Chromium-side memory
  (§2.3) each of those requests asks again.
- A request to a **different** origin with its own bad certificate still
  fails silently, as today.
- Popup and OAuth windows that are not Blanc tabs are untouched; Electron's
  default deny still applies to them.

### 4.3 Warning page

`certificateErrorQuery` gains one field, `continue=1`, set only when the
store reports the failure eligible. The page never decides eligibility.

When `continue=1`, `error.html` shows a third link, **Advanced**, after
**Try again** and **Back to safety**. Activating it reveals (and moves focus
to) a short panel:

> This site's certificate isn't trusted, so Blanc can't confirm who you're
> talking to. Someone on your network could be impersonating it. Only
> continue if you know this device — for example, a router, NAS or server on
> your own network.
>
> **Continue to 192.168.1.5:8006 (unsafe)**

- The host:port label comes from the page's own `url` parameter, displayed
  with `textContent` only.
- The Continue control calls `window.bowserPages.errorPage.continueUnsafe()`
  with **no arguments**. The page cannot name a URL or fingerprint.
- `Escape` or a second activation of **Advanced** collapses the panel.
- Without `continue=1` the page is byte-for-byte today's behavior.

### 4.4 IPC: `pages:error:continue-unsafe`

- `tab-preload.js` exposes `errorPage: { continueUnsafe() }` only when
  `location.host === 'error'`.
- `pages.js` registers it with `handleEvent('pages:error:continue-unsafe',
  'error', …)` so `isTrustedPagesEvent` enforces the exact top-level
  `blanc://error/` document and session.
- `pageSurfaces.owns` in `main.js` accepts host `error` when the sender is a
  live tab's WebContents owned by the current window runtime, the same rule
  already used for `newtab` and `mahjong`.
- The main-process handler resolves the tab from the sender's WebContents id,
  reads that tab's **main-held** `tab.certificateError`, re-checks
  `isEligible`, calls `allow(wc.session, { url, error, certificate })`, and then
  `queueTabNavigation(... loadURL(certificateError.url))`. It returns
  `{ ok: true }` or `{ ok: false, error: 'not-eligible' | 'no-certificate-error' }`.
- `browser-api/bridges.json` records the new channel with host list
  `['error']`; `npm run browser-api:build` regenerates it and
  `browser-api:check` enforces the preload/handler/host agreement.

### 4.5 Island site information

**The warning belongs to the loaded document, not to the store.** Removing an
exception (Stop allowing in another tab) or evicting it at the cap must never
turn an already-open page from "Not secure" into "Connection is secure": that
page's bytes were still fetched over a connection Blanc could not verify.

- The handler in §4.2 sets `tab.pendingCertificateException` when it allows a
  **main-frame** request.
- On main-frame cross-document commit (`did-navigate`, `tab-view.js:335`; `tab-view.js:369` is
  the `did-start-navigation` reset of `certificateError`), the tab sets
  `tab.documentCertificateException` to the pending record when its origin
  equals the committed URL's origin, **or** when the store still has an
  exception for the committed origin (a navigation served on a pooled
  connection may never raise a new `certificate-error`). Otherwise it sets it
  to `null`. `pendingCertificateException` is cleared on every commit.
- Same-document navigations (`did-navigate-in-page`) leave it unchanged.
- Nothing else clears it: not `forget`, not eviction, not a store change made
  from another tab. Only the next cross-document commit, which recomputes it,
  replaces it. A page loaded under an exception is therefore marked until
  that document is replaced.
- Like `certificateError`, it is main-process state and crosses IPC only as
  the site-info projection.
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

### 4.6 Lifecycles that keep or replace the document

The record must follow the document, so every path that moves a live document
to a new tab record carries it, and every path that rebuilds the document
recomputes it.

- **Reopen Closed Tab, live-view tier (~30 s).** A closed tab may be parked
  and later adopted without another navigation (`createTab({ adoptView })`,
  `main.js:6340`). `buildTabEntry` (`src/main/closed-tabs.js:73`) adds
  `documentCertificateException` to the entry's existing document-scoped
  `seed`, and `reopenEntry` already applies the seed with
  `Object.assign(tab, entry.seed)` (`main.js:6346`). The reopened tab
  therefore keeps "Not secure" for the unchanged page. The record is a
  closed-entry secret like the snapshot: it stays in main, and
  `projectEntries` still exposes only `{id, title, favicon, tabCount}`. This
  keeps today's reopen behavior; holding eligibility is unchanged.
- **Reopen Closed Tab, snapshot/URL tiers.** The page is loaded again, so the
  commit-time rule in §4.5 recomputes the record: the exception is used if it
  is still in the store and still matches, otherwise the warning returns.
- **Move Tab to New Window** adopts the same tab record, so the record moves
  with it unchanged.
- **Quiet Tabs.** Discarding a renderer destroys the document; waking reloads
  it and the commit-time rule recomputes. The storage-preserving variant
  reloads the same WebContents, which is also a new commit.
- **Private tabs** are never recorded for reopen, so they need no seed.

`buildSiteInfo` gains a `certificateException` input fed from
`tab.documentCertificateException`. When it is set, the site-info state is a
new `certificate-exception`:

- **Title:** "Not secure"
- **Summary:** "You chose to continue even though this site's certificate
  isn't trusted. Blanc will warn you again after it restarts."
- The certificate details already shown for `certificate-error` are shown
  here too (subject, issuer, validity, fingerprint), read from
  `tab.documentCertificateException.certificate`, so they stay correct after
  the store entry is gone. `tab.certificateError` is still cleared on commit
  (`tab-view.js:369`) as today, so the two states can never both apply. The
  site-info builder in `main.js` (around line 3971) passes the tab's record
  alongside the existing `certificateError`. The store's `get` is used only by
  the commit-time recomputation above.
- **Action:** a **Stop allowing** button next to Privacy settings. It calls a
  new `browserAPI.siteInfoForgetCertificateException()` →
  `chrome:site-info-forget-certificate-exception`, which forgets the active
  tab's origin in its session, closes that session's connections, and reloads
  the tab, which shows the warning again. Other open tabs on the same origin
  keep their "Not secure" state until they navigate; their next request
  fails, and their next cross-document load shows the warning.
- The island's site-info button uses the same warning glyph as `insecure` and
  `certificate-error`. The island hint reads
  "you continued past a certificate warning".
- `browser-api/contract.json` adds the state literal to the `siteInfo.state`
  union and the new invoke member; `npm run browser-api:build`.

## 5. What does not change

- `setCertificateVerifyProc` still returns `-3`; Blanc never accepts a
  certificate globally.
- Public hosts, revoked certificates and non-tab windows: hard stop.
- No typed passphrase (`thisisunsafe`), no Settings exception list, no
  persistence.
- The private-tab quick exit, history, and session rules are untouched. A
  restored tab that hits the warning simply shows it again.

## 6. Spec and policy updates (same PR)

Per the repository's spec-first rule, the change ratifies the new contract in
`spec/` and updates every guard in the same commit as the behavior:

- `spec/features.md` F39: replace "No certificate bypass is offered" with the
  local-only, session-only, Advanced-disclosure contract above, including
  the private-session separation.
- `spec/acceptance/site-certificate-safety.feature`: keep the existing
  scenario retitled "A public site's invalid certificate offers no way
  through"; add `@F39-2` "A local address can be continued past for the
  session" and `@F39-3` "A different certificate on the same local address
  warns again".
- `test/desktop/steps/site-certificate-safety.steps.js`: the existing
  no-bypass step stays and now asserts against the public fixture. New steps
  drive Advanced → Continue and the site-info state.
- `test/unit/site-security.test.js`: the "contains no bypass" test becomes
  "offers continue only for eligible local failures", asserting `continue`
  is absent for `badcert.test` and present for a `192.168.*` host.
- `spec/parity-matrix.md` has no F39 row today; none is added.

## 7. Testing

**Unit (`node --test`):**

- `isLocalNetworkHost`: every range boundary in §3.1, both sides (e.g.
  `172.15.255.255` no, `172.16.0.0` yes, `172.31.255.255` yes, `172.32.0.0`
  no; `100.63.255.255` no, `100.64.0.0` yes, `100.127.255.255` yes); IPv6
  bracketed and unbracketed; `.local`/`.lan`/`.internal`/`.home.arpa`/
  single-label yes; `example.com`, `8.8.8.8`, `badcert.test`,
  `lan.example.com` no.
- `certificate-exceptions`: eligibility per error, including
  `ERR_CERT_INVALID` and `ERR_CERT_REVOKED` ineligible; ineligible when
  `verifiedThisRun` is true or dates/fingerprint are missing; `matches` false
  for a different fingerprint, error, port, scheme or session; private and
  normal sessions isolated; `forget` removes one origin; `clear` removes every
  origin for one session and leaves other sessions untouched; the 64-origin
  cap calls `onEvict`.
- **Validity transition:** allow a self-signed certificate at `now` inside
  its validity with `ERR_CERT_AUTHORITY_INVALID`; `matches` is true just
  before `validTo` and false just after it, with the error string unchanged.
  The mirror case for a not-yet-valid certificate crossing `validFrom`.
- Certificate observer: a host verified `OK` and later failing stays in the
  verified-this-run set; sessions are independent.
- `certificateErrorQuery`: `continue=1` only for eligible input.

**Desktop acceptance (Playwright-Electron, xvfb in CI):** a third TLS fixture
with its own self-signed certificate for `nas.home.arpa`, added to the
harness's `--host-resolver-rules`. Scenarios:

1. Public `badcert.test`: no Advanced link, no continue control (existing).
2. `nas.home.arpa`: Advanced reveals Continue; Continue loads the fixture,
   including a same-origin script subresource that must execute; site info
   reports `certificate-exception`.
3. **Stop allowing** returns the tab to the warning.
4. A private tab visiting `nas.home.arpa` after a normal-tab continue still
   gets the warning.
5. **Two tabs, revocation:** two tabs on `nas.home.arpa` both show
   `certificate-exception`; **Stop allowing** in tab A returns A to the
   warning while tab B still reports `certificate-exception` (never
   `secure`); reloading B shows the warning.
6. **Reopen during the live-view window:** continue past the warning on
   `nas.home.arpa`, close the tab, reopen it within the hold window, and
   assert the reopened tab adopted the same document (no new navigation) and
   still reports `certificate-exception`, never `secure`. A unit test asserts
   `buildTabEntry` copies the record into `seed` and `projectEntries` does not
   expose it.
7. **Eviction:** with the cap lowered through a new test-only setter on `src/main/test-hook.js` (installed only when `BLANC_TEST=1` in unpackaged builds), a tab
   whose exception is evicted keeps `certificate-exception` until it
   navigates, then shows the warning.

Commit-time recomputation (pending record, pooled-connection fallback,
same-document navigation, cross-origin navigation clearing it) is also
unit-tested as a pure function extracted from the `did-navigate` handler.

**Manual:** a packaged Linux build against a real self-signed device, which
closes the #544 loop. Ask the reporter to confirm on the next release.

## 8. Out of scope

- Remembering choices across restarts, and a Settings list to manage them.
- Any bypass for public sites. Revisit only if Electron exposes Chromium's
  HSTS / `strict_enforcement` signal.
- Client-certificate selection (`select-client-certificate`).
- The separate Linux Settings bug in #548.
