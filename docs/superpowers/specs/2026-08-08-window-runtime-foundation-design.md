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
| `tabsBroadcastTimer` | The coalesced `tabs:updated` debounce. **Per-runtime**, or under M2 one window's pending broadcast would suppress another's. |
| `themeTintRefreshGeneration` | Tint refresh generation counter for the strip. |
| `lastActiveByCluster` | Per-cluster last-active tab memory (⌘1–9 focus behavior). Workspace state, so per-runtime. |
| Permission-prompt state | Ownership is assigned from the **requesting tab's `webContents`** at prompt creation; a response is accepted only when `event.sender` resolves to that same runtime. `flushPermissionPrompts()` (today part of the `'closed'` handler) flushes **only the closing runtime's** prompts — closing one window must not flush another's. |
| `onePasswordFillInFlight` | Per-runtime: the fill flow's focus/dialog referent is the owning window (see 1Password note below). |
| `railActivationSerial` | Vertical-tabs rail activation counter — per-window UI state. |
| Suppression/interaction flags tied to the window (address-menu popup state, blur-dismissal suppression) | Enumerated precisely during planning; anything consulted by an overlay/window event handler is per-window by definition. |

**Deliberately global, decided not deferred:** `recentlyClosedUrls` stays
app-global in M1 — reopen-closed-tab remains one app-wide stack, exactly
today's behavior. Making it per-workspace is the deferred "closed-tab
recovery" roadmap item, and pre-scoping it here would change reopen order,
which M1 must not.

The inventory above is the enumerated contract; the plan may *add* newly
discovered per-window flags during implementation but may not recategorize
anything listed here without a spec amendment.

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
- `registerChromeSurface(runtime, wcId)` / `unregisterChromeSurface(wcId)` —
  explicit per-surface registration. A runtime has TWO chrome surfaces that
  route IPC — the strip and the overlay — and their lifecycles differ: the
  strip lives as long as the window, while the overlay view is created lazily
  and can be destroyed and recreated. Each creation registers; each
  destruction unregisters. `attachWindow(runtime, { window })` binds the
  replacement window only; surfaces register themselves as they come up.
- `detachWindow(runtime)` — the window-close lifecycle (below); unregisters
  every surface the runtime still holds.
- Registry enumeration for M2 (`all()`), trivially [runtime] in M1.

**Detach / reattach lifecycle.** Today's macOS close path destroys the
`BrowserWindow`, overlay, and utility sheet but deliberately retains tabs,
selection, and groups for dock reopen (`main.js` `'closed'` handler +
`did-finish-load` reattach, `:3136-3147`). The runtime maps onto that
contract explicitly:

- On window close, **the primary runtime survives** with `runtime.window =
  null`, its overlay/sheet fields nulled, and — critically — its registered
  chrome surface ids — strip AND overlay — **unregistered**, so a late IPC message from the
  dying chrome resolves to no runtime (ignored) rather than to a runtime
  whose window is gone. The workspace fields (tabOrder, activeTabId, groups)
  stay untouched, exactly as today's globals do.
- On dock-reopen, `attachWindow` binds the replacement `BrowserWindow`; the
  new strip and (lazily) overlay register their surfaces as they are created,
  and the existing `did-finish-load` reattach runs inside the runtime's
  binding.
- The registry's unit suite includes a **detach → reattach fixture**: after
  the cycle, workspace state is intact, the old chrome id resolves to
  nothing, and the new one resolves to the runtime.

The reference's registry unit tests port with renames; the lifecycle fixture
is new (the reference modeled discard-on-close for secondary windows but
never fixture-tested the macOS detach → reattach of the primary).

### ALS binding in `main.js`

- `windowRuntimeContext = new AsyncLocalStorage()`.
- `bindWindowRuntime(runtime, fn)` wraps every native event registration —
  each tab `webContents` listener, overlay `webContents` listeners, window
  listeners (`focus`, `blur`, `resize`, `closed`), and the `before-input-event`
  Escape path — so `setTimeout`/`setImmediate` follow-ups inherit the owning
  runtime.
- `currentRuntime()` resolves ALS context first.

**Fallback contract:** outside any context, `currentRuntime()` returns the
single runtime in production — and **throws under `acceptanceTestMode`**
(`!app.isPackaged && BLANC_TEST === '1'`, `main.js:73`), *not* under the raw
environment variable: the packaged first-run smoke launches a **packaged**
build with `BLANC_TEST: '1'` for its adblock-failure paths
(`packaged-first-run-smoke.mjs:117/:154`), where strict mode must never arm.

**Legitimate root bindings.** Not every entry point arrives via a bound event
listener. The following are sanctioned roots that must establish the binding
themselves (each wraps its work in `bindWindowRuntime(theRuntime, …)`):
startup/session restore, native menu `click` handlers, test-hook invocations
(Playwright calls `globalThis.__blanc` from outside any ALS context), settings
fan-out callbacks, adblock engine callbacks, sync/tabsync timers, and the
permission-prompt flow. The plan enumerates each root individually.

With those roots bound, the strict throw's honest claim is: **every runtime-
dependent unbound path that the suite executes fails loudly** during M1's
soak, instead of surfacing as misrouted state in M2. It is an executed-path
detector, not a static proof — paths the suite never drives are not covered,
which is one more reason M1 ships early and soaks.

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
- **Loading, with rollback → re-upgrade precedence:** a `version`-less file
  (v0, what every install has today) loads as one window. For a v1 file the
  loader must decide **which writer wrote last** — and the legacy writer wins
  on divergence. Mechanism, verified against 1.0.9's actual code:
  `JsonStore.update(fn)` mutates the stored object in place and persists it
  whole, so a rolled-back 1.0.9 rewrites the flat fields while *preserving*
  the unknown `version`/`windows` keys. After
  `1.1 → rollback → tabs changed under 1.0.9 → reinstall 1.1`, the nested
  `windows` entry is stale and the mirror is current. Therefore: if the
  mirror and `windows[focused]` diverge, **rebuild v1 from the mirror** and
  discard the nested entry; if they agree, load `windows[0]`. Divergence is
  compared over the persisted fields (`urls`, `activeIndex`, `groups`,
  `groupIds`, `pinned`), order-sensitive.
- **Unknown future versions are read-only:** a `version` greater than 1 loads
  best-effort from the mirror (else empty) and **suppresses session
  persistence for the whole run**, so a 1.1 build never overwrites a newer
  format it cannot faithfully rewrite. Never a crash.
- Private tabs stay out of both shapes, exactly as today.
- **Persistence guards carry over verbatim, as tested behavior:** no save
  while quitting, while persistence is suspended, or with zero tabs; and
  `activeIndex` is only updated when the active tab is actually in the
  persisted list — a private or url-less active tab keeps the last good
  index (1.0.9's `persistSession` guards, `main.js:1045`/`:1065`).

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
production, throw under `acceptanceTestMode`). There are no new user-facing error
states — that is the point of the milestone.

## Testing

- **Unit:** the ported registry suite; the session-workspace suite (v0 load,
  v1 round-trip, mirror correctness, private-tab exclusion, unknown-version
  handling); the 1.0.9-shape fixture test for the mirror; **two transition
  fixtures** — (a) rollback → re-upgrade: a v1 file whose flat fields were
  rewritten by the legacy writer loads from the mirror, discarding the stale
  nested workspace; (b) newer-version file: loads read-only from its mirror
  and no save is issued for the whole run. Plus a registry detach → reattach
  fixture (below).
- **Acceptance:** the existing 64 scenarios, unchanged, green — run live, not
  just dry. Under `acceptanceTestMode` the strict-ALS throw is active for the
  whole run, so the suite doubles as a detector for every runtime-dependent
  unbound path it executes.
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
