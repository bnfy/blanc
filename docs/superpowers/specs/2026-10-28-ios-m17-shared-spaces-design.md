# iOS M17: Shared Spaces on iPhone

**Date:** 2026-10-28
**Status:** design for the owner's review. Nothing in it is built.
**Contract:** [`2026-10-24-ios-v1-companion-release-design.md`](2026-10-24-ios-v1-companion-release-design.md)
§4 (Shared Spaces and groups), §5 (Recently closed, synced), §6 rows F1, F3,
F6, F18, F27, F40, F41, and the M17 row of §7.
**Protocol:** [`2026-10-25-shared-spaces-sync-design.md`](2026-10-25-shared-spaces-sync-design.md)
(M16), built on desktop in `src/main/shared-spaces*.js`,
`src/main/synced-closed*.js` and `src/main/sync-scheduler.js`, offered from
desktop 1.45. The Worker routes it needs (`spaces`, `space-<id>`, `closed`,
`shared`) are deployed and accepted by the owner (#1216). M17 changes neither
the protocol nor the Worker.
**Owner decisions, 2026-10-28:** the phone's tabs outside any Space are kept as
**This iPhone**; M17 ships as **three stacked PRs** (M17a, M17b, M17c); the
owner sees **2–3 layout options** for groups in the tab grid and for the Space
menu before they are built; **dragging** tabs into and between groups is
**after M17**.

---

## 1. What a person gets

The Island gains a **Space mark** at its leading edge: the current Space's
symbol on its colour, or, on This iPhone, a quiet grey mark once any Space
exists. Tapping it opens the **Spaces menu**: This iPhone, then every Space on
the phone, then, under each other device, that device's Spaces. Choosing a
Space swaps the phone's open tabs for that Space's tabs, the selected one
loading first and the rest loading when they're opened. Choosing This iPhone
brings back the tabs that were open before.

The tab grid shows tabs **under their group headers**: a name, an optional
colour, and a menu to rename, recolour, ungroup or close the group. A tab's
long-press menu moves it into a group, out of one, or into a new one, and moves
it to another Space.

Settings → Sync gains **Keep Spaces and groups in sync on this iPhone**, off by
default, beside **Share this iPhone's open tabs**, with its own line: "Tabs in
your shared Spaces are synced from this iPhone." With it on, the phone's
Spaces are the account's shared library: the same tabs, groups, pins, names and
order as on every desktop that has the switch on, edited from either side, with
a tab closed anywhere leaving everywhere.

With it off, the phone still sees every device's Spaces, read-only, and can
**Bring a Space**: review its tabs and copy it onto the phone as a local Space.

The palette shows a **Recently closed** band among the groups: pages closed on
this phone or any other device in the last day, newest first, each row saying
where it was closed. Tapping one reopens it here.

## 2. Goals, non-goals, anti-goals

**Goals**

1. iOS speaks M16 exactly: same records, clocks, tombstones, positions,
   pending sets, revision hints, request budget, `closed` entries and `shared`
   sidecar, proven by the shared vectors desktop generates.
2. A desktop 1.45 with the switch on and an iPhone with the switch on show the
   same Space, and an edit on either reaches the other within a sync pass.
3. Nothing is lost: a tab removed remotely lands in the phone's Recently closed;
   a phone stale past 30 days keeps its unconfirmed tabs in a "kept on this
   iPhone" Space instead of publishing them.
4. The page under the person's finger never changes (contract §4.6).
5. Groups, Spaces, This iPhone and the active Space survive a cold start.

**Non-goals for M17**

- Dragging tabs into or between groups, and reordering Spaces by drag (owner,
  2026-10-28). Order changes come from menu actions in M17.
- `/space`, `/group`, `/ungroup`, `/close-group`: the slash commands are M10's,
  built in parallel in `SlashCommand.swift`. M17 exposes the `TabsManager`
  calls those commands need (§9) and touches neither that file nor the
  palette's command list.
- Splits, Glance, Tab Archive, custom tab names as an editing feature (a shared
  Space's custom name is shown, F46 contract row).
- Presence ("open on the Mac"), compaction of positions, the authenticated v2
  protocol: M16 §15.
- The onboarding switch screen (contract §3 step 3) and Background App Refresh:
  M18.

**Anti-goals** (M17 has failed even if it works)

- A phone that writes something desktop 1.45 can't merge, or merges something
  differently from desktop. Any divergence from a shared vector is a bug in
  iOS, never in the vector.
- A Space that silently loses a tab, or a remote close that leaves no Recently
  closed row.
- A phone that pushes the account over the Worker's 30 GETs a minute with two
  desktops: the phone keeps M16's 10-per-trailing-minute budget like any
  device.
- A Spaces menu or tab grid that looks like a generic list app rather than
  Blanc: the mockup step (§8) exists to prevent that.

## 3. The phone's tab sets

**This iPhone.** The phone always has exactly one shown tab set. It is either
This iPhone (tabs in no Space, device-local, never shared) or one Space. The
phone's local state keeps every set it has:

- **This iPhone**: its tabs, groups and selection. Never synced as Spaces; its
  tabs reach other devices only through Tab Sync (F27) when "Share this
  iPhone's open tabs" is on and This iPhone is shown.
- **Local Spaces**: Spaces made on the phone, or brought while the switch is
  off, or kept from a dormant shared Space (M16 §4.6). Device-local, like a
  desktop Space with the switch off.
- **Shared Spaces**: local projections of library Spaces, with `sharedId` and
  per-tab `tabId`s, active or dormant exactly as M16 §4.1 describes.

**Switching.** Choosing another set in the Spaces menu puts the shown set away
and shows the chosen one. Putting away keeps the set's records (URL, title,
pin, group, position, selection), not its pages: the web views are released.
Showing a set creates its tabs **quiet** (§4), with only the selected tab
loading. Nothing is asked: This iPhone always keeps the loose tabs, so no
switch can lose them (owner, 2026-10-28).
*My call:* the phone keeps no set-aside pages resident (desktop keeps two),
because iOS evicts web content under memory pressure anyway and a phone has
far less room; coming back to a set reloads its selected page.

**A Space is shown on at most one surface on the phone**, trivially, since
there is one. The same Space may be open on a desktop at the same time
(contract §4.5).

**Private tabs** are never part of any set: they stay open across switches,
listed in the grid's private section as today, and are never saved, synced or
recorded (M9).

## 4. Quiet tabs on the phone

Today every restored tab creates and loads a `WKWebView`. M17 adds a **quiet**
tab: a `TabModel` that holds its URL and title and creates its web view only
when it is first shown, then loads. A quiet tab shows its saved title and the
site's letter in the grid (no thumbnail), counts as an open tab everywhere, and
is published to Tab Sync like any other.

Quiet tabs are what make a 300-tab Space affordable to open, and what a remote
`nav` change applies to without touching a page (M16 §4.3: the quiet tab loads
the new URL when opened). Web views are still created only after the window
exists (the iOS 26 lesson, #1147).
*My call:* cold-start session restore uses quiet tabs too, so the phone stops
loading every saved tab at launch; only the selected one loads.

## 5. Groups

Groups follow desktop's rules (F3, CLAUDE.md "Tab groups"):

- A group has a **name** kept in the case typed and matched without regard to
  case (two groups in one set can't differ only by case; a duplicate is
  refused), and an optional **colour**, one of the eight Space presets or none.
- A group exists only while it holds tabs; its tabs are contiguous; ungrouped
  tabs may sit above, between or below groups. The pure layout rules are a
  Swift port of `src/renderer/tab-sections.js`, checked against vectors
  generated from it (§10).
- A new plain tab opens **ungrouped**. A page-opened tab opens ungrouped at the
  end. New private tabs are never grouped.
- Pinned tabs lead their group's rows (grouped pins) or the set (ungrouped
  pins), as in desktop's ⌘L panel.

**In the tab grid**, groups are sections with a header (name, colour, tab
count, and a fold control), and a group header's menu offers **Rename**,
**Colour ▸**, **New Tab in Group**, **Ungroup** and **Close Group**. A tab's
long-press menu gains **Move to Group ▸** (existing groups, **New Group…**,
**Remove from Group**) and **Move to Space ▸** (every other set on the phone,
**New Space…**). Close Group closes its tabs as one Undo (M11's banner) and,
for a shared Space, one tombstone per tab. The exact layout of headers, folded
groups and the menus is chosen from mockups (§8).

**In the palette**, the tab list shows the same group headers, groups rank
above tabs in the Quick Switcher (contract F6), and choosing a group shows its
first tab.

## 6. Spaces on the phone

**The Space mark** sits at the Island's leading edge, left of the existing
Sunrise menu mark, at least 32 pt square (the iOS 26 UI-test rule). It draws
the Space's symbol on its colour, with desktop's readability guard deciding
white or black ink (`SpaceIdentity` in `src/renderer/space-identity.js`). On
This iPhone it is a quiet grey Spaces glyph once any Space exists, and absent
before the first Space. It is hidden while a private tab is shown.

**The Spaces menu** lists, top to bottom:

1. **This iPhone**, with its tab count.
2. **This iPhone's Spaces** (local and shared), in their order, each with its
   symbol, name, tab count, a sync mark on shared ones whose accessible text
   names the state (M16 §10: "Shared", "Waiting to upload", "Not synced since
   {time}", "Full for sync", "Spaces sync isn't available"; D8), and a check on
   the shown one.
3. **On other devices**: for each other device, its Spaces that this phone
   doesn't already have (a shared Space the phone holds is listed once, in
   2). Choosing one opens **Bring a Space** (§7).
4. **New Space…**, and an **Edit** mode for rename, colour, symbol, move up and
   move down, and delete.

Delete removes the Space at once with an **Undo** banner (M11's), and the phone
keeps a deleted Space in a local Recently deleted for 7 days, as desktop does.
On a shared Space, Delete writes the Space tombstone **at once**, as desktop
does (`sharedSharing.metadata(…, {deleted: true})` in `src/main/main.js`); a
tombstone is final, so Undo (or a restore from Recently deleted) brings the
Space back as a **local copy** with a dormant link, not as the shared Space.
The banner's text for a shared Space says so: "Deleted everywhere. Undo keeps a
copy on this iPhone." Deleting the shown Space
shows This iPhone. Creating is refused at 25 Spaces on the phone, and sharing
at 25 in the library, with the reason (M16 §3.7).

**What "the other devices' Spaces" means.** With the phone's switch **on**,
the phone holds **every** live library Space, as desktop does
(`reconcile()` in `src/main/shared-spaces-service.js` adds each one that isn't
deleted, dormant or a draft to the device's Spaces, and every pass fetches each
one's blob). So section 3 is empty and the menu lists the whole library in
section 2. With the switch **off**, section 3 lists the library's Spaces under
the device that created each (`createdBy`, named from the device list),
read-only, for Bring a Space.

*Reads with the switch off (my call).* Desktop already reads the `spaces` index
while its switch is off, for the switch-on sheet (`sharedIndexPreview()` in
`src/main/sync.js`), merging it into its Spaces state. The phone does the same
for the index, once when the Spaces menu opens and at most once a minute,
through the request budget. It fetches a Space's blob only when the person
opens that Space's review sheet, into a **read-only cache** that is never
merged into `shared-spaces.json`, never uploaded, and is dropped when the sheet
closes. So turning the switch on later starts from exactly the state desktop
would have. The phone writes no Spaces store while off.

## 7. Bring a Space (F40, reinterpreted)

With the switch off, choosing another device's Space in the Spaces menu, or
from the palette's search, opens a **review sheet**: the Space's name and mark,
its groups with their tabs (title and site), the tab count, and one primary
action.

- **Switch on:** every library Space is already on the phone (§6), so "bring"
  is just choosing it in the Spaces menu; there is no review sheet. This is
  the contract's "open the shared Space".
- **Switch off:** the action is **Bring to iPhone**. It copies the Space as a
  new **local** Space (fresh local ids, no link, so later desktop edits don't
  reach it) and shows it. A second line says so: "This copy won't change when
  the Space changes on {device}. Turn on Spaces sync to keep them together."
  with a link to the setting.

Either way the tabs arrive quiet, with only the Space's saved selection (or
its first tab) loading, in one operation: a person never sees tabs trickle
in. Over 25 phone Spaces the action is disabled with the reason.

## 8. Layout mockups before building (owner, 2026-10-28)

Before M17a's UI tasks, the builder renders **2–3 directions** for (a) groups in
the tab grid, folded and unfolded, light and dark, and (b) the Spaces menu with
This iPhone, a shared Space, a local Space and one other device, as real
SwiftUI screens in the iOS simulator (a throwaway branch, not merged), and the
owner picks one per surface. Desktop's Spaces menu and ⌘L group headers are
the reference, adapted to the phone and to iOS 26's glass; nothing is invented
that desktop doesn't have.

**Chosen (owner, 2026-10-28)**, from three directions each, rendered in the
iOS 26.5 simulator:

- **Groups in the tab grid: section headers.** Each group is a header row
  (colour dot, or a hollow ring for no colour; the name; the tab count; a fold
  chevron; a ⋯ menu) above its cards in the ordinary two-column grid. A folded
  group shows one quiet "{count} tabs tucked away" row in place of its cards.
  Not chosen: tinted blocks washed with the group's colour, and a folded group
  drawn as one stacked card.
- **Spaces menu: a card over the Island.** A Blanc-drawn rounded card rising
  from the Island, lined up with it (the Island stays visible below): This
  iPhone with its count; the phone's Spaces with tile, name, tab count, sync
  mark and a check on the shown one; then, per other device, a small device
  heading and its Spaces; a footer with **New Space** and **Edit**. It
  dismisses on a tap outside, a swipe down, or Escape on a hardware keyboard.
  Not chosen: a native `UIMenu` (iOS orders it bottom-up beside the Island and
  can't show sync states well) and a bottom sheet with large tiles.

## 9. Keep Spaces and groups in sync on this iPhone

The switch lives in the native Settings → Sync screen, under "Share this
iPhone's open tabs", off by default, with the line "Tabs in your shared Spaces
are synced from this iPhone." The two switches are independent (contract §4.2).
It appears only while Profile Sync is on.

- **On, the first time:** a sheet lists This iPhone's Spaces (never This iPhone
  itself) with tab counts and the library's remaining room; every Space that
  fits is ticked; an oversized one is unticked and greyed with the reason (D2,
  D3). This iPhone is offered as a one-tap **Save as a Space** first, so a person
  with no Spaces yet has something to share. Confirming uploads the ticked
  Spaces as new library Spaces (M16 §4.6). Two "Work" Spaces stay two.
- **Off:** the phone keeps its copies as local Spaces with dormant links and
  keeps maintaining their records (M16 §2.10, §4.6). Nothing is deleted or
  retracted anywhere; the setting's footer says so.
- **On again:** each dormant Space offers **Rejoin** (default) or **Add as a
  copy**, exactly as desktop.
- **Sync off or account switch:** the Spaces state file is cleared and Spaces
  revert to local copies with no link, as desktop.
- **An older Worker** (404 on `spaces`) shows "Spaces sync isn't available yet"
  under the switch and leaves it off.

The phone has no pairing question to ask (M16 §4.7 is the desktop's, asked when
the phone joins). *My call:* when the phone joins an account whose library
already has Spaces, its Settings → Sync shows the switch with a one-line note,
"{count} shared Spaces are waiting", and nothing turns on by itself.

## 10. The protocol on iOS

Ported to Swift, beside the existing sync code in `ios/Blanc/Blanc/Sync`, each a
pure type with no UIKit or WebKit, unit-tested against desktop's vectors:

| Swift | Ports | What it holds |
|---|---|---|
| `SharedSpacesModel` | `shared-spaces-model.js` | fields and per-field merge, final tombstones, `mid`, record tags, `validKey`, ordering, acknowledgement, revision, budget, sanitize/relay, expiry, `activeTabId`, `applyLocalEdits`, `settlePending`, `recoveryDecision`, `admit`, `pushPlan`, `settleUpload` |
| `SyncScheduler` | `sync-scheduler.js` | the 10-GET trailing window, the I/S/F/R round robin with persisted cursors, backoff on 429 |
| `SyncedClosed` | `synced-closed-model.js` | own entry, merge, budget, inbox, dismissed |
| `SharedSidecar` | the `shared` store in `shared-spaces.js` | own entry bound to the F27 snapshot's `updatedAt`, the receiver's hide rule |
| `SharedSpacesState` | `shared-spaces.js` | the account-bound local file: index, blobs, pending, accepted sets, recoveries, request log and cursors |
| `TabSections` | `tab-sections.js` | group sections from the tab order |

**Vectors.** `scripts/build-ios-sync-vectors.cjs` already emits Spaces vectors
(positions, fields, revision, budget, pipeline, selections, settlements,
selection merge, index revision, relay). M17b adds groups for what iOS ports
and no vector yet covers: `mergeBlob`/`mergeIndex` associativity on three-way
cases, `sanitizeBlob` repairs, `expireTombstones`, `recoveryDecision`,
`admit`, the scheduler (a scripted hour of picks and 429s), the `closed` model
(own entry, merge, budget, inbox), the sidecar, and `tab-sections.js`. The
generator stays the single source; `test/unit/ios-sync-vectors.test.js` keeps
the committed file honest.

**The sync pass.** Today `SyncEngine.runPass` fetches every store every pass.
M17c replaces that with the scheduler for **every** store, switch on or off,
because the phone now reads `spaces` and Space blobs and must stay inside the
per-device budget. `closed` and `shared` are added as optional stores, the way
`sends` was, with `hasPublishableContent` so presence alone never creates a
store.

**Record ↔ tab set.** A Swift adapter does for the shown set what desktop's
`shared-spaces-adapter.js` does for a window: diff the shown tabs against the
displayed baseline into field edits (new tab, `nav`, pin, group, position,
close as `deleted`; groups and Space identity likewise), and apply merged
changes to the shown set in one pass, marking them applied so they produce no
echo. A set that isn't shown has no protected tab and takes every change at
once.

**The protected tab** is the shown set's selected tab while the app is in the
foreground or background. A remote `nav` or tombstone for it goes to the
accepted set and applies when the person selects another tab, closes it
themselves, leaves the Space, or at the next cold start (a return from the
background is not one; contract §4.6). The accepted set is saved with the
Spaces state.

**Remote closes** close the tab the way a local close does: into the phone's
`closed` entry (and its Undo is not offered, since the person didn't close it).
As on desktop (`src/main/main.js`, where closed entries are recorded), a
closed item from a shared Space uses the **shared tab record's id** as its `id`,
so every device lists the page once, and a row for a remote close is labelled
with the device that wrote the tombstone (`deleted.by`, named from the device
list), not with the phone.

**Round-tripping what the phone can't edit.** A shared tab's custom `name`
(F46) is shown and kept unchanged; the phone never clears it. Fields and
records the phone can't interpret are relayed exactly as M16 §3.3 requires
(`relayBlob`, `relayIndex`, `relayInto`).

**Tab Sync with groups and Spaces.** The phone's F27 snapshot
(`TabSnapshots.swift`) starts publishing its groups as desktop does, under the
existing "Share this iPhone's open tabs" consent, and adopts desktop's
membership rule (`src/main/tabsync.js`): when the set of tabs that sit in a
shared Space changes, the snapshot gets a fresh `updatedAt`, so an older
sidecar binding can't tie and win; and the sidecar's `i` indexes the same
filtered list the snapshot was built from, with a binding only where the
snapshot's tab is canonically the tab it describes.

**Stale replicas** (M16 §3.9): a shared Space whose last merge is older than 30
days moves its absent records into one "{Space} · kept on this iPhone" local
Space, idempotent, exempt from the 25 cap.

**Budgets** are M16 §5's, checked on the encrypted blob. A tab past a full
Space's budget opens as usual with a quiet dot and the accessible text "Not
synced: this Space is full"; the Spaces menu says which Space is full.

**Other devices, shown once.** The phone publishes its own `shared` sidecar
entry bound to the F27 snapshot it publishes in the same pass, and hides a
desktop's tabs that sit in a shared Space the phone holds from Other devices,
the start page and the Quick Switcher, under M16 §8's exact rule.

## 11. Recently closed, synced

- The phone publishes its own `closed` entry: pages it closed itself or by a
  remote close, http(s) only, title and URL, never private, 24 hours and 25
  items, `spaceId` when the tab was in a shared Space (M16 §7). Like desktop
  1.45, it reads and publishes `closed` (and `shared`) only while the Spaces
  switch is on: desktop treats all three as Spaces stores under that consent
  (`spaces: true` in `sync.js`'s store table), and the phone matches it.
- The palette shows one **Recently closed** band, newest first, each page
  once: pages the person closed on the phone, unlabelled; pages closed by
  another device, or removed here because another device closed them, as
  "Closed on {device}" (M16 §7).
  Tapping reopens the page as a new tab in the shown set (a new record in a
  shared Space). A row's swipe action **Forget** hides it on the phone; **Clear
  all** clears the phone's own entry and hides every remote row.
- M11's Undo banner stays the immediate way back for the phone's own close; the
  band is the lasting one. With the Spaces switch off (or without Profile
  Sync) the band shows the phone's own closes only, kept locally for the same
  24 hours and 25 items, and nothing is published.

## 12. Saved session

`session.json` grows from `{urls, activeIndex}` to a versioned file:

```
{ "version": 2,
  "shown": "iphone" | "<setId>",
  "sets": { "iphone": { "tabs": [...], "groups": [...], "activeIndex": n },
            "<setId>": { "name", "color", "symbol", "pos", "sharedId"?, "link"?,
                         "tabs": [ { "url", "title", "pinned", "groupId", "tabId"? } ],
                         "groups": [ { "id", "name", "color", "collapsed" } ],
                         "activeIndex": n } },
  "urls": [...], "activeIndex": n }      // the old two keys, for a rollback
```

The old keys keep mirroring the shown set, so a downgrade to a build before M17
keeps the open tabs (desktop's v0 mirror rule). Private tabs are never saved.
Recently deleted Spaces live beside it with their 7-day expiry. The shared
protocol state is separate (`shared-spaces.json`, account-bound), as on
desktop.

## 13. Delivery: three stacked PRs (owner, 2026-10-28)

Each PR is green on its own on the iOS 26.5 and 27.0 simulators and reviewable
alone.

- **M17a — Groups, Spaces and This iPhone, local.** Quiet tabs; groups in the
  grid and palette; the Space mark and menu with local Spaces; This iPhone;
  Move to Group / Move to Space; Recently deleted; session v2. No sync. Starts
  with the §8 mockups and the owner's pick.
- **M17b — The protocol in Swift.** `SharedSpacesModel`, `SyncScheduler`,
  `SyncedClosed`, `SharedSidecar`, `SharedSpacesState`, the extra vectors in
  the generator, all unit-tested against desktop's output. No UI and no
  network change.
- **M17c — Sync it.** The scheduler-driven pass; the switch and its sheets;
  the adapter, accepted set and remote closes; Bring a Space; the Recently
  closed band; the sidecar; status lines and the full-Space dot; copy in all
  six languages; `spec/` updates (F3, F41, F40, F27 iOS rows) and the parity
  matrix.

## 14. Constraints

- iOS 18.4 minimum, SwiftUI + `WKWebView`, no SPM packages, the existing
  `ios/Blanc` project (contract §8).
- Don't edit `SlashCommand.swift`, `SlashCommands.strings` or the palette's
  command list while M10 is in flight; anything M17 needs from them goes
  through the owner.
- No `WKWebView` before the window exists; UI-test hit targets ≥32 pt.
- Every new user-visible string goes through `copy/messages` with all six
  languages in the same PR (`copy:check`), and the shared copy keys desktop
  already added for M16 are reused where the text is the same.
- The Space colours and symbols come from `space-identity.js`: a generated
  Swift file of the eight presets and sixteen Lucide paths, with a check that
  fails when it drifts, like the other substrates.
- No Worker deploy and no desktop behaviour change. The only desktop-side
  edits are to the vector generator and its test.

## 15. Testing

- **Unit (BlancTests):** every vector group in §10; the session v2 round trip
  and the rollback mirror; quiet-tab creation without a web view; `TabSections`
  layout; group naming rules; Space create/rename/delete/Undo/Recently deleted;
  the adapter's diff, apply-without-echo, protected-tab deferral and cold-start
  apply; stale-replica recovery idempotence; the sync pass against a fake
  Worker (`SyncWorkerClientTests`' pattern) spending at most 10 GETs in any
  trailing minute.
- **UI (BlancUITests, iOS 26.5 and 27.0):** make a group and rename it; move a
  tab between groups; create a Space, switch to it and back to This iPhone
  with the loose tabs intact; delete and Undo; Bring a Space from a seeded
  remote library (a `UITestSeed` fixture, as Send to device seeds); a remote
  close of a background tab lands in Recently closed; a remote navigation of
  the selected tab waits until another tab is chosen; turning the switch on
  shows the sheet.
- **Two-device check before the M17c PR is ready for review:** a desktop dev
  build with the switch on and the simulator paired to the same account (the
  deployed Worker), exercising create, close, navigate, group, and delete in
  both directions, recorded in the PR.

## 16. Calls made here, for the owner to check

1. No set-aside pages stay resident on the phone; returning to a set reloads its
   selected page (§3).
2. Cold-start restore loads only the selected tab; the rest are quiet (§4).
3. With the switch off, the phone reads the `spaces` index as desktop's
   switch-on sheet does, and a Space's blob only while its review sheet is
   open, into a cache that is never merged or uploaded (§6).
4. Bring a Space with the switch off makes an unlinked local copy, and says so
   (§7).
5. The switch-on sheet offers to save This iPhone as a Space first (§9).
6. No pairing question on the phone; a note says how many shared Spaces are
   waiting (§9).
7. With the Spaces switch off, the phone's Recently closed band is local only
   and publishes nothing, matching desktop 1.45 (§11).
8. The Space mark is hidden while a private tab is shown (§6).
9. Deleting a shared Space tombstones it at once; Undo keeps a local copy, as
   on desktop (§6).
10. The phone's Tab Sync snapshot starts publishing its groups, as desktop's
    does (§10).
