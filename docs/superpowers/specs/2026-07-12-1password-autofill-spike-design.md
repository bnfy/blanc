# 1Password fill — feasibility spike

**Date:** 2026-07-12
**Status:** Approved for implementation planning (rev. 7) — after three external reviews + two adversarial passes

## What

A throwaway **spike** that proves whether Blanc can fill a web login form from a 1Password
vault **without any browser extension** — the capability that would, if it works, reopen
password-manager support that Blanc removed with the Chrome extension runtime. This is not a
shipping feature; it is a de-risking experiment whose only output is a yes/no and a set of
learnings. If it succeeds, a separate spec designs the real engine; if it fails, we document
the dead end and stop. **The spike code must be removed (or gated out) before any release.**

The spike does exactly one thing when triggered on a web page: look up 1Password Login items
whose website matches the active tab's origin, and populate the page's username + password
fields with a match — behind a Touch ID prompt.

### Feasibility context (why this is the only path)

Three research threads + a manual test settled the landscape (2026-07-12):

- **Full autofill parity by integrating either vendor's *own* autofill is impossible without
  a WebExtension runtime.** Both 1Password and Dashlane ship autofill only as a browser
  extension, and no OS/Chromium hook injects a third-party manager's *passwords* into a
  non-Safari browser's web content.
- **⌘\ (1Password Universal Autofill) is empirically dead in Blanc** — tested live: it finds
  the login and offers to fill, but the value never lands, because it fills from the *outside*
  via macOS Accessibility, which Chromium web fields reject. There is no zero-code stopgap.
- **The one viable storeless path is a Blanc-native engine that fills from the *inside*** —
  Blanc already injects into its own `WebContentsView` (ad-block cosmetic filtering), so field
  population is a solved capability. The **1Password JavaScript SDK** (`@1password/sdk`,
  `DesktopAuth`) can read the user's *personal* vault behind biometrics from the Node/Electron
  main process — confirmed one of three officially supported languages, and desktop-app auth
  inherits the signed-in user's vault access (unlike service-account tokens, which can't reach
  Personal/Private vaults). **Dashlane has no equivalent** (no desktop app, no personal-vault
  SDK; only a read-only `dcli`), so it is out of scope for the spike.

The spike validates the two unknowns that decide the full engine's worth:
1. **Auth + read** — the JS SDK authenticates from Electron main (via its native desktop-app
   bridge, see Architecture) and reads a matching personal-vault Login behind Touch ID, and that
   native bridge survives a signed/hardened/notarized build.
2. **Inside-injection** — Blanc populates a real, framework-controlled web field so the value
   is retained (the exact move ⌘\ could not make).

## Behavior

Trigger: a **keyboard chord** (proposed **⌥⌘P**), enabled iff `!app.isPackaged ||
process.env.BLANC_1P_SPIKE === '1'` — dev by default, plus an explicit opt-in for a packaged
build **solely** for the signed-build fallback (see Risks); never active in a normal shipping
build. Deliberately *not* the `/1password` slash command yet — that would publish an
experimental, desktop-only command into the governed cross-platform slash-command substrate. A
real `/1password` command is part of the *full engine*.

On trigger, with an `http(s)` tab active:

1. Blanc captures the triggering **window**, the tab id (`capturedTabId`), the tab's
   **navigation epoch** (see Architecture), a **document-identity token** — the page's
   `performance.timeOrigin`, read once at trigger via `executeJavaScript` (unique per document
   load) — the **exact URL** `expectedURL = wc.getURL()`, and its **full origin**
   `expectedOrigin = new URL(expectedURL).origin` (e.g. `https://github.com` — scheme + host +
   optional port; *not* the bare hostname). The hostname for vault matching is derived from it
   (`new URL(expectedOrigin).hostname`).
2. It asks 1Password for **Login items whose stored website host matches** the expected origin's
   hostname. This runs on *overviews* — no credential is decrypted (see Architecture). First use
   in a session raises the 1Password desktop app's authorization prompt (Touch ID), naming the
   requesting process and account.
3. **Zero matches** → no-op (logged). **One match** → decrypt that one item and fill.
   **Multiple matches** → a native chooser (`dialog.showMessageBox`, the pattern
   [webauthn.js](../../../src/main/webauthn.js) already uses) lists the titles with a **Cancel**
   button (`cancelId`); on selection the chosen item is decrypted and filled; on cancel/dismiss
   it is a no-op (logged), mirroring `chooseWebAuthnAccount`'s return-undefined.
4. Before injecting, Blanc **re-validates** (§Security): the captured window is still live and
   focused, the captured tab still exists and is still active, its `webContents` is alive and
   focused, its navigation epoch is unchanged, and `wc.getURL()` still **exactly** equals
   `expectedURL` (which subsumes the origin check). It then injects; the injected function's **first
   act is a synchronous check of `location.href === expectedURL && document.hasFocus() &&
   performance.timeOrigin === capturedTimeOrigin`** — three complementary identity layers: a new
   document (reload, cross-document nav) changes `timeOrigin`; an SPA `pushState`/`replaceState`
   route change keeps `timeOrigin` and origin but changes `location.href`; a cross-origin nav
   changes both. All run before touching any field. On a match the fields visibly populate and
   retain their values.

**Guard — explicit `http(s)`-only allowlist.** Only `http:`/`https:` origins proceed; everything
else (`blanc://`, `file://`, `data:`, `view-source:`, blank new tab, …) is a no-op. (Private tabs
*are* allowed — the SDK session is app-global; Blanc writes no history or store entry, though
1Password keeps its normal session and user-auditing behavior.)

## Architecture

One new self-contained module plus **three** clearly-marked spike hooks in `main.js` (fill
orchestrator, chord listener, packaging-smoke init). No IPC namespace, store, setting, preload, or
renderer change. **Footprint:** adds `src/main/onepassword.js`, a unit test
`test/unit/onepassword-match.test.js`, the three `main.js` hooks (the fill orchestrator also adds a
small navigation-epoch counter to the tab's existing `did-navigate`/`did-navigate-in-page`
handlers), and — in `package.json` / `package-lock.json` — an exactly-pinned `@1password/sdk@0.4.0`
(plus its transitive `@1password/sdk-core`). See Risks re: whether an `asarUnpack` glob is even
needed. That is the whole delta.

- **`src/main/onepassword.js`** — owns the SDK client and *all* credential handling. The SDK is
  **`require`d lazily** (only inside these functions / behind the env gate) so a normal packaged
  startup never loads it.
  - `async function getClient()` — lazily constructs and caches a client:
    `createClient({ auth: new DesktopAuth(accountName), integrationName: 'Blanc',
    integrationVersion: app.getVersion() })`, where `accountName = process.env.BLANC_1P_ACCOUNT`
    (**required** — do not commit an account identifier). **Native path, not WASM:** when an
    account name is present the SDK builder selects `SharedLibCore`, which `process.dlopen()`s
    `/Applications/1Password.app/Contents/Frameworks/libop_sdk_ipc_client.dylib` (the native IPC
    bridge inside the *installed* 1Password app) — the bundled `core_bg.wasm` is the
    *service-account/token* path and is **not** used here. Only discard the cached client on an
    **unrecoverable** failure; the SDK re-authorizes/retries an ordinary ~10-min session expiry
    itself. Pin `@1password/sdk@0.4.0`.
  - `async function findLogins(expectedHost)` — **matches on overviews; decrypts no
    secret/credential.** `items.list(vaultId)` returns `ItemOverview`s, which — verified against
    the SDK type (`ItemOverview.websites: Website[]`, each `Website` carrying `url`; `types.ts`
    v0.4.0) — carry the item's website URLs; only the credential `fields` are absent (the overview
    is decrypted metadata, but holds no secret). Flow: `vaults.list()` → for each accessible vault
    `items.list(vaultId)` → keep `category === 'Login'` overviews → for each,
    `matchesHost(overview.websites.map(w => w.url), expectedHost)`. Returns metadata only
    (`{ vaultId, itemId, title }`). `matchesHost(itemUrls, host)` is a pure helper (unit-testable):
    for each stored URL it extracts the hostname **tolerantly** — 1Password website fields are
    often scheme-less (`github.com`), which `new URL()` rejects, so it prepends `https://` when no
    scheme is present, and a still-malformed URL is skipped, not thrown — normalizes a leading
    `www.` off both sides, and requires **exact host equality** (deliberately not substring —
    `includes` would match `github.com.evil.com`).
  - `async function revealCredential(vaultId, itemId)` — the **only** call that decrypts a secret,
    run on exactly the one chosen item: `items.get(vaultId, itemId)` → from `item.fields[]` read
    the **built-in** password (field `id === 'password'`, expected `fieldType === 'Concealed'`) and
    username (field `id === 'username'`, expected `'Text'`). **No fieldType fallback** — a Login can
    carry custom concealed fields (a PIN, a recovery answer), so "first `Concealed` field" could
    return the wrong secret; if a built-in field is absent, return the defined missing-field outcome
    rather than guess. Returns `{ username, password }` (either may be null → a defined outcome,
    below). TOTP deferred to the full engine.
- **`src/main/main.js`** — three hooks, each commented spike-only:
  - `async function fillActiveTabFrom1Password()` — orchestrates the flow, **wrapped end-to-end in
    try/catch** (logs the outcome only — *never* a credential). It captures the window,
    `capturedTabId`, `expectedURL` + `expectedOrigin`, the document-identity `capturedTimeOrigin`
    (read via `executeJavaScript`), and a **navigation epoch** — a per-tab counter bumped in the
    tab's existing
    `did-navigate` / `did-navigate-in-page` handlers **and on main-frame `did-start-navigation`** (so
    a navigation that *begins* mid-flow is detectable, not only one that has completed;
    [main.js:946/974](../../../src/main/main.js) + a new `did-start-navigation` increment).
    Because auth/chooser are async, **re-validates before injecting**: the captured window is live
    and focused (`!win.isDestroyed() && win.isFocused()` — do *not* abort merely because Touch ID
    transiently blurred Blanc; require focus to have **returned** by fill time), the captured tab
    exists and is active (`activeTabId === capturedTabId`), its `webContents` is alive
    (`!isDestroyed()`), its epoch is unchanged, and `wc.getURL() === expectedURL` (exact URL, which
    subsumes origin).
    It injects via `executeJavaScript(source)` — single-arg (matching [main.js:637](../../../src/main/main.js));
    **no `userGesture`** (setting `value` + events needs no activation, and `userGesture:true`
    would grant the page transient activation for popups/downloads). The injected function: **(a)
    first checks `location.href === EXPECTED_URL && document.hasFocus() && performance.timeOrigin ===
    EXPECTED_TIME_ORIGIN` synchronously, aborting on mismatch** (the exact-URL + `timeOrigin` pair is
    the in-page proof that this is still the captured document *and* route — `timeOrigin` alone would
    miss an SPA `pushState` that keeps the document; together they close the same-origin race); (b)
    finds the password field — first **visible** main-frame `input[type=password]`
    (visible = `offsetParent !== null`, non-zero client rect, not `type=hidden`, skipping
    honeypots); (c) finds the username — focused text/email element, else the visible text/email
    input preceding the password field (in its form if any, else nearest preceding in document
    order); (d) sets each via the **native setter**
    (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`) + bubbling
    `input`/`change` events; (e) returns a **status object only**
    (`{ originMismatch, filledUser, filledPass }`), never the values. `EXPECTED` and all credential
    strings are embedded with `JSON.stringify`. **Every outcome logs one result line:**
    matched+injected / no-match / origin-or-focus-mismatch / tab-or-window-changed abort /
    chooser-cancel / auth-denied / inaccessible-vault / no-password-field / partial (password
    filled, username missing → fill password only, don't abort) / injection-error.
  - **A `before-input-event` listener attached to each tab's `wc` inside `createTab`**
    ([main.js:865](../../../src/main/main.js), `wc = view.webContents`) — **not** the overlay
    listener at [main.js:417](../../../src/main/main.js), which is bound to `overlayView` and never
    sees keystrokes while page content has focus. Exact contract: `input.type === 'keyDown'`
    (mirroring [main.js:418](../../../src/main/main.js) — without it, keyUp double-fires) **and**
    `!input.isAutoRepeat` **and** the **physical** key `input.code === 'KeyP'` (on macOS ⌥ mutates
    `input.key`, so `key === 'p'` may never fire) **and** exact modifiers `input.meta && input.alt
    && !input.control && !input.shift` (note ⌥⌘P sits one modifier from the ⌘P Print accelerator at
    [main.js:1781](../../../src/main/main.js)). A **module-level single-flight boolean** ignores a
    second trigger until the current fill resolves, released in a `.finally()`. On match it calls
    `fillActiveTabFrom1Password()` fire-and-forget (`.catch(log).finally(releaseFlag)`) and
    `event.preventDefault()`. Enabled iff `!app.isPackaged || process.env.BLANC_1P_SPIKE === '1'`.
  - **`initSpikeCoreSmoke()`** — startup hook, runs **only** when `process.env.BLANC_1P_SPIKE ===
    '1'`. With the setup prerequisites satisfied (1Password running, integration on,
    `BLANC_1P_ACCOUNT` set), it calls `getClient()` then a trivial `vaults.list()` in try/catch and
    classifies **strictly**: **PASS** only if `createClient(DesktopAuth)` **and** `vaults.list()`
    both succeed (matching criterion 3(b)); **INCONCLUSIVE** if the user cancels the biometric prompt
    (the bridge state is unknowable); **FAIL** on every other error, logged with **sanitized**
    diagnostics — an error referencing `dlopen` / `libop_sdk_ipc_client` / library-not-found /
    code-signature is specifically the *native-bridge-didn't-load* failure, while auth/connection
    errors are also FAIL (3(b) requires the round-trip to work). Never a credential in the log.

**Security posture** (models Blanc's main-only secret handling — the supporter key and sync-crypto
never cross into a renderer):

- Credentials are **never** exposed to Blanc's chrome/overlay renderer, its preload bridges, its
  logs, or any store. They live only in **main-process memory** — transiently — and are written
  into the **verified active page** for the fill (inherent to any autofill). The accurate guarantee
  is confinement to main + the verified page.
- **Only the chosen item's credential fields are decrypted.** (Overviews are themselves decrypted
  metadata — the precise claim is that *no secret* is decrypted during matching.) Matching runs on
  `items.list()` overviews (website URLs present, credential `fields` absent); `items.get()` — the
  only call returning a password — runs on the single selected item after selection. When done,
  Blanc releases its reference and
  does not intentionally cache the credential (best-effort; no memory-zeroization guarantee in
  JS/the SDK).
- **Origin/identity defense — layered, and honest about which layer is authoritative.** The
  **unspoofable** authority is the main-side `wc.getURL()` (Chromium ground truth the page cannot
  forge), re-checked for **exact-URL** equality before injection — but a main-side check followed by
  `executeJavaScript` is **not atomic** (a navigation can slip in). The injected
  `location.href`/`performance.timeOrigin`/`document.hasFocus()` check closes that TOCTOU race, but
  runs in the page's **main world**, so a hostile *replacement* document could spoof those getters or
  tamper the setter — it is best-effort, **not** the authoritative layer. Together they cover each
  other's gap; main-world spoofing is an **accepted spike limitation** (a full engine could inject
  into an isolated world).
- **Window + tab + document identity re-validated, not assumed.** Because auth/chooser are async and
  Blanc keeps tabs alive after a window closes, the fill requires the *originating window* still live
  and focused, the same active tab, a live focused `webContents`, and an unchanged navigation epoch
  (bumped on `did-start-navigation` too). A navigation that *begins* after the main-side check would
  still let `executeJavaScript` run in the replacement/updated document, so the closing guarantee is
  the injected **`location.href === expectedURL && performance.timeOrigin === captured`** pair: a new
  document changes `timeOrigin`; an SPA `pushState`/`replaceState` route change (same document, so
  `timeOrigin` alone would miss it) changes `location.href`; a cross-origin nav changes both.
  (Subject to the accepted main-world spoofing limitation above.) Net: a credential is never filled
  into a background/closed window, a switched tab, or a silently-navigated page.
- **Native bridge under the hardened runtime.** DesktopAuth `process.dlopen()`s AgileBits' (Team-ID
  ≠ Blanc's) `libop_sdk_ipc_client.dylib`; this is *entitlement-permitted* by Blanc's
  `com.apple.security.cs.disable-library-validation` (present in both `build/entitlements.mac.plist`
  and `.inherit.plist`) under `hardenedRuntime: true` — but must be proven in a notarized build
  (criterion 3b).
- **Main frame only.** Cross-origin iframes are not filled in the spike.

## Non-goals (this is a spike; these are the *full engine's* work)

- Sophisticated origin matching — subdomains, ports, public-suffix, IDN, redirects, and 1Password's
  per-item `AnywhereOnWebsite`/`ExactDomain`/`Never` rules. The spike does a plain **exact
  normalized-host** match (`www.`-stripped) against overview website URLs.
- Isolated-world injection — the spike injects into the page main world and accepts the main-world
  spoofing limitation above.
- Robust login-vs-signup/change-password disambiguation — fills the first visible password field;
  a combined form may fill the wrong field. Accepted; target a mainstream login page.
- Save/update, TOTP, inline suggestions, cross-origin iframes, account-selection UX.
- Any Dashlane path, settings UI, `/1password` slash command or substrate wiring.
- Robustness across non-standard 1Password install locations (the dlopen path is hardcoded to the
  standard `/Applications` bundle).

## Setup prerequisites (one-time, before any run)

- **1Password 8 installed at the standard path** (`/Applications/1Password.app` on macOS — the
  native bridge is `dlopen`ed from inside it), running and unlocked.
- In the app: **Settings → Developer → Integrate with the 1Password SDKs → Integrate with other
  apps** (without it `DesktopAuth` cannot connect); **Settings → Security → Touch ID** for biometric
  approval.
- **`BLANC_1P_ACCOUNT`** env var set to the target account name/UUID (**required** — not committed).
- Install and exactly pin: `npm i -E @1password/sdk@0.4.0`.

## Success criteria

1. On `https://github.com/login` (or any site with a matching Login), the chord → Touch ID prompt
   (**first use per ~10-min SDK session**; a re-run within it fills with no prompt) → **both fields
   populate and retain their values** via `npm start`.
2. The SDK authenticates and reads a **personal/private-vault** item from Electron main.
3. **The native bridge survives a real build** — two checks (per the SharedLibCore path):
   - **(a)** `require('@1password/sdk')` resolves in a packaged app (module + any eagerly `require`d
     WASM present). A quick `dist:dir` unpacked build suffices for this check.
   - **(b)** a **truly notarized** distribution build — a `zip`/`dmg` target built under the repo's
     notarization environment via an **explicit non-publishing** command
     (`op run --env-file=.env.1password --no-masking -- npx electron-builder --mac zip --publish
     never`), **not** `dist:dir` (which electron-builder treats as an unsigned/unnotarized unpacked
     dev artifact) and **never `npm run release`** — that publishes an immutable GitHub release,
     which conflicts with the spike-removal requirement. Verify the artifact
     with `codesign --verify`, `spctl -a`, and `xcrun stapler validate`; then launch the
     installed/extracted app with `BLANC_1P_SPIKE=1` and a throwaway `--user-data-dir` (so it never
     touches the real profile or the single-instance lock). `initSpikeCoreSmoke()` →
     `createClient(DesktopAuth)` + `vaults.list()` must log PASS — proving the `process.dlopen()` of
     1Password's `libop_sdk_ipc_client.dylib` works under the hardened runtime +
     `disable-library-validation` + **Gatekeeper/notarization**. This — not WASM packaging — is the
     genuine unknown. The same flag also enables the chord in that build for the full auth+fill
     fallback.

A failure at (1) after (2) succeeds is decisive — inside-injection is harder than the ad-block
precedent implies — **but only after ruling out the origin/host, focus, and field-detection details
above**, so a silent no-op isn't misread as that signal.

## Risks & open questions

- **Native IPC bridge under the hardened runtime (the real packaging risk).** DesktopAuth
  `process.dlopen()`s `/Applications/1Password.app/Contents/Frameworks/libop_sdk_ipc_client.dylib`
  (AgileBits-signed, different Team ID). Permitted by Blanc's `disable-library-validation`
  entitlement (verified in both plists) under `hardenedRuntime`, but **unproven** in a notarized
  build + Gatekeeper, and a hard dependency on 1Password at the standard install path. Criterion
  3(b) surfaces this. (`core_bg.wasm` is the *token* path, unused here; asarUnpack of it only
  matters if `require('@1password/sdk')` eagerly resolves it — check 3(a).)
- **Dev-process authorization.** In `npm start` the requesting process is unsigned `Electron`, not
  `Blanc`; the desktop-app channel is human-in-the-loop, so it should still prompt, naming the dev
  binary. If it refuses, run the full auth+fill against the signed `BLANC_1P_SPIKE=1` build (3b).
- **SDK v0 API churn** — `vaults.list`/`items.list`/`items.get`/`ItemOverview.websites`/
  `DesktopAuth`/`SharedLibCore` are per `@1password/sdk@0.4.0`; pin exactly, re-verify on bump.
- **Field detection** — native-setter + events is standard, but selection can miss on non-standard
  inputs or combined login/signup forms (see Non-goals); target a mainstream login page first.

## Testing

- **Unit — `test/unit/onepassword-match.test.js`** (pure, `node --test`, no Electron/SDK): cover
  `matchesHost(itemUrls, host)` — exact match; `www.` vs bare; **scheme-less stored value**
  (`github.com`) matches host `github.com`; **subdomain must NOT match** (`login.github.com` vs
  `github.com`); substring trap (`github.com.evil.com` must NOT match); item with multiple URLs (one
  matches); item with no URLs; a **malformed stored URL is skipped, not thrown**.
- **Manual**, via a fresh `npm start` (chrome loads once at window creation — relaunch, don't ⌘R):
  - `https://github.com/login` with a matching login → Touch ID → both fields fill.
  - Two matching logins → chooser → pick fills; **Cancel** → no-op.
  - No match → no-op (logged). `blanc://settings/`, `file://`, blank tab → no-op.
  - **Double-press** fast → only one flow (keyDown + `!isAutoRepeat` + single-flight).
  - **Same-document reload / cross-doc nav** mid-flow → `performance.timeOrigin` mismatch aborts.
    **SPA `pushState` route change** mid-flow (same document, `timeOrigin` unchanged) → the
    `location.href !== expectedURL` guard aborts.
  - **Switch or close the tab/window** mid-flow → identity/focus re-check aborts; nothing written.
  - **Touch ID blur then refocus** → the flow still fills (blur alone doesn't abort).
- **Packaging** — 3(a): `require('@1password/sdk')` resolves in a `dist:dir` app. 3(b): a
  **notarized** `zip`/`dmg` built with the explicit non-publishing command (`op run … electron-builder
  --mac zip --publish never` — **never `npm run release`**), verified with `codesign`/`spctl`/`xcrun
  stapler`, launched with `BLANC_1P_SPIKE=1` + throwaway `--user-data-dir` + desktop app running →
  `initSpikeCoreSmoke` logs PASS only if `createClient(DesktopAuth)` + `vaults.list()` succeed
  (INCONCLUSIVE on biometric cancel; FAIL otherwise). The flag also enables the chord for the
  auth+fill fallback.
