# Arc Spaces import — design

Date: 2026-10-11
Status: decisions approved in conversation; parser landed, flow awaiting implementation
Feature id: F45 (proposed)

## Why

Arc stopped getting new features in May 2025. The Browser Company now builds
Dia, and Arc only receives Chromium and security updates. Its Spaces still
work, but nothing new is coming to them, and Arc users who rely on Spaces
have no obvious next home. Blanc Spaces are the closest
equivalent, and `/arc-alternative` already speaks to these people.

Today Blanc cannot read Arc at all. Favorites import (F30) and Bring Your
Tabs (F40) cover Chrome, Edge, Brave, Chromium and Vivaldi only. An Arc user
has to rebuild every Space by hand, which is the moment most people give up
on switching.

This project lets someone bring their Arc Spaces across in one explicit
step.

## Naming

In this spec **Space** (capitalised) is Arc's Space, and a **Blanc space** is
one saved set in Blanc Spaces, Blanc's Patron feature (renamed from Named
Workspaces on 2026-10-11). Code keeps its internal `workspace` identifiers.

## Decisions (owner, 2026-10-11)

1. **Patrons get one Blanc space per Arc Space.** Everyone else gets each
   Space as tab groups, with an offer to save it as a Blanc space. This
   deliberately relaxes F40's rule that a Blanc space is always a separate
   gesture after migration, for this source only. Creating Blanc spaces stays
   Patron-gated in main.
2. **Pinned tabs open as quiet tabs.** Loose pinned tabs become pinned
   tabs; each top-level folder becomes a group; tabs load only when chosen.
3. **Also imported:** Today (unpinned) tabs, and Arc's top-row Favorites
   into Blanc Favorites.
4. **Platforms at launch:** macOS and Windows read Arc's file directly.
   Arc never shipped on Linux, so Linux (and any machine where discovery
   fails) imports a copied `StorableSidebar.json` through **Choose file…**.

## Non-goals

- Sign-ins, cookies, passwords, history, site permissions or downloads.
- Arc's archived tabs, Notes, Easels, Boosts, Little Arc, Peek and Space
  colors or icons.
- Mapping Arc profiles onto Blanc profiles. Every Space lands in the
  current Blanc profile (Blanc Spaces are profile-scoped); Spaces that used a
  separate Arc profile are labelled so the person knows sign-ins will differ.
- Any automatic grouping or "understanding" of tabs. Groups come only from
  folders the person made in Arc (see `docs/marketing-claims.md`).
- Changing anything in Arc. Blanc only reads, and never asks Arc to quit.

## Source: `StorableSidebar.json`

Arc keeps every Space, its pinned and Today sections, folders, split views
and the top-row Favorites in one JSON file:

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/Arc/StorableSidebar.json` |
| Windows | `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json` (exactly one matching package, else Choose file…) |
| Linux | none; Choose file… only |

The format is undocumented. The shape `src/main/arc-sidebar.js` relies on,
cross-checked against the open-source `arc-export` and `arc-export-windows`
readers, is recorded at the top of that module. Unknown item kinds are
counted and skipped, never guessed at.

### Reading rules (main process only)

- **User-initiated.** Discovery runs only after the person picks Arc as a
  source (F30's rule). Nothing reads Arc's folder on its own.
- **Opaque to renderers.** The page receives an opaque source id, never a
  path. Choose file… uses a native dialog in main; the chosen path stays in
  main for that one read.
- **Bounded.** 32 MiB file cap, 100,000 items, depth 32, 100 Spaces,
  500 Favorites. Read size and type from one open descriptor (the F30
  pattern), and compare size and mtime before and after the read; a change
  means Arc was saving, so ask the person to try again. Arc does not need
  to quit: the file is plain JSON, not a session log.
- **macOS permission errors** reuse F30's Full Disk Access guidance.

## Mapping a Space

Implemented and unit-tested in `planSpaceCapture` / `planArcSpacesImport`:

| Arc | Blanc |
|---|---|
| Space | Blanc space (Patron) or window of groups (everyone else) |
| Space name | Blanc space name; collisions in this profile become `Name (Arc)`, `Name (Arc 2)`…; untitled Spaces become `Space N` by Arc order |
| Loose pinned tab | Pinned, ungrouped tab, first in order |
| Top-level folder | Group with the folder's name, lowercased (Blanc's mono labels); same-named folders share one group |
| Nested folder or split view | Folded into its top-level folder's group (or its section if none) |
| Today tab | Ungrouped tab after the groups |
| Renamed tab title | Kept as the quiet tab's title until it loads |
| Top-row Favorites | Blanc Favorites folder **Arc**, add-only and deduplicated through the existing F30 path |

Bounds: 500 tabs and 50 groups per Space. Tabs past the cap are counted and
shown in the preview, never silently dropped. Only `http:`/`https:` URLs are
kept. Empty Spaces are skipped and listed.

## Flow

1. **Entry.** Arc appears as a source in Bring Your Tabs, and a Patron with
   no spaces sees **Import Spaces from Arc** in the Spaces panel.
2. **Preview.** One row per Space: name, tab and group counts, a note when
   it used a separate Arc profile, and a checkbox (all selected). A separate
   checkbox covers Favorites. Renderers get only counts, titles, hostnames
   and opaque ids (F40's projection), never full URLs.
3. **Room check (Patrons).** If the selection exceeds the free space
   slots (25 per profile), the preview says how many fit and which do not,
   before anything is written. Nothing is partially created.
4. **Apply.**
   - **Patron:** main re-checks `isPatronActive()`, then creates every
     planned Blanc space in **one durable write** (`updateAndFlush`): all
     Spaces or none. No window is bound or switched; the person opens a
     space from the list when they want it. If Patron lapsed between
     preview and apply, the result is `not-patron` and the preview offers
     the everyone-else path.
   - **Everyone else:** each selected Space opens in its own new window,
     tabs quiet and viewless with only the first selected tab woken (F40's
     apply rules), folders as groups. Each window shows a quiet
     **Save this window as a space** offer that leads to Patron.
   - Favorites are added after the tab step succeeds.
5. **Result.** A summary of what was created, what was skipped (non-web
   tabs, Notes and Easels, tabs over the cap) and why, and marks the
   moving-in checklist task complete.

## Privacy and security

- Same posture as F40: explicit source choice, read-only, bounded, no
  network, no telemetry in this project. The Arc profile directory name
  never leaves the parser.
- No path, raw JSON, Space id or full URL crosses IPC. The browser-api
  contract (`browser-api/bridges.json`) gains the new `pages:*` channels
  with their host lists, changed together with the preload and handler.
- Imported URLs are validated again in main before any tab or space is
  created.

## Implementation phases

1. **Parser and planner** (`src/main/arc-sidebar.js`, 15 unit tests). Done
   in this change.
2. **Discovery and read** in `browser-data-import.js` (an `arc` source with
   the per-platform locations above), plus Choose file… via a main-owned
   dialog. Unit tests with a fake fs, mirroring
   `browser-data-import.test.js`.
3. **Apply** in main: Patron path through the workspace store (one durable
   write), everyone-else path through the existing F40 apply seam, and
   Favorites through F30.
4. **Preview UI** in the Bring Your Tabs page and the Spaces panel entry,
   with strings in `copy/messages/en.json` and every shipped language in
   the same PR (F44).
5. **Spec and acceptance:** add F45 to `spec/features.md` and
   `spec/acceptance/arc-spaces-import.feature` with drivable fixtures
   (a `StorableSidebar.json` fixture, Patron and non-Patron runs).

## Release and claims gates

- Before any public claim, import a **real** Arc sidebar on a Mac and on a
  Windows PC with Arc installed, plus the Linux Choose file… path, and
  record the evidence. The format is reverse-engineered; fixtures alone do
  not prove it.
- Marketing copy follows `docs/marketing-claims.md`: say what moves (tabs,
  pinned tabs, folders as groups, Favorites) and what does not (sign-ins,
  Notes, Easels, archived tabs). Arc's status is quoted only from first-party
  sources.

## Open questions

- The Windows package suffix (`_ttt1ap7aakyb4` in community reports) is
  matched by prefix; confirm on a real install.
- Whether Arc's per-profile Favorites rows (`topApps` with a custom
  profile) should be offered separately. v1 imports all of them,
  deduplicated, into one **Arc** folder.
