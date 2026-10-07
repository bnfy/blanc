# Routine JSON-store saves off the main thread

**Date:** 2026-10-06
**Status:** approved 2026-10-06 (revision 4: revision 3 after two reviews,
plus the plan review's corrections to drain ownership, repeated discards and
serialization failures) — implemented in https://github.com/bnfy/blanc/pull/606
**Amends:** the persistence behavior in `src/main/store.js` (`JsonStore`) and
Named Workspace autosave in `src/main/workspaces.js`, and the "Persistence"
paragraph in `CLAUDE.md`/`AGENTS.md` ("normally saved on a 250ms debounce.
Writes use an owner-only temporary file, fsync, and atomic replacement").
Explicit and quit-time saves stay synchronous.

## Why

Every `JsonStore` save runs on Blanc's main process: `mkdirSync`, `openSync`,
`writeFileSync`, `fchmodSync`, `fsyncSync`, `closeSync`, `renameSync`
(`src/main/store.js:125–149`). Two routine paths call it constantly:

- **The store's own 250 ms debounce** (capped at 5 s) behind `update()`.
  `persistSession()` (`src/main/main.js:4237`) runs after nearly every tab
  broadcast (`:4506`) and saves `session.json` this way; history, the
  blocked-request counter and other stores do too.
- **Named Workspace autosave.** `queueCapture()` (`src/main/workspaces.js:102`)
  arms its own 250 ms timer (`scheduleRetry`, `:95`, with backoff on failure)
  that runs `flushPending()` (`:82`) → `saveCapture()` → `write()` →
  `store.updateAndFlush()`. That is a synchronous, `fsync`ing save on a
  routine timer whenever a window bound to a Named Workspace changes.

Main-process CPU profiles from repeated Windows CI runs (2026-10-06, run
37433818784) put every remaining long freeze in `#flush` from the debounce
timer (`store.js:109`), with `fsyncSync` taking 945–1,386 ms. Those runs had no
active Named Workspace, so the second path was not measured. While main is
frozen, Blanc cannot paint, route input, or answer uBO's network decisions.
#599 keeps such freezes from failing uBO; the freezes themselves remain.

## Decisions

Taken with the owner on 2026-10-06:

1. **Only routine saves become asynchronous:** the store's debounced saves and
   the Named Workspace autosave timer. Explicit saves stay synchronous with
   their current `true`/`false` results: `flush()`, `updateAndFlush()`,
   `saveCapture()` called directly, the quit-time flushes, and the test hook's
   workspace flush. That covers profile creation, workspace checkpoints,
   session checkpoints, the crash ledger, settings migrations, the telemetry
   install ID and sync keys.
2. **Mechanism:** Node's `fs.promises`, so the write and `FileHandle.sync()`
   run on libuv's thread pool, with a per-file sequence check so an older
   asynchronous write can never replace a newer one. A worker thread and a
   utility process were rejected: the kept synchronous callers cannot wait on
   either without blocking.
3. **Durability posture unchanged:** owner-only temp file, flushed to disk,
   atomic rename. Flushing to disk is not dropped.
4. **Leftover temp files are cleaned up**, under the rules in "Stale temp
   files", and never promoted to the committed file.

## Design (`src/main/store.js`)

### Entry state

Each entry (one per device file or per named-profile file) gains:

- `changeSeq` — incremented by every applied mutation.
- `committedChangeSeq` — the `changeSeq` contained in the file last
  committed. The entry is **dirty** while `changeSeq > committedChangeSeq`.
- `writeSeq` / `committedWriteSeq` — one counter shared by both write paths,
  taken at snapshot; a write commits only if its `writeSeq` exceeds
  `committedWriteSeq`.
- `inFlight` — the routine write in progress (at most one), as a promise that
  settles after its cleanup has finished; `rewrite` — another routine write is
  due when it settles.
- `discarded` — set when profile deletion drops the entry.

### Routine save (asynchronous)

Triggered by the debounce timer, by the 5 s cap, or by `updateAndCommit()`
(below):

1. If `inFlight`, set `rewrite` and return. When the write settles, if
   `rewrite` is set and the entry is still dirty and not discarded, clear
   `rewrite` and start one more write with a fresh snapshot.
2. Otherwise, synchronously on main, snapshot `JSON.stringify(entry.data,
   null, 2)` and the current `changeSeq`, and take `writeSeq = ++entry.writeSeq`.
   If serialization throws, nothing is written: log it, keep the entry dirty,
   resolve the waiters this write covered with `false`, and return. Never
   throw out of the save timer.
3. If the entry is discarded, stop. Otherwise, asynchronously: `mkdir`
   (recursive), `fs.promises.open(temp, 'w', 0o600)` with
   `temp = <file>.<pid>.<writeSeq>.tmp`, `handle.writeFile(json)`,
   `handle.chmod(0o600)`, `handle.sync()`.
4. **Always close the handle in a `finally`**, before any temp-file removal.
5. **Commit, in one synchronous step on main:** if the entry is discarded, or
   `writeSeq <= committedWriteSeq` (a newer write already landed), remove the
   temp file and stop. Otherwise `fs.renameSync(temp, file)`, then set
   `committedWriteSeq` and `committedChangeSeq` from the snapshot. JavaScript
   runs one task at a time on main, so no other write can commit between the
   check and the rename.
6. **On any error:** close the handle (step 4), then remove the temp file
   (best effort), then log as today (`quietErrors` respected). The entry stays
   dirty and no timer is re-armed. The next mutation re-arms the debounce, and
   the quit flush writes any dirty entry. `inFlight` settles only after this
   cleanup.

### `updateAndCommit(fn)` (new, asynchronous)

For routine callers that need to know a change reached disk (Named Workspace
autosave):

- Applies `fn`, increments `changeSeq`, then starts a routine save at once
  (no debounce; coalescing as in step 1).
- Returns a promise for `true` once a commit with
  `committedChangeSeq >= that changeSeq` lands, from either write path.
- It resolves `false` if the routine write that should have included the
  change fails or the entry is discarded first. In that case memory keeps the
  change and the entry stays dirty; there is **no rollback**, since only the
  synchronous `updateAndFlush()` promises one. Callers retry, and the quit
  flush covers it.

### `dirty` and `commitPending()` (new)

- `store.dirty` — whether the active entry has changes not yet committed
  (`changeSeq > committedChangeSeq`).
- `store.commitPending()` — the asynchronous counterpart of `flush()` for
  already-applied changes. It starts a routine save if the entry is dirty and
  resolves like `updateAndCommit()`: `true` once a commit covering the current
  `changeSeq` lands (immediately if the entry is not dirty), `false` on
  failure or discard.

### Explicit saves (synchronous; unchanged contract)

`flush()` and `updateAndFlush()` keep their synchronous steps and return
values, also take `writeSeq = ++entry.writeSeq`, and use the same per-write
temp file name. On success they set `committedWriteSeq` and
`committedChangeSeq`. A routine write that started earlier then finds a newer
committed `writeSeq` and discards its temp file.

**`updateAndFlush()` failure while a routine write is in flight**, defined
exactly:

- It applies `fn` and increments `changeSeq`, then the synchronous write fails.
- It restores `data` to the snapshot taken before `fn` **and restores
  `changeSeq`** to its value before `fn`. The rejected mutation is gone from
  memory and from the dirty count.
- It leaves `writeSeq` advanced (an unused number is harmless),
  `committedWriteSeq`/`committedChangeSeq`, `inFlight` and `rewrite`
  untouched, and re-arms the debounce timer only if one was pending before,
  as today.
- The held routine write snapshotted the earlier, unsaved data, so when
  released it commits that data. The rejected mutation is never persisted,
  because every later snapshot is taken from the restored data.

### Quit

`before-quit` → `flushPending()` synchronously writes every **dirty** entry,
not only those with a pending timer, covering routine writes in flight or
failed. Quit durability is at least today's. A routine write still in flight
at quit later finds the newer commit and discards its temp file. If the
process exits first, the temp file is left behind (see "Stale temp files").

### Profile deletion guard

Awaiting in-flight writes is not enough on its own: `#entry()` (`store.js:62`)
recreates an entry on the next access, and a recreated entry could write the
profile's folder back. So:

- `discardProfileStoreEntries(profileId)` first **tombstones** the profile in
  a module-level set, then marks each of its entries `discarded`, clears their
  timers, removes them, and **returns a promise** that settles when their
  in-flight routine writes have closed their handles and removed their temp
  files. The promise is kept per profile until it settles, so a repeated or
  overlapping discard waits for the same writes instead of finding no entries
  and returning at once.
- For a tombstoned profile, `#entry()` returns an **inert** entry: data from
  `defaults`, never loaded from disk, and never written. `update()` applies in
  memory only, `flush()` and `updateAndFlush()` return `false`, and
  `updateAndCommit()` resolves `false`.
- Profile IDs are random UUIDs (`local-profiles.js:15`) and never reused, so
  the tombstone lasts for the rest of the launch.
- The deletion flow (`main.js:8648–8652`, already `async`) awaits the
  returned promise before `fs.rmSync(namedProfileDataDirectory(profileId), …)`.
  On Windows an open temp file would otherwise make the recursive delete fail.

### Stale temp files

A crash or exit mid-write can leave a temp file beside a store file, both
today (`<file>.<pid>.tmp`) and with this change (`<file>.<pid>.<seq>.tmp`).
Cleanup rules:

- **When:** best effort, once per entry on its first load from disk.
- **Exact patterns only:** in the entry's own directory, files named exactly
  `<name>.json.<digits>.tmp` or `<name>.json.<digits>.<digits>.tmp` for that
  store's `name`. Nothing else is touched.
- **Exclusive ownership:** Blanc holds the single-instance lock
  (`main.js:1354`) for its user-data directory, so no other Blanc process owns
  those files. The sweep runs only when the lock is held, and is skipped in the
  acceptance test mode, which runs without it.
- **Never touches active writes:** files whose `<pid>` is this process's are
  skipped.
- **Never promoted:** orphan temp files are only ever deleted, never renamed
  into place, even if the committed file is missing or corrupt. A missing or
  corrupt file still loads `defaults`, as today.

## Named Workspace autosave (`src/main/workspaces.js`)

### "Unchanged in memory" is not "saved"

`write()` (`workspaces.js:66`) skips persistence when `model.updateCapture()`
reports `unchanged`. Once the asynchronous path exists, a capture can be in
memory while its write is still in flight or has failed, so a later checkpoint
of the same capture would report `unchanged`, return success and set status
`saved` with older data on disk. Therefore:

- **Synchronous checkpoints** (`saveCapture()` called directly, the
  synchronous `flushPending()`): when the result is `unchanged` but
  `store.dirty`, call `store.flush()`. On `false`, return
  `{ ok: false, error: 'storage-failed' }` and set status `storage-failed`,
  exactly as a failed `updateAndFlush()` does today. `saved` is reported only
  when the data is on disk.
- **The asynchronous drain** (below): when `unchanged` but `store.dirty`, await
  `store.commitPending()` and treat its result like `updateAndCommit()`'s, so
  retries persist unchanged-but-dirty data too.

### Ownership of asynchronous completions

Per profile, the workspace state gains `epoch` (a number), `draining` (one
asynchronous drain at a time) and `disposed`.

- **One drain per profile.** The timer starts the asynchronous drain only if
  none is running; otherwise it does nothing, because the running pass rereads
  `pending` until it is empty. The drain's promise is installed in `draining`
  **before** its pass starts and cleared afterwards, so a pass that never
  awaits (nothing queued) cannot leave a settled promise that blocks every
  later drain.
- **Epoch.** The drain captures `epoch` when it starts.
  - Every synchronous checkpoint (`saveCapture()` called directly, the
    synchronous `flushPending()`) increments `epoch` after it finishes.
  - `disposeProfile()` increments `epoch`, sets `disposed`, and clears the
    timer on the profile's state object **before** removing it from the map
    (today it only clears the timer and deletes the entry,
    `workspaces.js:140`). An in-flight drain holds that object, so it sees
    `disposed`.
- **A completion acts only if it still owns the state:** the same `epoch`, and
  the profile not `disposed`.
  - It removes a capture from `pending` only if the queued capture is still
    the same object.
  - It sets status (`saved` / `storage-failed`) only if it still owns the
    state.
  - An obsolete completion (superseded or disposed) changes no status. In
    particular, it never replaces a newer checkpoint's status.
- **No stranded captures.** When a drain ends for any reason (finished,
  failed or superseded) and captures are still queued, it calls
  `scheduleRetry`, which arms a fresh pass under the new epoch. Otherwise a
  checkpoint of one workspace during a drain would leave another workspace's
  queued capture with no timer. `scheduleRetry` arms nothing for a disposed or
  unavailable profile or when a timer is already armed, so a disposed
  profile's timer is never re-armed.
- `scheduleRetry` also refuses to arm a timer for a `disposed` profile.

The synchronous `flushPending()` stays for quit (`main.js:4191`) and the test
hook (`:9830`), and `saveCapture()` called directly stays synchronous for
workspace checkpoints (`main.js:5065`). Only the timer runs the asynchronous
drain. Status values and `onStatus()` notifications are unchanged.

## What users see

Nothing, except fewer freezes. The change removes the measured synchronous
write/`fsync` freezes from routine saves. It does **not** remove all
save-related main-thread work: `JSON.stringify` at snapshot and `renameSync`
at commit stay on main. Their cost is measured before merge (below), not
assumed.

**Crash-loss window**, honestly stated:
- Today, changes not yet written are lost on a crash: up to the 250 ms
  debounce, or up to 5 s while updates keep arriving (the cap).
- With this change, add the time a routine write spends queued and in flight
  before its commit.
- That added time is measured on all four CI platforms before merge, and the
  numbers are recorded in the PR.

## Invariants

1. An older write never replaces a newer one: commits happen in increasing
   `writeSeq`.
2. Explicit saves, the synchronous workspace flush and the quit flush are
   synchronous and return the same results as today.
3. Every committed file was fully written and flushed to disk from an
   owner-only temp file before the atomic rename.
4. After quit, the file holds every change made before quit, unless the
   synchronous quit write itself failed, as today.
5. A mutation rejected by a failed `updateAndFlush()` is never persisted.
6. Every routine write closes its file handle before removing its temp file,
   and its `inFlight` promise settles only after that cleanup.
7. Nothing writes a deleted profile's folder: in-flight writes skip their
   commit, and later access gets an inert entry.
8. At most one routine write is in flight per file.
9. No orphan temp file is ever promoted to a committed file.
10. A workspace checkpoint reports `saved` only when its data is on disk.
11. An obsolete workspace completion never changes status or arms a timer.

## Testing

**Unit** (`test/unit/json-store-async-saves.test.js`, real temp directory;
`fs.promises.open` is wrapped so the returned `FileHandle`'s `sync()` can be
held or made to fail):

- **No block:** a routine save returns while `sync()` is held, and the file
  updates after release.
- **Ordering:** held routine write, then `flush()` with newer data, then
  release → the file has the newer data, and the older temp file is removed.
- **Coalescing:** updates during a held write → exactly one follow-up write,
  with the latest data.
- **Failed `updateAndFlush()` during a held routine write:** with the earlier
  change A unsaved and held, `updateAndFlush(B)` fails (synchronous write made
  to fail) → `data` has A and not B, and `changeSeq` is restored. After
  release the file has A, never B, and the timer and `rewrite` follow the
  rules above.
- **Failure cleanup:** `sync()` rejects → the handle is closed before the temp
  file is removed, the entry stays dirty, and the next update or quit writes
  it.
- **Quit:** `flushPending()` with a routine write in flight writes the latest
  data synchronously, and the in-flight write discards on release.
- **Profile deletion:** discard during a held write → the commit is skipped,
  the temp file removed and the folder not recreated. The returned promise
  settles only after release and handle close. An `update()`/`flush()`/
  `updateAndCommit()` for that profile **during the drain and after it** gets
  the inert entry, `flush()` returns `false`, and no file or folder appears.
- **`updateAndCommit()`:** resolves `true` on commit, including when a newer
  synchronous flush covers it, and `false` on failure, with memory kept.
- **Stale temp sweep:** removes only exact-pattern siblings of the loading
  store; leaves other stores' temps, unrelated files, this process's own temps
  and non-matching names. It never promotes a temp file, including when the
  main file is missing.
- **Serialization failure:** an unserializable value fails the routine save
  without throwing from the timer, resolves `updateAndCommit()` `false`, and
  leaves the entry dirty.
- **Repeated discard:** a second discard of the same profile during a held
  write waits for that write too.
- **Updated existing test:** `json-store-profile-scope.test.js`
  (`discardProfileStoreEntries` now returns a promise; the default-profile
  case still returns or resolves `false`).
- **Workspaces** (`workspaces-store.test.js`, extended):
  - the timer path awaits `updateAndCommit`; a capture queued during a held
    write stays pending and is written by the follow-up pass; failure →
    `storage-failed` and backoff;
  - **unchanged but dirty, async write held:** a synchronous checkpoint of the
    same capture flushes synchronously, reports `saved`, and the disk has the
    capture;
  - **unchanged but dirty, async write failed:** the synchronous checkpoint
    flushes; if that flush fails too, it returns `storage-failed`, never
    `saved`; an async retry of unchanged-but-dirty data persists it via
    `commitPending()`;
  - **obsolete completion:** a held async drain fails after a newer
    synchronous checkpoint succeeded → status stays `saved`, and no retry is
    armed;
  - **disposal:** `disposeProfile()` during a held drain → the drain's `false`
    result changes no status and arms no timer, and `scheduleRetry` refuses a
    disposed profile;
  - **one drain per profile:** a timer firing during a drain starts no second
    drain;
  - **empty pass:** a drain that finds nothing queued leaves autosave working
    for the next capture;
  - **no stranded captures:** with captures for workspaces A and B queued, a
    synchronous checkpoint of A during A's held write still gets B written;
  - the synchronous `flushPending()` keeps its results.

**Desktop:** the full acceptance profile and the uBO, shield, session and
workspace desktop suites, on all four platforms.

**Measurements before merge** (the diagnostics-branch technique, rebased onto
this change), on Windows and the other three platforms:

- the event-loop stall monitor and stall-triggered main-process CPU profiles,
  with **an active Named Workspace** in the scenario;
- routine save timings: `JSON.stringify` and `renameSync` on main, and
  queued + in-flight duration.

`#flush` and `fsyncSync` must no longer appear in routine-save freezes, and
any remaining stall must be explained in the PR.

**Affected-machine confirmation before merge.** Hosted checks are not
physical-machine confirmation. The owner confirms packaged candidates on this
Mac and on the Windows VM's normal install with a real profile: settings,
Favorites, history and Named Workspace changes survive a quit and relaunch, a
deleted named profile's folder is removed, and no new freezes appear. The PR
records that confirmation, or a written waiver that names the missing evidence
and the risk.

## Docs to update with the implementation

- `CLAUDE.md` and `AGENTS.md` (mirrored verbatim), "Persistence" paragraph:
  routine debounced saves and Named Workspace autosave run asynchronously off
  the main thread; explicit and quit-time saves stay synchronous; the same
  temp-file + flush-to-disk + atomic-rename posture applies to both.

## Out of scope

- Moving `JSON.stringify` off main.
- Directory `fsync` after rename (not done today either).
- Converting explicit saves to asynchronous.
