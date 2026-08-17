# Reopen Closed Tab — design

Date: 2026-08-16
Status: approved after review round 1, not implemented

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
`setAudioMuted(true)`, and placed behind the held-state firewall (§3.4). ⌘⇧T
re-attaches *that same view*. No network request, no re-render, no lost JS state.
This restores things no snapshot can carry: a page reached by POST, a half-typed
rich-text editor, a canvas, a video timestamp, a WebSocket-driven app, a page
behind a session that has since expired.

Capacity: **one held view per window**, **30 seconds**.

A Tier 0 entry **always captures its Tier 1 snapshot at park time as well**, so a
held entry is "snapshot plus live view" rather than a separate kind of thing.
Three consequences, all of which simplify the implementation:

- Expiry is just dropping the view; the entry survives as Tier 1 with no work at
  the moment the timer fires.
- If the held view dies (renderer crash, §5.3) or cannot be re-attached, restore
  falls back to the snapshot instead of failing.
- A **newer single-tab close takes the hold**, downgrading the previous held
  entry to its already-captured snapshot. The most recent close is the one the
  user is most likely to undo, so the live view follows it rather than being
  refused. `MAX_HELD_VIEWS = 1` is maintained by this downgrade, not by refusal.

Because every held entry has a snapshot behind it, downgrade is always available
and `expireHolds` never needs to destroy an entry outright.

**Tier 1 — snapshot.** On hold expiry, and for every close that cannot be held.
Stores `trimSnapshot()` entries + active index + slot metadata. ⌘⇧T rebuilds the
tab through `createTab({ restoreHistory, pinned, groupId })`, which already
exists and is already used by `duplicateTab`. Scroll position, back/forward
stack, group, pin, mute, and slot all return; the page re-fetches.

A close falls to Tier 1 when any of these hold:

- it is a group close (see §2.2)
- the tab is capturing mic or camera (§5.1)
- the tab was quiet (`tab.asleep`) — no live renderer exists to hold

**Tier 2 — URL only.** Fallback when `trimSnapshot()` returns null, i.e. the tab
has no committed navigation history to shape. This is today's behaviour, retained
as the floor so no case regresses.

**Not recorded at all.** Matching today's predicate in `closeTab`: a tab with no
usable `url` string, any `blanc://newtab` tab, and **every private tab** (§2.3).
Utility pages never open as tabs, so they need no separate rule.

**Quiet-tab snapshots are copied by field, never by reference.** A quiet tab
being closed already has a `sleepSnapshots` entry, but that record's `view` can
be a **live** `WebContentsView`: the storage-bearing path
(`discardRendererKeepingStorage`) sets `tab.view = null` and never nulls
`record.view`, unlike the ordinary path which nulls it on `'destroyed'`. Tier 1
therefore copies only `entries`, `index`, and `droppedPageState`. The retained
view stays the property of `closeTab`'s existing teardown, which already destroys
it. Copying the record wholesale would bypass the held-view ceiling and leak a
`WebContents`.

### 2.2 Grain: one entry per user action

| Action | Entry produced |
| --- | --- |
| `closeTab(id)` | one tab entry — Tier 0 if eligible, else Tier 1, else Tier 2 |
| `closeGroup(gid)` | one group entry: the group record (`name`, `collapsed`, index in `rt().groups`) plus N tab snapshots, each Tier 1 (individually falling to Tier 2 if its own `trimSnapshot()` returns null) |

A group close cannot use Tier 0: holding eight live renderers costs roughly
1.2 GB, which contradicts the product's memory position. The tier degrades by
grain, not arbitrarily — a rule that is explainable in one sentence. A group close
does not disturb an existing Tier 0 hold; only a single-tab close takes the hold.

**Group close must become an atomic, capture-first teardown.** `closeGroup()` is
currently `for (const id of ids) closeTab(id)`, which is unusable as-is:

- `pruneEmptyGroups()` destroys the group record partway through the loop, before
  its name and cluster index can be read
- each close records its own entry, producing N entries instead of one
- closing the active member re-runs replacement selection repeatedly, and can
  **wake a quiet group member** just to close it a moment later

The teardown therefore: snapshots every member first (reading `rt().groups` for
the group's cluster index while it still exists), builds the single group entry,
then closes the members with per-close recording and replacement selection
suppressed, and finally performs one replacement selection at the end.

**The group's slot needs its own index.** Visible cluster order comes from
`rt().groups`, not from `tabOrder`, so per-tab indices alone cannot restore where
the group sat among other groups.

### 2.3 Private tabs are entirely excluded

A private tab close records nothing and holds nothing — Tier 0 included. This is
unchanged from today's behaviour.

An earlier draft held private tabs live while other private tabs remained open.
That is dropped for three reasons:

- A held entry necessarily carries in-memory metadata, and the ⌘L panel section
  (§4) would render a private page's title and favicon in **normal** chrome.
- "Another private tab remains open" does not mean the private session is
  visibly on screen — the sibling may be in a background window or an inactive
  tab, so the quick-exit contract is not actually preserved.
- Three public pages state the exclusion plainly:
  `site/src/pages/privacy.astro`, `site/src/pages/features.astro`, and
  `site/src/pages/features/private-tabs.astro`. Acceptance scenario F4-1's steps
  would still have passed, but its title ("cannot be reopened") and its row in
  the acceptance index would have become false.

Consequence: this design requires **no** amendment to `spec/features.md`,
`spec/parity-matrix.md`, `spec/divergence-register.md`, CLAUDE.md's private-tabs
paragraph, or any site copy.

### 2.4 Restore semantics

- Splice the tab back at its recorded index in `tabOrder`, clamped to the current
  length.
- Rejoin its group by id if that group still exists; otherwise find-or-create by
  name, matching `/group`'s semantics.
- Restore `pinned` and `muted` from the entry.
- **Explicitly call `wc.setAudioMuted(effectiveTabMuted(tab))` on re-attach.**
  `wireTabView` only ever mutes (`if (effectiveTabMuted(tab)) wc.setAudioMuted(true)`)
  and never unmutes, so a Tier 0 restore would otherwise stay permanently silent
  from the park-time mute.
- Activate the restored tab, matching today's behaviour.
- For a group entry: restore the group record at its recorded cluster index
  first, then its tabs in their recorded order, then activate whichever was
  active at close time (or the first, if that tab was not in the group).

### 2.5 Held tabs keep executing — accepted and disclosed

A held tab is a background tab for 30 seconds: invisible, muted, and subject to
Chromium's hidden-view throttling, but its JavaScript, timers, and existing
network connections keep running. That continued execution is precisely what
makes ⌘⇧T an undo rather than a reload.

It is bounded — one tab, 30 seconds, never a capturing tab — and constrained by
the firewall in §3.4, which denies the held page new navigation, new windows, and
new permissions. Documented in the spec and on the privacy page rather than left
as a surprise.

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

holdEligibility(tab, { hasSnapshot })        -> 'hold' | 'snapshot' | 'url' | 'refuse'
buildTabEntry(tab, snapshot, slot, now)      -> entry
buildGroupEntry(group, tabs, snapshots, now) -> entry
expireHolds(entries, { now, graceMs })       -> string[]   // entry ids to downgrade
```

`holdEligibility` returns `'refuse'` for a tab that must not be recorded at all
(no usable url, `blanc://newtab`, or private), and otherwise the highest tier the
tab qualifies for. It does not take a held count — a newer close always takes the
hold (§2.1), so the caller downgrades the incumbent rather than the policy
refusing the newcomer.

`expireHolds` returns ids to downgrade rather than mutating. There is no destroy
list: every held entry has a snapshot behind it, so expiry is always a downgrade.

### 3.2 `main.js` — the impure half

Owns: parking and re-attaching views, the held registry, the expiry timer, the
`closedEntries` list on each window runtime, and `reopenClosedTab()`.

`reopenClosedTab()` branches on the popped entry's tier:

- Tier 0 → adopt the parked view into a new tab record; if the view is dead or
  re-attach throws, fall through to the entry's snapshot
- Tier 1 → `createTab(url, { restoreHistory, pinned, groupId })`
- Tier 2 → `createTab(url)` as today
- group entry → restore the group record, then loop Tier 1 over its tabs

Reopening consumes the entry and cancels its expiry timer.
`reopenClosedTabInWindow(runtimeId)` keeps its current signature and role as the
window-addressed variant used by the test hook.

### 3.3 The one new construction seam

Restoring a Tier 0 entry must reuse the parked view, not build a new one.
`createTab` already has the `bornQuiet` seam that skips view construction,
wiring, and the initial navigation. Add a narrow `adoptView` option alongside it:
when supplied, use that view instead of constructing one, run `wireTabView` as
normal, apply the explicit unmute from §2.4, and skip the initial
`loadURL`/`restore`.

The alternative — a separate `restoreHeldTab()` that builds the tab record
directly — would duplicate a ~40-field record shape whose fields carry
non-obvious invariants (`restorableCommit`, `navEpoch`, `historyEligible`,
`wakeGeneration`). That duplication is the larger risk.

### 3.4 The held-state firewall

A held page is still executing but has no tab record, so it must not be left
bare. `removeAllListeners()` alone — the `sleepTab` pattern — is **not** safe
here: `sleepTab` destroys its contents immediately afterward, whereas a held view
runs on for 30 seconds. Parking therefore clears the tab-model listener set and
then installs a minimal replacement set.

Park sequence, in this order, so no window exists in which a request resolves
against neither the tab record nor the firewall:

1. Add `wc.id` to the process-wide `heldWebContents` registry.
2. `wc.removeAllListeners()`.
3. Install the firewall listeners below.
4. Delete `tabIdByWebContentsId` / `lastMainFrameMethod` entries and remove the
   tab from `tabs`, `tabOrder`, `windowRuntimes`.

Firewall contents:

- **`setWindowOpenHandler(() => ({ action: 'deny' }))`** — re-installed, not
  merely cleared. `setWindowOpenHandler` is a method-installed handler, **not** an
  EventEmitter listener, so `removeAllListeners()` does not clear the one
  `wireTabView` set at `tab-view.js`. Left in place, a held page could
  `window.open` and run a `boundToTab` closure against a deleted tab record.
  Precedent for the deny form: `main.js` uses it for the auth dialog and other
  non-tab contents.
- **`will-navigate` and `will-redirect` → `preventDefault()` unconditionally.**
  A held page is frozen at the state the user closed; blanket refusal is both
  stronger and simpler than re-implementing the privileged-URL guard from
  `tab-view.js`, and without it a held page could navigate into `blanc://` and
  then be re-attached. Subframe navigation is left alone so the page survives
  restore intact.
- **Permission denial** via the registry — see §5.1.
- **`render-process-gone` and `once('destroyed')` → atomic downgrade** — see §5.3.

Unparking removes the firewall and the registry entry, then `wireTabView`
reinstalls the ordinary set.

## 4. Surfaces

**⌘⇧T and File → Reopen Closed Tab.** Existing. The menu item's `enabled`
predicate moves from `recentlyClosedUrls?.length` to the new entry list.

**`/reopen` slash command.** New. Hint: `Reopen the tab you just closed`.

**⌘L panel "closed" section.** A quiet section below the tab list showing the
most recent entries — favicon and title, a `held` marker on the Tier 0 entry, and
`N tabs` on a group entry. Clicking reopens *that* entry rather than the top of
the stack. This is new panel chrome and therefore needs render proof in the real
chrome plus explicit approval before any Design System push.

Because private tabs are never recorded (§2.3), this section can never render
private page metadata.

**Not in scope:** Quick Switcher matching over closed tabs. That is the retrieval
direction, deliberately excluded (§1).

## 5. Invariants

### 5.1 Capture: refuse at park, deny while held

Two independent mechanisms, both required.

**Refuse at park.** A tab with `tab.capturing` is never held; it closes
immediately and releases mic/camera, re-checked **synchronously at park time**,
matching the shape of `sleepTab`'s final guard.

**Deny while held.** The synchronous check is not sufficient on its own: a parked
page can request mic or camera afterward, and a **remembered** grant is answered
by the stored-decision path without ever reaching the prompter. The tab record is
gone by then, so `tabForWebContents` — `tabs.get(tabIdByWebContentsId.get(wc.id))`
— returns null, the capture grant observer cannot anchor the grant to any tab, and
capture would begin with the OS indicator lit but no Blanc chip. (Keeping
`tabIdByWebContentsId` populated would *not* fix this: the tab is absent from
`tabs` regardless. A separate registry is the only workable lookup.)

Therefore `setPermissionRequestHandler` and `setPermissionCheckHandler` both
consult `heldWebContents` first and **deny every permission** for a held
`WebContents`, ahead of the stored-decision lookup. Broader than media alone,
deliberately: a page the user has closed has no business acquiring geolocation or
firing a notification either, and one rule is easier to keep correct than a media
carve-out. Denials here are never persisted.

The prompter path is already safe — an unresolvable requester resolves `null`,
which denies without persisting — but the registry check runs first regardless so
the two handlers agree.

### 5.2 Listener replacement, not listener removal

Covered in §3.4. Restated as the invariant: **a held view is never left without
navigation, window-open, permission, crash, and destruction protection.** The
tab-model listeners are cleared because they would write to a record that no
longer exists; the firewall replaces them.

`tabIdByWebContentsId` and `lastMainFrameMethod` are cleared at park, since every
consumer resolving through them expects a live tab record. The held registry is
the purpose-built lookup for the held state.

### 5.3 Crash downgrade must be atomic

A renderer crash does **not** necessarily destroy its `WebContents`. After a
crash the object remains, `isDestroyed()` stays false, and a `liveContents`-style
check therefore accepts a dead view — re-attaching a sad-tab and never reaching
the snapshot fallback.

The firewall therefore retains `render-process-gone` and `once('destroyed')`
observers whose sole job is to downgrade the entry atomically: null the entry's
view reference, clear the registry entry, cancel the hold timer, and leave the
entry standing as Tier 1. Restore then takes the snapshot path with no special
casing at the call site.

### 5.4 Teardown and cleanup contracts

- **`before-quit`** destroys held views alongside `sleepSnapshots`, in the same
  loop location.
- **Capacity eviction** must destroy an evicted entry's held view. Reachable: the
  held entry is the newest, but 24 further closes within the same 30 s push it to
  the tail where the 25-entry cap evicts it.
- **Non-primary window close** loops `closeTab(tabId)` and then discards the
  runtime three lines later (`main.js`). Recording must be **suppressed** for
  that loop — the same suppression the group teardown needs — or it parks a live
  view into a runtime that is immediately discarded, leaking a `WebContents`. Any
  pre-existing held view for that runtime is destroyed and its entries dropped.
- **Primary window close on macOS** takes the `detachWindow` path instead: the
  runtime and its tabs survive for dock-reopen, and `recentlyClosedUrls` survives
  with them today. That contract is preserved — entries are **not** dropped. The
  held view is still destroyed and its entry downgraded to Tier 1, because a live
  view cannot outlive its window's `contentView` and the 30 s bound cannot span
  an indefinite dock-closed period.
- **`persistSession()`** never sees held tabs, since they are already out of
  `tabs`, `tabOrder`, and `windowRuntimes`. No change needed there.
- **`sleepTeardownInProgress`** and the Quiet Tabs teardown path must not race
  the park path; a close during a sleep teardown already wins (`closeTab` sets the
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

**CLAUDE.md** needs a short paragraph for this feature. Its private-tabs sentence
needs **no** change, since private tabs remain fully excluded (§2.3).

**No spec, parity-matrix, divergence-register, or site-copy changes are
required.** F4-1 stands unmodified and its title stays true.

## 7. Testing

**`test/unit/closed-tabs.test.js`** over the pure module: tier selection for each
eligibility case, `'refuse'` for newtab, url-less, and private tabs,
one-entry-per-action grain, the 25-entry cap, expiry downgrade, and a newer close
taking the hold and downgrading the incumbent.

**Acceptance:** a new F2 scenario — closing a group of N and reopening restores
the group whole, with membership, order, and pins intact, in one step.

**Hand verification** — what neither unit nor acceptance tests reach:

- audio actually stops on ⌘W of a playing tab, and a restored tab is audible again
- mic/camera release on ⌘W of a capturing tab, OS indicator included
- a held page with a **remembered** mic grant calling `getUserMedia` is denied and
  lights no indicator
- a held page calling `window.open` opens nothing
- scroll position and typed form content survive a Tier 0 restore
- a Tier 1 restore lands at the right scroll offset with a working back button
- crashing a held renderer downgrades cleanly and ⌘⇧T still restores via snapshot
- quitting with a held view leaks no renderer
- macOS: close the primary window, dock-reopen, ⌘⇧T still finds prior entries

Chrome-level changes (the ⌘L panel section) require relaunching `npm start`;
⌘R reloads only the active tab's view.

## 8. Deliberately excluded

- Persistence across quit. Rescue, not archive.
- Quick Switcher matching over closed tabs.
- Tier 0 for private tabs (§2.3), and any reopen of private tabs at all.
- Undoing a closed *window*. Would require moving the list off the per-window
  runtime into a process-wide store; revisit only if the window case proves
  common.
- A configurable grace window. A rescue feature you have to configure is one most
  people never get. 30 s is fixed.
- A transient pill affordance during the hold. Transient chrome that appears and
  vanishes on its own is the pattern that got the scroll-away island rejected.
