# Arc Spaces import — design

Date: 2026-10-11
Status: implemented; real-Arc evidence recorded on macOS, Windows and Linux (2026-10-12/13, `docs/evidence/f45-arc-import-real-sidebars-2026-10-12.md`); not yet released
Feature id: F45

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

1. **Entry.** An Arc row on Bring Your Tabs' first step offers **Bring Spaces
   from Arc** when Arc's file exists, and **Choose file…** everywhere. A Patron
   with no spaces also sees **Import Spaces from Arc** in the empty space
   switcher, which opens Bring Your Tabs.
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

## Implementation

| Part | Where | Tests |
|---|---|---|
| Parser and planner | `src/main/arc-sidebar.js` | `test/unit/arc-sidebar.test.js` |
| Discovery and bounded read (macOS, Windows, chosen file) | `src/main/arc-import-source.js` | `test/unit/arc-import-source.test.js` |
| Session, projection, apply rules (Patron re-check, room, lapse) | `src/main/arc-import.js` | `test/unit/arc-import.test.js` |
| All-or-nothing space creation | `createMany` in `src/main/workspaces.js` | `test/unit/workspaces-store.test.js` |
| Main wiring: native file dialog, one window per Space via `applyWorkspaceToWindow`, Favorites via `bookmarks.importBookmarks` | `src/main/main.js` | — |
| IPC on the `tab-import` host and the page bridge | `pages:arc-import:*` in `src/main/pages.js`, `tabImport.arc*` in `src/main/tab-preload.js`, `browser-api/bridges.json` | `browser-api:check` |
| Page: Arc row, Spaces preview, result | `src/renderer/pages/tab-import-arc.js` (guarded, `arcImport.*` strings in English and German) | `test/unit/tab-import-arc.test.js` |
| Spec and acceptance | F45 in `spec/features.md`, `spec/acceptance/arc-spaces-import.feature` | `test/desktop/steps/arc-import.steps.js` (F45-1 … F45-7, in the runnable profile) |
| Test-only seams (unpackaged `BLANC_TEST=1` only) | Arc discovery under `BLANC_TEST_BROWSER_HOME` with a chosen platform layout, a stand-in for the native file dialog, a read counter; `arcImport`/`arcImportPage` in `src/main/test-hook.js` | — |
| Empty space switcher entry | `src/renderer/workspace-ui.js` | `test/unit/workspaces-patron-entry.test.js` |

Two small departures from the first draft of this spec: discovery lives in its
own module rather than in `browser-data-import.js`, because Arc is a single
file rather than Chromium profiles..

## Release and claims gates

- Before any public claim, import a **real** Arc sidebar on a Mac and on a
  Windows PC with Arc installed, plus the Linux Choose file… path, and
  record the evidence. The format is reverse-engineered; fixtures alone do
  not prove it. Plans: `docs/testing/arc-import-mac.md`,
  `docs/testing/arc-import-windows.md` and `docs/testing/arc-import-linux.md`.
  Evidence: `docs/evidence/f45-arc-import-real-sidebars-2026-10-12.md`, which
  the first release that ships F45 links from its release record.
- Marketing copy follows `docs/marketing-claims.md`: say what moves (tabs,
  pinned tabs, folders as groups, Favorites) and what does not (sign-ins,
  Notes, Easels, archived tabs). Arc's status is quoted only from first-party
  sources.

## Open questions

- Whether Arc's per-profile Favorites rows (`topApps` with a custom
  profile) should be offered separately. v1 imports all of them,
  deduplicated, into one **Arc** folder. The real-sidebar runs on 2026-10-12
  confirmed that Arc keeps one row per Arc profile on both macOS and Windows:
  a Space with its own profile shows only its profile's row.

## Resolved questions

- **The Windows package suffix (2026-10-12).** A real install of Arc for
  Windows 1.127.0.297 (Arm64) keeps its sidebar under
  `TheBrowserCompany.Arc_ttt1ap7aakyb4`, the suffix community reports gave,
  and exactly one package folder matched. Blanc still matches by prefix, so a
  different suffix would also work. This was recorded by the Windows test plan
  run.
