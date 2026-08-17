# Reopen Closed Tab — design

Date: 2026-08-16
Status: approved, not implemented

## 1. Problem

`reopenClosedTab()` (`src/main/main.js`) pops a bare URL string off
`rt().recentlyClosedUrls`, a per-window array capped at 25, and opens a fresh tab
with it at the end of the tab order. Everything else about the tab is gone:

- back/forward stack
- scroll position
- typed-but-unsubmitted form content
- group membership, pin state, mute state
- position in the tab order

`closeGroup()` pushes one entry per tab, so undoing an accidental eight-tab group
close takes eight presses of ⌘⇧T. The only surface is File → Reopen Closed Tab
(⌘⇧T); there is no slash command and nothing in the ⌘L panel.

`closeTab()` calls `wc.close()` with no `waitForBeforeUnload`, so ⌘W already
discards unsaved work with no prompt. Nothing in Blanc currently stands between a
mis-aimed ⌘W and losing what you typed.

**Scope: rescue, not retrieval.** This design targets "I just closed the wrong
tab — give it back exactly." A browsable, searchable, quit-surviving archive of
closed tabs is a different feature and is deliberately out of scope. Nothing here
is persisted to disk; the closed list is session-lifetime and per-window, as
today.

## 2. Behaviour contract

### 2.1 Three tiers, degrading by grain

**Tier 0 — held (live).** A single-tab close parks the tab's `WebContentsView`
instead of destroying it: removed from `contentView`, `setVisible(false)`,
`setAudioMuted(true)`. ⌘⇧T re-attaches *that same view*. No network request, no
re-render, no lost JS state. This restores things no snapshot can carry: a page
reached by POST, a half-typed rich-text editor, a canvas, a video timestamp, a
WebSocket-driven app, a page behind a session that has since expired.

Capacity: **one held view per window**, **30 seconds**.

A Tier 0 entry **always captures its Tier 1 snapshot at park time as well**, so a
held entry is "snapshot plus live view" rather than a separate kind of thing.
Three consequences, all of which simplify the implementation:

- Expiry is just dropping the view; the entry survives as Tier 1 with no work at
  the moment the timer fires.
- If re-attaching the view fails (renderer crashed while held), restore falls
  back to the snapshot instead of failing.
- A **newer single-tab close takes the hold**, downgrading the previous held
  entry to its already-captured snapshot. The most recent close is the one the
  user is most likely to undo, so the live view follows it rather than being
  refused. `MAX_HELD_VIEWS = 1` is maintained by this downgrade, not by refusal.

The one exception is a private tab, which never captures a snapshot (§2.3) and so
is destroyed rather than downgraded.

**Tier 1 — snapshot.** On hold expiry, and for every close that cannot be held.
Stores `trimSnapshot()` entries + active index + slot metadata. ⌘⇧T rebuilds the
tab through `createTab({ restoreHistory, pinned, groupId })`, which already
exists and is already used by `duplicateTab`. Scroll position, back/forward
stack, group, pin, mute, and slot all return; the page re-fetches.

A close falls to Tier 1 when any of these hold:

- it is a group close (see §2.2)
- the tab is capturing mic or camera (§5.1)
- the tab was quiet (`tab.asleep`) — no live renderer exists to hold

Private tabs are **not** in this list: a private close is Tier 0 or nothing, and
never becomes a Tier 1 snapshot (§2.3).

**Tier 2 — URL only.** Fallback when `trimSnapshot()` returns null, i.e. the tab
has no committed navigation history to shape. This is today's behaviour, retained
as the floor so no case regresses.

**Not recorded at all.** Matching today's predicate in `closeTab`: a tab with no
usable `url` string, and any `blanc://newtab` tab. Utility pages never open as
tabs, so they need no separate rule.

### 2.2 Grain: one entry per user action

| Action | Entry produced |
| --- | --- |
| `closeTab(id)` | one tab entry — Tier 0 if eligible, else Tier 1, else Tier 2 |
| `closeGroup(gid)` | one group entry: the group record (`name`, `collapsed`) plus N tab snapshots, each Tier 1 (individually falling to Tier 2 if its own `trimSnapshot()` returns null) |

A group close cannot use Tier 0: holding eight live renderers costs roughly
1.2 GB, which contradicts the product's memory position. The tier degrades by
grain, not arbitrarily — a rule that is explainable in one sentence.

A group close does **not** disturb an existing Tier 0 hold; only a single-tab
close takes the hold.

Capacity stays at **25 entries per window**, of which at most one carries a live
view. The list remains on the window runtime (`rt()`), so ⌘⇧T is predictably
about *this* window; closing a window drops its entries and destroys its held
view.

### 2.3 Private tabs: Tier 0 and nothing else

A closed private tab is held live **only while other private tabs remain open**.
It is never downgraded to a snapshot. The held view and its entry are destroyed
outright on any of:

- the 30 s hold expiring
- the last remaining private tab closing
- the owning window closing
- app quit

So closing your last private tab is the exit: nothing is held, ⌘⇧T returns
nothing. Holding a private tab while its session is still live on screen changes
nothing about exposure, since the session and its other tabs are already visible.

This keeps "private tabs are excluded from reopen-closed-tab" true in every
durable sense — nothing about a private tab is ever recorded, serialized, or
persisted. Only a live in-memory view is recoverable, and only inside a private
session that is already on screen.

### 2.4 Restore semantics

- Splice the tab back at its recorded index in `tabOrder`, clamped to the current
  length.
- Rejoin its group by id if that group still exists; otherwise find-or-create by
  name, matching `/group`'s semantics.
- Restore `pinned` and `muted` from the entry. A tab the user had muted before
  closing stays muted; the Tier 0 park-time mute is not itself persisted into the
  restored state.
- Activate the restored tab, matching today's behaviour.
- For a group entry: restore the group record first, then its tabs in their
  recorded order, then activate whichever was active at close time (or the first,
  if that tab was not in the group).

### 2.5 Held tabs keep executing — accepted and disclosed

A held tab is exactly a background tab for 30 seconds: invisible, muted, and
subject to Chromium's hidden-view throttling, but its JavaScript, timers, and
network connections keep running. That continued execution is precisely what
makes ⌘⇧T an undo rather than a reload.

This is bounded — one tab, 30 seconds, never a capturing tab — and is documented
in the spec and on the privacy page rather than left as a surprise.

## 3. Architecture

Mirrors the Quiet Tabs split, which CLAUDE.md already documents as the house
pattern for this shape of feature.

### 3.1 `src/main/closed-tabs.js` — pure policy

No `require('electron')`. Injected clock, never read. Requireable from
`node --test`. Precedent: `tab-sleep.js`, `session-snapshot.js`,
`tabsync-model.js`.

```
CLOSED_GRACE_MS = 30_000
MAX_CLOSED_ENTRIES = 25
MAX_HELD_VIEWS = 1

holdEligibility(tab, { hasSnapshot })  -> 'hold' | 'snapshot' | 'url' | 'refuse'
buildTabEntry(tab, snapshot, slot, now)   -> entry
buildGroupEntry(group, tabs, snapshots, now) -> entry
expireHolds(entries, { now, graceMs })    -> { downgrade: [], destroy: [] }
```

`holdEligibility` returns `'refuse'` for a tab that must not be recorded at all
(no usable url, or `blanc://newtab`), and otherwise the highest tier the tab
qualifies for. It does not take a held count — a newer close always takes the
hold (§2.1), so the caller downgrades the incumbent rather than the policy
refusing the newcomer.

`expireHolds` returns two lists rather than mutating: entries whose held view
should be destroyed while the entry survives as its snapshot (`downgrade`), and
entries that should be dropped entirely (`destroy` — private holds).

### 3.2 `main.js` — the impure half

Owns: parking and re-attaching views, the expiry timer, the `closedEntries` list
on each window runtime, and `reopenClosedTab()`.

`reopenClosedTab()` branches on the popped entry's tier:

- Tier 0 → adopt the parked view into a new tab record
- Tier 1 → `createTab(url, { restoreHistory, pinned, groupId })`
- Tier 2 → `createTab(url)` as today
- group entry → loop Tier 1 over its tabs after restoring the group record

Reopening consumes the entry and cancels its expiry timer.
`reopenClosedTabInWindow(runtimeId)` keeps its current signature and role as the
window-addressed variant used by the test hook.

### 3.3 The one new construction seam

Restoring a Tier 0 entry must reuse the parked view, not build a new one.
`createTab` already has the `bornQuiet` seam that skips view construction,
wiring, and the initial navigation. Add a narrow `adoptView` option alongside it:
when supplied, use that view instead of constructing one, run `wireTabView` as
normal, and skip the initial `loadURL`/`restore`.

The alternative — a separate `restoreHeldTab()` that builds the tab record
directly — would duplicate a ~40-field record shape whose fields carry
non-obvious invariants (`restorableCommit`, `navEpoch`, `historyEligible`,
`wakeGeneration`). That duplication is the larger risk.

## 4. Surfaces

**⌘⇧T and File → Reopen Closed Tab.** Existing. The menu item's `enabled`
predicate moves from `recentlyClosedUrls?.length` to the new entry list.

**`/reopen` slash command.** New. Hint: `Reopen the tab you just closed`.

**⌘L panel "closed" section.** A quiet section below the tab list showing the
most recent entries — favicon and title, a `held` marker on the Tier 0 entry, and
`N tabs` on a group entry. Clicking reopens *that* entry rather than the top of
the stack. This is new panel chrome and therefore needs render proof in the real
chrome plus explicit approval before any Design System push.

**Not in scope:** Quick Switcher matching over closed tabs. That is the retrieval
direction, deliberately excluded (§1).

## 5. Invariants

### 5.1 Capture is never held

A tab with `tab.capturing` closes immediately and releases mic/camera. This is
re-checked **synchronously at park time**, matching the shape of `sleepTab`'s
final guard (`src/main/main.js`) — a tab can begin capturing between eligibility
selection and teardown. A held tab that kept the microphone open would leave the
OS indicator lit after the user closed the tab, contradicting the capture
indicator's contract.

### 5.2 Listeners are stripped at park

`wc.removeAllListeners()` before parking, exactly as `sleepTab` does. Otherwise a
held view's loading, failure, and crash handlers fire against a tab record that is
no longer in `tabs`, poisoning state or resurrecting a tab that was closed.
`wireTabView` re-attaches the full listener set on restore.

`tabIdByWebContentsId` and `lastMainFrameMethod` are keyed on `wc.id` and are
cleared at close today; a held view's `webContents` is still alive, so they are
cleared at park and re-established on restore.

### 5.3 Liveness

Every touch of a held view goes through the `liveContents()` guard rule: after
`webContents.close()`, `view.webContents` can read back `undefined`. A held
view's `webContents` may also be destroyed out from under us by a renderer crash.

### 5.4 Teardown

- `before-quit` destroys held views alongside `sleepSnapshots`, in the same loop
  location.
- Window close destroys that window's held view and drops its entries.
- `persistSession()` never sees held tabs, since they are already out of `tabs`,
  `tabOrder`, and `windowRuntimes`. No change needed there.
- `sleepTeardownInProgress` and the Quiet Tabs teardown path must not race the
  park path; a close during a sleep teardown already wins (`closeTab` sets the
  flag false), and parking preserves that ordering.

### 5.5 Memory ceiling

One held view per window. The honest worst case is N windows × one held renderer
each (~150 MB apiece) for 30 seconds, reachable only by pressing ⌘W in several
windows within the same 30 s. Held views are not counted against
`MAX_SLEEP_SNAPSHOTS`, which bounds a different and much cheaper resource.

## 6. Obligations elsewhere

Each of these fails CI or a guard test if missed, and must land in the **same
commit** as the behaviour change.

**`/reopen` must land in four places** or `npm run substrate:check` fails:
`copy/slash-commands.json`, `src/renderer/overlay.js` (the live command table),
`src/renderer/pages/shortcuts.js`, and `main.js`'s `SLASH_COMMANDS`.

**`test/unit/close-tab-shutdown.test.js`** slices `main.js` from
`function closeTab(id) {` to `\nfunction reopenClosedTab()`. That function name
and its adjacency to `closeTab` are load-bearing; keep both or update the test.

**Spec amendments for the private hold.** `spec/features.md` (F4, two sentences),
`spec/parity-matrix.md` (F4 row), and `spec/divergence-register.md` currently
state flatly that private tabs are never reopenable. Reword to "never *recorded*
for reopen", and describe the live-session hold.

Acceptance scenario **F4-1 passes unchanged** — it opens one private tab, closes
it, and reopens; that is the last-private-tab case, which holds nothing.

**CLAUDE.md** needs a short paragraph for this feature, and its private-tabs
sentence ("excluded from session persistence, sync, and reopen-closed-tab")
needs the same wording refinement.

## 7. Testing

**`test/unit/closed-tabs.test.js`** over the pure module: tier selection for each
eligibility case, `'refuse'` for newtab and url-less tabs, one-entry-per-action
grain, the 25-entry cap, expiry downgrade-vs-destroy, a newer close taking the
hold and downgrading the incumbent, and the private rules (held only with
siblings, never downgraded).

**Acceptance:**

- New F2 scenario: closing a group of N and reopening restores the group whole,
  with membership, order, and pins intact, in one step.
- New F4-7 scenario: with two or more private tabs open, closing one and
  reopening restores it; closing the last one restores nothing.

**Hand verification** — what neither unit nor acceptance tests reach:

- audio actually stops on ⌘W of a playing tab
- mic/camera release on ⌘W of a capturing tab, OS indicator included
- scroll position and typed form content survive a Tier 0 restore
- a Tier 1 restore lands at the right scroll offset with a working back button
- quitting with a held view leaks no renderer
- a held view surviving a renderer crash does not take down main

Chrome-level changes (the ⌘L panel section) require relaunching `npm start`;
⌘R reloads only the active tab's view.

## 8. Deliberately excluded

- Persistence across quit. Rescue, not archive.
- Quick Switcher matching over closed tabs.
- Undoing a closed *window*. Would require moving the list off the per-window
  runtime into a process-wide store; revisit only if the window case proves
  common.
- A configurable grace window. A rescue feature you have to configure is one most
  people never get. 30 s is fixed.
- A transient pill affordance during the hold. Transient chrome that appears and
  vanishes on its own is the pattern that got the scroll-away island rejected.
