# Window-runtime foundation (1.1 M1) — design

**Date:** 2026-08-08
**Status:** Approved, ready for planning
**Roadmap:** `2026-08-08-blanc-1-1-roadmap.md` (M1 of M1→M2→M3)
**Reference:** `codex/post-1.0-development` — consulted, never merged or cherry-picked

## Decision

All per-window state in `src/main/main.js` moves behind a window-runtime
boundary, with **exactly one runtime**. No user-visible change of any kind.
The milestone ships in a normal patch release, so the riskiest part of 1.1 —
the state refactor — gets real-world soak on a small diff before M2 puts a
second window on top of it.

**Success is defined negatively:** the entire existing suite — 365 unit tests,
64 acceptance scenarios / 425 steps — passes **unchanged**. A new acceptance
scenario would mean M1 changed behavior, which is failure. The only new tests
are pure unit suites for the two new modules and the rollback-mirror fixture.

## Why this shape (Approach A)

The reference implementation proved the trio of mechanisms with two real
windows (verified live during the audit): a pure runtime registry,
`AsyncLocalStorage` carrying the owning runtime through late callbacks, and
sender-derived chrome IPC routing. M1 adopts all three with n=1 — where a
misroute is impossible by construction — instead of:

- **explicit `runtime` parameter threading**, which is a signature change
  across a ~3,500-line main.js (the most conflict-prone diff possible for a
  patch that must read as behavior-invisible), and which handles worst exactly
  what ALS handles best — Electron callbacks that outlive their call stack
  (the focus-reassert dance, navigation settling, coalesced broadcasts);
- **a singleton object now, ALS later**, which would make M2 sweep the same
  lines a second time and would give the late-callback mechanism zero soak
  before it matters.

## State inventory

Three categories, decided per variable — this table is the contract for the
implementation plan.

### Moves into the runtime record

Current module globals in `main.js`:

| State | Notes |
|---|---|
| `win` | The `BrowserWindow`. Accessed as `runtime.window`; the bare `win` binding is deleted at the end of M1 so no call site can silently keep a stale global. |
| `tabOrder`, `activeTabId`, `groups` | The tab workspace. |
| `overlayView`, `overlayMode`, `overlayPrefill` | Island overlay state. |
| `shieldAnchorRight`, `shieldPopoverHost`, `shieldTrigger` | Post-fork shield-popover state (#76/#85) the reference never saw. Runtime-owned from day one so M2 never edits the shield paths. |
| `utilitySheetView`, `utilitySheetUrl` | Utility sheet. |
| `tabsWantingAddressBarFocus` | Address-bar focus reclaim set. |
| `chromeHeight` | Strip geometry. |
| Suppression/interaction flags tied to the window (address-menu popup state, blur-dismissal suppression) | Enumerated precisely during planning; anything consulted by an overlay/window event handler is per-window by definition. |

**1Password fill:** its window references — the `win.isFocused()` revalidation
and `dialog.showMessageBox(win, …)` parenting — become reads of the runtime
that owned the originating tab. The audit flagged these as *semantically wrong*
under multi-window; fixing the referent now means M2 never touches a
security-sensitive flow. With n=1 the behavior is identical.

### Stays per-tab (process-wide `tabs` Map)

The `tabs` Map remains global, keyed by tab id; each tab record gains a
`runtimeId`, and the registry maintains the ownership index. Tab identity
outlives window membership — M2's move-tab-to-window affordances depend on
that — and the audit judged this split sound in the reference.

### Stays app-global

Settings, all `JsonStore`s, the adblock engine, telemetry, sync/tabsync,
supporter, WebAuthn registration, protocol/scheme handlers, the app menu
(menu-per-focus is M2's problem).

## Components

### `src/main/window-runtime-registry.js` — new, pure

No Electron imports; plain data plus functions:

- `createRuntime(fields)` → a runtime record with the inventory above, all
  initialized to the same defaults main.js uses today.
- `attachTab(runtime, tabId)` / `detachTab(tabId)` / `runtimeForTab(tabId)` —
  the ownership index.
- `runtimeForChromeWebContentsId(id)` — resolves the runtime owning a chrome
  (strip or overlay) `webContents`, for IPC routing.
- Registry enumeration for M2 (`all()`), trivially [runtime] in M1.

The reference's registry unit tests port with renames only.

### ALS binding in `main.js`

- `windowRuntimeContext = new AsyncLocalStorage()`.
- `bindWindowRuntime(runtime, fn)` wraps every native event registration —
  each tab `webContents` listener, overlay `webContents` listeners, window
  listeners (`focus`, `blur`, `resize`, `closed`), and the `before-input-event`
  Escape path — so `setTimeout`/`setImmediate` follow-ups inherit the owning
  runtime.
- `currentRuntime()` resolves ALS context first.

**Fallback contract:** outside any context, `currentRuntime()` returns the
single runtime in production — and **throws under `BLANC_TEST`**. Every
unbound callback therefore fails loudly in the acceptance suite during M1's
soak instead of surfacing as misrouted state in M2. This is the cheapest
insurance the refactor can buy, and it is the reason M1's suite-green gate is
meaningful evidence rather than a formality.

### IPC routing

`chromeOn`/`chromeHandle` resolve the runtime from `event.sender` via the
registry before running the handler inside `bindWindowRuntime`. A sender that
resolves to no runtime is ignored with a dev-only log — never a throw in
production, never a fallback to "whatever window is focused".

### `src/main/session-workspace.js` — new, pure

Versioned workspace persistence for `session.json`:

- **v1 shape:** `{ version: 1, windows: [{ urls, activeIndex, groups,
  groupIds, pinned }] }` — one entry in M1.
- **v0 mirror (rollback contract):** the v1 file *also* writes today's flat
  top-level fields — `urls`, `activeIndex`, `groups`, `groupIds`, `pinned` —
  mirroring the focused window. A rolled-back 1.0.9 reads its familiar shape
  and restores the focused window's tabs. The mirror is a transition measure,
  dropped in 1.2 once 1.1 is the update floor; the spec for whichever release
  drops it must say so in its notes.
- **Loading:** a `version`-less file (v0, what every install has today) loads
  as one window; v1 loads `windows[0]` in M1. Unknown future versions load as
  v0-from-mirror if the mirror parses, else empty — never a crash.
- Private tabs stay out of both shapes, exactly as today.

Pure functions over plain objects; fixture-tested, including a fixture
asserting the mirror is **shape-identical to what 1.0.9 writes** (locked
against the current serializer's output, so the rollback promise is a test,
not an assumption).

## Data flow

`broadcastTabs()` reads the current runtime's workspace; `serializeTabs()` is
unchanged in shape and keeps the single `connection` derivation from #85. The
chrome renderers see byte-identical payloads — there is no renderer diff in
M1 at all.

## Error handling

Two failure classes, both defined above where they arise: unresolvable IPC
senders (ignore + dev log) and missing ALS context (single-runtime fallback in
production, throw under `BLANC_TEST`). There are no new user-facing error
states — that is the point of the milestone.

## Testing

- **Unit:** the ported registry suite; the session-workspace suite (v0 load,
  v1 round-trip, mirror correctness, private-tab exclusion, unknown-version
  handling); the 1.0.9-shape fixture test for the mirror.
- **Acceptance:** the existing 64 scenarios, unchanged, green — run live, not
  just dry. Under `BLANC_TEST` the strict-ALS throw is active for the whole
  run, so the suite doubles as an unbound-callback detector.
- **Test hook:** any addition is read-only (e.g. a `windowRuntimes()`
  inspector) and consumed by nothing until M2. Deliberately **no** new
  dependency in the shared `Before` hook — the coupling that made the
  reference's test slice inseparable from its architecture.
- **Packaged smoke:** the existing packaged-first-run and migration smokes
  must pass, since session.json's on-disk shape changes (v1 + mirror) and the
  migration smoke upgrades a real 1.0.x profile.

## Explicitly not in M1

Window creation or any second-window code path, menu changes, profiles,
Glance, closed-tab recovery, new IPC channels, renderer changes of any kind.

## Rollback story (user-facing)

Update to 1.1.x then roll back to 1.0.9: the focused window's tabs, groups,
and pins survive via the mirror; history, favorites, settings were never
touched. Nothing else in M1 writes a new on-disk shape.
