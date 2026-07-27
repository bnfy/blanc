# 1Password fill — subdomain + multi-step matching improvements

**Date:** 2026-07-12
**Status:** Ready for planning (rev. 4 — after three security-review rounds; planning deferred)
**Branch:** `feature/1password-fill` (builds on the feasibility spike)

## What

Two improvements to Blanc's 1Password fill so it works on more real logins:

1. **Subdomain matching** — an item saved for `google.com` fills on
   `accounts.google.com` (any `*.google.com`), not only an exact-host page.
2. **Multi-step logins** — on a username-first screen with no password field yet,
   `⌥⌘P` fills the username; the second press on the password screen fills the
   password. Stateless — no credential is held across the navigation.

**Scope note:** improves the **personal dev build**, not the shippable engine.
Unaffected by the §4.1(e) question
([`1password-legal-inquiry.md`](../../1password-legal-inquiry.md)): 1Password
replied 2026-07-12 that they don't pre-approve compliance (no prohibition stated,
no ruling either way), and **distribution is shelved — personal-only**. Local use
against one's own vault was never in question. Retains `SPIKE` framing and dev
env-gating.
This revision pulls **isolated-world injection** forward from the real-engine
backlog because the two-phase design below only delivers its security value there.

## Part 1 — Subdomain matching (`src/main/onepassword.js`)

Match on **registrable domain (eTLD+1)** via `tldts-experimental`'s `getDomain`
**with `allowPrivateDomains: true`**:

- Each host (page + each stored item URL) reduces to its registrable domain;
  compare for equality.
  - `accounts.google.com` ↔ item `google.com` → both `google.com` → **match**.
  - `www.github.com` ↔ `github.com` → **match** (subsumes the `www.` strip).
  - `github.com.evil.com` vs `github.com` → `evil.com` ≠ `github.com` → **no match**.
- **`allowPrivateDomains: true` is required.** With the default, `getDomain`
  collapses PSL *private* suffixes — `user.github.io` → `github.io` — so
  `alice.github.io` and `bob.github.io` both become `github.io` and
  **cross-match** (`github.io`, `vercel.app`, `pages.dev`, `herokuapp.com`,
  `appspot.com`, …). With the flag, `user.github.io` → `user.github.io`. Verified
  against the pinned `tldts-experimental@7.4.6`; the flag doesn't change ICANN
  cases (`google.com`, `co.uk`, the `evil.com` trap).
- **Fallback:** `getDomain` returns `null` for hosts with no suffix (`localhost`,
  raw IPs, single-label intranet names) — fall back to exact normalized-host
  equality. Match key: `getDomain(host, { allowPrivateDomains: true }) || host`.

**Behavior (intended):** an item for a bare registrable domain fills across all
its subdomains, symmetric — 1Password's default "anywhere on website" breadth.
The multi-match chooser covers several matches; it does **not** mitigate a single
wrong match, so the PSL flag is load-bearing.

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

`normalizeHost` unchanged. **Dependency:** promote `tldts-experimental` to a
**direct** dependency, pinned to the tree's resolved `7.4.6` (same physical copy).

## Part 2 — Multi-step fill: two-phase, isolated-world, least-privilege

The fill runs in **two isolated-world injections** so (a) the password is sent to
the renderer only *after* inspection observes a password field — and written only
if the isolated fill pass still finds one — and (b) the credential and the
selection/setter logic live in a JS realm the page cannot hook or scrape.

**Isolated world.** Both injections use
`wc.executeJavaScriptInIsolatedWorld(FILL_WORLD_ID, [{ code }])`, not
`executeJavaScript`. **`FILL_WORLD_ID = 1001`** — a dedicated custom world;
`0` (main world) and `999` (Electron's context-isolation / preload world) are
**forbidden**, and Electron recommends custom isolated worlds at id ≥ 1000
([docs](https://www.electronjs.org/docs/latest/api/web-contents#contentsexecutejavascriptinisolatedworldworldid-scripts-usergesture)).
The page's main-world JS cannot observe or tamper the isolated realm's intrinsics
(`Object.getOwnPropertyDescriptor`, the `HTMLInputElement` value setter) or read
the embedded credential.

**Accurate guarantee (not overclaimed).** Isolation protects the credential and
the decision/setter logic **up to the intended DOM write**. Once Blanc writes the
value into the field, the page can read that field — inherent to *every* autofill;
isolation does **not** make a populated field secret from its own page. What it
does secure: an unused credential (e.g. a password on a username-only step) is
never written and stays in the isolated realm, and the page cannot hijack the
selection/setter to redirect or capture the write.

**Flow** (matching + item selection happen before this, as today — `findLogins`
→ chooser if needed → a chosen item):

1. **Inspect (credential-free, isolated world).** Run the identity guard, collect
   candidate inputs, run the shared `selectFields`, and return **no credential
   material** — booleans plus the selection basis:
   `{ originMismatch } | { originMismatch: false, hasPassword, hasUsername, passwordBasis }`,
   where `passwordBasis` is `'authoritative' | 'heuristic' | null`. The pass also
   stashes the decision (element references + basis + a per-flow nonce) in the
   isolated world, so the fill pass can prove it is acting on the same elements
   that were authorized.
   `originMismatch` → `origin-or-focus-mismatch`; `!hasPassword && !hasUsername`
   → `no-fillable-field` — **and nothing is decrypted** in that case.
2. **Reveal (main process).** Only now, with a fillable field confirmed, call
   `revealCredential(chosen)` — the sole decrypt.
3. **Re-validate.** After the reveal await, re-check the full identity set
   (live+focused window, same active tab, live+focused webContents, unchanged
   `navEpoch`, exact `wc.getURL() === expectedURL`) before the second injection.
4. **Decide (main process).** `sendPass = hasPassword ? password : null`,
   `sendUser = hasUsername ? username : null`. On a username-only step the
   password is never sent to the renderer.
5. **Fill (isolated world).** Inject with only the non-null credentials. It
   re-runs the identity guard, then **synchronously** re-runs `selectFields` and
   sets the fields in the same execution — page JS gets no window between select
   and set to mutate the DOM or hook the setter. If the expected field is absent
   (DOM changed since inspect), the credential is simply not written; it never
   leaves the isolated realm. Returns `{ originMismatch, filledUser, filledPass }`,
   or `{ selectionChanged: true, filledUser: false, filledPass: false }` when the
   authorization stash no longer matches (nonce, element identity, liveness or
   basis) — in which case **nothing is written**.

**Everything from the reveal (step 2) onward runs inside the binding-less catch
→ fixed `fill-error`** — once a credential is in main-process memory, no failure
path may log a page- or SDK-controlled message. (Pre-reveal errors keep the
detailed `setup-error` line, as today.)

### Shared field logic — pure `selectFields`, embedded by `.toString()`

The decision lives in **one pure function**, unit-tested and identical in both
injections. `isVisible`, `isSearchLike`, `isNewsletterLike`, `loginEvidence`,
`collectCandidates` (thin DOM adapter), and `selectFields` are defined once at
module scope; both injected scripts embed their source via
`Function.prototype.toString()`, so tested code == shipped code. `selectFields`
is exported for tests.

- **`collectCandidates()`** (DOM adapter, in page) — ordered array of `input`
  descriptors in document order:
  `{ i, type, autocomplete, name, id, placeholder, ariaLabel, labelText, formText, formKey, isVisible, isFocused, inSearchScope }`.
  `labelText` is **field-local** (own/wrapping `<label>`); `formText` is
  **scope-level** (submit-button copy, form name/id) and is read only by
  `scopeLooksLikeSignup`/`scopeLooksLikeLogin` — mixing them lets one button's
  wording contaminate every field's evidence. `formKey` is a real `<form>` where
  one exists, else a nearest-widget-container key; only truly orphaned inputs
  stay `null`, and a `null` password scope fills the **password only** (the
  absence of a boundary is not a boundary).
  `type`/`autocomplete` lowercased; `isVisible` requires not `type="hidden"`, a
  live `offsetParent`, `checkVisibility({checkOpacity, checkVisibilityCSS})`
  where available, a non-zero rect that **intersects the viewport**, and no
  clipping by the field or any ancestor — an off-screen (`left:-10000px`) or
  clipped decoy carrying `current-password` must not read as a real target.
  `isFocused` = `=== document.activeElement`; `inSearchScope` = inside a
  `[role="search"]`. **`formKey`** = a stable index assigned per distinct **owner
  element identity** via a `Map<Element, number>` — *not* `form.id`, since forms
  may lack ids or share them. The owner is `input.form` when there is one, else
  the nearest **token-matched** form-like container (`[role=form]`, `fieldset`,
  `dialog`, `[class~=login]`/`[class~=signin]`/`[class~=auth-form]` and
  friends). Substring matchers are forbidden here: `[class*=auth]` would match
  `authenticated-layout` and merge every form-less widget on the page. An input
  with no such owner keeps `formKey: null`.
- **`selectFields(cands)`** (pure) → `{ passwordIndex, usernameIndex, passwordBasis }`
  (`passwordBasis` is `'authoritative' | 'heuristic' | null`; the indices may be
  `null`). Helpers over a lowercased **field-local** blob
  (`name+id+autocomplete+placeholder+ariaLabel+labelText`); scope-level
  `formText` is read separately and never merged in:
  - `isSearchLike` — `type==='search'`, `inSearchScope`, blob **contains**
    `search`/`query` (substring, so camelCase `siteSearch`/`queryInput` are
    caught), or `name`/`id` exactly `q`/`s`.
  - `isNewsletterLike` — blob contains `newsletter`/`subscribe`/`marketing`/`promo`.
  - `loginEvidence` → `strong` if `autocomplete==='username'` or blob matches
    `/user(name)?|login|account|identifier|loginfmt/`; `medium` if `type==='email'`,
    `autocomplete==='email'`, or blob contains `email`; else `null`.
  - `candidate` = visible `text`/`email`/`tel`, **not** search-like, **not**
    newsletter-like.
  - **`passwordIndex`** — chosen **per form scope**, never "first on the page":
    a scope announcing signup (fields *or* submit copy) is rejected outright;
    otherwise an uncontradicted `current-password` field wins (two of them in one
    scope fail closed); otherwise the scope must hold **exactly one visible
    password field** (2+ ⇒ signup/change/reset), that field must not read as
    new-password-ish, and the scope must carry login evidence. Across scopes, an
    authoritative scope outranks focus and only a *visible* focused element may
    break a tie.
  - **`usernameIndex`**:
    - *Password present, real scope* (`formKey` non-null — a `<form>` or a
      form-like container): candidates sharing that `formKey`, ranked
      evidence-first (explicit `autocomplete=username` outranks wording, which
      outranks email-ish); focus breaks ties only **within** the best tier; a
      same-tier tie falls back to the candidate immediately preceding the
      password. A focused field outside the scope is never used.
    - *Password present, form-less scope* (`formKey` null): **no username is
      filled at all.** `null` is not a scope, it is the absence of one — every
      orphaned input on the page shares it, so even a uniquely-ranked candidate
      may belong to an unrelated widget. Uniqueness is not membership. The
      adapter mitigates this by deriving a container key from form-like
      boundaries only (`[role=form]`, `fieldset`, `dialog`, login/auth-classed
      containers) — never generic `section`/`article`/`div`, which routinely
      hold two unrelated widgets.
    - *No password* (username step): from candidates with `loginEvidence != null`
      (call them *positives*) — **no lone-field fallback, no bare guessing**:
      `pool` = the `strong` positives if any, else all positives; if `pool` has
      exactly one → it; if `pool` has more than one → the focused one **if it is
      in `pool`**, else `null` (ambiguous → no-op). Focus is only a tie-break
      among positives.

### Orchestrator outcome map (`fillActiveTabFrom1Password` in `main.js`)

- inspect `originMismatch` → `origin-or-focus-mismatch`
- inspect `!hasPassword && !hasUsername` → `no-fillable-field`
- re-validation fails → the existing `abort-*` line
- fill `originMismatch` → `origin-or-focus-mismatch`
- `filledPass && filledUser` → `filled` `user+pass`
- `filledUser && !filledPass` → `filled` `user-only (multi-step step 1)`
- `filledPass && !filledUser` → `filled` `pass-only (username field not found)`
- fill reports `selectionChanged` (nonce, element identity, liveness or basis no
  longer match what was authorized) → `selection-changed`, **nothing written**
- otherwise → `nothing-filled`

Unchanged: `revealCredential` decrypts only the chosen item (and now only after
inspection confirms a fillable field); fill never submits; the password is sent to
the renderer only after inspection observes a password field and written only if
the isolated fill pass still finds one; credentials are never logged.

## Footprint

- **`src/main/onepassword.js`** — `matchesHost` (registrable-domain key +
  private-domains flag); `tldts-experimental` require + `registrableKey`; shared
  DOM helpers + pure `selectFields` (+ export); `buildInspectScript` (new,
  credential-free); `buildFillScript` (rewritten: `collectCandidates` +
  `selectFields`, synchronous select+set, fill only provided creds).
- **`src/main/main.js`** — `fillActiveTabFrom1Password`: isolated-world inspect →
  reveal → re-validate → decide → isolated-world fill; the outcome map above; the
  `FILL_WORLD_ID = 1001` constant.
- **`test/unit/onepassword-match.test.js`** — matching + `selectFields`
  behavioral cases (below).
- **`package.json` / `package-lock.json`** — pinned `tldts-experimental@7.4.6`.

## Non-goals (unchanged — real-engine backlog)

Shadow-DOM piercing, cross-origin iframes, auto-advance across the multi-step
navigation (stateless — per-press), TOTP, and 1Password's per-item
`AnywhereOnWebsite`/`ExactDomain`/`Never` rules.

## Testing

**Unit — `test/unit/onepassword-match.test.js`** (`node --test`, pure):

- **`matchesHost`:** exact; `www.` both ways; **subdomain matches**
  (`accounts.google.com` ↔ `google.com`); deep-subdomain ↔ parent; substring trap
  still **fails**; **cross-tenant private domains must NOT match**
  (`alice.github.io` vs `bob.github.io`; two `*.vercel.app`); `foo.co.uk` vs
  `bar.co.uk` no match; **localhost + raw-IP fallback**; no URLs; malformed URL
  skipped.
- **`selectFields`** (pure, descriptor fixtures — the behavioral core):
  - single-page login (username + password) → both indices.
  - password step, no username → password only.
  - username step, `autocomplete="username"` → that field.
  - Google/Microsoft style (`type=email` + `autocomplete=username` / `name=loginfmt`)
    → that field.
  - **focused *generic* text field, no login evidence** → username `null` (focus
    is not evidence).
  - **camelCase search** (`id="siteSearch"`, `name="queryInput"`) focused → `null`.
  - **focused candidate in a *different* form than the password** → username
    resolves within the password's form scope, **not** the focused field.
  - **sole newsletter email** (`id="newsletter-email"`) → `null`.
  - **login email + newsletter email** → login email (newsletter excluded).
  - **two positive emails, neither strong, none focused** → `null` (ambiguous).
  - **two anonymous forms** (login form + newsletter form, both no `id`) →
    password's username resolves within the **same** `formKey`, not the newsletter
    field.
  - hidden/honeypot inputs (`isVisible:false`) → ignored.
- **`buildInspectScript` / `buildFillScript`** (string assertions, secondary):
  inspect source carries **no** credential literal; fill source JSON-embeds only
  provided creds, contains the identity guard + native setter; both embed the same
  `selectFields`/`collectCandidates` source.
- **`FILL_WORLD_ID` constant** — assert it is `1001` (or at least `≥ 1000` and
  neither `0` nor `999`), so a refactor can't silently move the fill into the main
  or preload world.

**Manual** (fresh `npm start` with `BLANC_1P_ACCOUNT`):
- `accounts.google.com`, item for `google.com` → `filled user-only`; next screen
  → password fills.
- Single-page login on a subdomain of a saved item → `filled user+pass`.
- Search-only page → `no-fillable-field`.
- **React/framework page** (e.g. a React or Vue login) → the native-setter +
  bubbling `input`/`change` events are observed, the value **sticks** through the
  framework's controlled-input tracking, and submit uses the filled value.
- **DOM replacement between phases** — after triggering, script-remove the
  password form before the fill pass; confirm the password is **not** written and
  no `[1p-spike]` line leaks a value (isolated-realm containment).
- Regression: exact-host single-page login → `filled user+pass`; `localhost`/IP
  dev login still matches.

## Confirmation gate for heuristic targets (added after audit round 3)

`selectFields` reports **how** it chose a password field:

- **`authoritative`** — the site's own `autocomplete="current-password"`,
  uncontradicted by a `new-password` token or by its own "Confirm"/"New"
  wording. Filled **silently**; this covers most major sites.
- **`heuristic`** — inferred from structure (exactly one visible password field
  in scope) plus wording. Those wording signals (`create|choose|new|confirm|
  sign-up|register`…) are **English-only**, so a localized signup page matches
  none of them and would read as a login form. A heuristic target therefore
  requires an explicit **native confirmation dialog before anything is
  decrypted**; cancelling logs `user-declined` and reveals no secret.

A dialog is language-independent, which is why it — and not a longer wordlist —
is the actual boundary. A username-only fill needs no prompt: it writes no
secret.

### Forbidden return sentinel vs. the deliberate authorization stash

These are different things and only one is prohibited:

- **Forbidden — a cross-call *return channel*.** If
  `executeJavaScriptInIsolatedWorld` failed to resolve a value, writing the
  status somewhere for a later call to read back would leave state that goes
  stale across navigation and silently misreports. The flow instead **fails
  closed as `fill-error`**.
- **Deliberate — the authorization stash.** The inspect pass leaves
  `{nonce, pwEl, userEl, basis}` in the isolated world so the fill pass can prove
  it is acting on the elements that were actually authorized. It is
  **single-use** (cleared on read), **nonce-scoped** to one invocation, and
  cleared by navigation — verified by Task 1's persistence probe
  (`sameEl:true`, `after-nav.seen:false`). It carries no credential and is not a
  return channel.

## Residual: same-node relabeling

Authorization binds the **element identity and basis** that inspect chose, not
the surrounding form's semantics. A page that keeps the same password node but
relabels its context between the two passes — swapping the submit-button copy
from "Sign in" to "Create account", say, while `selectFields` still resolves to
that node with an unchanged basis — is not detected. Accepted for this
iteration: the reproduced replacement attack (swapping the annotated field for
an unannotated one) *is* caught, and binding whole-form semantics would mean
re-deriving and comparing every scope-level signal. Revisit if consent should
cover form semantics rather than field identity.

## Residual: annotation is trusted unconditionally

A field carrying an uncontradicted `autocomplete="current-password"` is filled
**silently**, on the reasoning that the site has declared where the existing
credential belongs. That trust is not language-aware: a **localized** signup page
whose password field carries a stray `current-password` token — and whose signup
wording our English regexes cannot read — is classified `authoritative` and fills
without a prompt. The confirmation dialog is therefore language-independent **for
heuristic targets only**, not universally.

Accepted deliberately: annotating a signup field as `current-password` is a site
bug, and prompting on every annotated field would put a dialog in front of the
majority of correct fills. Revisit if it proves wrong in practice — the
alternative is to prompt for annotated fields that carry no corroborating login
evidence.

## Risks / edge cases

- **Cross-tenant over-match** — **mitigated for PSL-listed private suffixes** by
  `allowPrivateDomains: true` (verified: `user.github.io` → `user.github.io`). It
  cannot guarantee every shared-hosting domain is PSL-registered; an unlisted
  shared host could still collapse. A single wrong match fills silently (no
  chooser), so this is load-bearing — covered by the cross-tenant unit tests.
- **`tldts-experimental` currently transitive** — promoting to a direct pinned
  dependency removes the adblocker-bump risk.
- **Isolated-world return plumbing** — `executeJavaScriptInIsolatedWorld` returns
  `Promise<any>` and, like `executeJavaScript`, resolves with the completion value
  of a single `WebSource` ending in the status-object expression, so it should
  round-trip directly. The plan verifies this with a throwaway probe in its first
  isolated-world step; if the result is unexpectedly `undefined`, the flow **fails
  closed as `fill-error`** — no persistent cross-call sentinel state (which could
  go stale across navigation).
- **Inspect→fill DOM race** — closed for credential exposure by isolated-world +
  synchronous select-then-set: if the field vanishes, the credential is not
  written and never leaves the isolated realm. Residual (inherent to all
  autofill): once written, a populated field is readable by its own page.
- **DOM adapter not unit-tested** — `collectCandidates` needs a browser; covered
  by the manual matrix. The security-critical *decision* (`selectFields`) is fully
  unit-tested. jsdom is not used (its no-layout `offsetParent`/`getBoundingClientRect`
  make visibility fixtures unreliable).
- **Username heuristic residual** — search + newsletter exclusion, login-positive
  evidence required, focus only an in-scope tie-break, no lone-field guess. This
  makes a wrong-field fill unlikely but **not impossible** (e.g. a page whose
  login form genuinely contains a mislabeled extra input); the common failure mode
  is a no-op, and the fixtures cover the known traps.
