# M16: Shared Spaces, groups and Recently closed — the desktop protocol

**Date:** 2026-10-25 (revised the same day after the owner's review of `e0ebe765`)
**Status:** proposed. The contract is `2026-10-24-ios-v1-companion-release-design.md` §4, §5 and §7 (merged in #1102, owner-decided 2026-10-24). This document chooses the mechanisms that contract left open. The owner has settled D1–D9 (§13); nothing here is built.
**Ships as:** a public desktop feature release (its own What's New page and the feature-release gates in CLAUDE.md) before Blanc for iPhone, so the protocol gets real use first (§4.7 of the contract). M17 (Spaces on iPhone) builds on it.
**Builds on:** Profile Sync (`2026-07-07-profile-sync-design.md`), Tab Sync (`2026-07-21-tab-sync-design.md`, F27), Send to device (`2026-10-24-ios-m7b-send-to-device-design.md`, the `sends` store), Blanc Spaces (F41), custom tab names (F46), Move to Space (#1097).
**Retires:** F41's "Spaces are device-local and profile-scoped; they never sync", when this ships.

## 1. What a person gets

With Profile Sync on, Settings → Sync gains a per-device switch, off by default, beside "Share this device's open tabs":

> **Keep Spaces and groups in sync on this device**
> Tabs in your shared Spaces are synced from this device. Shared Spaces are one library for your whole sync, not just one other device.

With it on, this device's Spaces join the account's one shared library. A Space is the same set of tabs, groups, pins, names and order on every device that has the switch on. Opening a shared Space on two devices at once is fine and is the point. Closing a tab in a shared Space closes it everywhere; the receiving device files it in its own Recently closed, which is synced too, so nothing is lost. Following a link in a shared tab updates the Space everywhere. The page the person is looking at is never changed under them: a remote close or navigation of that tab waits until they leave it, or until Blanc next starts cold.

With it off, nothing changes from today: Spaces are local, and other devices see this device's tabs read-only through Tab Sync, if that switch is on.

## 2. Decisions taken here

The contract fixes what; these are the hows, each with the reason. Where the owner's review (2026-10-25) changed the first draft, the row says so.

| # | Decision | Why |
|---|---|---|
| 2.1 | **One encrypted blob per Space, in a store named by the Space's immutable id** (`space-<32 hex>`), plus one `spaces` index blob. (Review: D1.) | 25 Spaces × 500 tabs can't fit one 512 KiB blob (§5). Fixed slots would let two offline devices allocate the same slot to different Spaces, and a freed slot could take a stale device's write for its replacement. A small Worker route change buys a protocol with no allocation at all. |
| 2.2 | **The library holds at most 25 Spaces per account**, desktop's existing cap, as a product limit enforced at creation, never by dropping. | One budget everywhere. Concurrent creation can pass it transiently (§3.7). |
| 2.3 | **Records, not captures.** Each Space, group and tab is its own record with an id, per-field clocks and a tombstone; order is a position string per item. (Review: per-field clocks, correction 3.) | The contract's §4.3. One clock per tab record would let a navigation on one device and a pin on another overwrite each other. |
| 2.4 | **A shared Space's tabs get stable ids** that the local capture carries in a new `tabIds` column of `workspaces.json`. | The F27 entry has no tab ids and is frozen; the capture is Blanc's own file and may grow a column. |
| 2.5 | **Budgets are measured on the serialized encrypted payload**, with a 320 KiB plaintext guide. **Over budget is refused at the edge, loudly:** a Space that won't fit stops accepting new shared tabs on this device, says so, and the last good record stays. An oversized Space is not shared at all until it fits (D3). (Review: correction 1.) | Base64 inflates plaintext by a third: 400 KiB of plaintext is a 546,156-byte blob, over the Worker's 524,288. The contract requires over-budget behaviour that is never silent; a Space that quietly differs across devices breaks "the same set of tabs". |
| 2.6 | **A pass fetches the index first and only the Space blobs it says changed**, at most eight per pass, with the index carrying a per-Space change clock. (Review: correction 2.) | 33 stores against the Worker's 30 GETs per account per minute would starve one device, let alone two. |
| 2.7 | **Remote changes are applied to a live Space by diffing records against a per-window applied baseline**, through the same `closeTab`, `createTab` and navigation paths a local action uses, with a deferred queue per window for protected active tabs. Local autosave diffs the window against that baseline, never against the merged records. (Review: correction 4.) | Reuses Recently closed, Quiet Tabs and the set-aside machinery; and a deferred, still-displayed stale tab must never be republished as a local edit or a resurrection. |
| 2.8 | **Local edits stay pending until a fetched blob contains them**, and are replayed on every push until then. The design claims that, not recovery from a lost write in general. (Review: correction 3.) | The Worker's writes are not atomic (R5). Per-field clocks let a replay win cleanly; nothing stronger is true. |
| 2.9 | **Synced Recently closed is a per-device store, `closed`**, in the `sends` shape (one writer per entry). | The contract's §5; no merge conflicts by construction. |
| 2.10 | **Other-devices dedupe uses a `shared` sidecar bound to one F27 snapshot by its clock and listing tab occurrences by index**; a missing, stale or oversized sidecar leaves every tab visible. (Review: correction 5.) | The contract forbids a new field in the F27 entry and asks for "shown once"; a URL match would hide an unrelated tab with the same address. |
| 2.11 | **Turning the switch off keeps the records in the library** (the contract's §4.2), publishes nothing further, never retracts, and keeps a dormant link so turning it on again **rejoins** those Spaces by default rather than copying them. (Review: correction 6.) | Other devices keep the Space; an ordinary off/on cycle must not double the library. |
| 2.12 | **The Worker stays v1** with one route change (the `space-<id>` store pattern and a prefix-listing account DELETE); owner deploys before any client that needs it. | The authenticated v2 protocol is its own project (CLAUDE.md). R3 and R5 stay open and are stated, not fixed (§11). |

## 3. The library, as records

All plaintext below sits inside the usual AES-GCM envelope (`sync-crypto.js`: `{v, iv, ct, tag}`, base64); the Worker sees only ciphertext.

### 3.1 The `spaces` index

One blob, the directory of the library:

```
{ "v": 1,
  "spaces": {
    "<spaceId>": {
      "name":   { "v": "Work",     "c": 1800000000000, "by": "<deviceId>" },
      "color":  { "v": "#426c4c",  "c": …, "by": … },
      "symbol": { "v": "briefcase","c": …, "by": … },
      "pos":    { "v": "a0k",      "c": …, "by": … },          // order among Spaces (§3.4)
      "createdAt": 1800000000000, "createdBy": "<deviceId>",
      "tabsClock": 1800000123456,   // the newest record clock in the Space's blob (§6)
      "deletedAt": null             // a tombstone when set (§3.5): { "c": …, "by": … }
    } } }
```

- `spaceId` is 32 lowercase hex characters (a UUID without hyphens), fresh when a Space joins the library. A local Space's id is never reused as the shared id.
- Name ≤60 (desktop's cap), colour `#rrggbb`, symbol one of the sixteen; invalid values are repaired as `workspaces-model.js` already does, never rejected.
- `tabsClock` is bumped by any device that writes the Space's blob, to the newest clock in it, so a reader knows from the index alone whether it needs the blob (§6).
- A deleted Space keeps its index entry as a tombstone for 30 days (§3.5).

### 3.2 One Space, one blob: store `space-<spaceId>`

```
{ "v": 1, "spaceId": "<spaceId>",
  "groups": {
    "<groupId>": {
      "name":      { "v": "Reading", "c": …, "by": … },
      "color":     { "v": null,      "c": …, "by": … },
      "collapsed": { "v": false,     "c": …, "by": … },
      "pos":       { "v": "b",       "c": …, "by": … },
      "deletedAt": null } },
  "tabs": {
    "<tabId>": {
      "nav":     { "v": { "url": "https://…", "title": "…" }, "c": …, "by": … },
      "name":    { "v": null | "Custom name",  "c": …, "by": … },   // F46, ≤100
      "pinned":  { "v": false,  "c": …, "by": … },
      "groupId": { "v": "<groupId>" | null, "c": …, "by": … },
      "pos":     { "v": "c2",   "c": …, "by": … },
      "deletedAt": null } },
  "active": { "v": "<tabId>", "c": …, "by": … }                   // the saved selection
}
```

- Each field carries its own clock `c` (ms since the epoch, the writer's clock) and writer `by`. URL and title change together on a navigation, so they share `nav`. A pin on one device and a navigation on another therefore both survive.
- Tabs: http(s) only, URL ≤2048 and title ≤200 UTF-16 units (Tab Sync's limits; `sanitizeTab`). `name` is the person's custom tab name (F46, `normalizeTabName`, ≤100), null when the page's title is used; the phone shows it as desktop does. `blanc://` pages, `file://` pages, private tabs, splits and page state never enter a record. The error page records its real destination (`persistableUrl`), as the capture does.
- Groups keep desktop's rules: a name kept in the case typed and matched without regard to case within a Space, an optional preset colour.
- At most **500 tabs** in a Space (the Tab Sync bound) and the byte budget of §5.

### 3.3 Merge rule

Per field: the higher clock wins; on a tie, the lexicographically smaller `by`; on a tie of both (one device wrote the same field twice in one millisecond, or a replay), the lexicographically smaller canonical value. Per record: `deletedAt` is a field like the others, so a tombstone wins over an older edit and loses to a newer one. Per blob: the union of records by id. Every rule is deterministic, so two devices merging the same two blobs in either order agree.

Clock skew between devices makes "last writer" approximate. This is accepted, as it is for Favorites; the merge never loses a record, only the older of two concurrent edits to the same field.

### 3.4 Order as positions

`pos` is a string over the alphabet `0-9a-z`, compared lexicographically, with no trailing `0` (so every position has a successor and a predecessor):

- **Append** after the last item `p`: if `p`'s last character is below `z`, increment it; otherwise append `1`.
- **Prepend** before the first item `p`: the largest string shorter than or equal in length that is less than `p` (decrement the last character; if it is `1`, append… the standard fractional-indexing midpoint rules, written out in `shared-spaces-model.js` with vectors).
- **Insert between** `a` and `b`: the shortest string strictly between them (the midpoint of their first differing character; if they are adjacent characters, extend with the midpoint of the alphabet).

Two items with equal `pos` (two devices inserting into the same gap at once) order by id. There is **no renumbering in M16** (D7): a device cannot know that another has no offline edits, and rewriting every position and clock could overwrite a concurrent reorder. Positions grow by at most one character per insertion into the same gap, so 500 insertions into one gap are 500 characters at worst; that is far from the budget and acceptable. Compaction is a later protocol with its own safety argument.

### 3.5 Tombstones

Removing a Space, group or tab sets `deletedAt` with a clock. A tombstone is dropped **30 days** after `deletedAt` by every writer. A device offline for more than 30 days may resurrect a deleted tab from its stale copy; the same bounded risk Favorites accept.

A tab whose `groupId` names a tombstoned group is shown ungrouped; if a newer edit later revives the group (its tombstone loses), the tab returns to it. A tab moved into a group on one device while the group is deleted on another resolves the same way, by the clocks of the two fields, with no special case.

### 3.6 Who writes what, and in what order

- Any device with the switch on may write any record. A device bumps a clock only on a field it changed; it never rewrites another device's unchanged field with a newer clock.
- **Write order:** the Space blob first, then the index. A blob with no index entry is unreachable but harmless (the creating device retries the index on its next pass). An index entry whose blob is missing is shown as an empty Space until the blob arrives, never deleted by a reader; the writing device retries the blob on its next pass. Both retries come from the pending set (§3.8).
- Every write is read-merge-write with the Worker's `ifVersion`. On 409 the device merges the newer blob and retries, as `syncOne` already does (three attempts).

### 3.7 The 25-Space cap

A device refuses to create or share a 26th Space while its merged index holds 25 live Spaces, with the reason shown (§5). Two devices creating at once can still pass 25; nothing is dropped. The Spaces menu then shows "26 of 25 Spaces are shared" and offers to delete or unshare one; all 26 keep syncing meanwhile.

### 3.8 Pending edits, and what "saved" means

Each device keeps, per Space in `shared-spaces.json`, a **pending set**: the fields it changed, with their clocks, that it has not yet seen in a fetched blob. A push merges the pending set into the latest fetched blob and PUTs. A field leaves the pending set only when a fetched blob contains it with that clock or a newer one. Until then it is replayed on every push.

What this gives: a PUT the Worker lost to a racing writer (R5) is replayed on the next pass, and per-field clocks let the replay win over the racing writer's older values for the same fields. What it does not give: recovery of a field the Worker lost after the device had seen it stored and cleared it from the pending set, nor recovery for a device that is wiped or whose `shared-spaces.json` is lost. The Worker's own statement stands: reconciliation does not guarantee recovery. The settings status shows "Waiting to upload" while a pending set is non-empty, and "Not synced since {time}" when pushes have failed for more than an hour.

## 4. From the record to the window and back

### 4.1 Local state

- `workspaces.json` stays the device's projection of each Space: the columns it has today plus three new ones for shared Spaces: `sharedId` (the library's spaceId), `tabIds` (parallel to `urls`) and `sharedLink` (`active` or `dormant`, §4.6). Unshared Spaces carry none. An older build ignores all three.
- A new profile-scoped `shared-spaces.json` holds, bound to the sync `accountId` (the `rebind` guard every sync store has): the last merged index and Space blobs; per Space the pending set (§3.8); per window the applied baseline and the deferred queue (§4.3–4.4).
- Only the Personal profile syncs, as all of Profile Sync does. Named profiles' Spaces stay local.

### 4.2 Local change → record

The autosave that already runs on every tab broadcast (`autosaveWorkspaceBindings`) also, for a shared Space, diffs the window's tabs **against the window's applied baseline** (§4.3) by `tabId`:

- a tab with no id is new: fresh id, `pos` after its neighbour, every field clocked now;
- a tab whose URL or title changed: a `nav` edit; a pin, name, group or position change: that field's edit;
- a tab no longer present: a tombstone;
- groups and Space identity likewise.

Each edit goes into the pending set and into the baseline. The Space blob uploads on Tab Sync's debounce (15 s, 60 s at most) and at once on close of the Space's last window, quit or switch. The index uploads with it when Space identity or `tabsClock` changed.

### 4.3 Record → live window, and the applied baseline

Each window showing a shared Space (a shown window or a set-aside runtime) keeps an **applied baseline**: the record set as last applied to that window. When a merge changes a Space, main applies the difference between the baseline and the merged records to the runtime, through the ordinary paths, in one synchronous pass, and advances the baseline:

| Change | Applied as |
|---|---|
| New tab record | `createTab(url, { asleep: true, groupId, pinned, customTitle })` at its position, quiet until selected. `tabOrder` and groups are renormalized (`syncTabLayout`). |
| Tab tombstone | `closeTab(id)` with recording on, so the tab lands in this window's Recently closed exactly as a local close does: the live view is parked for the usual period, then the snapshot tier, then URL and title (D5). The dirty-form probe does not run. |
| `nav` change | A main-frame navigation of the live tab (`navigateTabToAddress`), or just the record for a quiet tab (it loads the new URL when woken). |
| Name, pin, group, position | Applied to the tab record and layout; no page is touched. |
| Group tombstone | Members show ungrouped (§3.5). |
| Space tombstone | The window leaves the Space (as Delete does today, into Recently deleted locally, 7 days) and keeps its tabs as an unsaved window; a set-aside runtime is disposed. |
| Space renamed, recoloured, reordered | The mark and the Spaces menu update; no tabs are touched. |

Changes main applies this way mark the affected tabs as **applied** for the duration of the pass, so the broadcast they cause produces no local edit (no echo). The autosave in §4.2 diffs against the baseline, so a tab the window still shows at an old URL because its change is deferred (§4.4) is already at the new URL in the baseline and is never republished as a navigation back; a tab whose close is deferred is already a tombstone in the baseline and is never resurrected as new. An unrelated local change in the same window (closing another tab, say) diffs cleanly against the same baseline; the acceptance tests include exactly that case.

A set-aside Space takes every change at once; nothing is on screen there.

### 4.4 The protected active tab

The tab the person is looking at is the active tab of **each window** showing the Space, whether or not the window has keyboard focus, and every visible pane of a split in it (D4). A tombstone or `nav` change for such a tab is **deferred**: it goes into the window's deferred queue in `shared-spaces.json` and is applied when the tab stops being active (a tab switch, closing the tab themselves, the window closing or leaving the Space) or at the next cold start, whichever first. A deferred change is dropped if a newer record supersedes it, and the baseline already reflects the record (§4.3), so nothing stale is ever published from the queue. The queue is per window and never synced.

A deferred navigation keeps the person's page; when applied, the tab loads the newer URL. A deferred close files the page in Recently closed with the live view parked as a local close would (D5). Both are visible when they happen because the person has just left the tab.

### 4.5 Which device has a Space open

Stays per device (contract §4.5). The library records no presence. "A Space is in at most one window at a time" remains desktop's local rule.

### 4.6 Switching the switch

- **On, the first time:** a sheet lists this device's Personal Spaces with their tab counts and the library's remaining room (25 minus the Spaces already there). Every Space that fits the 500-tab and byte limits is ticked by default; the person unticks any they want to keep local (D2). An oversized Space is listed unticked and greyed with the reason, and the sheet offers to split it (D3): it stays local until it fits. Confirming uploads the ticked Spaces as new library Spaces (fresh `spaceId`s and `tabId`s). Two devices that each had "Work" end up with two "Work" Spaces (contract §4.2). If the ticked set would pass 25, the sheet says so and asks for fewer.
- **Off:** the device keeps its current copies as local Spaces and publishes nothing further. Nothing is deleted anywhere, and nothing is retracted (contract §4.2; the settings text says so). The copies keep a **dormant link** (`sharedLink: dormant`, with `sharedId` and `tabIds`) and stop being diffed; the pending set is kept.
- **On again:** for each dormant Space the sheet shows the library's state: **Rejoin** (the default, when the library still has that Space and it isn't tombstoned: the local copy's changes since the switch went off are merged as records with their clocks, the pending set included) or **Add as a copy** (a new Space; the only choice when the library's Space was deleted). So an ordinary off/on cycle changes nothing in the library.
- **Sync off or account switch:** `shared-spaces.json` is cleared as `tab-sync.json` is; Spaces revert to local copies with no link.

### 4.7 Pairing

After a desktop with the switch **off** that showed a pairing code sees a new device's entry arrive (in `session` or `sends`, the devices Send to device already discovers), it asks once, in Settings → Sync and as a start-page notice, using the device's published name: **"{Device} joined. Keep Spaces and groups in sync with it?"** followed by one line, "This shares your Spaces with every device in this sync that has the switch on," with **Turn on** and **Not now**. Turn on opens the §4.6 sheet. The question is asked once per paired device, for any kind of device (D9), and never again after Not now; a desktop whose switch is already on is never asked.

## 5. Budgets, and what happens over them

Numbers: a tab record with per-field clocks is 250–450 bytes typical (UUID, URL, title, five clocks and writers, position), about 2.9 KiB worst (a 2048-unit URL and a 200-unit title in a 3-byte script, a 100-unit name). A Space of 500 typical tabs is roughly 150–220 KiB of plaintext; of 500 worst-case tabs about 1.4 MiB. The encrypted envelope is base64, so a blob is about 4/3 of its plaintext plus a few dozen bytes: 320 KiB of plaintext is a 436,928-byte blob, under the Worker's 524,288-byte cap with room to spare; 400 KiB would be 546,156 bytes, over it.

Rules:

1. **Every PUT is checked on the serialized encrypted payload**, `JSON.stringify({ ifVersion, blob })` in UTF-8 bytes, against the Worker's 524,288-byte blob cap less a 4 KiB margin. The 320 KiB plaintext figure (Tab Sync's `BUDGET_BYTES`) is the guide a device uses to decide *before* making a change whether it will fit; the encrypted check is the gate.
2. **A Space blob over the budget on this device's own write refuses the sync of the change, not the change.** A tab opened past the budget opens in the window as usual, marked "not synced" (a quiet dot on its row with the accessible text "Not synced: this Space is full"), and the Spaces menu's status line reads "This Space is full for sync: {count} tabs stay on this device." Nothing already shared is dropped. The budget counts everything in the blob: live records, **tombstones** (a closed tab frees its bytes only when its tombstone expires after 30 days, so closing tabs does not make room at once; the status line says so when that is the case), navigation edits (a longer URL can push a full Space over; that navigation is then the unsynced change, and the tab shows the dot) and other devices' concurrent additions (a blob that arrives already over budget is merged and shown in full; this device just can't add to it).
3. **500 tabs per Space,** the same way.
4. **25 Spaces per library** (§3.7).
5. **An oversized Space is not shared** (D3): at switch-on, or when a local Space is later moved into the library, a Space over either limit stays local with the reason and an offer to split it.
6. **Index blob: 64 KiB** of plaintext. 25 entries are a few KiB; it cannot be exceeded within rule 4.
7. **`closed` store: 64 KiB**, `sends`' rule: the stalest other devices' entries are dropped first, never this device's.
8. **`shared` sidecar: 64 KiB.** Over it, this device omits its own entry (its tabs then show under the device, which is correct, only not deduplicated); a receiver drops any device's entry it can't parse. Indices are small (500 integers ≈ 2 KiB), so this is a guard, not an expected state.

Never silent: every refusal above shows in the Spaces menu beside the Space, with accessible text, and Settings → Sync's status line names the Spaces affected. Nothing is ever trimmed from a record that another device wrote.

## 6. Fetching within the rate limit

The Worker allows 30 GETs per account per minute, shared by every device on the account, and 120 requests per client IP. With one store per Space the account can hold up to 33 stores, so a pass must not fetch them all.

- A pass fetches the **index first** (one GET), then only the Space blobs whose `tabsClock` is newer than the device's merged copy, **at most eight per pass**, newest-changed first, plus any Space this device has a pending set for (so a push always merges against the latest). Blobs left over wait for the next pass.
- Passes keep Profile Sync's existing cadence (the 4 s coalescing schedule, the focus refresh, Tab Sync's 15 s/60 s debounce) with one addition: a device never starts a full pass less than 60 s after its previous one, except the focus refresh, which is index-only unless the index shows a change.
- A 429 backs off that pass for 60 s and halves the next pass's blob cap, recovering one per clean pass. The status line shows "Sync is busy; retrying" after two consecutive 429s.
- Worst case, two desktops each fetching index plus eight blobs every minute is 18 GETs, under the limit; a third device degrades to backoff, not failure.

## 7. Recently closed, synced (`closed` store)

Per device, one writer per entry, the `sends` shape:

```
{ "devices": { "<deviceId>": {
    "name": "MacBook Pro", "platform": "darwin", "updatedAt": …,
    "items": [ { "id": "<uuid>", "url": "https://…", "title": "…",
                 "closedAt": …, "spaceId": "<spaceId>" | null } ] } } }
```

- A device adds an item when it closes a tab itself or applies a remote tombstone (§4.3): http(s) only, title and URL only, never page state, never a private tab. **24 hours and 25 items per device** (contract §5), newest kept; entries not updated for 30 days are pruned; a daily heartbeat keeps live devices present.
- Every device shows **one** Recently closed band (D6), newest first across devices: this device's own entries as today, with their held-view and snapshot tiers, each shown once (an own close is never also listed from the synced copy), and other devices' rows labelled "Closed on {device}". Reopening a remote row opens the page as a new local tab. Forget hides the row on this device (a local `dismissed` map, `sends`' pattern). Clear all clears this device's own entry and hides every remote row. The band's copy never claims a remote row restores form contents; only a locally parked view can.
- Leaving the sync publishes a retraction, as `sends` does.

## 8. Other devices, shown once (`shared` sidecar)

A device with the switch on also publishes, in a small optional store:

```
{ "devices": { "<deviceId>": {
    "forUpdatedAt": 1800000000000,          // the F27 session entry this describes
    "tabs": [ { "i": 4, "spaceId": "<spaceId>" }, { "i": 5, "spaceId": "<spaceId>" } ] } } }
```

`forUpdatedAt` is the `updatedAt` of the device's own F27 `session` entry as published in the same pass, and `i` is the index into that entry's `tabs` array of each tab that sits in a shared Space. A receiver applies a device's sidecar entry **only when `forUpdatedAt` equals the `updatedAt` of the F27 entry it holds for that device** and it can see `spaceId` (its own switch on and the Space in its merged index); then it hides exactly those occurrences from the device's section in Other devices, the Quick Switcher and the start page, and the tabs appear under the Space instead. A sidecar that is missing, stale (clocks differ because one store arrived before the other), oversized or unparseable leaves every tab visible; the next pass catches up. The F27 `session` entry is unchanged. An unrelated tab with the same URL is never hidden.

## 9. The Worker

Changes to `cloudflare/sync-worker/src/index.js`:

- The store segment of `/v1/blob/:accountId/:store` accepts `[a-z]+` or `space-[0-9a-f]{32}`. Fixed names added to `STORES`: `spaces`, `closed`, `shared`.
- Account-wide DELETE lists `blob:<accountId>:` by prefix (`listNames` already exists for the cleanup) and deletes every key, so Space blobs are wiped with the rest.
- The daily cleanup is unchanged: it already lists `blob:` by prefix.
- Blob cap, rate limits, markers and the daily new-account budget are unchanged. The README's API section documents the pattern and the three names.

**Deploy before any client release that offers the switch**; a client meeting an older Worker gets `404 unknown store` and says "Spaces sync isn't available yet" in Settings, as Send to device does. Deploying is the owner's action. An account can now hold up to 33 blobs instead of 5; the storage budget design's cost bound (§7 there) is recomputed in the plan with real per-account averages, which are far below the cap.

## 10. The client

Added to `sync.js`'s `STORES` table the way `sends` was, each `optional: true` with `hasPublishableContent` so a presence-only write never creates a store in KV's missing-read window. Space stores are dynamic, so the table gains one entry kind that expands from the merged index at pass time (§6):

- `spaces` and each `space-<id>`: `export`, `merge` and `equals` from a new `src/main/shared-spaces.js` (orchestration, `JsonStore`) over a pure `src/main/shared-spaces-model.js` (records, per-field merge, positions, budgets, the pending set, the fetch plan; no electron; unit-tested, and the vectors the iOS port will check against).
- `closed`: `src/main/synced-closed.js` over `synced-closed-model.js`, modelled on `sends`.
- `shared`: in `shared-spaces.js`.

`main.js` gains the record↔window adapter with its baselines and deferred queues (§4.2–4.4) beside the existing Space machinery (`workspaceCapture`, `applyWorkspaceToWindow`, `makeResidentRuntime`), the switch, the §4.6 sheet, the pairing question and the status lines. The Spaces menu shows a sync mark on shared Spaces (D8) whose accessible text names the state: "Shared", "Waiting to upload", "Not synced since {time}", "Full for sync", "Spaces sync isn't available"; a glyph alone never stands for a state.

## 11. Interface text

New `copy/messages` keys, all six languages in the same PR: the switch and its two lines; the §4.6 sheet (its title, the room line, Rejoin and Add as a copy, the oversized reason and "Split this Space…"); the five sync-mark states; "This Space is full for sync: {count} tabs stay on this device" and its tombstone variant ("Closed tabs free their room after 30 days"); "{count} of 25 Spaces are shared"; "Sync is busy; retrying"; "Spaces sync isn't available yet"; the pairing question, its line and two buttons; "Closed on {device}"; the settings note that turning the switch off keeps shared copies on other devices. F41's spec line is replaced; `spec/features.md`, `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17) and the privacy label ("Spaces and groups: synced when you turn it on, end to end encrypted") are updated in the shipping PR.

## 12. Security and privacy (R3, R5)

- **What travels:** Space names, colours, symbols, order; tab URLs, titles, custom names, pins, groups and order; Recently closed URLs and titles; device names. Never private tabs, page state, snapshots, splits, favicons' sources (icons go through their own sidecar), `blanc://` or `file://` pages, or anything from a named profile.
- **Consent:** the switch is its own consent (contract §4.2), independent of "Share this device's open tabs". Off by default; an update never turns it on. The pairing question is a Turn on button that opens the sheet, not a default.
- **R3 (the locator is a bearer capability):** unchanged and still open. Shared Spaces add nothing to its exposure beyond more ciphertext under the same locator; the v1 size and rate limits are unchanged. Said plainly in the privacy page and the release notes: no claim of authentication.
- **R5 (non-atomic KV):** unchanged and still open. The design claims only §3.8: pending edits are replayed until a fetched blob contains them, and per-field clocks let a replay win. A write the Worker lost after the device saw it stored, or a device that lost its local state, is not recovered, and a delete racing a write can resurrect a record until the next pass. The design never claims convergence stronger than that; the test plan (§13) includes the replay and the unrecoverable case, so the limitation is tested, not assumed.
- **Threats this adds:** a malicious or buggy device in the account can delete or rewrite every shared Space (as it can every Favorite today). Recently closed and the 30-day tombstones bound the loss; Recently deleted keeps a deleted Space for 7 days locally. A remote navigation could point a shared tab at a hostile page; it loads only when the person comes to that tab (§4.4), under the same navigation guards as a typed address (`handOffToOs`, `isForbiddenTopLevelUrl`, the blocker). Records are sanitized on merge like F27 entries, so a junk blob never reaches a renderer.
- **`docs/security-assessment.md`** gets a row for shared Spaces under the Profile Sync entry, and the release's security review signs it.

## 13. Testing

- **Unit (pure model):** per-field merge is commutative, associative and idempotent; tombstone vs edit in both orders; group tombstone racing a tab move; position insertion, append, prepend and equal-position tie by id, with vectors; byte budget measured on the encrypted payload, with a 400 KiB plaintext refused and 320 KiB accepted; tombstones counted in the budget; 25-Space and 500-tab caps and the transient 26; sanitization of junk; the pending-set replay (two devices PUT the same Space from the same version; the loser's next pass replays its pending fields and both converge) and the documented unrecoverable case (a field cleared from the pending set then lost upstream stays lost, and the test asserts that, so the claim stays honest); the fetch plan (index first, at most eight changed blobs, pending Spaces always included). Vectors generated for the iOS port, as `sends-model` has.
- **Unit (adapter, lifted source like `tab-context-glance-availability.test.js`):** record→window diff produces the right `createTab`/`closeTab`/navigation calls; the active tab's change is deferred for every window and visible pane; a deferred change is dropped when superseded; **an unrelated local close while a remote close is deferred publishes only the local close** and neither resurrects nor re-navigates the deferred tab; an applied change produces no echo edit.
- **Acceptance (two sync "devices" in one run, as the F27 scenarios do):** the switch-on sheet lists Spaces with room and refuses an oversized one; two "Work" stay two; a tab opened on A appears quiet in B's open Space; a tab closed on A lands in B's Recently closed with its live view parked, and the band shows "Closed on A" once; a navigation on A updates B's quiet tab and defers on B's active tab (in an unfocused window too) until a switch; cold start applies a deferred close; the Space-full state shows, names the tombstone case, and clears; turning the switch off keeps local copies, leaves A's library intact, and turning it on again rejoins without duplicating; an older Worker (404) shows "isn't available yet"; a 429 backs off and recovers; the Other-devices drawer shows a shared tab once and a same-URL unshared tab still; a stale sidecar leaves tabs visible.
- **Crash and restart:** a merge applied, then SIGKILL before the next save: records, baseline and window agree on restart and nothing is duplicated or lost; a crash between the blob write and the index write leaves a reachable or retried Space, never a half one (the harness's `crashAndRelaunch` from #1097).
- **Pseudo-locale sweep** over the new copy.

## 14. Decisions (owner, 2026-10-25)

| # | Question | Decision |
|---|---|---|
| D1 | Fixed slot stores, or one store per Space? | **One store per Space, named by its immutable id** (§2.1, §9). |
| D2 | Which Spaces stay local when the library can't take them all? | **The person chooses** in the switch-on sheet, with the room shown (§4.6). |
| D3 | An oversized Space at switch-on: join with what fits, or refuse? | **Refuse until it fits**, with the reason and an offer to split (§5). |
| D4 | Protect the active tab of every window, or only the focused one? | **Every window**, every visible split pane (§4.4). |
| D5 | A remotely closed tab: Recently closed only, or park the live view like a local close? | **Park it like a local close** (§4.3); never describe URL and title as preserving form contents. |
| D6 | One Recently closed band or a separate one? | **One band**, newest first, remote rows labelled, own closes shown once (§7). |
| D7 | Position renumbering? | **None in M16**; a specified fractional algorithm with deterministic ties (§3.4). |
| D8 | A sync mark on shared Spaces? | **Yes, with accessible text per state**; a glyph never implies a failed upload succeeded (§10). |
| D9 | Ask the pairing question for any new device? | **Any new device, while this device's switch is off**, by its name, once, saying the library is account-wide (§4.7). |

## 15. Not in M16

- The phone's side (M17): the mark and menu, groups in the switcher, Bring a Space, the per-device switch on iOS.
- Presence ("open on another device"), per the contract's §4.5.
- Splits in shared Spaces (a split's tabs sync as plain tabs; the split itself stays local).
- Position compaction (D7).
- Named profiles' Spaces.
- The authenticated v2 protocol, atomic writes and deletion fencing (CLAUDE.md: their own project).
- Any marketing claim before the release ships and its evidence exists (`docs/marketing-claims.md`).

## 16. Order of work

1. This document, reviewed and approved.
2. The plan (`superpowers:writing-plans`).
3. Worker route and `STORES`, README; owner deploys.
4. `shared-spaces-model.js` and `synced-closed-model.js` with their unit tests and vectors.
5. Desktop: stores, the adapter with baselines and deferred queues, the switch and its sheet, the status lines, the pairing question; acceptance scenarios.
6. Security review (§12) and the F41 / parity / privacy updates.
7. The What's New page, then the feature release.
