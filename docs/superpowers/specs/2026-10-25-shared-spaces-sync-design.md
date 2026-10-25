# M16: Shared Spaces, groups and Recently closed — the desktop protocol

**Date:** 2026-10-25 (sixth revision, after the owner's reviews of `e0ebe765`, `ea5b1f22`, `b7b3b076`, `48743d0e` and `c9d6a141`)
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
| 2.3 | **Records, not captures.** Each Space, group and tab is its own record with an id, per-field clocks and a final tombstone; order is a position key from one fully specified algorithm, **every key ending in its own record's full id**, so no two valid keys are ever equal (§3.4). | The contract's §4.3. One clock per tab record would let a navigation on one device and a pin on another overwrite each other; equal keys would leave an insertion between them undefined. |
| 2.4 | **A shared Space's tabs get stable ids** that the local capture carries in a new `tabIds` column of `workspaces.json`. | The F27 entry has no tab ids and is frozen; the capture is Blanc's own file and may grow a column. |
| 2.5 | **Budgets are measured on the serialized encrypted blob** against the Worker's 524,288-byte cap, with 320 KiB of plaintext as the planning guide. **Over budget is refused at the edge, loudly;** an oversized Space is not shared until it fits (D3). | `encrypt()`'s base64 envelope makes 400 KiB of plaintext a 546,208-byte blob; 320 KiB is 436,980 (§5). The contract requires over-budget behaviour that is never silent. |
| 2.6 | **At most 10 GETs per device in any trailing 60 seconds**, enforced by a log of request times, spent **round robin across four classes of work with a persisted next-class cursor** advanced after every request; the index carries a **content revision** per Space as a hint, and periodic reconciliation fetches blobs the hint missed, as often as the budget allows (§6). | 30 GETs per account per minute, shared by every device: a sliding window keeps three devices at or under it in every minute, where a token bucket's burst would not. A per-pass priority order let one class starve the others; a clock maximum cannot detect every change; blob and index writes are not atomic. |
| 2.7 | **Two baselines per window**: the **displayed** baseline (what the window shows) that local autosave diffs against, and an **accepted** set of remote targets waiting on the protected active tab. The displayed baseline advances only when a deferred change actually applies (§4.3–4.4). | Advancing one baseline to the remote target while the window still shows the old page would read as a local navigation back. |
| 2.8 | **Local edits stay pending until a fetched blob contains or provably supersedes them under the field's own merge rule**, and are replayed on every push until then (§3.8). The design claims that, not recovery from a lost write in general. | The Worker's writes are not atomic (R5). "Same clock or newer" would let a fetched `deleted: false` with a later clock clear a pending delete. |
| 2.9 | **Tombstones are final.** A deleted record's id is retired; nothing revives it, and a reopened page is a new record (§3.5). **Resurrection after a tombstone expires is possible**, as it is for Favorites, and is bounded by a recovery copy, not prevented (§3.9). | Deterministic on every replica. A stronger guarantee needs a generation or checkpoint protocol, which is not in M16; the design says so rather than claiming it. |
| 2.10 | **A dormant (switched-off) Space keeps maintaining its records locally**, with real clocks, and publishes nothing; **Rejoin** resumes publishing by an ordinary merge, after a fresh fetch (§4.6). | An off/on cycle must not double the library, and offline edits must carry the clocks they were made with, not a fresh stamp over the whole snapshot. |
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
      "pos":    { "v": "i<tag>",   "c": …, "by": … },          // order among Spaces (§3.4)
      "createdAt": 1800000000000, "createdBy": "<deviceId>",
      "rev": "9f2a…",               // content revision of the Space's blob (§6.1), a hint
      "deleted": { "v": false, "c": …, "by": … }               // the tombstone field (§3.5)
    } } }
```

- `spaceId`, and every group and tab id below, is 32 lowercase hex characters (a UUID without hyphens), fresh when the record is created; a record with any other id is dropped on merge. A local Space's id is never reused as the shared id.
- Name ≤60 (desktop's cap), colour `#rrggbb`, symbol one of the sixteen; invalid values are repaired as `workspaces-model.js` already does, never rejected.
- `rev` is the content revision of the Space blob as last written by the device that wrote it (§6.1). It is a hint for fetching, never the only reason to fetch. It travels with the clock and writer of the write that set it, `revAt` and `revBy`, and two hints merge like a field: the higher `revAt` wins, then the smaller `revBy`, then the smaller hash; a hint without `revAt` ranks below any hint with one. A writer publishing a new hint sets `revAt` to at least one more than the hint it replaces, so a device whose clock runs behind still publishes a hint that wins. (Choosing by hash alone would keep whichever revision sorts first, so a reader that held an old revision would keep it after merging a newer one about half the time and republish it, and the hint would stop meaning "changed".) After a successful blob write the writer records the uploaded revision as the one it last saw, so its own published hint doesn't send it to fetch its own write.
- A deleted Space keeps its index entry as a tombstone for 30 days (§3.5).

### 3.2 One Space, one blob: store `space-<spaceId>`

```
{ "v": 1, "spaceId": "<spaceId>",
  "groups": {
    "<groupId>": {
      "name":      { "v": "Reading", "c": …, "by": … },
      "color":     { "v": null,      "c": …, "by": … },
      "collapsed": { "v": false,     "c": …, "by": … },
      "pos":       { "v": "b<tag>",  "c": …, "by": … },
      "deleted":   { "v": false,     "c": …, "by": … } } },
  "tabs": {
    "<tabId>": {
      "nav":     { "v": { "url": "https://…", "title": "…" }, "c": …, "by": … },
      "name":    { "v": null | "Custom name",  "c": …, "by": … },   // F46, ≤100
      "pinned":  { "v": false,  "c": …, "by": … },
      "groupId": { "v": "<groupId>" | null, "c": …, "by": … },
      "pos":     { "v": "c2<tag>", "c": …, "by": … },          // <tag>: §3.4
      "deleted": { "v": false,  "c": …, "by": … } } },
  "active": { "v": "<tabId>", "c": …, "by": … }                   // the saved selection
}
```

- Each field carries its own clock `c` (ms since the epoch, the writer's clock) and writer `by`. URL and title change together on a navigation, so they share `nav`. A pin on one device and a navigation on another therefore both survive.
- The optional saved selection `active` can additionally carry `cleared: true`. This means there is no selected shared tab: `v` retains the original target only to preserve the write's comparison rank, alongside its original `c` and `by`. A missing, deleted, expired or withheld target clears the selection this way without inventing a clock or discarding the winning write. Clients use `activeTabId(blob)` (null for a cleared or invalid target), not `active.v`, as the effective selection. This does not change F27. A newer explicit selection can supersede the marker.
- Tabs: http(s) only, URL ≤2048 and title ≤200 UTF-16 units (Tab Sync's limits; `sanitizeTab`). `name` is the person's custom tab name (F46, `normalizeTabName`, ≤100), null when the page's title is used; the phone shows it as desktop does. `blanc://` pages, `file://` pages, private tabs, splits and page state never enter a record. The error page records its real destination (`persistableUrl`), as the capture does.
- Groups keep desktop's rules: a name kept in the case typed and matched without regard to case within a Space, an optional preset colour.
- At most **500 live tabs** in a Space (the Tab Sync bound) and the byte budget of §5.

### 3.3 Merge rule

Per field: the higher clock `c` wins; on a tie, the lexicographically smaller `by`; on a tie of both (the same device wrote the same field twice in one millisecond, or a replay), the lexicographically smaller canonical value (`canonical` from `tabsync-model.js`). The one exception is `deleted`, where `true` wins whatever the clocks (§3.5). Per record: the union of its fields, each merged by its rule; a record present on either side is present after the merge. Per blob: the union of records by id. Every rule is deterministic and symmetric, so two devices merging the same two blobs in either order agree, and merging a blob with itself changes nothing.

Clock skew between devices makes "last writer" approximate. This is accepted, as it is for Favorites; the merge never loses a record, only the older of two concurrent edits to the same field.

**Content this version can't interpret is relayed, never erased.** A device displays and applies only what it can validate: known fields with acceptable values, in records that have all of them. Everything else another device wrote (a field a newer client added, a value longer or of a scheme this version doesn't accept, a record left incomplete by either) is kept as received in every upload, merged with the device's own state by the rules above. Where the device's copy of a field and the fetched one are the same write (same clock and writer), the fetched original is uploaded, not the device's normalized copy. Relayed content is never applied to a window, counts toward the byte budget of the upload it travels in, and is never trimmed to make room (§5). Records whose tombstones have expired are not relayed. Presence for §3.9 and acknowledgement for §3.8 are judged against the fetched blob as received, so a record or value this version can't display is neither "absent" nor "unconfirmed". Only well-formed records and fields are relayed: a record id of 32 lowercase hex digits, a field name of a lowercase letter followed by at most 31 letters or digits, at most 32 fields per record, each field a complete `{v, c, by}`.

For `active`, compare clock, writer and target value exactly as above. Only when all three tie does `cleared: true` win over the live form of that same write. Keep the original target value when clearing: changing or dropping it would change the comparison rank and let an older selection reappear depending on merge order. The clear marker is normalized and retained during merge and serialization; shared vectors cover both associations of three-way merges, including equal-clock different-target ties.

### 3.4 Order as positions

Positions are the wire protocol's order and must agree byte for byte between desktop and iPhone, so the rules are complete here, with a reference algorithm, and pinned by shared vectors (§13). The algorithm below was run against the cases in this section and a 200,000-case random check before this text was written; the vectors are generated from the same code.

**Alphabet and keys.** The alphabet is the 36 characters `0123456789abcdefghijklmnopqrstuvwxyz`, in that order (ASCII order), each worth its index 0–35. A **key** is a non-empty string over the alphabet whose last character is not `0`. Keys are compared as strings, character by character by alphabet index, a shorter key that is a prefix of a longer one sorting first (plain lexicographic order). Because no key ends in `0`, every key has keys below and above it, so a list can always grow at both ends and in every gap. A device that reads an invalid key (empty, foreign characters, trailing `0`) treats the record as having no position and orders it after every valid key, by id.

**One algorithm, `mid(a, b)`.** Given keys `a` < `b`, or `a` absent (meaning the start, written `""`) or `b` absent (meaning the end), it returns a key `m` with `a` < `m` < `b`. Prepending is `mid("", first)`, appending is `mid(last, "")`, inserting between neighbours is `mid(a, b)`.

```
mid(a, b):                      // digit(k, n): index of k's n-th character
  out = ""; n = 0
  loop:
    da = n < len(a) ? digit(a, n) : 0          // a is padded with 0 (index 0)
    db = b == "" ? 36 : (n < len(b) ? digit(b, n) : 36)   // b is padded with 36, past z
    if da == db:  out += char(da); n += 1; continue
    if db - da >= 2:  out += char(floor((da + db) / 2)); return out
    // db == da + 1: take a's digit (so out < b from here on), then find
    // something above the rest of a with no upper bound.
    out += char(da); a = a[n+1 ..]; b = ""; n = 0
```

Why it is right: `out` copies the common prefix, then at the first difference either takes a character strictly between the two (so `a` < `out` < `b` at that position, and nothing after it matters) or takes `a`'s character where `b`'s is one higher (so `out` < `b` whatever follows) and continues with only `a`'s remainder as a lower bound, where the same two cases apply with `b` unbounded. It terminates because each iteration consumes a character of `a`, and once `a` is exhausted its padding `0` against `36` returns `i` (index 18). The returned key never ends in `0`, because the final character is ⌊(`da` + `db`) / 2⌋ with `db` ≥ `da` + 2, which is at least 1. Examples the vectors pin: `mid("a1", "a11")` = `a10i`; `mid("a1", "a2")` = `a1i`; `mid("a1z", "a2")` = `a1zi`; `mid("", "1")` = `0i`; `mid("", "a1")` = `5`; `mid("ab", "")` = `n`; `mid("a", "a0i")` = `a09`; `mid("i", "i1")` = `i0i`; `mid("zz", "")` = `zzi`.

**Record tags: keys are unique by construction.** Two devices inserting into the same gap at once compute the same `mid`, and two equal keys would make a later insertion between them call `mid(a, a)`, outside its precondition. So every stored key is **`mid(a, b)` followed by the record's own tag**: its 32-hex id with each hex digit `h` written as the alphabet character of index `h + 1` (so `0`–`f` become `1`–`g`; the tag never contains `0`, and the key never ends in `0`). The tag is a fixed 32 characters and a bijection of the id, so:

- **Validity.** A key is valid for a record only if it is longer than 32 characters, its last 32 characters are that record's tag, and its prefix is a valid key under the rules above. A record whose key fails this (empty, wrong tag, foreign characters) has no position and orders after every valid key, by id; this also covers a buggy or hostile writer.
- **Uniqueness.** Two valid keys of two different records end in two different 32-character tags, so they are different strings. Within one list (a Space's tabs, its groups, the library's Spaces) **no two valid keys are equal**, and every pair of neighbours satisfies `a < b` strictly, so `mid(a, b)` is always called within its precondition. Equal keys are impossible rather than tolerated.
- **Placement.** `mid(a, b)` returns a key that is not a prefix of `b` (its last character is strictly less than `b`'s character at that position, or `b` was absent) and is greater than `a`; appending any suffix therefore keeps `a < key < b`. So a tagged key sits strictly between the neighbours the device chose, and two devices' concurrent inserts into the same gap both do, ordered between themselves by their tags; a third insert between those two is an ordinary `mid` of two distinct keys.
- **Moves keep the tag.** Moving a record writes `mid(new left, new right)` plus the same tag, so a record has one key at a time and uniqueness holds through moves.

This was checked mechanically before being written down: two deliberate concurrent inserts into one gap give distinct keys strictly between the neighbours, and an insert between those two is valid; 300 trials of 400 inserts each, in concurrent batches of up to three at random places, produced no out-of-order key and no duplicate. The shared vectors include those constructed cases, not only random ones (§13).

**Choosing a key.** A new item placed after the last item uses `mid(last, "")`; before the first, `mid("", first)`; between two neighbours, `mid(a, b)`; each followed by the record's tag, where `a` and `b` are the neighbours' full stored keys. Keys grow slowly: typical keys are 35–50 characters; 500 inserts into the front of one gap, 500 appends, or 500 inserts directly after one item reach about 130–140 characters. A Space's 500 tab keys therefore cost about 20–70 KiB, inside the §5 budget, which counts them.

**No renumbering in M16** (D7): a device cannot know that another has no offline edits, and rewriting every position and clock could overwrite a concurrent reorder. Compaction is a later protocol with its own safety argument.

### 3.5 Tombstones: final

`deleted` is a field like the others (`{v: true|false, c, by}`) with its own merge rule: **`true` wins**, whatever the clocks. Concretely:

- Deleting sets `deleted` to `true` with the writer's clock. Nothing sets it back to `false`: no edit to another field revives the record, and no device writes `deleted.v = false` after `true`. A page reopened from Recently closed, or a tab re-added, is a **new record with a new id**. A group recreated with the same name is a new group. So liveness depends on one field's `v`, and every replica that has seen the tombstone agrees; one that hasn't yet agrees as soon as it merges. Edits to a tombstoned record's other fields are merged and ignored; they are dropped with the record when its tombstone expires.
- A tab whose `groupId` names a tombstoned group is shown ungrouped; it stays so, because the group is never revived. A tab moved into a group on one device while the group is deleted on another ends ungrouped on every replica, with no special case.
- A tombstoned record is kept **30 days** after `deleted.c`, then dropped by every writer, with every field. The byte budget counts it until then (§5).
- Expiry also removes that record's pending fields from retained local state. It is a local retention decision, not a server acknowledgement: a failed upload must not restore expired pending records. The upload plan reports the expired ids separately so settlement can apply only that cleanup to the caller's current pending snapshot, preserving unexpired writes and edits that arrived while the request was in flight. The expired-id result is local bookkeeping, never a new synced store.
- **Resurrection is possible and bounded, not prevented.** A device that did not receive a tombstone before it expired (offline for the whole 30 days, or simply never fetching that Space's blob in that time) still holds the record with `deleted: false` and no evidence it was deleted; when it next merges, the record comes back on every device. This is the same bounded risk Favorites accept. §3.9 keeps the damage small; a real guarantee needs an explicit generation or checkpoint protocol, which is not in M16.

### 3.6 Who writes what, and in what order

- Any device with the switch on may write any record. A device bumps a clock only on a field it changed; it never rewrites another device's unchanged field with a newer clock.
- **Write order:** the Space blob first, then the index. A blob with no index entry is unreachable but harmless (the creating device retries the index on its next pass). An index entry whose blob is missing is shown as an empty Space until the blob arrives, never deleted by a reader; the writing device retries the blob on its next pass. Both retries come from the pending set (§3.8).
- Every write is read-merge-write with the Worker's `ifVersion`. On 409 the device merges the newer blob and retries, as `syncOne` already does (three attempts). Each retry's GET is spent from the request budget (§6.2).

### 3.7 The 25-Space cap

A device refuses to create or share a 26th Space while its merged index holds 25 live Spaces, with the reason shown (§5). Two devices creating at once can still pass 25; nothing is dropped. The Spaces menu then shows "26 of 25 Spaces are shared" and offers to delete or unshare one; all 26 keep syncing meanwhile.

### 3.8 Pending edits, and what "saved" means

Each device keeps, per Space in `shared-spaces.json`, a **pending set**: the field writes it made (each a complete `{v, c, by}`) that it has not yet seen confirmed in a fetched blob. A push merges the pending set into the latest fetched blob and PUTs.

**Acknowledgement uses the field's full merge rule.** A pending write `p` for a field is cleared only when the fetched blob's value `f` for that field satisfies `merge(f, p) = f`: the fetched value already *is* the pending write, or beats it under that field's rule (§3.3). For a last-writer field that means `f` has a higher clock, or the same clock and a smaller or equal `by`, or all equal and a smaller or equal canonical value. For `deleted`, a pending `true` is cleared **only** by a fetched `true`; a fetched `false` never clears it, whatever its clock, and the pending delete is replayed. A pending write that is beaten is cleared because replaying it could never change the outcome. Until cleared, every pending write is replayed on every push.

What this gives: a PUT the Worker lost to a racing writer (R5) is replayed on the next pass, and per-field clocks let the replay win over the racing writer's older values for the same fields. What it does not give: recovery of a field the Worker lost after the device had seen it stored and cleared it from the pending set, nor recovery for a device that is wiped or whose `shared-spaces.json` is lost. The Worker's own statement stands: reconciliation does not guarantee recovery. The settings status shows "Waiting to upload" while a pending set is non-empty, and "Not synced since {time}" when pushes have failed for more than an hour.

### 3.9 Long-stale replicas: a recovery copy, not a guess

A device whose last successful merge of a Space is older than the 30-day tombstone retention cannot tell, for a local record the fetched blob lacks, whether it is new offline work or a record deleted elsewhere whose tombstone has since expired. The design does not guess either way:

- The device **fetches and merges before it publishes anything** for that Space (every push already does, §3.8), so it never publishes from a stale picture.
- Local records that the fetched blob **has**: merged normally, field by field; the device's offline edits keep their clocks and win or lose by §3.3.
- Local records that the fetched blob **lacks**, and the device's own pending writes that created them: **not published**. They are moved out of the shared Space into a local, unshared Space named "{Space} · kept on this device", with their tabs, so nothing is lost and nothing is resurrected onto other devices without the person choosing to. The Spaces menu says once what happened and where the tabs are; the person can move any of them back into the shared Space, which makes them new records, or leave them.
- **The recovery copy is idempotent.** Each shared Space has at most one recovery Space, which carries `recoveredFrom: <spaceId>` in `workspaces.json`. A later recovery for the same Space adds to it, skipping any tab whose `tabId` it already holds, so repeating the step (after a crash between writing the copy and dropping the records, or a second stale merge) never duplicates a tab. The copy is written and flushed before the records leave the shared Space's local state, so a crash in between leaves the tabs in both places, never in neither. If the person deleted the recovery Space, the next recovery creates a new one.
- **Preservation does not depend on room.** Recovery Spaces are created through a recovery path that is exempt from the 25-Space local cap (`MAX_WORKSPACES` is checked for Spaces a person creates, not for this), so preservation succeeds even when the device already has 25. The Spaces menu lists them like any Space, with a note while the device is over 25 that new Spaces can't be made until one is removed. A recovery Space is never shared automatically; moving tabs out of it into a shared Space makes them new records, and the library's 25-Space cap still applies to sharing.
- A device whose last merge of the Space is **within** the retention window publishes the local records the blob lacks as its own new work. Non-atomic storage means a recent fetch cannot prove the device has seen every relevant tombstone, so this is where resurrection remains possible (§3.5): a record deleted elsewhere whose tombstone this device missed, through a lost write or simply not fetching that blob in time, comes back.

This bounds the visible damage, not the possibility: the recovery copy keeps a long-stale device from republishing absent records wholesale, and a record that does come back reappears in its Space, where the person and Recently closed can act on it. Nothing stronger is claimed.

## 4. From the record to the window and back

### 4.1 Local state

- `workspaces.json` stays the device's projection of each Space: the columns it has today plus three new ones for shared Spaces: `sharedId` (the library's spaceId), `tabIds` (parallel to `urls`) and `sharedLink` (`active` or `dormant`, §4.6). Unshared Spaces carry none. An older build ignores all three.
- A new profile-scoped `shared-spaces.json` holds, bound to the sync `accountId` (the `rebind` guard every sync store has): the last merged index and Space blobs with each blob's content revision and the time of its last successful merge; per Space the pending set (§3.8); per window the displayed baseline, the accepted set and the deferred queue (§4.3–4.4); the request log, the next-class cursor and each class's item cursor (§6.2).
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
- **The person edits the same field locally** (they navigate the deferred tab themselves, or close it): §4.2 records a local edit with a newer clock, which wins over the accepted remote value under §3.3 everywhere (for a close, both sides agree the tab is deleted); the deferred change is dropped as superseded, and the local close records it in Recently closed once.
- **The window leaves the Space or closes**: the change applies on the way out (the window's tabs are being put away anyway).

A deferred navigation keeps the person's page; when applied, the tab loads the newer URL. A deferred close files the page in Recently closed with the live view parked as a local close would (D5). Both are visible when they happen because the person has just left the tab.

### 4.5 Which device has a Space open

Stays per device (contract §4.5). The library records no presence. "A Space is in at most one window at a time" remains desktop's local rule.

### 4.6 Switching the switch

- **On, the first time:** a sheet lists this device's Personal Spaces with their tab counts and the library's remaining room (25 minus the Spaces already there). Every Space that fits the 500-tab and byte limits is ticked by default; the person unticks any they want to keep local (D2). An oversized Space is listed unticked and greyed with the reason, and the sheet offers to split it (D3): it stays local until it fits. Confirming uploads the ticked Spaces as new library Spaces (fresh `spaceId`s and `tabId`s, every field clocked now: this is the one moment a whole Space is stamped new, because it is new to the library). Two devices that each had "Work" end up with two "Work" Spaces (contract §4.2). If the ticked set would pass 25, the sheet says so and asks for fewer.
- **Off:** the device keeps its current copies as local Spaces and publishes nothing further. Nothing is deleted anywhere, and nothing is retracted (contract §4.2; the settings text says so). Each copy keeps a **dormant link** (`sharedLink: dormant`, with `sharedId` and `tabIds`) and **keeps maintaining its records**: §4.2 runs on every autosave as before, so each edit the person makes while the switch is off becomes a field write with the clock of the moment it was made, in the pending set. Only the upload stops; the merged copy of the library's blob is kept as of the last fetch, with its merge time.
- **On again:** for each dormant Space the sheet shows the library's state and offers **Rejoin** (the default when the library still has that Space and it isn't tombstoned) or **Add as a copy**. *Rejoin* is nothing but the ordinary cycle resumed: fetch the Space's blob first, merge it with the device's kept copy under §3.3 (the device's dormant-period writes carry their own clocks and win or lose field by field against what other devices did meanwhile; remote tombstones close the device's tabs into its Recently closed per §4.3), apply §3.9 if the last merge is older than the retention, then push the pending set. Nothing is re-stamped. *Add as a copy* creates a new Space with fresh ids and clocks of now, as a first-time share does; it is the only choice when the library's Space was deleted. So an ordinary off/on cycle with no edits changes nothing in the library.
- **Sync off or account switch:** `shared-spaces.json` is cleared as `tab-sync.json` is; Spaces revert to local copies with no link.

### 4.7 Pairing

After a desktop with the switch **off** that showed a pairing code sees a new device's entry arrive (in `session` or `sends`, the devices Send to device already discovers), it asks once, in Settings → Sync and as a start-page notice, using the device's published name: **"{Device} joined. Keep Spaces and groups in sync with it?"** followed by one line, "This shares your Spaces with every device in this sync that has the switch on," with **Turn on** and **Not now**. Turn on opens the §4.6 sheet. The question is asked once per paired device, for any kind of device (D9), and never again after Not now; a desktop whose switch is already on is never asked.

## 5. Budgets, and what happens over them

Numbers: a tab record with per-field clocks is 250–450 bytes typical (UUID, URL, title, six clocks and writers, position), about 2.9 KiB worst (a 2048-unit URL and a 200-unit title in a 3-byte script, a 100-unit name). A Space of 500 typical tabs is roughly 150–220 KiB of plaintext; of 500 worst-case tabs about 1.4 MiB.

The Worker checks `JSON.stringify(body.blob)` in UTF-8 bytes against **524,288** (`MAX_BLOB_BYTES`), and separately the whole request against 525,312 (`MAX_REQUEST_BYTES`). `encrypt()` returns `{v, iv, ct, tag}` with base64 fields, so a blob is about 4/3 of its plaintext plus about 70 bytes. Measured with the real `encrypt()`: **320 KiB of plaintext is a 436,980-byte blob; 360 KiB is 491,592; 400 KiB is 546,208**, over the cap.

Rules:

1. **Every PUT is checked on the serialized encrypted blob**, `JSON.stringify(blob)` in UTF-8 bytes, against 524,288 less a 4 KiB margin (so 520,192). The 320 KiB plaintext figure (Tab Sync's `BUDGET_BYTES`) is the guide a device uses to decide *before* making a change whether it will fit; the encrypted check is the gate.
2. **A Space blob over the budget on this device's own write refuses the sync of the change, not the change.** A tab opened past the budget opens in the window as usual, marked "not synced" (a quiet dot on its row with the accessible text "Not synced: this Space is full"), and the Spaces menu's status line reads "This Space is full for sync: {count} tabs stay on this device." Nothing already shared is dropped. The budget counts everything in the blob: live records, **tombstones** (a closed tab frees its bytes only when its tombstone expires after 30 days, so closing tabs does not make room at once; the status line says "Closed tabs free their room after 30 days" only when the expiry of the closed tabs alone would let the change fit, and otherwise just that the Space is full), navigation edits (a longer URL can push a full Space over; that navigation is then the unsynced change, and the tab shows the dot) and other devices' concurrent additions (a blob that arrives already over budget is merged and shown in full; this device just can't add to it).
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

The index is a **hint**, not the only reason to fetch, because the blob and index writes are not atomic and a writer can fail between them. So every Space blob is also **reconciled** (fetched regardless of `rev`) in rotation, from the budget share §6.2 reserves for it; and a 404 for a Space blob the index names is treated as "not yet written" (§3.6), never as deleted.

### 6.2 One sliding window, four classes, round robin

**The limit.** A device makes **at most 10 sync GETs in any trailing 60 seconds**, whatever the reason (a scheduled pass, a focus refresh, a 409 retry). It keeps a **request log**: the times of its last 10 GETs. A GET may start only if fewer than 10 logged GETs are younger than 60 s; otherwise the device waits until the oldest one turns 60 s old. Times come from a monotonic clock while running; the log is persisted with wall-clock times, and on start any entry younger than 60 s by wall clock, or in the future (a clock that jumped back), counts as live for a full 60 s of monotonic time. So a restart cannot reset the window.

**Why this bound holds against the Worker.** The Worker counts GETs per account in fixed minute buckets (`bumpLimited`, `Math.floor(Date.now() / 60000)`) and refuses the 31st. Every fixed minute is a 60-second interval, so one device contributes at most 10 GETs to any bucket; two devices at most 20; three at most 30, which the Worker still allows. A fourth device can exceed it, and backoff (below) handles that. (A token bucket of 10 with continuous refill would allow 10 at once and 9 more within the next 54 s, so two devices could reach 38 in one bucket; it is not used.)

**What to fetch: four classes.** Work is in four classes, each with its own **item cursor** (persisted, §4.1):

| Class | Contents | Item cursor |
|---|---|---|
| **I** index | the `spaces` index | one item |
| **S** Spaces to sync | Space blobs with a pending set, then Space blobs whose `rev` differs from the local copy; each 409 retry of a Space push | over spaceIds in id order, pending ones first |
| **F** fixed stores | `bookmarks`, `settings`, `session`, `icons`, `sends`, `closed`, `shared` | over the seven, in that order |
| **R** reconciliation | every Space blob, for the re-read that catches a lost index write | over spaceIds in id order |

**Round robin across requests, not passes.** A persisted **next-class cursor** names the class that gets the next GET, cycling I → S → F → R → I. Whenever the window allows a GET, the device takes the class at the cursor; if that class has nothing to fetch it moves to the next class with work; it fetches that class's item at its item cursor, then advances **both** cursors: the item cursor past the item, and the next-class cursor to the class after the one just served. The cursors live across passes and restarts, so a device whose window allows one GET at a time (each pass gets a single request) still serves I, S, F, R in turn, one request each, and never spends every request on the index. With work in every class each class gets one request in four. With only some classes holding work, the rest take their share. **No class can be starved**, at any rate, and within a class the item cursor gives every item its turn.

A "pass" is just a run of the sync loop that spends whatever the window allows and stops; it no longer has a size of its own. **Pushes** (PUTs) are not GETs and are not counted by the Worker's per-account GET limit; each push's merge-first GET is a class S request. The per-IP limit of 120 requests a minute covers everything from one machine and is not approachable at this cadence. Tab Sync's 15 s / 60 s debounce decides *when* the device's own Space blob is pushed; the push rides the next class S turn. The focus refresh **marks the index as needing a fetch** (so class I has work at its next turn) and never moves the next-class cursor; it waits its turn like any request. Repeated focus events therefore cannot keep resetting the rotation to I and starve the classes after it.

**Backoff.** A **429** lowers the device's window from 10 to 5 GETs per trailing 60 s for the next five minutes (floor 3 after repeated 429s), recovering one step per clean minute back to 10. Round robin keeps every class moving at the reduced rate. The status line shows "Sync is busy; retrying" after two consecutive 429s.

**What the reconciliation guarantee is.** At the full rate with work in every class, class R gets about 2.5 requests a minute, so 25 Space blobs are all re-read within about 10 minutes, well inside the hour the design aims for. At the floor of 3 a minute, class R gets about 0.75 a minute when every class has work, so 25 blobs take about 33 minutes; under heavier or longer limiting it takes longer. The guarantee is therefore **"every Space blob is re-read within an hour at the normal rate, and as often as the window allows under rate limiting"**, and Settings → Sync shows "Checking for changes is slowed by rate limiting" when class R's last full rotation took longer than an hour.

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

**Deploy before any client release that offers the switch**; a client meeting an older Worker gets `404 unknown store` and says "Spaces sync isn't available yet" in Settings, as Send to device does. Deploying is the owner's action. An account can now hold up to 28 blobs (25 Spaces, the index, `closed` and `shared`) beside the existing 5; the storage budget design's cost bound (§7 there) is recomputed in the plan with real per-account averages, which are far below the cap.

## 10. The client

Added to `sync.js`'s `STORES` table the way `sends` was, each `optional: true` with `hasPublishableContent` so a presence-only write never creates a store in KV's missing-read window. The loop's "fetch every store each pass" becomes the §6.2 scheduler, which also decides which Space stores (expanded from the merged index) a pass touches:

- `spaces` and each `space-<id>`: `export`, `merge` and `equals` from a new `src/main/shared-spaces.js` (orchestration, `JsonStore`) over a pure `src/main/shared-spaces-model.js` (records, per-field merge and acknowledgement, final tombstones, the recovery copy, positions with record tags, budgets, the pending set, the revision, the sliding-window scheduler; no electron; unit-tested).
- `closed`: `src/main/synced-closed.js` over `synced-closed-model.js`, modelled on `sends`.
- `shared`: in `shared-spaces.js`.

`main.js` gains the record↔window adapter with its displayed baselines, accepted sets and deferred queues (§4.2–4.4) beside the existing Space machinery (`workspaceCapture`, `applyWorkspaceToWindow`, `makeResidentRuntime`), the switch, the §4.6 sheet, the §3.9 recovery copy, the pairing question and the status lines. The Spaces menu shows a sync mark on shared Spaces (D8) whose accessible text names the state: "Shared", "Waiting to upload", "Not synced since {time}", "Full for sync", "Spaces sync isn't available"; a glyph alone never stands for a state.

## 11. Interface text

New `copy/messages` keys, all six languages in the same PR: the switch and its two lines; the §4.6 sheet (its title, the room line, Rejoin and Add as a copy, the oversized reason and "Split this Space…"); the five sync-mark states; "This Space is full for sync: {count} tabs stay on this device" and "Closed tabs free their room after 30 days"; "{count} of 25 Spaces are shared"; "Sync is busy; retrying" and "Checking for changes is slowed by rate limiting"; "Spaces sync isn't available yet"; the §3.9 Space name suffix "· kept on this device" and its notice; the pairing question, its line and two buttons; "Closed on {device}"; the settings note that turning the switch off keeps shared copies on other devices. F41's spec line is replaced; `spec/features.md`, `spec/parity-matrix.md` (F41 desktop SHIPPED with sync, iOS PLANNED M17) and the privacy label ("Spaces and groups: synced when you turn it on, end to end encrypted") are updated in the shipping PR.

## 12. Security and privacy (R3, R5)

- **What travels:** Space names, colours, symbols, order; tab URLs, titles, custom names, pins, groups and order; Recently closed URLs and titles; device names. Never private tabs, page state, snapshots, splits, favicons' sources (icons go through their own sidecar), `blanc://` or `file://` pages, or anything from a named profile.
- **Consent:** the switch is its own consent (contract §4.2), independent of "Share this device's open tabs". Off by default; an update never turns it on. The pairing question is a Turn on button that opens the sheet, not a default.
- **R3 (the locator is a bearer capability):** unchanged and still open. Shared Spaces add nothing to its exposure beyond more ciphertext under the same locator; the v1 size and rate limits are unchanged. Said plainly in the privacy page and the release notes: no claim of authentication.
- **R5 (non-atomic KV):** unchanged and still open. The design claims only §3.8: pending writes are replayed until a fetched blob contains or supersedes them under the field's rule. A write the Worker lost after the device saw it stored, or a device that lost its local state, is not recovered; a delete racing a write can leave a record visible until the next pass merges the tombstone; a tombstone a device never received can resurrect a record after 30 days (§3.5), bounded by §3.9. The design never claims convergence stronger than that; the test plan (§13) includes the replay, the unrecoverable case and the resurrection case, so the limitations are tested, not assumed.
- **Threats this adds:** a malicious or buggy device in the account can delete or rewrite every shared Space (as it can every Favorite today). Recently closed and the 30-day tombstones bound the loss; Recently deleted keeps a deleted Space for 7 days locally. A remote navigation could point a shared tab at a hostile page; it loads only when the person comes to that tab (§4.4), under the same navigation guards as a typed address (`handOffToOs`, `isForbiddenTopLevelUrl`, the blocker). Records are sanitized on merge like F27 entries, so a junk blob never reaches a renderer.
- **`docs/security-assessment.md`** gets a row for shared Spaces under the Profile Sync entry, and the release's security review signs it.

## 13. Testing

**Shared vectors.** The pure model's behaviour is pinned by vectors that desktop and iPhone both check, through the existing route: `scripts/build-ios-sync-vectors.cjs` generates them into `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` and `test/unit/ios-sync-vectors.test.js` fails if the committed file drifts from the model. M16 adds vector groups for positions (every example in §3.4; the reference `mid` on a fixed list of a thousand random pairs with the `a < m < b` invariant asserted; the record tag of fixed ids; **constructed collision cases**: two records inserted into the same gap from the same neighbours, then a third inserted between those two, then a move of one of them into the same gap again; keys with a wrong tag, a missing tag, a trailing `0` or foreign characters, each with the order it must produce), per-field merge and tie-breaking, `deleted` true-wins, acknowledgement by the full rule, the content revision, and the budget.

**Unit (pure model):** per-field merge is commutative, associative and idempotent; `deleted` true-wins in both orders and no later edit revives; group tombstone racing a tab move ends ungrouped everywhere; `mid` satisfies `a < m < b` and validity on the §3.4 examples and 200,000 random pairs; `mid` is never called with `a ≥ b` on any list the model builds (asserted inside the model); a tagged key stays strictly between its neighbours; concurrent inserts into one gap, built deliberately from the same neighbours, yield distinct keys and an insert between them succeeds; a key whose tag does not match its record is treated as unpositioned; acknowledgement clears a pending write only when `merge(f, p) = f`, and a fetched `deleted: false` with a later clock never clears a pending `deleted: true`; byte budget measured on `JSON.stringify(encrypt(…))` with 400 KiB of plaintext refused and 320 KiB accepted (the figures of §5, computed by the test, not typed in); tombstones counted in the budget; 25-Space and 500-tab caps and the transient 26; sanitization of junk; the pending-set replay (two devices PUT the same Space from the same version; the loser's next pass replays its pending fields and both converge) and the documented unrecoverable case (a write cleared from the pending set then lost upstream stays lost, asserted, so the claim stays honest); the resurrection case (a replica that merged within the window but missed a tombstone brings the record back after expiry, asserted, so the limit stays documented; and §3.9 routes a long-stale replica's absent records to the recovery copy instead of publishing them); the recovery copy is idempotent (running recovery twice, or recovering after a simulated crash between flush and drop, adds each tab once) and succeeds with 25 local Spaces already present; the revision changes on any content change including a slow-clock edit; the scheduler never makes more than 10 (or the backoff window's) GETs in any trailing 60 s, checked over every 60-second window of a simulated hour, including across a simulated restart and a clock that jumps back; two and three simulated devices never exceed 20 and 30 in any fixed minute bucket; **with exactly one request allowed per pass, sustained work in all four classes is served I, S, F, R in turn** and none is starved over 1,000 passes, **including when a focus event arrives before every pass** (class R still gets one request in four, and the focus events only keep class I supplied with work); 409 retries and focus refreshes are counted; class R completes a rotation within the stated bound at each rate.

**Unit (adapter, lifted source like `tab-context-glance-availability.test.js`):** record→window diff produces the right `createTab`/`closeTab`/navigation calls; a protected tab's change goes to the accepted set and the displayed baseline stays put; **the displayed window then diffs to nothing** (no false navigation back, no resurrection); an unrelated local close while a remote close is deferred publishes only the local close; a local navigation of the deferred tab supersedes the remote one by clock; the deferred change applies and the baseline advances when the tab stops being active; an applied change produces no echo edit; a dormant Space keeps producing clocked pending edits and Rejoin fetches first and pushes them unchanged.

**Acceptance (two sync "devices" in one run, as the F27 scenarios do):** the switch-on sheet lists Spaces with room and refuses an oversized one; two "Work" stay two; a tab opened on A appears quiet in B's open Space; a tab closed on A lands in B's Recently closed with its live view parked, and the band shows "Closed on A" once; a navigation on A updates B's quiet tab and defers on B's active tab (in an unfocused window too) until a switch, and B's autosave publishes nothing for it meanwhile; cold start applies a deferred close; a Space-full state shows, names the tombstone case, and clears after expiry (clock advanced by the test hook); turning the switch off, editing, and turning it on again rejoins with the edits and without duplicating; a replica stale past the retention gets a "kept on this device" Space and publishes none of its absent records, including when it already has 25 Spaces, and a second stale merge adds nothing twice; an older Worker (404) shows "isn't available yet"; a 429 slows every class evenly and recovers; with every store changed the device spends its window round robin and finishes the rest as the window allows; a lost index write is caught by reconciliation (clock advanced); the Other-devices drawer shows a shared tab once and a same-URL unshared tab still; a stale sidecar leaves tabs visible.

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
| D7 | Position renumbering? | **None in M16**; the `mid` algorithm with record tags, so keys are unique by construction, and shared vectors (§3.4). |
| D8 | A sync mark on shared Spaces? | **Yes, with accessible text per state**; a glyph never implies a failed upload succeeded (§10). |
| D9 | Ask the pairing question for any new device? | **Any new device, while this device's switch is off**, by its name, once, saying the library is account-wide (§4.7). |

The owner also accepted true-wins deletion with immutable record ids (reopen creates a fresh id, §3.5), rejected the earlier stale-replica rule, and chose to keep "{Space} · kept on this device" as the recovery surface rather than Recently closed, which would misrepresent preserved work and expire it within a day; §3.9 makes it idempotent and independent of the local 25-Space cap, and makes no claim that a recent fetch has seen every tombstone.

## 15. Not in M16

- The phone's side (M17): the mark and menu, groups in the switcher, Bring a Space, the Recently closed band, the per-device switch on iOS.
- Presence ("open on another device"), per the contract's §4.5.
- Splits in shared Spaces (a split's tabs sync as plain tabs; the split itself stays local).
- Position compaction (D7), and a generation or checkpoint protocol that would make tombstone expiry safe (§3.5).
- Named profiles' Spaces.
- The authenticated v2 protocol, atomic writes and deletion fencing (CLAUDE.md: their own project).
- Any marketing claim before the release ships and its evidence exists (`docs/marketing-claims.md`).

## 16. Order of work

1. This document, reviewed and approved.
2. The plan (`superpowers:writing-plans`).
3. Worker route and `STORES`, README; owner deploys.
4. `shared-spaces-model.js` and `synced-closed-model.js` with their unit tests and the shared vectors.
5. Desktop: the scheduler, stores, the adapter with baselines, accepted sets and deferred queues, the recovery copy, the switch and its sheet, the status lines, the pairing question; acceptance scenarios.
6. Security review (§12) and the F41 / parity / privacy updates.
7. The What's New page, then the feature release.
