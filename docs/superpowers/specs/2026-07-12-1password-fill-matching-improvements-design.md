# 1Password fill — subdomain + multi-step matching improvements

**Date:** 2026-07-12
**Status:** Approved for planning (rev. 2 — after security review)
**Branch:** `feature/1password-fill` (builds on the feasibility spike)

## What

Two focused improvements to Blanc's 1Password fill so it works on more of the
user's real logins:

1. **Subdomain matching** — an item saved for `google.com` should fill on
   `accounts.google.com` (and any `*.google.com`), not only an exact-host page.
2. **Multi-step logins** — on a username-first screen (Google/Microsoft style)
   that has no password field yet, `⌥⌘P` should fill the username; the second
   press on the password screen fills the password. Stateless — no credential is
   held across the navigation.

**Scope note:** this improves the **personal dev build**. It is *not* the
shippable engine and does not depend on the §4.1(e) legal reply
([`1password-legal-inquiry.md`](../../1password-legal-inquiry.md)) — that gate
governs public distribution, not local use. The code retains its `SPIKE` framing
and dev env-gating.

## Part 1 — Subdomain matching (`src/main/onepassword.js`)

Change matching from exact-host to **registrable-domain (eTLD+1) equality**,
computed with `tldts-experimental`'s `getDomain` **with `allowPrivateDomains: true`**:

- Each host (page + each stored item URL) reduces to its registrable domain,
  compared for equality.
  - `accounts.google.com` and item `google.com` → both `google.com` → **match**.
  - `www.github.com` ↔ `github.com` → **match** (subsumes the old `www.` strip).
  - `github.com.evil.com` vs `github.com` → `evil.com` ≠ `github.com` → **no match**.
  - `foo.co.uk` → `foo.co.uk` (ICANN multi-part suffix handled).
- **`allowPrivateDomains: true` is required, not optional.** With the default
  (`false`), `getDomain('user.github.io')` returns `github.io`, so
  `alice.github.io` and `bob.github.io` both collapse to `github.io` and would
  **cross-match** — a saved item for one tenant would silently fill on another
  (`github.io`, `vercel.app`, `pages.dev`, `herokuapp.com`, `appspot.com`, …).
  With the flag, `user.github.io` → `user.github.io`, so per-tenant hosts stay
  distinct. Verified against the pinned `tldts-experimental@7.4.6`. The flag does
  not change the ICANN cases above.
- **Fallback:** `getDomain` returns `null` for hosts with no suffix at all
  (`localhost`, raw IPs, single-label intranet names). When the key is null, fall
  back to today's exact normalized-host equality so local/dev logins keep
  working. Match key: `getDomain(host, { allowPrivateDomains: true }) || host`.

**Behavior consequence (intended):** an item saved for a bare registrable domain
now fills across all of its subdomains, symmetric on the registrable domain —
1Password's default "anywhere on website" behavior, the breadth selected. The
existing multi-match chooser covers the case where several items now match; note
it does **not** mitigate a *single* wrong match, which is why the PSL flag above
matters.

```js
const { getDomain } = require('tldts-experimental');

// `host` is already normalized by normalizeHost (lowercased, www-stripped).
function registrableKey(host) {
  return getDomain(host, { allowPrivateDomains: true }) || host;
}

function matchesHost(itemUrls, host) {
  const targetHost = normalizeHost(host);
  if (!targetHost || !Array.isArray(itemUrls)) return false;
  const targetKey = registrableKey(targetHost);
  return itemUrls.some((u) => {
    const h = normalizeHost(u);
    return h != null && registrableKey(h) === targetKey;
  });
}
```

`normalizeHost` is unchanged. **Dependency:** promote `tldts-experimental` to a
**direct** dependency, pinned to the version already resolved via
`@ghostery/adblocker` (`7.4.6`) so the same physical copy is reused and the
`require` is owned rather than incidental.

## Part 2 — Multi-step fill via a two-phase, least-privilege flow

The fill now runs in **two injections** so the password is embedded only into a
page that actually has a password field:

1. **Inspect (credential-free).** Inject a script carrying **no credentials**. It
   runs the identity guard, collects the page's candidate inputs, runs the shared
   `selectFields` decision, and returns booleans only:
   `{ originMismatch } | { originMismatch: false, hasPassword, hasUsername }`.
2. **Decide (main process).** From those booleans choose which credentials to
   send — `sendPass = hasPassword ? password : null`,
   `sendUser = hasUsername ? username : null`. On a username-only step
   `hasPassword` is false, so **the password is never embedded**.
3. **Re-validate.** The inspection was async, so re-check the full identity set
   (live+focused window, same active tab, live+focused webContents, unchanged
   `navEpoch`, exact `wc.getURL() === expectedURL`) **before** the second
   injection — the same guard the single-phase flow already runs before injecting.
4. **Fill.** Inject `buildFillScript` with only the non-null credentials. It
   re-runs the identity guard and the **same** `selectFields` (deterministic on
   the unchanged DOM), fills the selected fields, and returns
   `{ originMismatch, filledUser, filledPass }`.

### Shared field logic — pure `selectFields`, embedded by `.toString()`

The security-sensitive decision lives in **one pure function** so it's
unit-testable and identical in both injections. `isVisible`, `isSearchLike`,
`collectCandidates` (the thin DOM adapter), and `selectFields` are defined once
at module scope in `onepassword.js`; both `buildInspectScript` and
`buildFillScript` embed their source via `Function.prototype.toString()`, so the
code that runs in the page is exactly the code the unit tests import.
`selectFields` is also exported for the tests.

- `collectCandidates()` (DOM adapter, runs in page): returns an ordered array of
  descriptors, one per `input`, in document order:
  `{ i, type, autocomplete, name, id, placeholder, ariaLabel, formId, isVisible, isFocused, inSearchScope }`
  (`type`/`autocomplete` lowercased; `i` = index into the collected list;
  `inSearchScope` = inside a `[role="search"]` or `<form role="search">`;
  `isVisible` = `offsetParent !== null` + non-zero client rect + not
  `type="hidden"`; `isFocused` = `=== document.activeElement`).
- `selectFields(cands)` (pure): returns `{ passwordIndex, usernameIndex }`
  (either may be `null`).
  - **`isSearchLike(c)`** — excluded from username selection: `c.type === 'search'`,
    or `c.inSearchScope`, or `/(^|[^a-z])(search|query|q)([^a-z]|$)/i` matches any
    of `name`/`id`/`autocomplete`/`placeholder`/`ariaLabel`.
  - **`passwordIndex`** — first visible `type === 'password'` descriptor (never a
    search field; passwords aren't search-like).
  - **`usernameIndex`** — a visible text/email/tel descriptor, **never
    `isSearchLike`**, chosen by:
    - *When a password field exists* (single-page or password step): the focused
      text candidate; else the nearest text candidate preceding the password in
      document order (preferring the same `formId`).
    - *When no password field exists* (username step), in order — requiring
      login-positive evidence, no bare guessing:
      1. the **focused** text candidate;
      2. `autocomplete === 'username'`;
      3. `name`/`id`/`autocomplete` matches `/user(name)?|login|account/i`;
      4. a **sole** `type === 'email'`/`autocomplete === 'email'` candidate
         (fires only if exactly one such email field exists — so a login email +
         a footer-newsletter email do **not** trigger a guess);
      5. if exactly **one** non-search text/email candidate exists on the whole
         page, use it;
      6. else `null` — ambiguous, no-op (never fill an unlabeled field among
         several, never a search box).

### Orchestrator outcome map (`fillActiveTabFrom1Password` in `main.js`)

Reads the two-phase results:
- inspect `originMismatch` → `origin-or-focus-mismatch`
- inspect `!hasPassword && !hasUsername` → `no-fillable-field`
- re-validation fails → the existing `abort-*` line
- fill `originMismatch` → `origin-or-focus-mismatch`
- `filledPass && filledUser` → `filled` `user+pass`
- `filledUser && !filledPass` → `filled` `user-only (multi-step step 1)`
- `filledPass && !filledUser` → `filled` `pass-only (username field not found)`
- otherwise → `nothing-filled`

Unchanged: `revealCredential` decrypts only the chosen item; the fill never
submits; credentials remain confined to the main process and the verified page,
are never logged (the phase-2 injection keeps its binding-less catch → `fill-error`),
and the password is embedded **only** when the page has a password field.

## Footprint

- **`src/main/onepassword.js`** — `matchesHost` (registrable-domain key +
  private-domains flag); `tldts-experimental` require + `registrableKey`; the
  shared DOM helpers + pure `selectFields`; `buildInspectScript` (new,
  credential-free); `buildFillScript` (rewritten to use `collectCandidates` +
  `selectFields`, fill only provided creds); export `selectFields`.
- **`src/main/main.js`** — `fillActiveTabFrom1Password`: run inspect → decide
  creds → re-validate → fill; the outcome map above (adds `no-fillable-field`,
  `filled user-only`; drops the old single `noPasswordField` branch).
- **`test/unit/onepassword-match.test.js`** — matching cases (subdomain matches;
  cross-tenant private-domain hosts must NOT match; co.uk; localhost/IP fallback)
  and **`selectFields` behavioral cases** (below).
- **`package.json` / `package-lock.json`** — add pinned `tldts-experimental@7.4.6`.

## Non-goals (unchanged — real-engine backlog)

Shadow-DOM piercing, cross-origin iframes, auto-advance across the multi-step
navigation (deliberately stateless — per-press), TOTP, and reading 1Password's
per-item `AnywhereOnWebsite`/`ExactDomain`/`Never` rules (uniform
registrable-domain match instead).

## Testing

**Unit — `test/unit/onepassword-match.test.js`** (`node --test`, pure — no
Electron/SDK/DOM):

- **`matchesHost`:** exact still matches; `www.` both directions; **subdomain now
  matches** (`accounts.google.com` ↔ item `google.com`); deep-subdomain item ↔
  parent; substring trap still **fails** (`github.com.evil.com` vs `github.com`);
  **cross-tenant private domains must NOT match** (`alice.github.io` vs
  `bob.github.io`; two `*.vercel.app`) — the `allowPrivateDomains` regression
  guard; **public suffix not collapsed** (`foo.co.uk` vs `bar.co.uk` don't
  match); **localhost + raw-IP fallback** (exact-only); item with no URLs;
  malformed stored URL skipped.
- **`selectFields`** (pure decision over descriptor fixtures — the behavioral
  core): each fixture is a hand-built candidate array. Cases:
  - Standard single-page login (visible username + password) → both indices.
  - Password step, no visible username → `passwordIndex` set, `usernameIndex` null.
  - **Username step** (email field, no password) → `usernameIndex` set.
  - **Focused search box** (`type=search` focused) + no login field → username null.
  - **Newsletter email + login email, no username signal** → username null (rule 4
    needs a *sole* email; rule 6 no-ops on ambiguity).
  - **Lone search field** (`name="q"`) → username null (search excluded).
  - Hidden/honeypot inputs (`isVisible:false`) → ignored.
  - `autocomplete="username"` chosen over an unrelated visible text input.
  - Google/Microsoft-style username step (`type=email` + `autocomplete=username`)
    → that field.
- **`buildInspectScript` / `buildFillScript`** (string assertions, secondary):
  inspect source carries **no** credential literal; fill source JSON-embeds only
  the provided creds and still contains the identity guard + native setter; both
  embed the same `selectFields` source.

**Manual** (fresh `npm start` with `BLANC_1P_ACCOUNT`):
- `accounts.google.com`, item saved for `google.com` → username fills
  (`filled user-only`); next screen → `⌥⌘P` → password fills.
- Single-page login on a subdomain of a saved item → `filled user+pass`.
- A page with only a search box → `no-fillable-field` (search not filled).
- Regression: exact-host single-page login → `filled user+pass`; a `localhost`/IP
  dev login still matches via fallback.

## Risks / edge cases

- **Cross-tenant over-match** — closed by `allowPrivateDomains: true` (verified:
  `user.github.io` → `user.github.io`). A single wrong match would fill silently
  (no chooser), so this flag is load-bearing, not cosmetic — covered by the
  cross-tenant unit tests.
- **`tldts-experimental` currently transitive** — promoting it to a direct pinned
  dependency removes the risk of an adblocker bump dropping/renaming it.
- **Inspect→fill TOCTOU** — the credential-free inspection opens a small window;
  closed by the main-side re-validation (step 3) plus the fill injection's own
  identity guard, and the DOM-determinism of `selectFields`.
- **DOM adapter not unit-tested** — `collectCandidates` (visibility/focus/ordering
  from the live DOM) needs a browser, so it's covered by the manual matrix; the
  security-critical *decision* (`selectFields`) is fully unit-tested. jsdom is not
  used — its no-layout `offsetParent`/`getBoundingClientRect` would make visibility
  fixtures unreliable.
- **Username heuristic residual** — bounded by search exclusion + login-positive
  evidence + no-guess-on-ambiguity; worst case is a no-op (`no-fillable-field`),
  never a wrong-field fill.
