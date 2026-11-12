# Arc migration: import and Space sync

Date: 2026-10-23
Status: merged October 23, 2026 (#1070); nothing implemented. Source checks so far: `docs/evidence/arc-1-170-mac-sidebar-and-export-2026-10-23.md`, `docs/evidence/arc-rich-test-setup-2026-10-24.md`, `docs/evidence/arc-rich-setup-importer-and-export-2026-10-24.md`
Builds on: F45 Arc Spaces import (`docs/superpowers/specs/2026-10-11-arc-spaces-import-design.md`), Blanc Spaces, Profile Sync v1 (`cloudflare/sync-worker/README.md`)

## Why

Arc's own page (arc.net, read 2026-10-23) gives this timeline:

- **October 22:** no new Arc accounts. The latest Arc build adds an option to export all data.
- **December 22:** Arc no longer opens on macOS or Windows. Arc accounts are deactivated and their personal data deleted within 30 days.

Arc points its users to Dia, which it says imports Spaces as Profiles and folders as Tab Groups. Blanc's importer (F45) already reads Arc's sidebar file, but it folds nested folders and splits into the top-level folder, merges same-named folders, and can't keep a Space in step between two computers afterwards. This plan fixes the import first and adds Space sync after it, as two separate releases.

Until December 22, Arc Sync keeps each computer's Arc sidebar file the same, so a person can import on each computer separately. **The import has the hard deadline; sync doesn't**, and sync must never hold the import back.

## Priorities

- Arc migration comes before new feature work, including Mail. Security updates, essential maintenance and stabilizing work already in flight continue.
- Before recording a pause, check what's actually active: Blanc Mail and Blanc for Teams (roadmap "Now"), the iOS port (#1030; M7a sync plan of 2026-10-23), protected video playback (#1061).
- Blanc stays on Electron, the Island stays the default, and the extension boundary doesn't change.

## Release sequence

| When | What |
|---|---|
| **November 5** | Review import readiness. Decide whether two-way Space sync can safely meet December (see *November 5 decision*). |
| **Mid-November (target)** | Release 1: better Arc import, released on its own. |
| **Early December (target)** | Release 2: Personal-profile Space sync, either two-way or the approved one-way fallback. |

Dates are targets. They never permit skipping acceptance, updater or release gates. Each feature release needs its own owner-approved What's New page live on blanc.day before `npm run release` starts.

## Release 1: Arc import that keeps the setup

### Check the source first (this week)

- Re-run the real-sidebar checks against Arc's October 22 build on a Mac and a Windows PC. The F45 evidence (`docs/evidence/f45-arc-import-real-sidebars-2026-10-12.md`) predates that build, so the sidebar file may have changed.
- Get real samples of Arc's new export. Record what each source (sidebar file, export) keeps: Space and folder identifiers, nesting, splits, pinned tabs, custom names. Support the export if it carries usable structure; otherwise document what it can't keep.
- Check whether those identifiers match on two computers sharing one Arc account.
- Re-test the copied-file path on Linux.
- Tell people how to save their Arc data before December 22. Don't promise the sidebar file stays readable after shutdown without evidence.

### Keep track of where each import came from

- Record versioned import provenance for each imported Space, folder and tab: the source identifier where one exists, and which Arc source it came from.
- Store it in a **separate profile-scoped file owned by main**, keyed by Space id, not inside `workspaces.json`. Reasons:
  - `normalizeWorkspace` rebuilds every Space record from a fixed list of fields (`src/main/workspaces-model.js:59`), so an older build silently drops new fields the next time it saves.
  - Raising the `workspaces.json` version makes older builds treat the file as `future-format` and mark Spaces unavailable (`src/main/workspaces.js:53`).
  - A separate file is simply ignored by older builds.
- The separate file records the Space's `revision` that it last matched. If an older build edited the Space in the meantime, the record's revision no longer matches. Main then re-matches tabs by position and URL, and treats anything that doesn't match as new.
- Raw Arc identifiers never cross renderer IPC and never appear in diagnostics or telemetry (F45's rule).
- Importing never needs Sync or a sync key.

### Keep the structure, within current limits

The first release uses **flat groups named by folder path**, such as `Work / Research`. Native nesting must not delay it.

- **Separate folders stay separate.** Each source folder gets its own group even when names collide. Clashes from identical paths, case differences or truncation get deterministic suffixes. Folders are never merged.
- **40-character group names** (`src/main/group-name-case.js:8`) stay. Room for the suffix is reserved before truncating. The preview shows the full source path (bounded) beside the shortened group name.
- **A `/` is plain text** in a group name. Test `/group`, Quick Switcher matching, the group menu's rename field, session restore and Spaces.
- **50 groups and 500 tabs per Space** (`src/main/arc-sidebar.js:27-28`) stay. Over 50 non-empty folders, the first 50 in source order become groups. The preview lists the rest, and only after confirmation are their tabs imported ungrouped. Tabs past 500 are reported as left out.
- **Empty folders** are reported as not imported, with their paths in the summary.
- **Splits:** two-pane splits become Blanc splits where Split View's rules allow (Blanc ships two panes; `PR1_MAX_PANES` in `src/main/split-model.js:13`). Larger splits are listed in the preview, and their tabs are imported in order without the split.
- Custom tab names, Today tabs, Favorites and the all-or-none write for the selected import keep F45's behavior.
- **Open decision: tabs inside folders.** Arc keeps folders in the pinned area, so every tab in a folder is pinned in Arc; F45 imports them unpinned (22 of 22 in the October 24 baseline). Release 1 either pins them inside their group (Blanc's group-local pins) or documents that only loose pinned tabs stay pinned. Decide at the November 5 review.
- **Open decision: sidebar order.** F45 places loose pinned tabs first, then folders, then Today, so a loose pinned tab Arc lists after a folder moves ahead of it. Blanc can lay ungrouped tabs between groups, but ungrouped pinned tabs sit in their own pinned section, so Arc's order may be only partly reproducible. Decide at the same review.
- Existing flat-group rules don't change: unique names ignoring case, `/group` find-or-create, section ordering, ⌘1–9 and the Island's dots.

### Profiles and setup

- Imports land in the chosen Blanc profile. The preview says Space sync will cover Personal only, so a Space imported into another profile won't sync, and logins, passwords and history never come across.
- Setup offers vertical tabs on each computer. The setting (`tabLayout`) is device-local and never synced, and existing users' settings are never changed silently.

### Spec and copy updates

- Update F45 in `spec/features.md`, `spec/acceptance/arc-spaces-import.feature`, the F45 design spec and any claims ledger that says folders fold into top-level groups or that same-named folders share one group.
- Public copy changes only when the behavior ships, per `docs/marketing-claims.md`.

## Groundwork for Release 2: lasting tab identity

Today a saved Space stores its tabs as parallel position-based lists (`urls`, `meta`, `groupIds`, `pinned`, split lists), and every autosave rebuilds it from the live tabs. Groups have `groupIds`; tabs have no lasting id. Merging edits by identity needs one.

- Give each tab a lasting key that survives Space save, restore and switching, session restore, quiet tabs, Recently closed, splits, and moving a tab to another window.
- Keep these keys in the same separate file as import provenance, under the same revision check. An older build that rewrites a Space leaves at worst unmatched tabs, which are treated as new and never as deleted.
- Never sync the keys of private tabs, and never let the keys cross IPC.
- This work can start alongside Release 1 but must not block it. The November 5 review confirms its design.

## Release 2: Personal-profile Space sync

Built on the existing **v1 encrypted transport**, with a separately reviewed Worker extension. The authenticated v2 protocol and Durable Object migration remain a separate project.

### Signing up and everyday behavior

- People choose which Spaces to upload. Existing and newly imported Spaces stay local until chosen.
- **Matching duplicate imports:** at sign-up, main derives matching tokens from the stored provenance, keyed to the account with the sync key, and sends them only inside encrypted data. Spaces with matching tokens are offered as one shared Space, with a preview when their contents differ. Where identifiers differ or are missing, the person confirms possible matches. Nothing is ever merged by name alone. Spaces imported before provenance existed go through an explicit matching flow, and the release doesn't claim automatic de-duplication for them.
- **What syncs:** Space names and appearance, group structure, tab order, pinned tabs, custom tab names and two-pane split arrangements.
- **What never syncs:** private tabs, credentials, cookies, history and live page state.
- Sync never navigates or closes an open page. Remote changes to an open Space are shown as pending and applied only when the person accepts them. Closed Spaces take remote changes directly.

### Data format and forward compatibility

- The Spaces dataset carries its own schema version.
- Clients carry unknown fields through unchanged, and refuse to write a dataset version newer than their own.
- An optional parent field for groups is reserved now, so native nesting can arrive later without a migration and without a December client flattening a nested Space.
- Clients that don't know the new store leave it alone. The Worker only answers store names it knows, and existing clients only ask for theirs.

### Storage and publication on KV

- **One writer per object:** each signed-up device has its own writer identity and namespace, and writes only its own index and objects. Devices never compete for the same object, which removes v1's lost-write race between devices.
- **Revision-named objects:** each object's key includes its revision, and objects are never overwritten in place. KV can take about a minute to show a write at other locations, so a reader can see a new index before its objects. A reader that finds an object missing retries later. Old revisions are removed after a grace period.
- **Confirmation:** a publish counts as done when the Worker's write response returns its `version`. Unsent edits are kept locally until then. There's no read-back check, since on KV it proves nothing more and spends the read budget.
- **Order:** objects are published before the writer's index moves forward. Objects a crash left behind, with no index pointing to them, are cleaned up.
- **Fetching:** each writer's index lists its Space objects and revisions, and readers fetch only what changed. Finding writers goes through a bounded Worker-side listing, never a shared object that clients write.
- **Size:** each encrypted object stays under the existing 512 KiB limit (`MAX_BLOB_BYTES`), counting the full serialized size after encryption. Large Spaces are split into bounded chunks.
- **Read budget:** the Worker allows 30 reads per account per minute (`RATE_LIMIT`), shared by every device on the account, including the iPhone once iOS M7a ships. Reads are scheduled within that budget, back off when throttled and leave room for the existing stores.
- The Worker change is deployed, backward compatible, before any desktop client uses it.

### Reconciliation

- Independent edits merge by Space, group and tab identity.
- Conflicting edits to the same item keep both sides as recoverable alternatives, never a full copy of the Space. Conflict storage is bounded. When it's full, the person sees a condition they can resolve; conflicting work is never silently discarded.
- If sync fails or hits a size limit, local Spaces stay fully usable.

### Device identity, retirement and copied devices

- **Copied devices:** Migration Assistant and backup restores copy `userData`, which includes the device's writer identity. If a device finds a revision in its own remote index that it never published, it's a copy, and it takes a new writer identity before publishing anything more. This only catches a copy after the fact: two copies running at the same time can both publish under the one identity before either sees the other's revision, and one index update can replace the other. **Unresolved:** the November 5 review must show a design in which simultaneous copies lose no edits and are detected, without relying on KV's non-atomic read-then-write.
- **Retirement:** people can retire a device. Retired writers are left out of merging, and their remote objects are removed by cleanup that can safely run again.
- **Returning devices:** inactivity expiry and how long deletion records are kept are set together. A device away longer than that window must sign up again, and its local data is offered as a separate recovery import. A returning device always reconciles before publishing.

### Deletion and v1's limits

- Account deletion covers every Space object, through paged prefix deletion that's repeated to catch KV listings that lag behind.
- The scheduled clean-up of inactive accounts must cover the new keys.
- Ordinary deletion is tested separately from deletion during concurrent uploads.
- **v1's stated limit** (`cloudflare/sync-worker/src/index.js:136-138`): deletion can't guarantee permanent revocation, and can't stop an out-of-date client that still holds the account key from uploading again. Copy never claims immediate or guaranteed deletion.

## November 5 decision

Two-way sync continues only if the reviewed design shows all of these:
- bounded storage and a workable request volume
- lasting tab identity
- matching of duplicate imports
- recovery from concurrent and offline edits
- no lost edits when two copies of one device publish at the same time (see *Device identity*)

The review also fixes chunk size, writer limits, polling intervals, how long deletion records are kept, and conflict capacity.

If it doesn't, the approved **one-way Space copy** fallback ships instead:

- Publish an encrypted snapshot of chosen Personal-profile Spaces.
- Another computer previews a snapshot and imports it as new Spaces, or explicitly replaces chosen local Spaces after keeping a recovery copy. The same provenance matching applies.
- No background merging and no automatic replacement.
- Each snapshot shows its source device and time.
- The same storage, consent, clean-up and v1 deletion qualifications apply.
- Release 1 stays independent either way.

## Later

After these releases, in order:
1. Native nesting, designed for:
   - empty folders that stay
   - duplicate names, and path-aware `/group`
   - Quick Switcher labels and ⌘1–9 numbering
   - moving whole subtrees
   - keeping tab order contiguous
   - Recently closed and splits
   - session restore and rollback copies
   - the reserved parent field
2. Peek-style pinned-link behavior using Glance.
3. A small window for external links, with explicit moving into a Space.
4. User-defined routing for external links.
5. Profile-aware Space switching, then separately consented sync for named profiles.

Deferred: Boosts, Easels, live integrations, AI features and mobile parity. General extension support and a Chromium fork stay out of scope.

## Verification

- **Import:**
  - real Mac and Windows sidebars and exports
  - copied files on Linux
  - Arc identities across two computers; duplicate, differing and identifier-less imports
  - long paths, plain-text slashes, case clashes and truncated suffixes
  - empty folders, and more than 50 groups or 500 tabs
  - two-pane and larger source splits
  - malformed files, interrupted imports and session restore
- **Lasting identity:** tab keys survive every path listed under *Groundwork*, and a rollback build's rewrite leaves unmatched tabs as new, never deleted.
- **Sync:**
  - several devices, delayed KV visibility and throttling
  - offline edits, conflicts and full conflict storage
  - copied devices, retirement, returning old devices and deletion
  - running out of storage
  - coexisting with existing clients, the existing Sync stores and the iOS client
- **Boundaries:** profile isolation and exclusion of private data hold through import, saving and sync.
- **Gates:** the required unit, desktop, packaged-platform, updater and release checks.
- **Testers:** consenting Arc users check import, everyday navigation and recovery on a second computer.
- **Telemetry:** local diagnostics and tester feedback only. Any new telemetry needs its own consent behavior, event schema and Worker allowlist review.

## Roadmap and public claims

- After the November 5 decision, update the public roadmap (`site/src/data/roadmap.json`) so it shows the approved Arc milestones and any paused work accurately.
- Switching-guide and comparison claims follow released behavior only, with first-party sources for Arc and Dia.
- The owner approves finished promotional content and captions before publication.

## Open questions

- Answered October 23–24: Arc's export carries no identifiers, titles, splits or pinned/Today distinction (`docs/evidence/arc-rich-setup-importer-and-export-2026-10-24.md`). It can only be a fallback for links and folder paths; matching across computers has to come from the sidebar file.
- Whether tabs inside Arc folders stay pinned, and whether Arc's sidebar order is kept (see *Keep the structure, within current limits*).
- Whether the sidebar file stays on disk and readable after December 22.
- Whether Release 2's Worker change should land before or after iOS M7a's client ships, to avoid testing the iPhone against a moving Worker.
