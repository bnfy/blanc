# Automatic recovery when uBlock Origin fails mid-session

**Date:** 2026-10-06
**Status:** approved 2026-10-06 (revision 3, after two reviews) — implemented in
https://github.com/bnfy/blanc/pull/596
**Amends:** the runtime-failure behavior in
`docs/ublock-origin-implementation-2026-10-02.md` ("timeout/background loss
cancels affected requests and marks failure") and the matching sentence in
`CLAUDE.md`/`AGENTS.md` ("Runtime crashes or decision timeouts of an available
uBO retain fail-closed recovery"). It keeps fail-closed behavior; it adds
automatic retry in front of the existing manual recovery.

## Why

When an available uBO provider fails after it has started, the profile stops
loading pages and stays stopped until the user finds Settings → Retry:

- `fail()` (`src/main/ublock-provider.js:99`) marks the provider `failed`,
  rejects every pending decision, suspends open uBO tools to a "needs retry"
  page (`:113–122`) and unloads the background.
- From then on `decide()` cancels every normal-profile request other than
  Blanc's own pages (`if (phase !== 'ready') return { cancel: true }`, `:547`). Cancelled page
  loads become Blanc's error page, `blanc://error/?url=…&code=-20`
  (`src/main/tab-view.js:444–466`).
- Nothing retries on its own. `blocking-providers.js` keeps the failed provider
  attached on purpose ("Runtime failures of an available uBO never change this
  selection: its provider remains fail closed"), and the only way out is the
  Settings card (`src/renderer/pages/settings.js:90–115`): Retry, use Blanc
  Blocker after a restart, or continue unfiltered.

A single slow decision is enough to get there. A critical request decision has
2 s (10 s for the first 15 s after uBO becomes ready). The 2026-10-06
investigation found that decisions on hosted Intel Macs took up to 1.6 s
while uBO's popup or dashboard was opening, and that a main-process stall
of 2 s or more trips the deadline even when uBO answers in about 1 ms (a
diagnostic busy-wait of 2.5 s after a decision was sent failed the provider
2/2 times; 1.5 s did not, 2/2). Real `ubo-decision-timeout` failures appeared
in five `desktop (macos-15-intel)` CI runs between 2026-10-04 and 2026-10-06:
three at the shield suite's "original uBO popup Escape" step and two at the uBO
suite's first named-profile navigation. Two stall sources were removed
(#592 Dock icon reload, #593 a test-only synchronous install); others remain,
including synchronous JSON-store saves (`src/main/store.js:125`, 0.9–1.4 s on
Windows runners).

Manual retry works: six forced `ubo-decision-timeout` failures on this
Apple Silicon development Mac each recovered with Settings' Retry in 1.5–2.1 s (also under
background-QoS throttling). The user just has no way to know that.

## Decisions

Taken with the owner on 2026-10-06:

1. **Retry uBO automatically; never substitute Blanc Blocker.** This keeps the
   recorded policies "No provider is silently substituted"
   (`docs/ublock-origin-implementation-2026-10-02.md`) and "This fallback is
   never inferred from a request timeout … background failure"
   (`docs/ublock-origin-shipping-2026-10-03.md`).
2. **Hold, then reload.** While uBO restarts, new requests in that profile wait
   (still blocked from the network) and then go to the restarted uBO. Pages
   whose load the failure cancelled reload once uBO is ready — plain GET page
   loads only, never form (POST) submissions.
3. **Quiet; the shield shows it.** No popup. The shield and Settings say uBO is
   restarting while it happens; the event is recorded in the local blocking
   diagnostics.
4. **Three automatic restarts per profile per 10 minutes.** A fourth eligible
   failure in that window stops retrying and shows today's manual recovery.
5. **Recovery lives inside the uBO provider**, with its policy in a new pure
   module, so automatic and manual recovery share one `retry()`.

Added after the first review of this draft (2026-10-06), each checked against
the code:

6. **Disposal cancels a running restart.** `initializeInner()` never checks
   `disposed` after its awaits, and `fail()` returns at once when disposed, so
   `readyPromise` can stay unsettled forever (even the 45 s startup timer goes
   through `fail()`). This already affects startup and manual Retry; automatic
   recovery would reach it without any user action. The fix is part of this
   work (section 2, "Cancellation").
7. **Reloads are bound to the exact failed navigation and its error page**, not
   to WebContents + URL + code, so a later navigation (including a failed POST
   to the same URL) can never be mistaken for the outage's GET (section 3).
8. **Held requests drain with bounded concurrency.** `ask()` rejects once 256
   decisions are pending (`ublock-provider.js:131`), so releasing 512 held
   requests together would cancel 256 of them (section 2, "Holding and
   draining").
9. **One deadline bounds the whole recovery episode:** 30 s from the failure,
   including retry delays. Each attempt can otherwise run up to the 45 s
   startup deadline, leaving Settings' recovery hidden for minutes.
10. **The shield shows a distinct Restarting state**, neither protected nor off:
    "uBlock Origin is restarting. New requests are paused."
11. **Delays `0 s, 2 s, 10 s`** within the episode deadline and the rolling
    budget, and `ubo-decision-failed` / `ubo-css-failed` stay manual-only.

Added after the second review (2026-10-06):

12. **Cancellation races every asynchronous step** against a cancellation
    promise that disposal and the episode deadline reject. A check after an
    `await` alone never runs if that step never settles.
13. **The drain stays active until its released decisions have settled**, not
    just until the queue is empty.
14. **Recovery ends at network readiness.** Restoring uBO tool pages happens
    afterwards and can't delay the drain or the deadline.

## Scope

In scope: failures of an available uBO provider **after it has reached ready at
least once in this launch**, in normal (non-private) profiles.

Not in scope, unchanged:

- Startup failures (before first ready). The startup controller, start-page
  recovery and `ubo-startup-timeout` keep their current behavior.
- Private tabs, which always use Blanc Blocker, and any Blanc Blocker failure.
- The decision deadlines themselves (2 s, 10 s warm-up, 15 s warm-up window,
  45 s startup). Measuring the deadline so main-process stalls don't count is
  a separate follow-up, as is making `JsonStore` saves asynchronous.
- MV2 retirement and unavailable-build fallback.

## Design

### 1. Policy module: `src/main/ublock-recovery.js` (new, pure)

No `require('electron')`, so it is unit-tested directly, like
`src/main/tab-sleep.js`.

- `RECOVERABLE` — the set of failure codes that may be retried automatically
  (table below). Every other code goes straight to manual recovery.
- `createRecoveryBudget({ limit = 3, windowMs = 600000, delaysMs = [0, 2000, 10000], now })`
  returns `{ take() }`. `take()` returns `{ allowed: true, attempt, delayMs }`
  while fewer than `limit` attempts started inside the rolling window, else
  `{ allowed: false }`. `delayMs` is indexed by the attempt's position in the
  window. Attempts age out of the window; nothing is persisted.
- `RECOVERY_DEADLINE_MS = 30000` — the longest one recovery episode may last,
  from the failure that started it, delays included. Also the longest any one
  request may wait in the hold queue.
- `HOLD_CAPACITY = 512` — the most requests that may wait at once.
- `DRAIN_RESERVE = 32` — decision slots the drain leaves free for other
  operations (site queries, CSS, observation events).
- `outageReloadTarget(currentUrl, token)` — returns the URL to reload only when
  `currentUrl` is Blanc's error page (`blanc://error/`) with code `-20` and
  `outage=<token>`; otherwise `null`.

Failure codes (all raised in `src/main/ublock-provider.js`):

| Recovered automatically | Why |
| --- | --- |
| `ubo-decision-timeout` | Slow or stalled answer; restart clears it. |
| `ubo-background-crashed`, `ubo-background-lost`, `ubo-background-disconnected`, `ubo-background-unavailable` | The background renderer or its bridge went away. |
| `ubo-bridge-crashed`, `ubo-css-crashed`, `ubo-css-timeout` | A helper renderer crashed or stalled. |
| `ubo-startup-timeout`, `ubo-initialization-failed` | Only when raised *during an automatic attempt*: the attempt failed and counts against the budget. |

| Manual recovery only | Why |
| --- | --- |
| `ubo-background-unsandboxed`, `ubo-background-node` | Security posture violated; never restart silently. |
| `ubo-response-invalid`, `ubo-redirect-invalid`, `ubo-css-target-invalid` | uBO returned something the host refuses; likely deterministic. |
| `ubo-css-capacity`, `ubo-host-capacity` | Resource bounds hit; a restart would reach them again. |
| `ubo-storage-failed`, `ubo-decision-failed`, `ubo-css-failed` | uBO's own code or storage failed; likely deterministic for the same input. |

### 2. Provider changes (`src/main/ublock-provider.js`)

**State.** A private `recovering` flag plus a `recoveryReady` promise, separate
from `phase`. While `recovering` is true, `status().phase` reports
`'recovering'` instead of `'failed'`/`'initializing'`. Internally `retry()`
still moves through `initializing` → `ready` exactly as the manual path does.
`everReady` is set at the first `state('ready')` (`:391`). Because status reads
`'recovering'`, `blocking-providers.js` `retry()` and `attach()` (which act only
on `'failed'`) never start a second, overlapping retry.

**On failure.** `fail(code)` keeps everything it does today: reject pending
decisions (the in-flight request is cancelled, as recorded), suspend tools,
schedule background cleanup. Then:

- If `everReady`, `RECOVERABLE.has(code)` and `budget.take().allowed`: set
  `recovering`, create `recoveryReady`, start the episode's
  `RECOVERY_DEADLINE_MS` timer, and after cleanup has run and the budget's
  `delayMs` has elapsed, call `retry()`.
- If already `recovering` (the failure happened inside an automatic attempt),
  `fail()` does not start a second episode. The attempt's rejection goes to
  the recovery loop, which starts another attempt only if the attempt's error
  code is in `RECOVERABLE`, `budget.take()` allows it, and the attempt's delay
  still ends before the episode deadline.
- Otherwise: today's behavior, `phase: 'failed'` and manual recovery.

Suspended tools show "uBlock Origin is restarting" instead of "needs retry"
while recovering. `retry()` already restores them after it succeeds (`:633–640`).

**Cancellation.** A `generation` counter, incremented by `dispose()` and when
an episode gives up, cancels any initialization in flight:

- Each run gets a cancellation promise. Every asynchronous boundary in
  `initializeInner()` (CSS host install and load, package install, extension
  load, background ready, bridge `loadURL()`, ready) is raced against it, so a
  step that never settles cannot keep the run alive. `dispose()` and the
  episode deadline actively reject that promise.
- After every boundary the run also checks its generation, so a step that
  wins the race just as cancellation happens still stops there.
- A stopped run closes and unloads whatever it created (CSS helper and
  extension, uBO extension, bridge view, background reference) and rejects its
  own `readyPromise`. An operation that finishes after cancellation (an
  extension load or view that resolves late) is cleaned up when it settles.
  `dispose()` also rejects `readyPromise` directly, since `fail()` returns early
  once disposed.
- Every waiter settles: `initialize()` and `retry()` callers, the hold queue,
  `recoveryReady`, and the episode and retry timers, which are cleared.

This also fixes the existing case of a profile being deleted or the app
quitting during startup or a manual Retry.

**Holding and draining.** At the point where `decide()` cancels a non-ready
provider (`:547`), a recovering provider instead puts the request in a FIFO
hold queue:

- At most `HOLD_CAPACITY` entries. A request that finds the queue full is
  cancelled.
- Each entry waits at most `RECOVERY_DEADLINE_MS` from when it joined, and is
  cancelled when the episode gives up or the provider is disposed.
- When uBO is ready, entries are released from the front while
  `pending.size < MAX_PENDING - DRAIN_RESERVE`; each released entry goes
  through the normal `ask()` path and deadline (the post-ready 10 s warm-up
  applies again). As each decision settles, the next entry is released.
- The drain stays active until the queue is empty **and** every decision it
  released has settled. Throughout that time, new critical requests join the
  queue's back instead of calling `ask()` directly, so they neither jump the
  queue nor, in a burst just after the last entry is released, use up the
  slots still held by drained decisions and hit `ask()`'s capacity rejection.
- No timer is needed per slot: every occupied slot has its own decision
  deadline, and a missed one calls `fail()`, which starts a new episode or
  manual recovery.

Requests are never sent unfiltered. The existing early returns are untouched:
Blanc's own pages, uBO's own fetches, and everything when blocking is switched
off (`:526–546`).

**Episode deadline.** If uBO is not ready `RECOVERY_DEADLINE_MS` after the
failure that started the episode, the provider cancels the attempt in flight
(see Cancellation), cancels the hold queue, clears `recovering` and goes to
`phase: 'failed'` with the episode's starting error code. Settings then shows
today's recovery card.

**After ready.** Recovery ends when uBO reaches ready (network filtering is
working), not when `retry()` returns. At that point the provider resolves
`recoveryReady`, clears `recovering` and the episode timer, starts the drain,
and marks every claimed outage token recovered (section 3). Only then are
suspended uBO tool pages restored, as best-effort work guarded by the
generation. Today `retry()` awaits every tool's `loadURL()` after `initialize()`
(`:633–640`); that wait moves after recovery ends, so a slow dashboard or
logger can hold neither the drain nor the 30 s deadline. A tool restore that
never resolves is abandoned when the provider is disposed or fails again.

**When attempts run out.** If an attempt fails and the budget, the code table
or the episode deadline refuses another, the provider ends the episode as
above. Claimed outage tokens are kept, so a later manual Retry can still reload
those pages.

### 3. Reloading pages the outage cancelled

Electron gives no identifier that links a `webRequest` request to the later
`did-fail-load` (`node_modules/electron/electron.d.ts`: neither
`OnBeforeRequestListenerDetails` nor `did-start-navigation` carries one), so
Blanc binds them itself.

1. **Track the current navigation.** At the top of `decide()`, for an http(s)
   main-frame request, the provider records
   `latestMainFrame.set(webContentsId, details.id)`. A new main-frame
   navigation in that tab gets a new `id`. The design assumes the `id` stays
   the same across redirects (as Chromium's extension `webRequest` API
   documents for `requestId`); the implementation verifies that in Electron
   with the uBO suite's existing `/redirect-start` fixture before relying on it.
2. **Record outage cancellations.** When the outage cancels an http(s)
   main-frame request with `details.method === 'GET'` (rejected at failure
   time or cancelled from the hold queue), the provider stores
   `{ webContentsId, url, requestId, at }`. The pending decision keeps those
   fields for this purpose. Requests uBO itself blocked are never recorded.
3. **Claim at the failure.** In `tab-view.js`'s `did-fail-load` handler
   (`:444–466`), for a main-frame `-20` failure, Blanc calls the profile
   provider's `claimOutage(webContentsId, validatedURL)`. It returns a token
   only if a record exists for that tab with that URL, its `requestId` is still
   `latestMainFrame` for the tab, and it is under 10 s old. The record is
   consumed either way. The token is 128 random bits; the error page URL gets
   `&outage=<token>` (`error.js` reads only `url`, `code` and `desc`).
   A later POST, or any other later navigation, has a different request `id`,
   so it can never claim an older GET's record.
4. **Reload when both halves are true.** The token is reloadable once both
   happen, in either order:
   - the error document carrying it has committed (main's `did-navigate`
     handler for a `blanc://error/` URL with `outage=` tells the provider), and
   - uBO is ready again.

   Then `hooks.reloadAfterOutage({ webContentsId, token, url })` runs.
5. **Revalidate immediately before loading.** Main reloads only if the tab is
   live and owns that `WebContents` (`liveContents(tab) === wc`), is not quiet,
   held for Reopen Closed Tab, or private, and
   `outageReloadTarget(wc.getURL(), token)` still returns the URL. It uses the
   existing `queueTabNavigation(wc, { isCurrent, run })` seam, whose
   `isCurrent` repeats the same check when the navigation actually runs, and
   `run` is `contents.loadURL(url)`.
6. **Expiry.** Unclaimed records are dropped after 10 s, or when a newer
   main-frame request starts in that tab. A token is dropped when its tab
   leaves that error page, when it is reloaded, or when the provider is
   disposed. At most 32 tokens are kept per profile.

Tokens and records stay in main-process memory. They are not sent over IPC,
persisted, synced or written to diagnostics. A token that survives in a restored
session's error URL means nothing after the process ends.

### 4. What users see

| Where | During automatic recovery | After it gives up |
| --- | --- | --- |
| Pages in that profile | Load slowly instead of failing; pages the outage cancelled reload by themselves once uBO is back | As today: blocked error page |
| Shield chip | New `restarting` mode, distinct from protected and off. Title: "uBlock Origin is restarting. New requests are paused." No count | As today |
| Shield popover (`ublock` variant) | "uBlock Origin is restarting. New requests are paused." | As today: "Blocking needs attention…" |
| Change-blocker detail | "uBlock Origin is restarting. New requests are paused." | As today |
| Settings → Blocking | Status "uBlock Origin is restarting. New requests are paused."; recovery buttons hidden | As today: Retry / Use Blanc Blocker / Continue unfiltered |
| uBO popup/dashboard/logger tabs | "uBlock Origin is restarting", restored automatically | "needs retry", restored by manual Retry |

Code touched: `shield-model.js` (`shieldChipState`, `shieldPopoverModel`,
`shieldProviderModel`), `settings.js` `renderBlocking`, and the strip renderer
and styles for the new chip mode (`src/renderer/renderer.js:705–711`,
`styles.css`). The chip's `mode` is a pinned union in
`browser-api/contract.json:143` (`'hidden' | 'off' | 'count' | 'quiet'`), so it
gains `'restarting'` and `npm run browser-api:build` regenerates the vectors.
The status bridge types `phase` as `unknown` (`browser-api/bridges.json`), so
`'recovering'` needs no contract change there. The chip's restarting visual
gets a before/after capture for approval before it ships.

### 5. Diagnostics

The provider's existing diagnostics entries (provider, version, error code,
stage, timings) gain `recovery: 'restarting' | 'recovered' | 'exhausted'`,
`attempt`, and for `exhausted` a `reason: 'budget' | 'deadline' | 'ineligible'`.
They still contain no URLs, matching "Diagnostics contain provider/version/error
codes only".

## Invariants (must stay true)

1. No normal-profile request reaches the network without a decision from a
   ready uBO, during recovery or after it.
2. No provider substitution: recovery never activates Blanc Blocker for a
   normal profile.
3. No POST replay; only main-frame GET loads cancelled by the outage reload,
   only by the exact request the outage cancelled, and only while its tab still
   shows the error page created for that failure.
4. At most three automatic restarts per profile in any 10-minute window.
5. Startup failures, private tabs and security-posture failures behave as
   today.
6. A recovery episode ends within 30 s of the failure that started it, and no
   request waits in the hold queue longer than that.
7. Every waiter settles, and nothing an initialization creates outlives the
   provider's disposal or a cancelled episode.
8. Draining never pushes `ask()` past its capacity, including while drained
   decisions are still pending.
9. Recovery ends at network readiness; restoring uBO tool pages never delays
   it.

## Testing

**Unit (new):**

- `test/unit/ublock-recovery.test.js` — eligibility table; budget (three
  attempts allowed, fourth refused, window ageing, delays by attempt);
  `outageReloadTarget` for the matching token, another token, no token, a
  non-error URL and a non-`-20` code.
- `test/unit/ublock-provider-recovery.test.js`, with the fake-Electron harness
  from `ublock-provider-startup.test.js`:
  - a timeout after ready → `recovering` → retry → `ready`, with a held
    decision answered by the restarted uBO;
  - a timeout before first ready → `failed` (no recovery);
  - an ineligible code → `failed`, and an ineligible code raised inside an
    automatic attempt ends the episode;
  - a fourth failure in the budget window → `failed`, held requests cancelled;
  - an attempt still initializing at the 30 s episode deadline → that attempt is
    cancelled, `failed`, held requests cancelled;
  - hold capacity and the per-request 30 s hold limit → cancel;
  - **drain:** 512 held requests released with zero `ubo-request-capacity`
    rejections, never more than `MAX_PENDING - DRAIN_RESERVE` decisions in
    flight, and FIFO order kept with new requests arriving mid-drain;
  - **cancellation:** for each asynchronous step in `initializeInner()`, a
    fake that **never settles**, then `dispose()` (and separately the episode
    deadline) → `initialize()`/`retry()` settle promptly, no view or extension
    is created after cancellation, anything created before it is closed or
    unloaded, and a step that resolves late is cleaned up. This also reproduces
    the existing unsettled-promise defect, so it must fail before the fix;
  - **drain tail:** a burst of new requests arriving after the original queue
    has emptied but before the drained decisions settle → they join the queue,
    with zero `ubo-request-capacity` rejections;
  - **tool restore:** a uBO tool page whose `loadURL()` never resolves → recovery
    still ends at uBO ready, held requests drain and the episode timer is
    cleared;
  - **reload binding:** an outage-cancelled main-frame GET can be claimed by its
    own failure; a later POST or GET to the same URL in that tab cannot claim
    it; a record older than 10 s cannot be claimed; a POST or subresource is
    never recorded; the token becomes reloadable when commit and recovery both
    happen, in either order.

**Unit (updated):** `shield-model.test.js` (the `restarting` chip mode and
copy), `blocking-settings-recovery.test.js` (the `'recovering'` phase hides the
recovery buttons) and `blocking-providers.test.js` (no second retry while
recovering). `ublock-operation-deadline.test.js` should pass unchanged: a
missed decision still calls `fail()`. `npm run browser-api:check` covers the
new chip mode.

**Desktop:** in `test/desktop/ublock-origin.mjs`, the "decision deadline" stage
(`:855–869`) currently asserts `phase === 'failed'` and then calls
`blockingRetry`. It changes to assert that:

- the hung request never reaches the fixture server;
- the provider reports `recovering` and then `ready` **without** `blockingRetry`;
- the `/deadline-gated` tab reloads and the server receives it once after
  recovery;
- a form POST that the outage cancelled is not resubmitted (the existing
  `/post-form` fixture).

A test-only hook (`BLANC_TEST=1` only) exhausts the budget, so the same stage
still covers the manual Retry path. Chip, popover and Settings copy get the
usual before/after captures.

**CI evidence before merge:** the full uBO workflow on all four desktop jobs,
plus recorded automatic-recovery durations from `desktop (macos-15-intel)`,
confirming that recovery finishes well inside the 30 s episode deadline on the
slowest supported runner.

## Docs to update with the implementation

- `CLAUDE.md` and `AGENTS.md` (mirrored verbatim): replace "Runtime crashes or
  decision timeouts of an available uBO retain fail-closed recovery" with the
  new behavior: automatic restart (at most three times per profile per
  10 minutes, each episode bounded to 30 s, holding requests meanwhile), then
  manual recovery; still fail closed, never substituted.
- `docs/ublock-origin-shipping-2026-10-03.md`: a dated section recording this
  change, leaving the original records intact.
- `spec/` has no uBO feature or divergence entry, so no parity change is
  needed.

## Open points for review

1. **Intel recovery time.** A restart took 1.5–2.1 s on this Apple Silicon Mac.
   In run 37427599106 the last launch's startup stages added up to about 16 s
   on a hosted Intel runner; a restart is expected to be shorter but hasn't been
   measured there. If CI shows Intel restarts close to 30 s, the episode
   deadline needs another look before merge.
2. **The chip's restarting visual.** Behavior and copy are settled (decision
   10). The look is proposed with captures during implementation and approved
   before it ships.
