# Divergence Register

Every **deliberate** platform split lives here. A divergence is legal only if it
has an entry with a rationale and the **parity contract that still holds** across
it. If you need to diverge in a way not listed, add a `D#` *before* merging.

Format per entry: why it must diverge · the per-platform approach · **what stays
identical anyway** (the parity contract) · status.

---

## D1 — Ad/tracker blocking engine
**Features:** F12
**Why:** The platforms expose fundamentally different network-interception
capabilities, and this is non-negotiable — you cannot ship a common engine.

- **Desktop:** `webRequest` interception via `@ghostery/adblocker-electron` at the
  session layer — programmatic, unconstrained, plus library-driven cosmetic
  filtering.
- **Android:** `WebView.shouldInterceptRequest` in a custom `WebViewClient` —
  **programmatic and comparably powerful** to desktop; can consult the full rule
  set per request. Alternatively a bundled Chromium fork if the app ever ships its
  own engine.
  **Update 2026-11-05:** Android ships its own engine: it is built on the
  Chromium fork's Android lane and uses the fork's blocker, shared with desktop
  (milestone A3, unreleased), not `WebView.shouldInterceptRequest`: the same
  Ghostery engine, pinned lists and hash-checked bundle, in a sandboxed utility
  process. Android ends background processes in normal use, so the engine starts
  again by itself, holding requests, at most three times in ten minutes; after
  that, or with a wrong bundle, pages stop and the Sunrise menu offers Retry.
- **iOS:** `WKContentRuleList` — **declarative JSON, ~150k-rule cap per list, no
  programmatic per-request logic.** Requires curating EasyList+EasyPrivacy down to
  fit and compiling to Apple's format. This is structurally the same constraint as
  Manifest V3's `declarativeNetRequest` — the very thing desktop Blanc was built to
  escape. Accept it; it is the platform ceiling.

**Parity contract that still holds:** blocking is on by default; a per-tab shield
count is shown (with the iOS caveat in D13); the trackers blocked come from the
*same source lists* (→ shared substrate) even though the compiled form differs;
`/allow-ads` and `/block-ads` work identically from the user's side.

**Do not** flatten Android down to iOS's declarative model to make the code
"match." Android is where the differentiator survives — let it be powerful.

**Detailed design:** [`blocking-backends.md`](./blocking-backends.md).

**Status:** Accepted, foundational.

---

## D2 — Per-site ad exception mechanism
**Features:** F12, F14 (`adblockExceptions`)
**Why:** Follows from D1.

- **Desktop / Android:** a **live predicate** — check the origin against the
  exceptions list per request; cheap, instant.
- **iOS:** content rule lists are compiled and attached to the web view, so a
  per-site exception means **swapping/recompiling or layering rule lists** — costlier
  and not instant. Recommended pattern (see `blocking-backends.md`): a small,
  separately-recompiled `ignore-previous-rules` list keyed on the allowlist,
  applied last, so the base lists stay cached.

**Parity contract:** adding/removing a site exception has the same *user-visible*
effect (ads allowed/blocked on that origin) and the same persisted
`adblockExceptions` shape everywhere; only the latency/mechanism differs.

**Detailed design:** [`blocking-backends.md`](./blocking-backends.md).

**Status:** Accepted.

---

## D3 — Downloads storage & file access
**Features:** F11
**Why:** iOS sandboxing vs. Android/desktop filesystem access.

- **Desktop:** arbitrary path + reveal-in-folder.
- **Android:** the Downloads directory / scoped storage; open via an intent.
- **iOS:** app sandbox → Files-app integration; "open" via the document
  interaction / share sheet.

**Parity contract:** the **downloads list UI, progress, states, and 200-entry
cap** are identical; only where the bytes land and how you re-open them differ.

**Status:** Accepted.

---

## D4 — Default-browser role & OS link hand-off
**Features:** F5, F19
**Why:** Each OS has its own default-browser mechanism and URI-hand-off model.

- **Desktop:** `handOffToOs()` for `mailto:`/`tel:`/`facetime:`/`sms:` plus an
  affirmative allowlist of reviewed app schemes and standard native OAuth scheme
  conventions. App callbacks require confirmation; unknown schemes never reach
  the OS. OS default registration uses the packaged app (macOS LaunchServices,
  the Windows Default Programs registry contract written by the installer, and
  the Linux desktop entry's `WebBrowser` category and HTTP(S) scheme-handler
  types).
- **iOS:** default-browser **entitlement** + universal-link/URI handling; hand-off
  via `UIApplication.open`. The app can't set itself: the walkthrough and
  Settings open the system's Default Apps screen. Apple rate-limits the check,
  so a refused one keeps the last answer.
- **Android:** intent filters + the default-browser role; hand-off via `Intent`.

**Parity contract:** a bare `mailto:`/`tel:`/etc. is handed to the OS (never
treated as a search query), unknown schemes do not reach an OS handler, and Blanc
can be set as the default browser, on every platform that allows it. Desktop app
callbacks are an accepted platform-specific extension.

**Status:** Accepted.

---

## D5 — Patron monetization rails
**Features:** F17, F14 (`patron`)
**Why:** App Store and Play require their own in-app billing for digital unlocks;
the desktop Polar.sh flow cannot be used in-app on mobile (and would violate store
policy).

- **Desktop:** Polar monthly/annual subscription, with earlier founding licenses
  honored permanently.
- **iOS:** **StoreKit / In-App Purchase** (Apple's cut applies).
- **Android:** **Google Play Billing.**

**Parity contract:** Patron unlocks creation of Blanc Spaces on every
platform. Existing workspaces remain available after a subscription lapses;
founding licenses retain permanent access. App-icon colorways are not a Patron
benefit. Renderers only ever see the derived boolean, never a key.

**Cross-honor (decided 2026-07-07):** a purchase on **either** platform unlocks the
other (not independent). The activation *mechanism* is non-trivial and deferred to
the iOS **M13** supporter spec: desktop→iOS is a one-time Polar-verification check;
iOS→desktop needs an activation/linking flow (App Store Server API signed
transactions + `appAccountToken`) plus a small Blanc-run entitlement registry, since
Blanc has no cross-platform account. Favour activation-time-only checks to preserve
the trusted-forever/offline-OK posture after unlock. See
[the iOS port roadmap](../docs/superpowers/specs/2026-07-07-ios-port-roadmap-design.md) §5.5.

**Status:** Accepted; mobile activation mechanism TBD @ iOS M13.

---

## D6 — App-icon switching mechanism
**Features:** F17
**Why:** Dynamic app-icon switching differs by OS.

- **Desktop:** Dock/taskbar icon swapped at runtime (`applyAppIcon`).
- **iOS:** `setAlternateIconName` — clean, first-class, supports all colorways.
- **Android:** no first-class dynamic icon API; the usual workaround is
  **`activity-alias` swapping**, which is limited and can relaunch/flicker. The
  colorway feature may therefore be **fuller on iOS than Android**.

**Parity contract:** the *set of colorways offered* and the gating
(`isAppIconAllowed`) are identical; the launcher-icon change may be less seamless
on Android — document the chosen UX rather than hiding the gap. The iPhone's
catalog adds one iPhone-only icon and starts with it; see D33.

**Status:** Accepted; Android UX to be finalized.

---

## D7 — Input model (keyboard → touch)
**Features:** F1, F6, F7, F19, and all shortcuts
**Why:** Desktop is keyboard-first; mobile is touch-first.

Desktop bindings and their mobile intent:

| Desktop | Action | Mobile equivalent |
|---------|--------|-------------------|
| ⌘[ / ⌘] (pill buttons) | Back / Forward | edge-swipe gesture (`allowsBackForwardNavigationGestures`); iPhone pill buttons are opt-in |
| ⌘L | Search & Commands (palette) | tap the pill / pull-down |
| ⌘T | New Tab | new-tab button |
| ⌘⇧N | New Private Tab | new-private-tab action |
| ⌘W | Close Tab | close affordance / swipe |
| ⌘⇧T | Reopen Closed Tab | menu action |
| ⌘F | Find in Page | menu action / `/find` |
| ⌘R / ⌘⇧R | Reload / hard reload | pull-to-refresh / menu |
| ⌘1–9 | nth Tab or Group | (no direct touch analog; via switcher) |
| Ctrl+Tab / ⇧ | Next/Prev Tab | swipe on the pill |
| ⌥⌘←/→/↑/↓ | Prev/Next tab-in-group / group | swipe / switcher |
| ⌘D | Add to Favorites | heart in action cluster |
| ⌘Y / ⌘⌥B | History / Favorites | menu / `/history` `/favorites` |
| ⌘⇧J | Downloads | menu / `/downloads` |
| ⌘, | Settings | menu / `/settings` |
| ⌘+/-/0 | Zoom | pinch (D10) |
| right-click | Context menu | long-press (F19) |
| ⌘/Ctrl+click | Open link in background tab | long-press → background |
| Esc | Dismiss island/find | back gesture / dismiss |

- **iPad** with a hardware keyboard **may reintroduce** the desktop shortcuts on
  iOS only — a permitted iOS-only enhancement, not an Android obligation.
  Built 2026-11-03 (on main, unreleased): ⌘T, ⌘⇧N, ⌘L, ⌘W, ⌘⇧T, ⌘,, ⌘F,
  ⌘R, ⌘[ / ⌘], ⌘+ / ⌘− / ⌘0, ⌘Y, ⌘⌥B, ⌘D and ⌘1–9 (desktop's cluster
  rule), from iPadOS's menu bar and ⌘-hold list. Next and previous tab are
  Safari's ⌘⇧] / ⌘⇧[, because iPadOS keeps Ctrl+Tab for moving keyboard
  focus and it never reaches the app.
  Pointer and trackpad (2026-11-03, unreleased): the pointer highlights the
  Island's controls and palette rows and lifts tab grid cards; secondary click
  opens the long-press menus (F19); a two-finger swipe on the Island switches
  tabs, as the touch swipe does.
- **Slash commands (F7) are the cross-platform equalizer:** every keyboard action
  also has a `/command`, so the *capability* stays reachable on touch even where a
  shortcut doesn't.

**Parity contract:** every *capability* is reachable on every platform (via
gesture, menu, or slash command); only the *trigger* differs. iOS and Android
touch affordances should match **each other**.

**Status:** Accepted.

---

## D8 — Tab / web-view lifecycle & memory
**Features:** F2, F18, F31
**Why:** Mobile OSes aggressively evict backgrounded web views; desktop can make
the same renderer-discard tradeoff deliberately while keeping tab identity.

- **Desktop:** switching a tab hides one view and shows another (detaching and
  re-attaching it on macOS/Windows; Linux keeps hidden views attached) and
  destroys nothing, but an
  *idle* background tab is a separate matter: its renderer is deliberately
  discarded and rebuilt on return (F31). That is a **convergence** toward the
  mobile behaviour below rather than a split from it — the difference left is who
  schedules it (D23).
- **Mobile:** inactive web views may be **snapshotted and torn down**, then
  restored (URL + scroll) on reactivation, to survive memory pressure.

**Parity contract:** from the user's view, a tab retains its identity, title, and
scroll position across backgrounding; restore is seamless. The *eviction strategy*
is an implementation detail per platform.

**Status:** Accepted; a shared "tab restore" acceptance scenario should exercise
this on mobile. Amended 2026-08-09: desktop now discards idle background
renderers by policy (F31), so the platforms differ in *when*, not *whether* — the
control surface is D23.

---

## D9 — Auto-update
**Features:** F22
**Why:** Mobile app stores own update delivery; a self-updater is disallowed/
pointless.

- **Desktop:** `electron-updater` against GitHub Releases (packaged only).
- **iOS/Android:** **store-managed** — no in-app updater.

**Parity contract:** users get updates through the platform's normal channel; no
platform ships a self-updater that fights the OS.

**Status:** Accepted.

---

## D10 — Zoom / page scaling
**Features:** F23
**Why:** Desktop discrete zoom vs. mobile native pinch/reflow.

**Parity contract:** pages can be scaled and reset on every platform; the control
is platform-native.

**Status:** Accepted.

---

## D11 — Window model & chrome placement
**Features:** F1, F2, F32, F34
**Why:** Desktop uses resizable native windows with window controls and a strip + overlay;
mobile is a single full-screen surface with system insets.

- **Desktop:** one independent workspace per `BrowserWindow`, each with a 68px
  strip, its own always-on-top overlay view, and traffic-lights / window controls.
- **Mobile:** a single surface; the island adapts to safe-area insets; no window
  controls; multi-window is a tablet/foldable consideration, not a phone one.
- **iOS (2026-11-05, owner request):** Settings → Island → Back and Forward
  buttons (off by default, device-local `islandHistoryButtons`, never synced)
  puts them on the iPhone Island in place of Reload and New Tab, after a
  visitor asked where Back was. The Island has no tab count on any layout:
  a pinch in on a fully zoomed-out page, as in Safari, or a swipe up from the
  Island opens the tab grid. The page shrinks into its card as Safari's does. Stop still shows while a page loads. Pull to
  refresh and the tab grid and palette's New Tab stay. The unfolded Island
  always shows every button. Back and Forward also survive a relaunch: each
  tab's `interactionState` is saved on this device only (never synced, never
  backed up, never a private tab), found through `SavedTab.historyId` and kept
  apart from it, and dropped when the person clears their history or site data.
- **iOS (2026-11-03, owner request):** the Island floats over every page at
  the bottom, with the page running behind it, and tucks away below the
  screen's edge while the person scrolls a website down, as Safari's bar does.
  A scroll back up, the top or end of the page, a new page or a tab switch
  brings it back. It never tucks on the Start Page, with VoiceOver on, or while
  the Spaces menu, palette panel or a banner over it shows. Settings →
  Hide the Island while scrolling (on by default, device-local
  `islandTucksOnScroll`, never synced) keeps it always on screen, and Settings
  → Island position (`islandPosition`, `bottom` by default or `top`, also
  device-local) moves it to the top of the screen, where it tucks upward, its
  notices, Spaces menu and unfolded-Duo palette hang below it, a swipe down
  opens the tab grid, and the Start Page moves its header below it. This is the
  owner's deliberate choice for the phone, where the Island is under the
  thumb; desktop's August 2026 rejection of a scroll-away Island (it would
  make the desktop Island transient chrome) still stands, and D29's
  pointer-driven auto-hide remains desktop's only hiding mode.
- **Android (A1, 2026-11-04, owner: as close to the iPhone as possible):**
  the iPhone's floating Island, its tuck rules, Island position and Hide the
  Island while scrolling, ported value for value. Chromium's toolbar stays
  hidden and the page fills the screen behind the Island, which sits inside
  the system bars and display cutout in gesture and three-button navigation.
  Two differences Chromium forces: a sideways swipe moves through the current
  tab list only (normal or private, which Chromium keeps apart; the iPhone
  mixes them, and A2's tab grid settles it), and the switched-in page slides
  in from 30% of the width and settles in 350 ms instead of following the
  finger, because Chromium draws one tab's page at a time.
- **Desktop workspace-local state:** reopen-closed history belongs to the native
  window that closed the tab (F2), and Glance can expose a second tab inside
  that same window (F34). Neither operation may cross a workspace/profile edge.

**Parity contract:** the island's *contents and states* (F1) are identical; its
*placement/windowing* adapts to the platform. Independent native windows (F32)
are a desktop-only capability unless a future tablet/foldable contract adopts
them explicitly; the same applies to the Glance multi-pane surface (F34).
D30 proposes that contract for the iPhone Duo's inner display (Glance and
two-pane Split View, F53).

**Status:** Accepted.

---

## D12 — Password AutoFill & passkeys (divergence in mobile's favor)
**Features:** F24
**Why:** Desktop is blocked from native password managers by vendor
code-signature allowlists (see `CLAUDE.md`); mobile web views participate in the
OS credential system.

- **Desktop:** `N/A` — cannot join the allowlist.
- **iOS:** AutoFill Credential Provider + platform passkeys/WebAuthn work in
  `WKWebView`; consider the `web-browser.public-key-credential` entitlement.
- **Android:** Autofill framework / Credential Manager + passkeys work in `WebView`.

**Parity contract:** on mobile, saved credentials and passkeys are offered on login
forms inside Blanc tabs. This is a feature **mobile gains** over desktop — track it
as such, not as desktop being behind.

**Status:** Accepted; an intentional *positive* divergence.

---

## D13 — Shield count fidelity
**Features:** F12, F1 (the pill's shield count)
**Why:** Surfaced while speccing the backends (`blocking-backends.md`). Whether the
app can observe individual blocked requests depends on the engine model.

- **Desktop:** exact — the Ghostery engine emits a `request-blocked` event per
  block (main.js already counts these per tab).
- **Android:** exact — the fork's blocker counts each block per tab. There's no
  shield chip: the count is a line under the Sunrise menu's blocking row (A3).
  The Start Page runs the iPhone's script, so it shows protection on or off, not
  a weekly count.
- **iOS:** **not directly available** — `WKContentRuleList` blocks silently with no
  per-request callback. Recommended: show a binary "protected / paused" state
  instead of a live count (an approximate number that disagrees with reality is
  worse than none).

**Parity contract:** protection status is always visible; the *precision* of the
count differs — exact on desktop/Android, a protected-state indicator on iOS. The
F12-1 acceptance step is relaxed on iOS accordingly.

**Detailed design:** [`blocking-backends.md`](./blocking-backends.md).

**Status:** Accepted; **iOS shield UX decided 2026-07-07: binary "protected / paused" state** (no live count — `WKContentRuleList` blocks silently). F12-1 relaxed on iOS.

---

## D14 — Cosmetic filtering fidelity
**Features:** F12
**Why:** Element-hiding (vs. request-blocking) has different ceilings per engine.

- **Desktop:** the library drives full cosmetic filtering (including procedural).
- **Android:** the same as desktop: the fork's blocker applies cosmetic rules,
  procedural ones and scriptlets from document start in Chromium's renderer (A3).
- **iOS:** `css-display-none` rules only — static selectors, a **subset**;
  procedural cosmetics (`:has`, scriptlets) are dropped.

**Parity contract:** obvious ad elements are hidden everywhere; the depth of
cosmetic coverage differs (full desktop and Android / static
iOS). Not a bug — a documented ceiling.

**Detailed design:** [`blocking-backends.md`](./blocking-backends.md).

**Status:** Accepted; **iOS cosmetic scope decided 2026-07-07: static `css-display-none` only** (procedural dropped). Android cosmetic depth (procedural via injection) finalized when Android is built.

---

## D15 — Chrome surface material
**Features:** F1
**Why:** iOS 26 introduces Liquid Glass, a platform-native translucent material
with no desktop/Android equivalent.

- **Desktop:** opaque token-defined surface (`--surface-raised` + `--border`
  custom properties in `styles.css`).
- **iOS (26+):** `.glassEffect(.regular.interactive, in: .capsule)` — the
  platform-native translucent material. Falls back to the token surface on
  iOS 17–25 via `#available(iOS 26, *)`.
- **Android:** token-defined surface (same as desktop). As built in A1
  (2026-11-04), it's the iPhone's pre-26 fallback (`IslandSurface.swift`): the
  raised fill, a 0.5 dp hairline and a soft shadow (Android's elevation shadow
  tinted to the iPhone's 10% or 25% black). Android has no Liquid Glass.

**Parity contract:** the island pill is present and functional on every
platform; the *material treatment* differs — opaque tokens on desktop/Android,
Liquid Glass on iOS 26+. The pill's layout, content, and interaction model
are identical.

**Status:** Accepted; **iOS material decided 2026-07-08: Liquid Glass with token fallback.**

---

## D16 — Private-tab passkey persistence
**Features:** F4, F24
**Why:** Desktop's device-bound Touch ID passkeys seal their credential metadata
with a per-session secret that Electron keeps in the session's preferences, and
the private session is deliberately non-persistent — its secret cannot survive a
quit. Electron's WebAuthn configuration is app-global, so desktop also cannot
selectively disable private-tab ceremonies (upstream per-session opt-out
requested: [electron/electron#52302](https://github.com/electron/electron/issues/52302)).

- **Desktop:** private tabs never see the normal profile's passkeys (consistent
  with the session isolation in F4), and a passkey *created* in a private tab is
  **ephemeral**: it works for the rest of the run, then becomes permanently
  unusable after Blanc quits (its Secure Enclave keychain item is orphaned). The
  private newtab copy states this.
- **iOS / Android:** passkeys go through the OS credential provider, which owns
  persistence (iCloud Keychain etc.) — a passkey created in a private tab
  persists like any other; the OS, not Blanc, is the source of truth.

**Parity contract:** passkey sign-in works in private tabs on every platform
*within a session*; private tabs never leak credentials into the normal
profile's store. Only the desktop treats private-*created* passkeys as
ephemeral, and says so in the private-tab copy.

**Status:** Accepted 2026-07-10 (Electron 43 offers no per-session WebAuthn
opt-out; renderer-side blocking would be bypassable). Revisit if
[electron/electron#52302](https://github.com/electron/electron/issues/52302)
lands. Hardware acceptance: F4-6.

## D17 — Encrypted DNS control (F25)
**Features:** F25
**Why:** In-app DoH control depends on the platform's network stack.

- **Desktop:** full control via `app.configureHostResolver` (Electron 43,
  process-wide, applied after `ready`).
- **Android:** OS-level Private DNS (DoT) exists; per-app DoH control to be
  assessed at port time.
- **iOS:** WKWebView exposes no in-app DoH control; encrypted DNS is an OS concern
  (Settings / configuration profiles). iOS contract: **document and defer to OS**,
  no in-app control.

**Parity contract:** the *encrypted-DNS control* is desktop-only; the *protection*
(encrypted DNS when the user configures it) is available on every platform through
whatever layer that platform provides.

**Status:** Accepted 2026-07-11.

---

## D18 — WebRTC IP-handling and receiver-buffer controls (F26)
**Features:** F26
**Why:** WebRTC IP-policy and receiver-buffer controls depend on the engine.

- **Desktop:** `webContents.setWebRTCIPHandlingPolicy` (standard + compatibility +
  disable-direct-UDP), plus `RTCRtpReceiver.jitterBufferTarget` for the Stable
  and Resilient call-audio modes.
- **Android:** WebView WebRTC IP-handling support to be assessed at port time.
- **iOS:** WKWebView exposes no WebRTC IP-handling policy; iOS contract downgrades
  to **platform default behavior, documented** (no in-app control).

**Parity contract:** the *control* is desktop-first; where a platform can't express
it, that's a documented capability gap, not a behavioral promise broken.

**Status:** Accepted 2026-07-11.

---

## D19 — Desktop vertical rail vs. mobile tab overview
**Features:** F28, F1, F2, F3, F4
**Why:** A permanently reserved desktop rail makes many open tabs scannable in a
wide, resizable window. Reserving the same geometry on a phone would consume the
content area and fight the platform's native navigation model.

- **Desktop:** optional 200–360px full-height left rail, defaulting and
  resetting to 248px. Its width is directly adjustable and device-local; a
  narrow window temporarily caps the rendered rail to preserve at least 392px
  for the page without overwriting the saved preference. The page pane keeps a
  68px sampled-color safe-area gutter for the floating Island, which remains
  the sole address, search, and command surface. The rail is another
  presentation of the canonical tab/group model.
- **iOS:** no reserved rail. Use the native full-screen tab overview while
  preserving Blanc's tab identity, private state, pinning, and named groups.
- **Android:** no reserved rail. Use the native full-screen tab overview while
  preserving the same tab identity, private state, pinning, and named groups.

**Parity contract:** every platform lets users identify, reach, switch, close,
create, and organize the same logical tabs and groups, with private and media
state visible. Desktop alone may reserve persistent horizontal space for the
rail; identical rail geometry, pointer drag behavior, and a synced layout
preference are not parity requirements.

**Status:** Accepted 2026-07-23.

## D20 — URL-bar context menu (desktop only)
**Features:** F19, F5

**Why:** A pointer right-click on the address field is a desktop-only gesture.
Mobile address fields inherit the platform's own text-selection menu
(Cut/Copy/Paste/Select All arrive for free from the OS), and replacing or
augmenting that menu fights platform conventions for marginal gain.

- **Desktop:** native context menu on the island's address input: Undo, Redo,
  Cut, Copy, **Copy Clean Link**, Paste, **Paste and Go**, Delete, Select All.
  Copy Clean Link strips a curated tracking-parameter list (`utm_*` prefix plus
  known click-ids, case-insensitive) from the field's visible text, preserving
  the order and encoding of surviving parameters; disabled when the text isn't
  an http(s) URL. Paste and Go routes clipboard text through the same pipeline
  as a typed address (OS hand-off, search heuristic, utility routing) and
  dismisses the island. Known v1 limitation: the menu is pointer-invoked on
  macOS (no keyboard context-menu gesture exists there — Shift+F10/menu-key
  work on Windows/Linux), so Copy Clean Link and Paste and Go have no
  keyboard-only or VoiceOver path on macOS; a slash-command fallback is the
  natural future fix.
- **iOS:** no custom menu; the system text-selection menu applies. No Copy
  Clean Link / Paste and Go equivalent in v1.
- **Android:** no custom menu; the system text-selection menu applies. No Copy
  Clean Link / Paste and Go equivalent in v1.

**Parity contract:** basic text editing on the address field works everywhere
via each platform's native affordances. Copy Clean Link and Paste and Go are
desktop conveniences, not parity requirements; if a platform later gains them,
the cleaning rules must match `src/main/clean-link.js` exactly.

**Status:** Accepted 2026-07-25.

## D22 — Browser-profile discovery and Favorites import
**Features:** F30

**Why:** Desktop browsers expose profile files in conventional user-data
directories, while mobile operating systems sandbox one browser from another.
The available source formats also differ.

- **Desktop:** detect known Chromium-family profiles and parse their bounded
  `Bookmarks` JSON, plus the `AccountBookmarks` JSON in which recent Chrome
  keeps a signed-in Google Account's bookmarks, in the main process. A
  user-selected Netscape bookmarks HTML file remains the cross-browser
  fallback, including Firefox and Safari.
- **iOS:** use a user-selected exported bookmarks document; no scanning another
  browser's application container.
- **Android:** use a user-selected exported bookmarks document through the
  system picker; no scanning another browser's private application storage.

**Parity contract:** Both discovery and import begin only after an explicit
user action — no platform scans for other browsers merely because a migration
surface was rendered. Import accepts only supported web Favorites, preserves
folders where the source carries them, deduplicates without replacing existing
data, and never expands into passwords, history, cookies, or sessions without a
separately specified choice.

**Status:** Accepted 2026-07-30. Amended 2026-08-08 to make discovery — not
just import — require an explicit action, since profile display names commonly
carry a person's real name or email address. Amended 2026-10-15 to read
Chrome's `AccountBookmarks` file beside `Bookmarks`, after signed-in Chrome
profiles were found to import nothing.

## D23 — Who decides when a background tab loses its renderer
**Features:** F31 (the behaviour itself is D8)

**Why:** Discarding a backgrounded web view is app-schedulable on desktop and
Android, and OS-governed on iOS — `WKWebView` suspension is not something an app
can schedule, only react to. The *behaviour* converged (D8); the *control* cannot.

- **Desktop:** app-scheduled and user-configurable — an idle delay
  (off / 30m / 1h / 6h, default 1h) plus a manual `/sleep` command that skips
  only the waiting.
- **Android:** app-scheduled and user-configurable on the same contract; the OS
  may additionally evict under memory pressure, which the app does not control.
- **iOS:** OS-governed. Surface no delay control at all; implement the restore
  path, and honour the same never-discard exclusions wherever the platform gives
  the app a say.

**Parity contract that still holds:** a backgrounded tab may lose its renderer on
any platform and returns with identity, title, and scroll intact; only the
control over *when* is platform-dependent.

**Scope of "scroll intact":** that clause, inherited from D8, is scoped to
**static documents**. A restored scroll offset is applied against a document
rebuilt from the initial response, so on an infinite-scroll or virtualized feed it
clamps to the bottom of the first page rather than returning to the same content.
Desktop's deep-scroll exclusion (F31) exists precisely so *automatic* quieting
never puts this contract in a position it cannot honour. A platform that discards
on the OS's schedule cannot make that promise for feeds and must not claim it.

**Tagging:** behaviour scenarios tag `@D8`; control-surface scenarios tag `@D23`.

**Status:** Accepted 2026-08-09.

## D24 — Capture-indicator surface (desktop chip vs. OS indicators)
**Features:** F13

**Why:** Electron exposes no browser-process capture-state API, so desktop
Blanc assembles live mic/camera state itself: the permission grant is the
only off→on signal, and page-world instrumentation refines toward off
(fail-safe: a defeated patch reads stuck-on, never silently-off; the macOS
system indicator remains the malicious-page backstop). Mobile OSes already
draw an authoritative capture indicator at system level.

- **Desktop:** Blanc draws its own window-wide capture chip in the island
  pill plus a popover listing each capturing tab/popup with focus and stop
  controls.
- **iOS/Android:** defer to the OS/WebView capture indicator; no in-chrome
  chip. Stop = leaving/closing the capturing page, as the platform idiom
  dictates.

**Parity contract that still holds:** media permission prompts show the
mic/camera glyphs with shared copy, permission policy and persistence are
identical, and capture state is never persisted or synced anywhere.

**Tagging:** desktop-chip scenarios tag `@D24`.

**Status:** Accepted 2026-08-13.

## D25 — Desktop local profiles vs. mobile app containers
**Features:** F33, F18, F9, F10, F11, F13

**Why:** Blanc’s desktop profile model is a multi-window browser capability:
each identity owns persistent and private Electron session partitions plus its
own browser windows. Phone operating systems already place the app in one
strongly isolated container and do not expose the same simultaneous
multi-window profile idiom.

- **Desktop:** Personal plus bounded named local profiles. Named identities
  isolate cookies/site data, Favorites, history, download metadata, remembered
  permissions, normal tabs, and private tabs. Profile Sync remains Personal-only.
- **iOS/Android:** N/A for the first native ports. They expose the platform app
  container and private-browsing mode, without an in-app named-profile catalog.

**Parity contract that still holds:** private browsing remains non-persistent;
ordinary browser records never cross into private history/session recovery; and
no platform silently expands Profile Sync’s approved data scope.

**Tagging:** desktop local-profile scenarios tag `@D25`.

**Status:** Accepted 2026-08-14.

## D26 — Desktop 1Password SDK bridge vs. mobile
**Features:** F38, F24

**Why:** Desktop Blanc cannot participate in third-party credential providers'
browser allowlists, but 1Password's user-authorized SDK provides a separate,
explicit way to retrieve a matching Login item from the installed desktop app.
Mobile web views already participate in the operating system's credential
provider surface (F24), where adding a second Blanc-specific picker would be
duplicative and less native.

- **macOS, Windows, Linux:** an off-by-default, explicit Fill command uses the
  installed 1Password desktop app and the user's configured account. Blanc
  applies the item's saved-website policy, offers a bounded native chooser, and
  fills only the revalidated active login form. It never becomes a credential
  store. The shortcut is ⌥⌘P on macOS and Ctrl+Shift+P on Windows and Linux.
  Any other desktop platform exposes no setting, command, shortcut, preload
  method, or IPC handler, and cannot start the credential broker.
- **iOS/Android:** F38 is N/A. Use F24's system AutoFill/Credential Manager
  surface, through which 1Password and other installed providers participate.

**Parity contract that still holds:** credentials are offered only through a
user-controlled provider surface, fill only into the intended login page, and
are never added to Blanc persistence, Profile Sync, telemetry, or browsing
records. The provider-specific setup and picker are platform-native.

**Tagging:** the live-account SDK scenario tags `@D26`, and the drivable fill
UX scenarios run on every desktop platform; the mobile system-provider scenario
remains `@D12`.

**Status:** macOS-only first release accepted by the product owner 2026-08-24;
the signed macOS live matrix is complete. Windows and Linux enabled on
2026-10-10 at the owner's request; their real-account matrix (physical
machines or VMs) is pending (`docs/1password-integration.md`).

## D27 — Interface-language picker location
**Features:** F44

**Why:** iOS and Android already provide a per-app language screen that also
applies to the system UI the app shows; an in-app picker there would duplicate
it and disagree with it. Desktop has no such OS facility for Electron apps.

- **Desktop:** Settings → General → Language with System plus supported
  languages by endonym; the choice is device-local and applies after a relaunch.
- **iOS:** Settings → Blanc → Language (the system per-app language screen).
- **Android 13+:** per-app language preferences (`LocaleManager`).

**Parity contract that still holds:** the same catalog, the same fixed terms,
the same English fallback and the same selectable set on every platform.

## D28 — Desktop Island hover-open vs. touch-only input
**Features:** F1

**Why:** A persistent mouse or trackpad pointer can dwell over the resting
Island without activating it. A finger cannot hover, and treating proximity or
a first tap as hover would steal the tap's ordinary job.

- **Desktop with a hover-capable fine pointer:** an off-by-default setting may
  open the Island panel after a continuous 300 ms dwell on the resting Island's
  address (favicon and domain); its buttons and chips stay click-only.
- **Touch-only desktop hardware, iOS and Android:** hover-open is unavailable;
  the ordinary tap, keyboard and gesture routes remain.

**Parity contract:** the same Island panel and all of its actions remain
reachable. Only the optional pointer-hover trigger is desktop-specific.

**Status:** Accepted 2026-10-17.

## D29 — Desktop auto-hiding Island strip
**Features:** F1

**Why:** On desktop the Island sits in a permanent 68px strip above the page.
Some people want every pixel for the page and reach the Island only when they
need it, as Vivaldi's and Arc's hidden toolbars allow. The reveal depends on a
pointer reaching the window's top edge, which touch input has no equivalent for.

- **Desktop:** an off-by-default, device-local setting (Settings → General and
  View → Auto-hide the Island, ⌘⌥B / Ctrl+Alt+B) gives the page the whole
  window. The pointer at the top edge, or any Island surface (palette, find,
  popovers, Glance), brings the Island back; it hides again once the pointer
  leaves it. A second device-local choice says how it comes back: **Float over
  the page** (the default, added 2026-10-20) slides the pill alone down over
  the page, which never moves, with the site still visible and clickable beside
  it; **Push the page down** shows the strip and moves pages down to make room,
  as v1.39.0 did. In both styles the window buttons come and go with the
  Island (the macOS traffic lights; in float mode the Windows and Linux
  controls, which float top-right, and the main-menu button), so they never
  sit over a site's own corner buttons while it is hidden; the macOS buttons
  stay beside the vertical rail, which owns that corner. In push mode resting
  the pointer just below the top edge also brings the Island back; in float
  mode only the top edge does, because a site's own header sits in that band
  and the Island would land on it, and the floating Island hides as soon as
  the pointer moves below the strip. Glance always uses the push layout.
  Turning it on shows the Island for a few seconds with a tip on how to bring
  it back. While hidden, a band along the page pane's top edge drags the
  window (both styles): 6px, or 10px on Windows, whose top 5 rows are the
  window's resize border. Below it the page's top band belongs to the page. With vertical tabs the rail is never reveal territory;
  only the page pane's top band is. On Linux under native Wayland, which gives
  apps no pointer position outside their windows, the Island is revealed from
  just inside the top edge only, not from the band above a floating window.
- **iOS and Android:** not offered. Mobile Island placement and any
  scroll-driven collapse are each platform's own presentation (D11).

**Parity contract:** the Island and all of its actions stay reachable through
the same keyboard and pointer routes; only how long the strip stays on screen
differs.

**Status:** Accepted 2026-10-19; float style added 2026-10-20. Windows and
Linux (X11 and native Wayland) hand checks ran 2026-10-20 (bnfy/blanc#994):
the Windows record of that check, that the band drags but a double-click on
it does not maximise, is corrected below. On Linux the window document went `hidden` while the page
covered it whole and stopped tracking resizes, leaving the floating pill and
window controls at stale positions after a maximise; on Linux a covered strip
now keeps one row uncovered (bnfy/blanc#999). Windows does the same: its
covered strip also went `hidden`, so a pill that grew while covered (more
tabs, a longer domain) was drawn wider than its view and lost its ends
(reported on v1.42.0; 2026-10-22 VM check), and a covered strip there keeps
one row uncovered too (bnfy/blanc#1052). On Windows the top 5 rows are the
window's resize border, not the band: the rows the 2026-10-20 check read as
dragging were resizing the window's top edge, and a double-click there
stretches it to full height, while the first row below them maximised. So a
6px band left one row that dragged, and only sideways or up, because Windows
drops the drag if the pointer's first move leaves the band (bnfy/blanc#1369).
The band there is now 10px, measured 2026-11-06 with real mouse input on a
GitHub-hosted Windows machine at 100% scale: in float, rows 5–9 drag sideways
and up, and rows 5–8 down at a 1px step; in push the strip is revealed by the
press, so rows 5–10 drag; rows 8–9 stop short of the window controls, which
keep their clicks. The October VM logs put the same row 4/5 boundary at 200%
scale; the 10px band has not been measured in the Windows VM.

---

## D30 — Foldable inner display (iPhone Duo)
**Features:** F1, F6, F34, F53 (and F32 later)

**Why:** iPhone Duo's 7.6" inner display reports regular width and height,
like an iPad, while its 5.4" outer display is an ordinary compact iPhone. The
inner display has room for surfaces D11 keeps desktop-only on phones, and D11
left that door open for "a future tablet/foldable contract".

- **Desktop:** unchanged.
- **iOS, compact width** (every iPhone, the Duo's outer display, the inner
  display in system Split View): the phone contract as before; Glance and
  Split View are not offered.
- **iOS, regular width** (the Duo's inner display; an iPad would get the same
  layout): the Island pill stays bottom-centre with a capped width, and the
  palette opens in place as desktop's panel does. Split View (F53) shows two
  tabs side by side, never three or four; floating Glance (F34) shows one
  reference card over the page. When the phone folds, a split shows its
  focused pane alone and returns on unfolding, and an open Glance closes.
  Folding and unfolding never reload a page. Controls stay off the fold while
  the phone is part-folded. Multiple windows (F32) are a later step.
- **Android:** foldables follow the same size-class rule when Android is
  built.

**Parity contract:** where a regular-width iOS layout offers Split View or
Glance, their semantics are desktop's: the focused pane is the active tab and
the Island serves it, a split is one item in the tab list and the session,
Close Split is one closed entry, private tabs are never saved, and Glance
never crosses a workspace. Only the number of panes and the presentation
differ.

**Status:** Proposed 2026-10-21 in
`docs/superpowers/specs/2026-10-21-ios-iphone-duo-design.md`. Duo-1 (the
unfolded Island and palette panel) is in the TestFlight beta and iOS 1.0;
two-pane Split View and floating Glance (2026-11-03) are on main and
unreleased; fold avoidance and multiple windows are not built.


---

## D31 — Reader Mode images in Electron and WebKit

**Feature:** F58. **Status:** Implemented candidate, acceptance/release pending.

Electron can ask the source tab's active blocker about an image before a bounded,
cookie-free fetch. WKContentRuleList has no equivalent per-request decision API.
iOS Reader Mode therefore reuses only images the source WKWebView already loaded
and can copy through an origin-clean canvas. It makes no extra image requests;
unloaded and cross-origin images without canvas permission are omitted, keeping
alt text and captions. Both platforms share extraction, sanitization, fonts,
appearance defaults, manual activation, and original-page return. Broader iOS
image coverage requires a reviewed blocker-equivalent path first.

---

## D32 — Link routing only on desktop
**Features:** F60

**Why:** Link routing chooses between local profiles, and Spaces inside them,
for a link another app hands Blanc. Only desktop has more than one profile
to choose between. iOS hands every link to the default browser's single
profile, and Android isn't built yet.

- **Desktop:** ordered domain and contains rules in Settings → Profiles send
  links from other apps (macOS `open-url`, command-line and second-instance
  URLs) to a profile, optionally a Space and a private tab.
- **iOS:** not offered. Links open as they do today.
- **Android:** not offered until it is built with profiles.

**Parity contract:** a link no rule matches behaves the same everywhere: it
opens in the window, or app, used last. Links clicked inside Blanc are never
routed on any platform. If a mobile Blanc gains profiles, it adopts the
desktop rule model (matching on the parsed host, first match wins, rules
device-local and never synced) rather than inventing a separate one.

**Status:** Desktop PR 1 implemented on the candidate branch, not shipped in
public v1.43.1. Revisit when a mobile Blanc has profiles.

---

## D33 — iPhone app icon catalog
**Features:** F17

**Why:** The owner asked for a layered, reflective iPhone icon in the
standard Light style (2026-10-29). They chose the iPhone's Sunrise Gold as
its standard icon and added Sunrise Dawn, which is kept off the Mac for now. iOS 26 and later draw Icon
Composer packages in Liquid Glass and store the chosen alternate icon
themselves.

- **Desktop (macOS):** five icons, `sunrise` standard, chosen in Settings →
  General → App icon and stored as the device-local `appIcon` setting.
- **iOS:** six icons, the Mac's five plus `sunrise-dawn` (Sunrise Dawn).
  `sunrise-gold` is the primary icon. They're chosen in Settings → Appearance → App icon and
  switched with `setAlternateIconName`. iOS remembers the choice, so there's
  no `appIcon` value in iPhone settings. The iPhone's Sunrise Gold is drawn for
  the phone: the same cream glass Sunrise on gold, plus a reflection under
  the water and separate glass pieces.
- **Android:** not built.

**Parity contract:** shared ids keep the same names and labels, no platform
reuses a retired id, and every icon is free. `sunrise-dawn` stays out of the
shared settings schema until the Mac offers it.

**Status:** iPhone implemented, unreleased. Spec:
`docs/superpowers/specs/2026-10-29-ios-liquid-glass-app-icons-design.md`.

---

## D34 — Blanc's pages at `chrome://blanc/` on Android
**Features:** F16, F9, F10

**Why:** Android Blanc is built on Chromium, which serves browser pages from
WebUI hosts under `chrome://`. A `blanc://` scheme would need a new URL scheme
through Chromium's navigation, security and storage code; a WebUI host gets the
same isolation (its own origin, no web content linking in) from code Chromium
already maintains.

- **Desktop:** `blanc://<page>/`, served by `src/main/pages.js`.
- **iOS:** `blanc://<page>/`, served by a `WKURLSchemeHandler`.
- **Android:** `chrome://blanc/<page>.html`, served by a WebUI
  (`chromium/blanc/android/browser/blanc_pages_ui.cc`) from shipping's page
  files, byte-identical to a pinned release. An adapter loaded first in each
  page links `blanc://` addresses to it. New tabs, Favorites and History open
  these pages, so Chrome's New Tab page is never created. As on the iPhone,
  the utility pages open as ordinary tabs in the phone layout, not desktop's
  sheet.

**Parity contract that still holds:** the same page files, the same
`window.bowserPages` members per page (from `browser-api/bridges.json`), and
pages that can't reach the web or local files.

**Status:** Android implemented in A1, unreleased.

---

## D35 — Settings as a native screen on phones
**Features:** F14

**Why:** On a phone, Settings is a short list of switches and choices that
belongs in the platform's own controls; desktop's `blanc://settings` page is
built for a pointer and a wide window.

- **Desktop:** `blanc://settings/`, a utility page.
- **iOS:** a native SwiftUI Settings sheet.
- **Android:** a native Settings screen, matching the iPhone's, in A5. Until
  then, Android shows no Settings and its pages' Settings links do nothing.

**Parity contract that still holds:** the same settings keys, defaults and
labels (`settings-schema/`, `copy/messages/`), and device-local settings stay
device-local everywhere.

**Status:** iOS implemented; Android planned (A5).

---

## D36 — Private tabs in their own section on Android
**Features:** F4, F2

**Why:** Chromium keeps private tabs in a separate tab model (its off-the-record
profile), with its own order, selection and closes. Showing them mixed into the
normal tabs would mean replacing Chromium's tab model.

- **Desktop:** private tabs sit among the window's tabs.
- **iOS:** private tabs sit in the one tab list, marked private.
- **Android:** the tab grid and the palette list normal tabs first and private
  tabs after a "Private" heading. Private tabs are never grouped.

**Parity contract that still holds:** private tabs are never in History, never
saved or synced, never reopened after a close, their children stay private, and
the private theme and Private chip are the same.

**Status:** Android implemented in A2, unreleased.

---

## D37 — Find bar at the bottom on phones
**Features:** F8

**Why:** On a phone the keyboard is up while you type what to find, and the
thumb is at the bottom of the screen.

- **Desktop:** a find capsule over the top of the page.
- **iOS:** the system find bar above the keyboard (`UIFindInteraction`).
- **Android:** Blanc's find bar above the keyboard, with the match count,
  Previous, Next and Done, matching the iPhone's.

**Parity contract that still holds:** the match count, moving between matches,
and the page staying usable while the bar is open.

**Status:** iOS implemented; Android implemented in A2, unreleased.

