# M16: Shared Spaces, groups and Recently closed — the desktop protocol

**Date:** 2026-10-25 (third revision, after the owner's reviews of `e0ebe765` and `ea5b1f22`)
**Status:** proposed. The contract is `2026-10-24-ios-v1-companion-release-design.md` §4, §5 and §7 (merged in #1102, owner-decided 2026-10-24). This document chooses the mechanisms that contract left open. The owner has settled D1–D9 (§14); nothing here is built.
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

The contract fixes what; these are the hows, each with the reason.

| # | Decision | Why |
|---|---|---|
| 2.1 | **One encrypted blob per Space, in a store named by the Space's immutable id** (`space-<32 hex>`), plus one `spaces` index blob (D1). | 25 Spaces × 500 tabs can't fit one 512 KiB blob (§5). Fixed slots would let two offline devices allocate the same slot to different Spaces, and a freed slot could take a stale device's write for its replacement. A small Worker route change buys a protocol with no allocation at all. |
| 2.2 | **The library holds at most 25 Spaces per account**, desktop's existing cap, as a product limit enforced at creation, never by dropping. | One budget everywhere. Concurrent creation can pass it transiently (§3.7). |
| 2.3 | **Records, not captures.** Each Space, group and tab is its own record with an id, per-field clocks and a final tombstone; order is a position string per item from a fully specified algorithm (§3.4). | The contract's §4.3. One clock per tab record would let a navigation on one device and a pin on another overwrite each other. |
| 2.4 | **A shared Space's tabs get stable ids** that the local capture carries in a new `tabIds` column of `workspaces.json`. | The F27 entry has no tab ids and is frozen; the capture is Blanc's own file and may grow a column. |
| 2.5 | **Budgets are measured on the serialized encrypted blob** against the Worker's 524,288-byte cap, with 320 KiB of plaintext as the planning guide. **Over budget is refused at the edge, loudly;** an oversized Space is not shared until it fits (D3). | `encrypt()`'s base64 envelope makes 400 KiB of plaintext a 546,208-byte blob; 320 KiB is 436,980 (§5). The contract requires over-budget behaviour that is never silent; a Space that quietly differs across devices breaks "the same set of tabs". |
| 2.6 | **One bounded scheduler for every GET**: a fixed per-pass budget covers the fixed stores, the index and Space blobs, with fair rotation; the index carries a **content revision** per Space as a hint, and periodic reconciliation fetches blobs the hint missed (§6). | 30 GETs per account per minute, shared by every device. A clock maximum cannot detect every change; blob and index writes are not atomic. |
| 2.7 | **Two baselines per window**: the **displayed** baseline (what the window shows) that local autosave diffs against, and an **accepted** set of remote targets waiting on the protected active tab. The displayed baseline advances only when a deferred change actually applies (§4.3–4.4). | Advancing one baseline to the remote target while the window still shows the old page would read as a local navigation back, the bug the first drafts recreated. |
| 2.8 | **Local edits stay pending until a fetched blob contains them**, and are replayed on every push until then. The design claims that, not recovery from a lost write in general (§3.8). | The Worker's writes are not atomic (R5). Per-field clocks let a replay win cleanly; nothing stronger is true. |
| 2.9 | **Tombstones are final.** A deleted record's id is retired; nothing revives it, and a reopened page is a new record. A device whose last merge is older than the tombstone retention treats its own copy as stale (§3.5). | Deterministic on every replica, and it removes the two resurrection paths (a concurrent edit, a long-offline copy). |
| 2.10 | **A dormant (switched-off) Space keeps maintaining its records locally**, with real clocks, and publishes nothing; **Rejoin** resumes publishing by an ordinary merge (§4.6). | An off/on cycle must not double the library, and offline edits must carry the clocks they were made with, not a fresh stamp over the whole snapshot. |
| 2.11 | **Synced Recently closed is a per-device store, `closed`**, in the `sends` shape (one writer per entry). | The contract's §5; no merge conflicts by construction. |
| 2.12 | **Other-devices dedupe uses a `shared` sidecar bound to one F27 snapshot by its clock and listing tab occurrences by index**; a missing, stale or oversized sidecar leaves every tab visible (§8). | The contract forbids a new field in the F27 entry and asks for "shown once"; a URL match would hide an unrelated tab with the same address. |
| 2.13 | **The Worker stays v1** with one route change (the `space-<id>` store pattern and a prefix-listing account DELETE); owner deploys before any client that needs it (§9). | The authenticated v2 protocol is its own project (CLAUDE.md). R3 and R5 stay open and are stated, not fixed (§12). |

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
      "pos":    { "v": "i",        "c": …, "by": … },          // order among Spaces (§3.4)
      "createdAt": 1800000000000, "createdBy": "<deviceId>",
      "rev": "9f2a…",               // content revision of the Space's blob (§6.1), a hint
      "deleted": { "v": false, "c": …, "by": … }               // the tombstone field (§3.5)
    } } }
```

- `spaceId` is 32 lowercase hex characters (a UUID without hyphens), fresh when a Space joins the library. A local Space's id is never reused as the shared id.
- Name ≤60 (desktop's cap), colour `#rrggbb`, symbol one of the sixteen; invalid values are repaired as `workspaces-model.js` already does, never rejected.
- `rev` is the content revision of the Space blob as last written by the device that wrote it (§6.1). It is a hint for fetching, never the only reason to fetch.
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
      "deleted":   { "v": false,     "c": …, "by": … } } },
  "tabs": {
    "<tabId>": {
      "nav":     { "v": { "url": "https://…", "title": "…" }, "c": …, "by": … },
      "name":    { "v": null | "Custom name",  "c": …, "by": … },   // F46, ≤100
      "pinned":  { "v": false,  "c": …, "by": … },
      "groupId": { "v": "<groupId>" | null, "c": …, "by": … },
      "pos":     { "v": "c2",   "c": …, "by": … },
      "deleted": { "v": false,  "c": …, "by": … } } },
  "active": { "v": "<tabId>", "c": …, "by": … }                   // the saved selection
}
```

- Each field carries its own clock `c` (ms since the epoch, the writer's clock) and writer `by`. URL and title change together on a navigation, so they share `nav`. A pin on one device and a navigation on another therefore both survive.
- Tabs: http(s) only, URL ≤2048 and title ≤200 UTF-16 units (Tab Sync's limits; `sanitizeTab`). `name` is the person's custom tab name (F46, `normalizeTabName`, ≤100), null when the page's title is used; the phone shows it as desktop does. `blanc://` pages, `file://` pages, private tabs, splits and page state never enter a record. The error page records its real destination (`persistableUrl`), as the capture does.
- Groups keep desktop's rules: a name kept in the case typed and matched without regard to case within a Space, an optional preset colour.
- At most **500 live tabs** in a Space (the Tab Sync bound) and the byte budget of §5.

### 3.3 Merge rule

Per field: the higher clock `c` wins; on a tie, the lexicographically smaller `by`; on a tie of both (the same device wrote the same field twice in one millisecond, or a replay), the lexicographically smaller canonical value (`canonical` from `tabsync-model.js`). Per record: the union of its fields, each merged by that rule; a record's existence is the union too, so a record present on either side is present after the merge. Per blob: the union of records by id. Every rule is deterministic and symmetric, so two devices merging the same two blobs in either order agree, and merging a blob with itself changes nothing.

Clock skew between devices makes "last writer" approximate. This is accepted, as it is for Favorites; the merge never loses a record, only the older of two concurrent edits to the same field.

### 3.4 Order as positions

Positions are the wire protocol's order and must agree byte for byte between desktop and iPhone, so the rules are complete here and pinned by shared vectors (§13).

**Alphabet and keys.** The alphabet is the 36 characters `0123456789abcdefghijklmnopqrstuvwxyz`, in that order (ASCII order), each worth its index 0–35; `mid` is the character for 18, `i`. A **key** is a non-empty string over the alphabet whose last character is not `0`. Keys are compared as strings, character by character by alphabet index, a shorter key that is a prefix of a longer one sorting first (plain lexicographic order). Because no key ends in `0`, every key has keys below and above it, so a list can always grow at both ends and in every gap. A device that reads an invalid key (empty, foreign characters, trailing `0`) treats the record as having no position and orders it after every valid key, by id.

**`append(last)`**, a key greater than `last` with room after it (`last` may be absent):

1. If there is no `last`: return `i`.
2. Let `c` be the last character of `last`. If `c` is below `z`: return `last` with `c` replaced by the next character. (`ab` → `ac`; room remains: `ab1`…`abz` lie between.)
3. Otherwise (`c` is `z`): return `last` + `1`. (`abz` → `abz1`.)

**`prepend(first)`**, a key less than `first` with room before it:

1. If there is no `first`: return `i`.
2. Let `c` be the last character of `first`. If `c` is above `1`: return `first` with `c` replaced by the previous character. (`ac` → `ab`.)
3. Otherwise (`c` is `1`): return `first` with `c` replaced by `0`, then `i` appended. (`a1` → `a0i`; `1` → `0i`.) The result ends in `i`, so it is a valid key, and `a0i` < `a1`.

**`between(a, b)`** for keys `a` < `b`, a key strictly between them:

1. Let `n` be the length of the longer key. Pad `a` on the right with `0` and `b` with the character after `z` (index 36, written `{`, never stored) to length `n`, conceptually only.
2. Find the first index `k` where the padded strings differ; let `x` = index of `a[k]`, `y` = index of `b[k]` (so `x` < `y`).
3. If `y` − `x` ≥ 2: return the common prefix `a[0..k)` + the character for ⌊(`x` + `y`) / 2⌋. (It is ≥ `1`, so the key is valid; `a1` and `a9` → `a5`.)
4. If `y` − `x` = 1: return `a[0..k]` (the prefix including `a[k]`) + `append(a[k+1..])`, where `a[k+1..]` is the rest of `a` after `k` (possibly empty, in which case `append` returns `i`). (`a1` and `a2` → `a1i`; `a1z` and `a2` → `a1z1`.)
5. The padding guarantees `x` < `y` at `k` whenever `a` < `b`, so no other case exists.

**Choosing a key.** A new item placed after the last item uses `append`; before the first, `prepend`; between two neighbours, `between`. Moving an item uses the same three rules on its new neighbours and changes only the moved item's `pos`. **Equal keys** happen when two devices insert into the same gap at once: items with equal keys order by id (the smaller tab id first). An insert between two items whose keys are equal, or an insert whose computed key already exists in the Space, is retried as `append` of the greater neighbour's key, so the result is a valid, distinct key that sorts directly after that neighbour; the person's next reorder, if any, replaces it. Keys grow by at most one character per insertion into the same gap, so 500 insertions into one gap are at most 500 characters: far inside the budget and acceptable.

**No renumbering in M16** (D7): a device cannot know that another has no offline edits, and rewriting every position and clock could overwrite a concurrent reorder. Compaction is a later protocol with its own safety argument.

### 3.5 Tombstones: final, and bounded

`deleted` is a field like the others (`{v: true|false, c, by}`) with one extra rule: **once a replica has seen `deleted.v = true` for a record, that record is deleted on that replica for good**, whatever later clocks say. Concretely:

- Deleting sets `deleted` to `true` with the writer's clock. Nothing sets it back to `false`: no edit to another field revives the record, and no device writes `deleted.v = false` after `true`. A page reopened from Recently closed, or a tab re-added, is a **new record with a new id**. A group recreated with the same name is a new group. So liveness depends on one field's `v`, and every replica that has seen the tombstone agrees; a replica that hasn't yet seen it agrees as soon as it merges, because `true` wins over `false` whatever the clocks (this is the one field where the merge is "true wins", not last writer, so no later edit can resurrect by clock skew). Edits to a tombstoned record's other fields are merged and ignored; they are dropped with the record when its tombstone expires.
- A tab whose `groupId` names a tombstoned group is shown ungrouped; it stays so, because the group is never revived. A tab moved into a group on one device while the group is deleted on another ends ungrouped on every replica, with no special case.
- A tombstoned record is kept **30 days** after `deleted.c`, then dropped by every writer, with every field. The byte budget counts it until then (§5).
- **Stale-replica guard.** A device whose last successful merge of a Space is older than 30 days may hold records whose tombstones have since expired. On its next merge of that Space it treats its copy as stale: any local record absent from the fetched blob is dropped, not re-added, and any local field edits older than the fetched blob's newest clock minus 30 days are discarded. The person sees the library's current state; the device's Recently closed records nothing for these (they were closed elsewhere long ago). This closes the resurrection path without a tombstone that lives forever.

### 3.6 Who writes what, and in what order

- Any device with the switch on may write any record. A device bumps a clock only on a field it changed; it never rewrites another device's unchanged field with a newer clock.
- **Write order:** the Space blob first, then the index. A blob with no index entry is unreachable but harmless (the creating device retries the index on its next pass). An index entry whose blob is missing is shown as an empty Space until the blob arrives, never deleted by a reader; the writing device retries the blob on its next pass. Both retries come from the pending set (§3.8).
- Every write is read-merge-write with the Worker's `ifVersion`. On 409 the device merges the newer blob and retries, as `syncOne` already does (three attempts). Each retry's GET counts against the scheduler's budget (§6.2).

### 3.7 The 25-Space cap

A device refuses to create or share a 26th Space while its merged index holds 25 live Spaces, with the reason shown (§5). Two devices creating at once can still pass 25; nothing is dropped. The Spaces menu then shows "26 of 25 Spaces are shared" and offers to delete or unshare one; all 26 keep syncing meanwhile.

### 3.8 Pending edits, and what "saved" means

Each device keeps, per Space in `shared-spaces.json`, a **pending set**: the fields it changed, with their clocks, that it has not yet seen in a fetched blob. A push merges the pending set into the latest fetched blob and PUTs. A field leaves the pending set only when a fetched blob contains it with that clock or a newer one. Until then it is replayed on every push.

What this gives: a PUT the Worker lost to a racing writer (R5) is replayed on the next pass, and per-field clocks let the replay win over the racing writer's older values for the same fields. What it does not give: recovery of a field the Worker lost after the device had seen it stored and cleared it from the pending set, nor recovery for a device that is wiped or whose `shared-spaces.json` is lost. The Worker's own statement stands: reconciliation does not guarantee recovery. The settings status shows "Waiting to upload" while a pending set is non-empty, and "Not synced since {time}" when pushes have failed for more than an hour.

## 4. From the record to the window and back

### 4.1 Local state

- `workspaces.json` stays the device's projection of each Space: the columns it has today plus three new ones for shared Spaces: `sharedId` (the library's spaceId), `tabIds` (parallel to `urls`) and `sharedLink` (`active` or `dormant`, §4.6). Unshared Spaces carry none. An older build ignores all three.
- A new profile-scoped `shared-spaces.json` holds, bound to the sync `accountId` (the `rebind` guard every sync store has): the last merged index and Space blobs with each blob's content revision and the time of its last successful merge; per Space the pending set (§3.8); per window the displayed baseline, the accepted set and the deferred queue (§4.3–4.4); the scheduler's rotation cursor (§6.2).
- Only the Personal profile syncs, as all of Profile Sync does. Named profiles' Spaces stay local.

### 4.2 Local change → record

The autosave that already runs on every tab broadcast (`autosaveWorkspaceBindings`) also, for a shared Space (active or dormant), diffs the window's tabs **against the window's displayed baseline** (§4.3) by `tabId`:

- a tab with no id is new: fresh id, `pos` from §3.4, every field clocked now;
- a tab whose URL or title changed: a `nav` edit; a pin, name, group or position change: that field's edit;
- a tab no longer present: `deleted` set `true`;
- groups and Space identity likewise.

Each edit goes into the pending set and advances the displayed baseline. For an active Space the blob uploads on Tab Sync's debounce (15 s, 60 s at most) and at once on close of the Space's last window, quit or switch; the index uploads with it when Space identity or the blob's revision changed. A dormant Space does everything but upload (§4.6).

### 4.3 Record → live window: the displayed baseline and the accepted set

Each window showing a shared Space (a shown window or a set-aside runtime) keeps two things:

- the **displayed baseline**: the record set exactly as the window currently shows it, the thing §4.2 diffs against;
- the **accepted set**: remote field values the device has merged and intends to apply to this window but hasn't yet, because the tab is protected (§4.4).

When a merge changes a Space, main compares the merged records with the displayed baseline. Every difference that is not protected is applied to the runtime at once, through the ordinary paths, in one synchronous pass, and the displayed baseline advances to it:

| Change | Applied as |
|---|---|
| New tab record | `createTab(url, { asleep: true, groupId, pinned, customTitle })` at its position, quiet until selected. `tabOrder` and groups are renormalized (`syncTabLayout`). |
| Tab tombstone | `closeTab(id)` with recording on, so the tab lands in this window's Recently closed exactly as a local close does: the live view is parked for the usual period, then the snapshot tier, then URL and title (D5). The dirty-form probe does not run. |
| `nav` change | A main-frame navigation of the live tab (`navigateTabToAddress`), or just the record for a quiet tab (it loads the new URL when woken). |
| Name, pin, group, position | Applied to the tab record and layout; no page is touched. |
| Group tombstone | Members show ungrouped (§3.5). |
| Space tombstone | The window leaves the Space (as Delete does today, into Recently deleted locally, 7 days) and keeps its tabs as an unsaved window; a set-aside runtime is disposed. |
| Space renamed, recoloured, reordered | The mark and the Spaces menu update; no tabs are touched. |

Every difference that **is** protected goes into the accepted set instead, and the displayed baseline is **not** advanced for it: the baseline keeps showing what the window shows. So §4.2's diff of window against baseline finds nothing for that tab, and the stale page is never published as a navigation back, nor a still-open tab as a new record. Changes main applies in a pass mark the affected tabs as **applied** for the pass, so the broadcast they cause produces no local edit (no echo). An unrelated local change in the same window (closing another tab, say) diffs cleanly against the same baseline; the tests include that case.

A set-aside Space has no protected tab; every change applies at once.

### 4.4 The protected active tab

The tab the person is looking at is the active tab of **each window** showing the Space, whether or not the window has keyboard focus, and every visible pane of a split in it (D4). A tombstone or `nav` change for such a tab is **deferred** into the window's accepted set and applied when the tab stops being active (a tab switch, closing the tab themselves, the window closing or leaving the Space) or at the next cold start, whichever first. Applying it runs the §4.3 row for the change and only then advances the displayed baseline for that tab. The accepted set is per window, persisted in `shared-spaces.json` (so a cold start can apply it), and never synced.

Three things can happen to a deferred change before it applies:

- **A newer remote value arrives** for the same field: the accepted set keeps only the newer one (the merge already did), and that is what applies.
- **The person edits the same field locally** (they navigate the deferred tab themselves, or close it): §4.2 records a local edit with a newer clock, which wins over the accepted remote value under §3.3 everywhere; the deferred change is dropped as superseded. For a tab the person closes themselves while a remote tombstone is deferred, both sides agree the tab is deleted, and the local close records it in Recently closed once.
- **The window leaves the Space or closes**: the change applies on the way out (the window's tabs are being put away anyway).

A deferred navigation keeps the person's page; when applied, the tab loads the newer URL. A deferred close files the page in Recently closed with the live view parked as a local close would (D5). Both are visible when they happen because the person has just left the tab.

### 4.5 Which device has a Space open

Stays per device (contract §4.5). The library records no presence. "A Space is in at most one window at a time" remains desktop's local rule.

### 4.6 Switching the switch

- **On, the first time:** a sheet lists this device's Personal Spaces with their tab counts and the library's remaining room (25 minus the Spaces already there). Every Space that fits the 500-tab and byte limits is ticked by default; the person unticks any they want to keep local (D2). An oversized Space is listed unticked and greyed with the reason, and the sheet offers to split it (D3): it stays local until it fits. Confirming uploads the ticked Spaces as new library Spaces (fresh `spaceId`s and `tabId`s, every field clocked now: this is the one moment a whole Space is stamped new, because it is new to the library). Two devices that each had "Work" end up with two "Work" Spaces (contract §4.2). If the ticked set would pass 25, the sheet says so and asks for fewer.
- **Off:** the device keeps its current copies as local Spaces and publishes nothing further. Nothing is deleted anywhere, and nothing is retracted (contract §4.2; the settings text says so). Each copy keeps a **dormant link** (`sharedLink: dormant`, with `sharedId` and `tabIds`) and **keeps maintaining its records**: §4.2 runs on every autosave as before, so each edit the person makes while the switch is off becomes a field edit with the clock of the moment it was made, in the pending set. Only the upload stops; the merged copy of the library's blob is kept as of the last fetch.
- **On again:** for each dormant Space the sheet shows the library's state and offers **Rejoin** (the default when the library still has that Space and it isn't tombstoned) or **Add as a copy**. *Rejoin* is nothing but the ordinary cycle resumed: fetch the Space's blob, merge it with the device's kept copy under §3.3 (the device's dormant-period edits carry their own clocks and win or lose field by field against what other devices did meanwhile; remote tombstones close the device's tabs into its Recently closed per §4.3), then push the pending set. Nothing is re-stamped. *Add as a copy* creates a new Space with fresh ids and clocks of now, as a first-time share does; it is the only choice when the library's Space was deleted. So an ordinary off/on cycle with no edits changes nothing in the library.
- **Sync off or account switch:** `shared-spaces.json` is cleared as `tab-sync.json` is; Spaces revert to local copies with no link.

### 4.7 Pairing

After a desktop with the switch **off** that showed a pairing code sees a new device's entry arrive (in `session` or `sends`, the devices Send to device already discovers), it asks once, in Settings → Sync and as a start-page notice, using the device's published name: **"{Device} joined. Keep Spaces and groups in sync with it?"** followed by one line, "This shares your Spaces with every device in this sync that has the switch on," with **Turn on** and **Not now**. Turn on opens the §4.6 sheet. The question is asked once per paired device, for any kind of device (D9), and never again after Not now; a desktop whose switch is already on is never asked.

## 5. Budgets, and what happens over them

Numbers: a tab record with per-field clocks is 250–450 bytes typical (UUID, URL, title, six clocks and writers, position), about 2.9 KiB worst (a 2048-unit URL and a 200-unit title in a 3-byte script, a 100-unit name). A Space of 500 typical tabs is roughly 150–220 KiB of plaintext; of 500 worst-case tabs about 1.4 MiB.

The Worker checks `JSON.stringify(body.blob)` in UTF-8 bytes against **524,288** (`MAX_BLOB_BYTES`), and separately the whole request against 525,312 (`MAX_REQUEST_BYTES`). `encrypt()` returns `{v, iv, ct, tag}` with base64 fields, so a blob is about 4/3 of its plaintext plus about 70 bytes. Measured with the real `encrypt()`: **320 KiB of plaintext is a 436,980-byte blob; 360 KiB is 491,592; 400 KiB is 546,208**, over the cap.

Rules:

1. **Every PUT is checked on the serialized encrypted blob**, `JSON.stringify(blob)` in UTF-8 bytes, against 524,288 less a 4 KiB margin (so 520,192). The 320 KiB plaintext figure (Tab Sync's `BUDGET_BYTES`) is the guide a device uses to decide *before* making a change whether it will fit; the encrypted check is the gate.
2. **A Space blob over the budget on this device's own write refuses the sync of the change, not the change.** A tab opened past the budget opens in the window as usual, marked "not synced" (a quiet dot on its row with the accessible text "Not synced: this Space is full"), and the Spaces menu's status line reads "This Space is full for sync: {count} tabs stay on this device." Nothing already shared is dropped. The budget counts everything in the blob: live records, **tombstones** (a closed tab frees its bytes only when its tombstone expires after 30 days, so closing tabs does not make room at once; the status line says "Closed tabs free their room after 30 days" when that is the case), navigation edits (a longer URL can push a full Space over; that navigation is then the unsynced change, and the tab shows the dot) and other devices' concurrent additions (a blob that arrives already over budget is merged and shown in full; this device just can't add to it).
3. **500 live tabs per Space,** the same way.
4. **25 Spaces per library** (§3.7).
5. **An oversized Space is not shared** (D3): at switch-on, or when a local Space is later moved into the library, a Space over either limit stays local with the reason and an offer to split it.
6. **Index blob: 64 KiB** of plaintext. 25 entries are a few KiB; it cannot be exceeded within rule 4.
7. **`closed` store: 64 KiB**, `sends`' rule: the stalest other devices' entries are dropped first, never this device's.
8. **`shared` sidecar: 64 KiB.** Over it, this device omits its own entry (its tabs then show under the device, which is correct, only not deduplicated); a receiver drops any device's entry it can't parse. Indices are small (500 integers ≈ 2 KiB), so this is a guard, not an expected state.

Never silent: every refusal above shows in the Spaces menu beside the Space, with accessible text, and Settings → Sync's status line names the Spaces affected. Nothing is ever trimmed from a record that another device wrote.

## 6. Fetching within the rate limit

The Worker allows 30 GETs per account per minute, shared by every device on the account, and 120 requests per client IP. With one store per Space an account holds up to 33 stores. Today's sync loop fetches every store on every pass; with 33 stores that alone would exceed the limit, so M16 replaces the per-pass fetch of "every store" with one bounded scheduler.

### 6.1 Knowing what changed: the content revision

Each Space blob's **revision** is the first 16 hex characters of SHA-256 over the canonical form (`canonical`) of the blob's plaintext as written. The writer puts that revision in the index entry's `rev` when it writes the index after the blob (§3.6). A reader compares `rev` with the revision of the blob it last merged: different means fetch. Content that didn't change hashes the same, so a heartbeat or a no-op PUT costs no fetch; any change at all, by a slow-clock device, an equal-clock edit or a tombstone expiry, changes the hash.

The index is a **hint**, not the only reason to fetch, because the blob and index writes are not atomic and a writer can fail between them. So:

- any Space with a non-empty pending set is fetched before its push (the merge needs the latest);
- every Space blob is **reconciled** at least once an hour per device: fetched regardless of `rev`, in rotation (§6.2), so a blob whose index write was lost is still seen within the hour;
- a 404 for a Space blob the index names is treated as "not yet written" (§3.6), never as deleted.

### 6.2 One scheduler for every GET

A **pass** is one run of the sync loop. Each pass has a GET budget of **10**, spent in this order; what doesn't fit waits for the next pass:

1. The fixed stores the loop already fetches, in their existing order (`bookmarks`, `settings`, `session`, `icons`, `sends`, then the new `closed` and `shared`): up to 7. The existing optional-store rules apply (a missing optional store costs its one GET).
2. The `spaces` index: 1.
3. Space blobs, in this priority, each costing 1 and **all counted against the same budget** (a pending Space never bypasses it): first Spaces with a pending set (oldest pending edit first); then Spaces whose `rev` differs from the local copy; then Spaces due for hourly reconciliation. Within each class, **fair rotation**: a persistent cursor over spaceIds (in id order) advances past each Space as it is fetched, so a Space that missed this pass is first in line next time and no Space starves behind a busy one.
4. Each 409 retry re-fetches the blob it is retrying and costs 1 from the same budget (`syncOne`'s three attempts are inside this count); a pass that runs out of budget mid-retry leaves the pending set in place and finishes the retry next pass.

**Cadence:** a device runs at most one pass per **60 s**, except that the existing focus refresh may run an **index-only** pass (1 GET) at any time; if the index shows changes or a Space is pending, the next full pass runs at its normal time. Tab Sync's 15 s/60 s debounce decides *when* the device's own Space blob is pushed; a push rides the next pass.

**Bound:** two devices at one full pass a minute spend at most 20 GETs a minute, under 30 with room for both devices' index-only focus refreshes. A third device makes 30 possible; the first device to see a **429** backs off that pass for 60 s and halves its next pass's budget (to 5, floor 3), recovering one per clean pass, so three or more devices settle into alternating passes rather than failing. The status line shows "Sync is busy; retrying" after two consecutive 429s. PUTs are not counted by the account GET limit, only by the per-IP limit of 120 requests a minute, which a single device cannot approach at this cadence.

## 7. Recently closed, synced (`closed` store)

Per device, one writer per entry, the `sends` shape:

```
{ "devices": { "<deviceId>": {
    "name": "MacBook Pro", "platform": "darwin", "updatedAt": …,
    "items": [ { "id": "<uuid>", "url": "https://…", "title": "…",
                 "closedAt": …, "spaceId": "<spaceId>" | null } ] } } }
```

- A device adds an item when it closes a tab itself or applies a remote tombstone (§4.3): http(s) only, title and URL only, never page state, never a private tab. **24 hours and 25 items per device** (contract §5), newest kept; entries not updated for 30 days are pruned; a daily heartbeat keeps live devices present.
- Every device shows **one** Recently closed band (D6), newest first across devices: this device's own entries as today, with their held-view and snapshot tiers, each shown once (an own close is never also listed from the synced copy), and other devices' rows labelled "Closed on {device}". Reopening a remote row opens the page as a new local tab (and, in a shared Space, a new record, §3.5). Forget hides the row on this device (a local `dismissed` map, `sends`' pattern). Clear all clears this device's own entry and hides every remote row. The band's copy never claims a remote row restores form contents; only a locally parked view can.
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

Added to `sync.js`'s `STORES` table the way `sends` was, each `optional: true` with `hasPublishableContent` so a presence-only write never creates a store in KV's missing-read window. The loop's "fetch every store each pass" becomes the §6.2 scheduler, which also decides which Space stores (expanded from the merged index) a pass touches:

- `spaces` and each `space-<id>`: `export`, `merge` and `equals` from a new `src/main/shared-spaces.js` (orchestration, `JsonStore`) over a pure `src/main/shared-spaces-model.js` (records, per-field merge, final tombstones and the stale-replica guard, positions, budgets, the pending set, the revision, the fetch plan; no electron; unit-tested).
- `closed`: `src/main/synced-closed.js` over `synced-closed-model.js`, modelled on `sends`.
- `shared`: in `shared-spaces.js`.

`main.js` gains the record↔window adapter with its displayed baselines, accepted sets and deferred queues (§4.2–4.4) beside the existing Space machinery (`workspaceCapture`, `applyWorkspaceToWindow`, `makeResidentRuntime`), the switch, the §4.6 sheet, the pairing question and the status lines. The Spaces menu shows a sync mark on shared Spaces (D8) whose accessible text names the state: "Shared", "Waiting to upload", "Not synced since {time}", "Full for sync", "Spaces sync isn't available"; a glyph alone never stands for a state.

## 11. Interface text

New `copy/messages` keys, all six languages in the same PR: the switch and its two lines; the §4.6 sheet (its title, the room line, Rejoin and Add as a copy, the oversized reason and "Split this Space…"); the five sync-mark states; "This Space is full for sync: {count} tabs stay on this device" and "Closed tabs free their room after 30 days"; "{count} of 25 Spaces are shared"; "Sync is busy; retrying"; "Spaces sync isn't available yet"; the pairing question, its line and two buttons; "Closed on {device}"; the settings note that turning the switch off keeps shared copies on other devices. F41's spec line is replaced; `spec/features.md`, `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17) and the privacy label ("Spaces and groups: synced when you turn it on, end to end encrypted") are updated in the shipping PR.

## 12. Security and privacy (R3, R5)

- **What travels:** Space names, colours, symbols, order; tab URLs, titles, custom names, pins, groups and order; Recently closed URLs and titles; device names. Never private tabs, page state, snapshots, splits, favicons' sources (icons go through their own sidecar), `blanc://` or `file://` pages, or anything from a named profile.
- **Consent:** the switch is its own consent (contract §4.2), independent of "Share this device's open tabs". Off by default; an update never turns it on. The pairing question is a Turn on button that opens the sheet, not a default.
- **R3 (the locator is a bearer capability):** unchanged and still open. Shared Spaces add nothing to its exposure beyond more ciphertext under the same locator; the v1 size and rate limits are unchanged. Said plainly in the privacy page and the release notes: no claim of authentication.
- **R5 (non-atomic KV):** unchanged and still open. The design claims only §3.8: pending edits are replayed until a fetched blob contains them, and per-field clocks let a replay win. A write the Worker lost after the device saw it stored, or a device that lost its local state, is not recovered, and a delete racing a write can leave a record visible until the next pass merges the tombstone. The design never claims convergence stronger than that; the test plan (§13) includes the replay and the unrecoverable case, so the limitation is tested, not assumed.
- **Threats this adds:** a malicious or buggy device in the account can delete or rewrite every shared Space (as it can every Favorite today). Recently closed and the 30-day tombstones bound the loss; Recently deleted keeps a deleted Space for 7 days locally. A remote navigation could point a shared tab at a hostile page; it loads only when the person comes to that tab (§4.4), under the same navigation guards as a typed address (`handOffToOs`, `isForbiddenTopLevelUrl`, the blocker). Records are sanitized on merge like F27 entries, so a junk blob never reaches a renderer.
- **`docs/security-assessment.md`** gets a row for shared Spaces under the Profile Sync entry, and the release's security review signs it.

## 13. Testing

**Shared vectors.** The pure model's behaviour is pinned by vectors that desktop and iPhone both check, through the existing route: `scripts/build-ios-sync-vectors.cjs` generates them into `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` and `test/unit/ios-sync-vectors.test.js` fails if the committed file drifts from the model. M16 adds vector groups for positions (every rule of §3.4, including prefix boundaries, `prepend` through `1` → `0i`, `between` adjacent characters, equal-key collision and the retry as `append`), per-field merge and tie-breaking, final tombstones and the stale-replica guard, the content revision, and the budget.

**Unit (pure model):** per-field merge is commutative, associative and idempotent; `deleted` true-wins in both orders and no later edit revives; group tombstone racing a tab move ends ungrouped everywhere; the stale-replica guard drops absent records on a >30-day-old replica and re-adds nothing; position rules and comparison as above; byte budget measured on `JSON.stringify(encrypt(…))` with 400 KiB of plaintext refused and 320 KiB accepted (the figures of §5, computed by the test, not typed in); tombstones counted in the budget; 25-Space and 500-tab caps and the transient 26; sanitization of junk; the pending-set replay (two devices PUT the same Space from the same version; the loser's next pass replays its pending fields and both converge) and the documented unrecoverable case (a field cleared from the pending set then lost upstream stays lost, asserted, so the claim stays honest); the revision changes on any content change including a slow-clock edit; the fetch plan spends exactly its budget in the §6.2 order, counts pending Spaces, rotates fairly, and reconciles every Space within an hour.

**Unit (adapter, lifted source like `tab-context-glance-availability.test.js`):** record→window diff produces the right `createTab`/`closeTab`/navigation calls; a protected tab's change goes to the accepted set and the displayed baseline stays put; **the displayed window then diffs to nothing** (no false navigation back, no resurrection); an unrelated local close while a remote close is deferred publishes only the local close; a local navigation of the deferred tab supersedes the remote one by clock; the deferred change applies and the baseline advances when the tab stops being active; an applied change produces no echo edit; a dormant Space keeps producing clocked pending edits and Rejoin pushes them unchanged.

**Acceptance (two sync "devices" in one run, as the F27 scenarios do):** the switch-on sheet lists Spaces with room and refuses an oversized one; two "Work" stay two; a tab opened on A appears quiet in B's open Space; a tab closed on A lands in B's Recently closed with its live view parked, and the band shows "Closed on A" once; a navigation on A updates B's quiet tab and defers on B's active tab (in an unfocused window too) until a switch, and B's autosave publishes nothing for it meanwhile; cold start applies a deferred close; a Space-full state shows, names the tombstone case, and clears after expiry (clock advanced by the test hook); turning the switch off, editing, and turning it on again rejoins with the edits and without duplicating; an older Worker (404) shows "isn't available yet"; a 429 backs off and recovers; a pass with every store changed spends 10 GETs and finishes the rest next pass; a lost index write is caught by reconciliation within the hour (clock advanced); the Other-devices drawer shows a shared tab once and a same-URL unshared tab still; a stale sidecar leaves tabs visible.

**Crash and restart:** a merge applied, then SIGKILL before the next save: records, baselines and window agree on restart and nothing is duplicated or lost; a deferred change in the accepted set applies at the cold start; a crash between the blob write and the index write leaves a reachable or retried Space, never a half one (the harness's `crashAndRelaunch` from #1097).

**Pseudo-locale sweep** over the new copy.

## 14. Decisions (owner, 2026-10-25)

| # | Question | Decision |
|---|---|---|
| D1 | Fixed slot stores, or one store per Space? | **One store per Space, named by its immutable id** (§2.1, §9). |
| D2 | Which Spaces stay local when the library can't take them all? | **The person chooses** in the switch-on sheet, with the room shown (§4.6). |
| D3 | An oversized Space at switch-on: join with what fits, or refuse? | **Refuse until it fits**, with the reason and an offer to split (§5). |
| D4 | Protect the active tab of every window, or only the focused one? | **Every window**, every visible split pane (§4.4). |
| D5 | A remotely closed tab: Recently closed only, or park the live view like a local close? | **Park it like a local close** (§4.3); never describe URL and title as preserving form contents. |
| D6 | One Recently closed band or a separate one? | **One band**, newest first, remote rows labelled, own closes shown once (§7). |
| D7 | Position renumbering? | **None in M16**; the fractional algorithm of §3.4 with deterministic ties and shared vectors. |
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
4. `shared-spaces-model.js` and `synced-closed-model.js` with their unit tests and the shared vectors.
5. Desktop: the scheduler, stores, the adapter with baselines, accepted sets and deferred queues, the switch and its sheet, the status lines, the pairing question; acceptance scenarios.
6. Security review (§12) and the F41 / parity / privacy updates.
7. The What's New page, then the feature release.
