# 1Password login fill — UX overhaul

Date: 2026-08-28
Status: Revised after review pass 3 (surface generation, sole-channel
geometry, readiness boundary); awaiting approval
Baseline: v1.9.1 public (feature shipped macOS-only in v1.9.0; PR #215 merged, unreleased)

## Problem

The 1Password login fill works and is security-reviewed, but its user experience
is stock Electron, not Blanc:

- Every prompt, error, and confirmation in the fill flow is a native
  `dialog.showMessageBox` modal (`src/main/credential-fill-controller.js`) —
  nine error variants, two setup nudges, a heuristic-form confirmation, and a
  page-changed abort. Success is silent.
- The multiple-match picker is a native context menu popped at a fixed fallback
  point (16, 64) — the top-left of the window, unrelated to the login form or
  the island.
- Setup requires the user to discover 1Password's Settings → Developer →
  Integrate with 1Password SDKs toggle on their own, then hand-type an account
  name or ID into a bare text field. A typo surfaces only later, mid-login, as
  an `account-not-found` dialog.
- Nothing signals that a login page is fillable. The user must already know
  ⌥⌘P, `/1password`, or the View menu item.

## Decisions taken (product owner, 2026-08-28)

1. **Scope:** full prioritized overhaul — in-flow surfaces, setup, and
   discoverability.
2. **Security boundary:** hybrid. The reviewed renderer-free credential rule
   stands: candidate usernames and credentials never cross renderer IPC, so the
   picker stays a native menu. Everything credential-free moves to Blanc-styled
   surfaces.
3. **Discoverability:** lightweight ambient hint — a structure-only page probe
   drives a pill affordance. This is a deliberate, documented posture change
   (Blanc previously inspected pages only on explicit invoke).
4. **Packaging:** one combined release. The ambient-hint security and
   marketing-claims review gates the whole release.

## Design

### 1. Fill capsule — Blanc-styled in-flow surface

A new small transparent `WebContentsView` rendering `fill-status.html` /
`fill-status.js` (a fourth `blanc-chrome://` document; the exact-allowlist
scheme registration gains this one entry), attached bottom-center over the
page, directly modeled on the permission-prompt surface. Two shapes:

- **Decision capsule** — replaces the blocking dialogs: the two setup nudges
  (Open Settings / Cancel) and the heuristic-form confirmation (Fill Login /
  Cancel). The flow awaits the reply exactly as it awaits dialogs today.
  Cancel-equivalent dismissals — anything that replaces or leaves the user's
  working surface: Escape, tab switch, tab creation, main-frame navigation,
  summoning ⌘L, opening a utility sheet, entering or leaving Glance, and
  window close. These same events invalidate the **whole fill flow**, not
  just a visible capsule — see "Flow-level invalidation" below.
- **Notice capsule** — non-blocking: all error variants, "page changed",
  "no matching login", and the new success notice. **Errors and aborts
  persist until dismissed** (✕ button, Escape, or the tab-switch/navigation
  dismissals) — they carry essential information and must not race a reading
  or assistive-tech user. Only the **success** notice auto-dismisses (~4 s,
  timer paused while hovered or focused): it is supplementary — the filled
  fields are themselves visible — and it is announced via a live region
  regardless of its visual lifetime.

**Accessibility contract:**

- The decision capsule is a `role="dialog"` with an `aria-label` per kind.
  Initial focus lands on **Cancel**; Tab/Shift-Tab cycle the two buttons;
  Enter and Space activate only the focused button (so Enter can never
  trigger Fill Login unless the user deliberately moved focus there —
  preserving today's `defaultId: 1` safety); Escape cancels. Focus
  restoration is **reason-aware**: a plain dismissal (reply, Escape, ✕,
  timeout) returns focus to the target tab's content, but when a successor
  surface caused the dismissal (⌘L, a utility sheet, Glance, a tab switch),
  that surface keeps focus — the capsule never steals it back.
- Notice capsules render into a live region: `role="alert"` for errors and
  aborts, `role="status"` for success. Screen readers announce the message
  once even if it is visually dismissed early.
- All actions are reachable by keyboard alone; nothing depends on hover.

**IPC contract (the property that keeps the boundary intact):** the capsule
renderer receives only a fixed message-kind identifier from a frozen enum. All
user-facing copy lives inside `fill-status.js`, keyed by kind. No
vault-derived, page-derived, or free-form string ever crosses to a renderer —
strictly less data than the native dialogs show today. `ERROR_COPY` in the
controller is replaced by kind emission; the copy table moves to the capsule
document. Transport hardening, all required:

- **Dedicated narrow preload.** The capsule view gets its own
  `fill-status-preload.js` exposing exactly one inbound listener
  (`fill:show {kind, mode, requestId}` / `fill:hide {requestId}`) and one
  outbound call (`fill:reply {requestId, verb}`). It does **not** load the
  rich `preload.js` `browserAPI` bridge. (The permission view currently loads
  the rich preload — this spec deliberately does not copy that; changing the
  permission view is out of scope.)
- **Request-ID echo.** Main assigns a monotonically increasing `requestId` per
  shown message. A reply is accepted only when sender-validated (the capsule's
  own WebContents and URL, same pattern as the `pages:*` guards) **and** its
  `requestId` matches the currently pending request. Stale or unknown IDs are
  dropped, so a late reply can never resolve a newer decision.
- **Per-kind verb validation.** Each kind declares its allowed verbs
  (decision kinds: their two verbs; notice kinds: `dismiss` only). A reply
  whose verb is not in the pending kind's set is dropped.
- **Renderer-ready replay.** The view is created lazily; a show sent before
  the document's first `did-finish-load` is queued and replayed on load (the
  renderer dedupes by `requestId`), mirroring the permission view's existing
  replay.
- **Cancel on destroy/crash.** If the capsule's WebContents is destroyed or
  its render process gone while a decision is pending, the pending promise
  resolves as Cancel and the flow's `activeFlow` guard is released. Every
  pending decision has exactly one resolution path — reply, a
  cancel-equivalent dismissal event, or view death — so a lost message can
  never leave the controller busy indefinitely.

**Controller seams:** `createCredentialFillController` swaps its `dialog`
dependency for injected `notify(target, kind)` and
`confirm(target, kind) → boolean` functions. Reason codes and flow order are
unchanged. Unit tests drive the seams directly.

**Flow-level invalidation:** the working-surface events above can also occur
while **no capsule is showing** — most likely during the broker await, which
can sit in a DesktopAuth prompt for many seconds. Checking current surface
state at checkpoints is not enough: ⌘L, a sheet, or Glance can be opened
**and closed again** entirely within one await. The window runtime therefore
keeps a **monotonic surface generation**, incremented on every surface
transition — overlay show/hide, utility sheet open/close, Glance enter/leave,
and permission-prompt arrival (which must invalidate a mid-broker flow, not
merely dismiss a visible capsule). The flow captures the generation **after
`prepareTarget` performs its controller-owned cleanup** (starting the fill
from the ⌘L palette closes the overlay as part of starting — that transition
must not self-invalidate), and `isTargetCurrent` additionally requires the
captured generation to still equal the current one. Because the flow already
re-checks that predicate after every await, any surface transition mid-broker
— even one that has since reverted — aborts the flow at the next checkpoint,
and nothing is ever filled underneath (or after) a successor surface. Aborts
caused by the user's own surface action (⌘L, sheet, Glance, tab switch)
cancel silently — the user chose to leave; genuine page changes keep their
notice.

**Stacking and coexistence:** the capsule view sits above the active tab's
view and below the overlay. Permission prompts take precedence: if a
permission prompt is pending or arrives, a pending decision capsule resolves
as Cancel and hides; a notice capsule simply hides. Main recomputes capsule
bounds on window resize (position moves don't fire ResizeObserver — the
resize listener lives in main, as with the permission view).

**Readiness and fallback:** presentation never assumes the renderer will
become ready. A show is subject to a bounded readiness deadline (~2 s)
covering `loadURL` rejection, `did-fail-load`, and a load that simply never
finishes. The boundary between the two failure outcomes is the message's
**first visible presentation** — a decision is typically already pending
while the lazily created view is still loading, so "decision pending" cannot
be the boundary:

- Failure **before the message has ever been visibly presented** falls back
  to the current `dialog.showMessageBox` path, which substitutes as the
  presentation: a pending decision is answered by the native dialog's
  result, and a notice is shown natively. A flow is never silently
  swallowed.
- Failure **after first visible presentation** (load failure, crash,
  destroy) resolves a pending decision as Cancel and releases `activeFlow` —
  the same single-resolution guarantee as the transport contract. There is
  no re-prompt: the user already saw the question once, and a second surface
  asking it again would be ambiguous.

### 2. Picker anchoring

The multi-match picker stays a native `Menu.popup` (usernames never leave the
main/broker side). Changes:

- **Geometry has exactly one channel: a live read immediately before
  `Menu.popup`.** The inspect result carries no rectangle — the broker await
  between inspect and pop can last many seconds (DesktopAuth), during which
  the user may scroll, resize, or trigger responsive reflow, so an
  inspect-time rect would be both stale and redundant. A small
  isolated-world call reads the current viewport rectangle of the password
  field (else the username field) under the existing nonce and
  element-identity validation (the same stash that authorizes the fill).
  Geometry only; no values. If the rect cannot be revalidated — element
  detached, nonce or document mismatch — the anchor falls back to the island
  pill; the flow itself is unaffected (its own page-changed checks govern
  aborting).
- A pure function (unit-tested, in `onepassword-policy.js`) converts the
  fresh CSS-pixel rect to window coordinates using the active view's
  **actual current bounds** (`view.getBounds()` — which is
  `layout.pageBounds` or Glance's `primary` rect, so vertical tabs' x offset
  and Glance's split are both honored; never an assumed `(0, chromeHeight)`
  origin) and the tab's **current page zoom factor**
  (`webContents.getZoomFactor()` — CSS pixels scale by the zoom factor
  before adding the view origin), clamping the result to the view's own
  bounds so a scrolled-out or oversized rect still yields an anchor over the
  page area.
- Anchor fallback chain: field rect → island pill anchor → existing (16, 64).
- Labels are unchanged (username primary, title · vault sublabel, sanitized by
  `menuText`).

### 3. Success feedback

On a successful fill, the notice capsule shows "Filled from 1Password".
Which fields were filled is not shown (kind only, no detail). Nothing is
recorded.

### 4. Setup & Settings status card

The Settings → Privacy & Security → 1Password section becomes a small status
card:

- **Row 1 — app presence (a hint, not authoritative):** a main-process
  filesystem check for `/Applications/1Password.app`, refreshed when the
  section is shown. A movable or nonstandard install produces a false
  negative, so absence renders as soft guidance ("Blanc couldn't find the
  1Password app in Applications — if it's installed elsewhere, Verify below
  still works"), never as a hard block; nothing is gated on this row. When
  present, an **Open 1Password** button launches the app. Verify is the
  authoritative check.
- **Row 2 — account + Verify:** the free-text account field stays (the SDK
  requires the identifier; `onePasswordAccount` keeps its frozen name), plus a
  **Verify** button that performs a real broker authorization probe with the
  typed account. Success renders an inline "Connected" state; failure renders
  the mapped fixed-kind error copy inline. The Verify click intentionally
  triggers 1Password's own DesktopAuth approval — completing setup at setup
  time instead of failing later mid-login. Interaction contract:
  - Verify is disabled while the account field is empty or
    whitespace-only.
  - **Persist first, then probe.** Verify begins by saving the field's
    current value through the normal Settings path and takes the
    **normalized value the save returns** as the probe input — never the
    raw field text — so it cannot race the field's own asynchronous
    change-save.
  - While a verification is in flight the button is disabled and shows a
    pending state; duplicate clicks are ignored.
  - Each verification carries a request token. "Connected" renders only
    when the response's token is the latest **and** the field's value and
    the stored account both still equal the value that was probed; anything
    else is dropped.
  - Editing the account field immediately resets "Connected" to unverified
    and invalidates any in-flight verification.
- The SDK-integration hint copy (Settings → Developer step) stays, tightened.

**Broker addition:** a new broker method `verify-account` performs
authorization plus the cheapest authenticated read (vault list) and returns
only ok / error-kind. This is an addition, not a rename — the frozen methods
`find-logins`, `reveal-credential`, `probe-package` are untouched. The result
crossing `pages:*` IPC is ok/kind only; no vault metadata reaches the
settings renderer.

**Persistence:** nothing new is stored or synced. No settings-schema change.
Verification is a live action, not a remembered state.

### 5. Ambient pill hint

When the feature is enabled and configured (`onePasswordEnabled`, non-empty
account, macOS):

- **Probe:** a tiny isolated-world, structure-only script checks for an
  authoritative login signal: a visible `input[type=password]` with an
  uncontradicted `autocomplete="current-password"` token. No heuristic
  wordlists ambiently — heuristics remain exclusive to the explicit flow. The
  script reads structure only, never values, and returns a boolean. One
  delayed recheck (~2.5 s) catches client-rendered forms; a miss after that
  is an accepted, documented limitation.
- **Triggers** (active tab only): main-frame `did-finish-load`; main-frame
  `did-navigate-in-page` (SPA route changes — `did-finish-load` alone does
  not fire for these); tab activation when the current navigation epoch is
  unprobed; and configuration becoming eligible (the feature toggled on or an
  account set) — which probes the active tab immediately.
- **Epoch binding:** every scheduled probe and its delayed recheck timer
  capture the tab's WebContents identity and navigation epoch (the
  `wakeGeneration`-style pattern) at schedule time, and **revalidate before
  applying the result**: the tab must still exist, be the same live
  WebContents (`liveContents`), be on the same epoch, still be active, and
  the feature still eligible. A result failing any check is discarded.
- **Clearing:** navigation start, tab quieting, tab closure, disabling the
  feature, and changing the account each cancel any pending probe/recheck
  timer for the affected tab(s) and clear its `fillHint` (disable/account
  change clear every tab's hint).
- **Scope guards:** http(s) pages only; never utility pages; quiet tabs are
  never woken or probed; private tabs do get the hint (nothing recorded).
  The hint state (`tab.fillHint`) is projected through `tabs:updated` like
  other tab display state and is never persisted or synced.
- **Affordance:** a small key glyph in the resting pill's trailing action
  cluster, shown only while the active tab's hint is set. Click invokes the
  normal explicit fill; tooltip "Fill login from 1Password (⌥⌘P)". No other
  surface changes.
- **Failure posture:** every ambient-path error is swallowed silently. The
  ambient probe can never produce a user-visible dialog, capsule, or log line
  containing page data.
- **Posture-change documentation (required, same release):**
  - `settings.html` hint copy currently reads "Blanc does not store your login
    data or read it while you browse" — it must change to state that, when the
    feature is on, Blanc checks pages for a login form so the island can offer
    Fill, never reads what you type, and never contacts 1Password until asked.
  - `docs/1password-integration.md` security-boundary section gains the
    ambient probe's exact contract.
  - A `docs/marketing-claims.md` pass before any public copy mentions the
    hint.

### 6. Copy pass

All capsule copy rewritten in Blanc's plain voice: short title, one actionable
line. The two identical "helper stopped" variants collapse into one kind. The
copy table lives in `fill-status.js`; a unit test parses that file, fails
loudly if the table cannot be found (never asserts absence as success), and
fails if any controller-emitted kind lacks copy.

### 7. Non-goals

- No renderer surface ever displays usernames, item titles, vault names, or
  credentials. The native picker is not being replaced.
- No automatic filling; invocation stays explicit (the hint glyph is an
  invitation, not an action).
- No save-login, TOTP, signup, or iframe support.
- No Windows/Linux enablement — all new code sits behind the same platform
  capability gate; the native smoke tests still prove the broker is
  unavailable there.
- No new synced settings; `onePasswordEnabled` / `onePasswordAccount` stay
  device-local with frozen names. `/1password` and its copy-substrate entry
  are unchanged.
- No changes to the broker's credential path (`find-logins`,
  `reveal-credential` are untouched).

## Testing

- **Unit:** capsule kind-table completeness (parse-with-fail-loud, per the
  source-lifted-test rule); the transport contract — requestId echo with
  stale-reply drop, per-kind verb validation, pre-load replay queueing, and
  destroy/crash resolving a pending decision as Cancel and releasing
  `activeFlow`; `pickerAnchorPoint` with nonzero view origins (vertical
  tabs, Glance primary rect) and non-100% zoom factors, plus clamping;
  `buildHintProbeScript` output policy (structure-only assertions, world id,
  no value reads); probe scheduling — epoch/WebContents revalidation
  discarding stale results, and timer cancellation on navigation, quieting,
  closure, disable, and account change; Verify token staleness and
  account-edit invalidation plus the persist-first ordering (probe input is
  the normalized saved value, "Connected" requires token + field + stored
  account to match); controller flows through the `notify`/`confirm` seams
  including every cancel-equivalent dismissal; **whole-flow invalidation** —
  the surface generation incrementing on each transition and
  `isTargetCurrent` failing on a generation mismatch at any checkpoint,
  specifically covering ⌘L opened **and closed again** within a single
  broker await, permission-prompt arrival mid-broker, and the
  post-`prepareTarget` capture point not self-invalidating a palette-started
  fill — plus the reason-aware focus outcome; capsule readiness failures —
  `loadURL` rejection, `did-fail-load`, and deadline expiry on **both sides
  of the first-visible-presentation boundary**: before it, the native dialog
  substitutes and answers the same pending decision; after it, the decision
  resolves Cancel and releases `activeFlow`;
  pre-popup geometry refresh — the anchor recomputed from a freshly read
  rect and falling back to the island pill when revalidation fails;
  `fillHint` projection and clearing; fallback-to-dialog when the capsule
  view is unavailable.
- **Acceptance (desktop harness):** hint glyph appears/disappears with a
  fixture login page (the probe needs no broker, so it runs offline under
  `BLANC_TEST=1`); capsule renders for a forced kind via the test hook;
  decision capsule cancels on tab switch; decision capsule opens with
  initial focus on Cancel and is fully keyboard-operable (Tab cycle,
  Enter/Space on focused button only, Escape cancels); roles and live
  regions are present (`role="dialog"`, `role="alert"`/`role="status"`);
  an error notice persists until explicitly dismissed.
- **Security review round** before merge, focused on: the ambient probe script
  (new code running on ordinary pages), the capsule IPC surface (fixed-kind
  enum, sender validation), the `verify-account` broker addition, and the
  live pre-popup geometry call.
- **Live macOS gate:** re-run the full real-account checklist in
  `docs/1password-integration.md`, extended with: anchored picker position on
  a real form, including after scrolling the page during the DesktopAuth
  wait; summoning ⌘L or a utility sheet during the broker wait aborts the
  flow with nothing filled; each capsule shape; Verify success,
  wrong-account failure, and DesktopAuth cancel; ambient hint on a real
  login page, an SPA, and a non-login page; permission-prompt precedence
  over a pending capsule.
- **Verification workflow:** chrome documents load once — relaunch `npm start`
  after chrome edits; verify Playwright-first; packaged behavior confirmed in
  a `dist:dir` build before release.

## Release

One combined release, after the security review and live gate close. Normal
owner go-ahead required; this design does not authorize tagging or
publishing. Windows/Linux artifacts keep their existing gates plus the
1Password-unavailable assertion.
