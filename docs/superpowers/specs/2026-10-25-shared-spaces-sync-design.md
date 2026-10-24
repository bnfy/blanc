# M16: Shared Spaces, groups and Recently closed — the desktop protocol

**Date:** 2026-10-25
**Status:** proposed. The contract is `2026-10-24-ios-v1-companion-release-design.md` §4, §5 and §7 (merged in #1102, owner-decided 2026-10-24). This document chooses the mechanisms that contract left open. Decisions D1–D9 (§13) are the owner's; nothing here is built.
**Ships as:** a public desktop feature release (its own What's New page and the feature-release gates in CLAUDE.md) before Blanc for iPhone, so the protocol gets real use first (§4.7 of the contract). M17 (Spaces on iPhone) builds on it.
**Builds on:** Profile Sync (`2026-07-07-profile-sync-design.md`), Tab Sync (`2026-07-21-tab-sync-design.md`, F27), Send to device (`2026-10-24-ios-m7b-send-to-device-design.md`, the `sends` store), Blanc Spaces (F41), Move to Space (#1097).
**Retires:** F41's "Spaces are device-local and profile-scoped; they never sync", when this ships.

## 1. What a person gets

With Profile Sync on, Settings → Sync gains a per-device switch, off by default, beside "Share this device's open tabs":

> **Keep Spaces and groups in sync on this device**
> Tabs in your shared Spaces are synced from this device.

With it on, this device's Spaces join the account's one shared library. A Space is the same set of tabs, groups, pins and order on every device that has the switch on. Opening a shared Space on two devices at once is fine and is the point. Closing a tab in a shared Space closes it everywhere; the receiving device files it in its own Recently closed, which is synced too, so nothing is lost. Following a link in a shared tab updates the Space everywhere. The page the person is looking at is never changed under them: a remote close or navigation of that tab waits until they leave it, or until Blanc next starts cold.

With it off, nothing changes from today: Spaces are local, and other devices see this device's tabs read-only through Tab Sync, if that switch is on.

## 2. Decisions taken here

The contract fixes what; these are the hows, each with the reason.

| # | Decision | Why |
|---|---|---|
| 2.1 | **One encrypted blob per Space, in 25 fixed slots** (`spacea` … `spacey`), plus one `spaces` index blob. | 25 Spaces × 500 tabs can't fit one 512 KiB blob (§5). Slot names are lowercase letters, so the Worker's existing `[a-z]+` store route serves them unchanged. |
| 2.2 | **The library holds at most 25 Spaces per account**, the same cap desktop already has per profile. | One budget everywhere; a 26th Space is refused with a visible reason, never dropped. |
| 2.3 | **Records, not captures.** Each Space, group and tab is its own record with an id, a clock and a tombstone; order is a position string per item. | The contract's §4.3. Favorites already merge this way. |
| 2.4 | **A shared Space's tabs get stable ids** that the local capture carries in a new `tabIds` column of `workspaces.json`. | The F27 entry has no tab ids and is frozen; the capture is Blanc's own file and may grow a column. |
| 2.5 | **Over budget is refused at the edge, loudly:** a Space whose record would pass 400 KiB stops accepting new shared tabs on this device, says so in the Spaces menu and in Settings → Sync, and the last good record stays. | The contract requires over-budget behaviour that is never silent. Trimming someone's tabs quietly is a loss. |
| 2.6 | **Remote changes are applied to a live Space by diffing records against the window's tabs**, through the same `closeTab`, `createTab` and navigation paths a local action uses, with one deferred queue per window for the protected active tab. | Reuses Recently closed, Quiet Tabs and the resident-space machinery instead of a second tab model. |
| 2.7 | **Synced Recently closed is a per-device store, `closed`**, in the `sends` shape (one writer per entry). | The contract's §5; no merge conflicts by construction. |
| 2.8 | **Other-devices dedupe uses a `shared` sidecar** listing, per device, the URLs of its tabs that sit in shared Spaces; the receiver hides those F27 tabs when it can see the Space. | The contract forbids a new field in the F27 entry. Icons already use a sidecar keyed by device and URL. |
| 2.9 | **Turning the switch off keeps the records in the library** (the contract's §4.2) and publishes nothing further; it never retracts. | Other devices keep the Space. This differs from Tab Sync's retraction and the privacy label says so. |
| 2.10 | **The Worker stays v1.** No new routes; four kinds of store added to `STORES`; owner deploys before any client that needs them. | The authenticated v2 protocol is its own project (CLAUDE.md). R3 and R5 stay open and are stated, not fixed, here (§11). |

## 3. The library, as records

All plaintext below sits inside the usual AES-GCM envelope; the Worker sees only ciphertext.

### 3.1 The `spaces` index

One blob, the directory of the library:

```
{ "v": 1,
  "spaces": {
    "<spaceId>": {
      "name": "Work", "color": "#426c4c", "symbol": "briefcase",
      "pos": "a0k",                 // order among Spaces (§3.4)
      "slot": "spacec",             // which blob holds its tabs and groups
      "clock": 1800000000000, "by": "<deviceId>",
      "deletedAt": null             // a tombstone when set (§3.5)
    } },
  "slots": { "spacec": "<spaceId>" }  // slot → Space, for the free-slot search
}
```

- `spaceId` is a fresh UUID when a Space joins the library; a local Space's id is never reused as the shared id (two devices could have the same local id by chance).
- Name ≤60 (desktop's cap), colour `#rrggbb`, symbol one of the sixteen; invalid values are repaired as `workspaces-model.js` already does, never rejected.
- A deleted Space keeps its index entry as a tombstone for 30 days (§3.5) and its slot is freed at once.

### 3.2 One Space, one slot blob

```
{ "v": 1, "spaceId": "<spaceId>",
  "groups": {
    "<groupId>": { "name": "Reading", "color": null, "collapsed": false,
                   "pos": "b", "clock": …, "by": "<deviceId>", "deletedAt": null } },
  "tabs": {
    "<tabId>": { "url": "https://…", "title": "…", "pinned": false,
                 "groupId": "<groupId>" | null, "pos": "c2",
                 "clock": …, "by": "<deviceId>", "deletedAt": null } },
  "active": { "tabId": "<tabId>", "clock": … }   // optional; the saved selection
}
```

- Tabs: http(s) only, URL ≤2048 and title ≤200 UTF-16 units (Tab Sync's limits; `sanitizeTab`). `blanc://` pages, `file://` pages, private tabs, splits and page state never enter a record. The error page records its real destination (`persistableUrl`), as the capture does.
- Groups keep desktop's rules: a name kept in the case typed and matched without regard to case within a Space, an optional preset colour.
- At most **500 tabs** in a Space (the Tab Sync bound) and 400 KiB of canonical plaintext (§5).

### 3.3 Clocks and tie-breaking

Every record carries `clock` (ms since the epoch, the writer's clock) and `by` (the writer's deviceId). Per record, the higher clock wins; on a tie, the lexicographically smaller `by` wins, so merging is symmetric and converges. A clock is set only by the device that changed the record; a device never rewrites another device's unchanged record with a newer clock.

Clock skew between devices makes "last writer" approximate. This is accepted, as it is for Favorites; the merge never loses a record, only a concurrent edit to the same field of the same record.

### 3.4 Order as positions

`pos` is a string position from a fractional indexing scheme over `0-9a-z` (the same idea as `closed-slot.js`'s place-keeping, written as a string so a new item fits between any two). Moving an item sets only its own `pos`. Two devices reordering at once produce a deterministic order (ties by id) rather than a fight. Every ten saves a device that owns all of a Space's recent edits may renumber positions to short strings, bumping every clock; renumbering is rare and never needed for correctness.

### 3.5 Tombstones

Removing a Space, group or tab sets `deletedAt` and bumps `clock`. A tombstone wins over any older edit and loses to a newer one (a tab re-added after the delete lives). Tombstones are dropped **30 days** after `deletedAt` by every writer. A device offline for more than 30 days may resurrect a deleted tab from its stale copy; the same bounded risk Favorites accept.

### 3.6 Who writes what

- Any device with the switch on may write any record. The index blob changes rarely (new, renamed, recoloured, reordered or deleted Spaces); slot blobs change often (every tab change).
- A write is read-merge-write with the Worker's `ifVersion`. On 409 the device merges the newer blob and retries, as `syncOne` already does. Two devices that write the same slot within KV's propagation window can both get 200 and one write can be lost (R5, §11); per-record clocks bound the damage to that write's records, which the losing device's next save re-publishes because its local records still carry the newer clocks.

## 4. From the record to the window and back

### 4.1 Local state

- `workspaces.json` stays the device's projection of each Space: the columns it has today plus two new ones for shared Spaces, `sharedId` (the library's spaceId) and `tabIds` (parallel to `urls`). Unshared Spaces carry neither. An older build ignores both.
- A new profile-scoped `shared-spaces.json` holds the last merged index and slot records, bound to the sync `accountId` (the `rebind` guard every sync store has), plus per-Space `publishedAt` and the deferred queue (§4.4).
- Only the Personal profile syncs, as all of Profile Sync does. Named profiles' Spaces stay local.

### 4.2 Local change → record

The autosave that already runs on every tab broadcast (`autosaveWorkspaceBindings`) also, for a shared Space, diffs the window's tabs against the Space's records by `tabId`:

- a tab with no id is new: fresh id, `pos` after its neighbour, clock now;
- a tab whose URL, title, pin, group or neighbours changed: an edit, clock now, same id (a navigation is an edit, §4.3 of the contract);
- a tab no longer present: a tombstone;
- groups and Space identity likewise.

The slot blob uploads on Tab Sync's debounce (15 s, 60 s at most) and at once on close of the Space's last window, quit or switch. The index uploads on the same debounce. A device never uploads a Space it has not opened since the last merge (nothing to say).

### 4.3 Record → live window

When a merge changes a Space this device has open (a shown window or a set-aside runtime), main applies the difference to that runtime through the ordinary paths, in one synchronous pass:

| Change | Applied as |
|---|---|
| New tab record | `createTab(url, { asleep: true, groupId, pinned })` at its position, quiet until selected. The window's `tabOrder` and groups are renormalized (`syncTabLayout`). |
| Tab tombstone | `closeTab(id)` with recording on: the tab lands in this window's Recently closed as a local close would. The dirty-form probe does not run (the page is recoverable there). |
| URL change | A main-frame navigation of the live tab (`navigateTabToAddress`), or just the record for a quiet tab (it loads the new URL when woken). |
| Title, pin, group, position | Applied to the tab record and layout; no page is touched. |
| Group tombstone | Members become ungrouped (the record's `groupId` is already null for them, or they carry their own tombstones). |
| Space tombstone | The window leaves the Space (as Delete does today, into Recently deleted locally, 7 days) and keeps its tabs as an unsaved window; a set-aside runtime is disposed. |
| Space renamed, recoloured, reordered | The mark and the Spaces menu update; no tabs are touched. |

A set-aside Space takes every change at once; nothing is on screen there.

### 4.4 The protected active tab

The tab the person is looking at is the active tab of each window showing the Space (every visible pane of a split counts). A tombstone or URL change for such a tab is **deferred**: it goes into the window's deferred queue in `shared-spaces.json` and is applied when the tab stops being active (a tab switch, closing the tab themselves, the window closing or leaving the Space) or at the next cold start, whichever first. A deferred change is dropped if a newer record supersedes it. The queue is per window and never synced.

A deferred navigation keeps the person's page; when applied, the tab loads the newer URL (the record's). A deferred close files the page in Recently closed. Both are visible when they happen because the person has just left the tab.

### 4.5 Which device has a Space open

Stays per device (contract §4.5). The library records no presence. "A Space is in at most one window at a time" remains desktop's local rule.

### 4.6 Switching the switch

- **On:** every local Personal Space is uploaded as a new library Space (fresh `spaceId`, fresh `tabId`s). Two devices that each had "Work" end up with two "Work" Spaces (contract §4.2). If the library would pass 25 Spaces, the switch turns on but the Spaces that don't fit stay local and the Spaces menu marks them "Not synced — the library is full" (D2 on which ones). If a Space has more than 500 tabs or 400 KiB, it joins with the first 500 tabs that fit and the menu says "N tabs stay on this device". Both states clear when room appears.
- **Off:** the device keeps its current copies as local Spaces (dropping `sharedId` and `tabIds`) and publishes nothing further. Nothing is deleted anywhere. Turning it on again re-uploads them as new Spaces; the old shared ones remain for other devices. The settings copy says this.
- **Sync off or account switch:** `shared-spaces.json` is cleared as `tab-sync.json` is; Spaces revert to local copies, as off above.

### 4.7 Pairing

After the desktop that showed a pairing code sees a new device's entry arrive (in `session` or `sends`, the devices Send to device already discovers), it asks once, in the Sync settings and as a start-page notice: **"Your iPhone joined. Keep Spaces and groups in sync with it?"** with **Turn on** and **Not now**. Turn on flips this device's switch (§4.6). The question is asked once per paired device and never again after Not now.

## 5. Budgets, and what happens over them

Numbers: a tab record is 120–300 bytes typical (UUID, URL, title, position, clock, deviceId), 2.4 KiB worst (a 2048-unit URL and a 200-unit title in a 3-byte script). A Space of 500 typical tabs is about 100 KiB; of 500 worst-case tabs about 1.2 MiB. The library's worst case, 25 × 500 worst-case tabs, is about 30 MiB. One blob can't hold the library, and one blob can't always hold one Space.

Rules, all on canonical UTF-8 bytes of plaintext (`canonical` from `tabsync-model.js`), checked before encrypting:

1. **Slot blob: 400 KiB.** This leaves room for the envelope under the Worker's 512 KiB cap and for tombstones. A device about to exceed it on its own write **refuses the local action's sync, not the action**: the tab opens in the window as usual but is marked "not synced" (a quiet dot on its row, the Spaces menu's status line "This Space is full for sync: N tabs stay on this device"). Nothing already shared is dropped. Closing tabs makes room and the waiting tabs join on the next save.
2. **500 tabs per Space,** the same way.
3. **25 Spaces per library** (§2.2, §4.6).
4. **Index blob: 64 KiB.** 25 entries are a few KiB; it cannot be exceeded within rule 3.
5. **`closed` store: 64 KiB**, `sends`' rule: the stalest other devices' entries are dropped first, never this device's.
6. **`shared` sidecar: 64 KiB**, likewise.

Never silent: every refusal above shows in the Spaces menu beside the Space, and Settings → Sync's status line names the Spaces affected. Nothing is ever trimmed from a record that another device wrote.

## 6. Recently closed, synced (`closed` store)

Per device, one writer per entry, the `sends` shape:

```
{ "devices": { "<deviceId>": {
    "name": "MacBook Pro", "platform": "darwin", "updatedAt": …,
    "items": [ { "id": "<uuid>", "url": "https://…", "title": "…",
                 "closedAt": …, "spaceId": "<spaceId>" | null } ] } } }
```

- A device adds an item when it closes a tab itself or applies a remote tombstone (§4.3): http(s) only, title and URL only, never page state, never a private tab. **24 hours and 25 items per device** (contract §5), newest kept; entries not updated for 30 days are pruned; a daily heartbeat keeps live devices present.
- Every device shows one merged list, newest first, each row naming the device that closed it, in the ⌘L Recently closed band under this device's own entries. Reopening a remote row opens the page as a new local tab (desktop's held-view and snapshot tiers apply only to its own entries). Forget hides the row on this device (a local `dismissed` map, `sends`' pattern). Clear all clears this device's own entry.
- Leaving the sync publishes a retraction, as `sends` does.

## 7. Other devices, shown once (`shared` sidecar)

A device with the switch on also publishes, in a small optional store:

```
{ "devices": { "<deviceId>": { "updatedAt": …,
    "tabs": [ { "url": "https://…", "spaceId": "<spaceId>" } ] } } }
```

listing the URLs of its open tabs that sit in shared Spaces. A receiver that can see `spaceId` (its own switch on and the Space in its library) hides those URLs from that device's section in Other devices, the Quick Switcher and the start page; the tabs appear under the Space instead. A receiver with its switch off, or an older build, ignores the sidecar and shows the tabs under the device as today. The F27 `session` entry is unchanged. A URL open both in a shared Space and in an unshared window on the same device is hidden in both places; this is accepted and noted.

## 8. The Worker

Added to `STORES` in `cloudflare/sync-worker/src/index.js`: `spaces`, `spacea` … `spacey`, `closed`, `shared`. Nothing else changes: the same `[a-z]+` route, blob cap, rate limits, markers and daily cleanup; account-wide DELETE already iterates `STORES`. The README's API section lists them with one line each. **Deploy before any client release that offers the switch**; a client meeting an older Worker gets `404 unknown store` for an optional store and says "Spaces sync isn't available yet" in Settings, as Send to device does. Deploying is the owner's action.

The Worker's `MAX_BLOB_BYTES` stays 512 KiB. Thirty new store names mean an account can hold up to about 32 × 512 KiB = 16 MiB instead of 5 × 512 KiB; the storage budget design's cost bound (§7 there) is recomputed in the plan with the real per-account average, which is far smaller.

## 9. The client

Added to `sync.js`'s `STORES` table the way `sends` was, each `optional: true` with `hasPublishableContent` so a presence-only write never creates a store in KV's missing-read window:

- `spaces` and each `spaceX`: `export`, `merge` and `equals` from a new `src/main/shared-spaces.js` (orchestration, `JsonStore`) over a pure `src/main/shared-spaces-model.js` (records, merge, positions, budgets; no electron; unit-tested, and the vectors the iOS port will check against).
- `closed`: `src/main/synced-closed.js` over `synced-closed-model.js`, modelled on `sends`.
- `shared`: in `shared-spaces.js`.

`main.js` gains the record↔window adapter (§4.2–4.4) beside the existing Space machinery (`workspaceCapture`, `applyWorkspaceToWindow`, `makeResidentRuntime`), the switch and its copy in Settings → Sync, the pairing question, and the status lines. The Spaces menu shows a sync mark on shared Spaces and the budget states.

## 10. Interface text

New `copy/messages` keys, all six languages in the same PR: the switch and its line; "Not synced — the library is full"; "This Space is full for sync: {count} tabs stay on this device"; "Spaces sync isn't available yet"; the pairing question and its two buttons; the Recently closed row's "Closed on {device}"; the settings note that turning the switch off keeps shared copies on other devices. F41's spec line is replaced; `spec/features.md`, `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17) and the privacy label ("Spaces and groups: synced when you turn it on, end to end encrypted") are updated in the shipping PR.

## 11. Security and privacy (R3, R5)

- **What travels:** Space names, colours, symbols, order; tab URLs, titles, pins, groups and order; Recently closed URLs and titles; device names. Never private tabs, page state, snapshots, splits, favicons' sources (icons go through their own sidecar), `blanc://` or `file://` pages, or anything from a named profile.
- **Consent:** the switch is its own consent (contract §4.2), independent of "Share this device's open tabs". Off by default; an update never turns it on. The pairing question is a Turn on button, not a default.
- **R3 (the locator is a bearer capability):** unchanged and still open. Shared Spaces add nothing to its exposure beyond more ciphertext under the same locator; the v1 size and rate limits are unchanged. Said plainly in the privacy page and the release notes: no claim of authentication.
- **R5 (non-atomic KV):** unchanged and still open. Per-record clocks make a lost write cost one device's unsynced edits for one save, re-published on its next save, rather than a whole Space. A delete racing a write can resurrect a record for up to one save. The design never claims strict convergence; the test plan (§12) includes a lost-write replay.
- **Threats this adds:** a malicious or buggy device in the account can delete or rewrite every shared Space (as it can every Favorite today). Recently closed and the 30-day tombstones bound the loss; Recently deleted keeps a deleted Space for 7 days locally. A remote navigation could point a shared tab at a hostile page; it loads only when the person comes to that tab (§4.4), under the same navigation guards as a typed address (`handOffToOs`, `isForbiddenTopLevelUrl`, the blocker). Records are sanitized on merge like F27 entries, so a junk blob never reaches a renderer.
- **`docs/security-assessment.md`** gets a row for shared Spaces under the Profile Sync entry, and the release's security review signs it.

## 12. Testing

- **Unit (pure model):** merge is commutative, associative and idempotent over records; tombstone vs edit in both orders; position insertion and reorder convergence; budget refusal leaves earlier records intact; 25-Space and 500-tab caps; sanitization of junk; the lost-write replay (two devices write the same slot from the same version; the loser re-publishes its newer clocks on the next pass and both converge). Vectors generated for the iOS port, as `sends-model` has.
- **Unit (adapter, lifted source like `tab-context-glance-availability.test.js`):** record→window diff produces the right `createTab`/`closeTab`/navigation calls; the active tab's change is deferred; a deferred change is dropped when superseded.
- **Acceptance (two sync "devices" in one run, as the F27 scenarios do):** turning the switch on uploads Spaces and two "Work" stay two; a tab opened on A appears quiet in B's open Space; a tab closed on A lands in B's Recently closed and the synced band shows "Closed on A"; a navigation on A updates B's quiet tab and defers on B's active tab until a switch; cold start applies a deferred close; the library-full and Space-full states show and clear; turning the switch off keeps local copies and leaves A's library intact; an older Worker (404) shows "isn't available yet"; a fault-injected lost write converges on the next pass; the Other-devices drawer shows a shared tab once.
- **Crash and restart:** a merge applied, then SIGKILL before the next save: nothing is duplicated or lost on restart (the records and the window agree), using the harness's `crashAndRelaunch` from #1097.
- **Pseudo-locale sweep** over the new copy.

## 13. Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | 25 fixed slot stores on the Worker (§2.1), or one store per Space created on demand (a Worker route change and a list-by-prefix DELETE)? | **Fixed slots.** No Worker logic changes; the 25 cap already exists. |
| D2 | Which Spaces stay local when turning the switch on would pass 25 (§4.6)? | **The newest by `updatedAt` stay local**; the person is told which. |
| D3 | A Space over 500 tabs or 400 KiB at switch-on: join with what fits, or refuse to share that Space? | **Join with what fits**, naming the count left behind. |
| D4 | The active-tab protection on desktop: the active tab of each window showing the Space, or only of the focused window? | **Each window's active tab**, splits' visible panes included. |
| D5 | A remote tombstone for a tab with unsaved form input: close into Recently closed (the contract's §4.4), or also keep the live view parked for 30 s as a local close does? | **Park it like a local close.** It costs nothing extra and the dirty page is one ⌘⇧T away. |
| D6 | Recently closed items from other devices: 24 h and 25 per device as the contract says, shown inside desktop's existing band, or a separate "From other devices" band? | **Inside the band**, each row naming its device. |
| D7 | Renumbering positions (§3.4): allowed, or never? | **Allowed**, rare, documented. |
| D8 | Show a sync mark on shared Spaces in the Spaces menu? | **Yes**, a small glyph beside the name; the budget states hang off it. |
| D9 | The pairing question (§4.7): also asked when a desktop pairs, or only for a phone? | **Any new device.** |

## 14. Not in M16

- The phone's side (M17): the mark and menu, groups in the switcher, Bring a Space, the per-device switch on iOS.
- Presence ("open on another device"), per the contract's §4.5.
- Splits in shared Spaces (a split's tabs sync as plain tabs; the split itself stays local).
- Named profiles' Spaces.
- The authenticated v2 protocol, atomic writes and deletion fencing (CLAUDE.md: their own project).
- Any marketing claim before the release ships and its evidence exists (`docs/marketing-claims.md`).

## 15. Order of work

1. This document, reviewed and approved.
2. The plan (`superpowers:writing-plans`).
3. Worker `STORES` and README; owner deploys.
4. `shared-spaces-model.js` and `synced-closed-model.js` with their unit tests and vectors.
5. Desktop: stores, the adapter, the switch, the status lines, the pairing question; acceptance scenarios.
6. Security review (§11) and the F41 / parity / privacy updates.
7. The What's New page, then the feature release.
