# Arc importer baseline and export on the rich test setup (October 24, 2026)

This records what the **shipped** F45 importer does with the three **Blanc Test** Spaces in `docs/testing/arc-rich-test-setup.md`, and what Arc's own export of the same setup contains. Release 1 of `docs/superpowers/specs/2026-10-23-arc-migration-design.md` changes this behavior, and this is the "before" picture.

**Scope:**
- This is the parser and planner only. The shipped `parseArcSidebar` and `planArcSpacesImport` from `src/main/arc-sidebar.js` (unchanged since `89c4239d1`) ran under Node 22.17.0 against Arc 1.170.0's live sidebar file on the Mac, read through one open descriptor and never written.
- It isn't an end-to-end import through Blanc's interface. The planner decides every group, pin, title and order that the import writes. `main.js` then applies that capture to a window or a Blanc space.
- Only the test Spaces are described: their folder names, `example.com`/`example.org` paths and custom names are test data. The other four Spaces in the file were parsed and counted, nothing more.

## What the importer does today

### Blanc Test Nesting

| Arc | Blanc |
|---|---|
| 2 loose pinned tabs, one renamed **Custom pinned name** | 2 pinned, ungrouped tabs. The custom name is kept as the title. |
| 8 top-level folders, 15 folders in all, four levels deep | **4 groups:** Research, Clients, Clients / Active, and the long name cut to 40 characters |
| **Research**, a second **Research**, and **research**: three separate folders | **One** group, Research, holding all six tabs `r1`–`r6`, including those from **Papers**, **2026** and **Drafts** nested inside |
| **Clients › Active** (tab `c1`) | group **Clients** |
| folder named **Clients / Active** (tab `c2`) | group **Clients / Active**. It's separate today only because nesting is discarded: Release 1's path names would give both the same name. |
| **Long folder name that runs well past forty characters › Another long nested folder name here** | group **Long folder name that runs well past for**. The nested folder's name is lost. |
| **Empty**, and **Only empty inside › Empty child** | nothing. No group, and no mention in the result. |
| 2 Today tabs | 2 unpinned, ungrouped tabs, last |
| All 9 tabs inside folders, pinned in Arc | **unpinned** |

### Blanc Test Splits

| Arc | Blanc |
|---|---|
| 6 splits: four two-pane, one three-pane, one four-pane; loose, in folders, in a nested folder and in Today | **No splits.** Every pane becomes an ordinary tab in its section or group. |
| Loose pinned split `s1`/`s2` | 2 pinned, ungrouped tabs |
| Folder **Mixed › Nested split** | folded into group **Mixed** |
| Loose pinned tab `r1`, **last** in Arc's pinned list | **3rd** tab: moved ahead of every folder |
| Today split `s15`/`s16`, tab `s17`, an Easel | 3 unpinned, ungrouped tabs. The Easel is skipped. |
| All 12 tabs inside folders, pinned in Arc | **unpinned** |

### Blanc Test Profile

| Arc | Blanc |
|---|---|
| Space on the **Blanc Test** Arc profile | `arcProfile: custom`, so the preview labels it as using a separate Arc profile |
| Pinned: folder **Work** (`w1`), then loose tab `w2` | `w2` pinned and **first**; `w1` unpinned in group **Work**: Arc's order reversed |
| Today tab `w3` | unpinned, ungrouped, last |
| Favorite `example.org/fav` on this profile's row | imported into Blanc Favorites' single **Arc** folder with every other profile's Favorites (4 in the whole file, deduplicated) |

### Across all three

- **All 34 web tabs imported** (13 + 18 + 3), none over the 500-tab cap. `example.com/r1` lands in both Spaces where Arc has it.
- Space names are kept as typed. None clashed.
- **The preview doesn't match the result.** For each Space it shows `folderCount`, the number of top-level folders (8 for Nesting). The result reports dropped tabs, empty Spaces and skipped items, but not:
  - merged folders
  - discarded nesting
  - folded splits
  - dropped empty folders
  - unpinned folder tabs
  - reordering

  Someone importing Nesting sees 8 folders in the preview and ends up with 4 groups, with no explanation.

## What Release 1 has to change, from this baseline

Already in the spec:
- **Keep folders separate.** Today, the two **Research** folders and **research** merge into one group.
- **Name groups by path.** Today, nesting is discarded below the top-level folder.
- **Disambiguate path names that clash.** With path names, **Clients › Active** and **Clients / Active** both become `Clients / Active`.
- **Truncate with a suffix.** Today, the long name is cut at 40 characters, so two long names sharing their first 40 would clash (the supplementary **Blanc QA** setup has such a pair).
- **Keep two-pane splits and list larger ones.** Today, every split is dropped without a word.
- **Report empty folders.** Today, they vanish without a word.
- **Show every transformation in the preview.** Today, the preview's folder count doesn't match the groups the import creates.

Not yet decided:
- **Pinned tabs inside folders.** All 22 folder tabs here are pinned in Arc and unpinned in Blanc. The plan still needs a decision.
- **Sidebar order.** The planner puts loose pinned tabs first, then folders, then Today, so a loose pinned tab placed after a folder in Arc moves ahead of it. Blanc lets ungrouped tabs sit between groups, but ungrouped pinned tabs show in their own pinned section, so keeping Arc's order may only be partly possible. The plan doesn't say yet.

## Arc's export of the same setup

A fresh **Arc > Settings > Advanced > Export Data** of this setup (8,192 bytes, October 24, 05:15) was copied to a private scratch folder, read and then deleted.
- Only the three **Blanc Test** sections are described below. In them, any link that isn't a test link is reported only as a count.
- The other four Spaces' sections were reduced to heading levels and item counts.

### Layout

- **One `#` heading per Space**, with the Space's name. Arc puts all seven Spaces in one file.
- **A `## Favorites` section in each Space, which mixes three things** in this order:
  1. that profile's Favorites row
  2. the Space's loose pinned tabs
  3. its Today tabs

  So **Blanc Test Nesting** and **Blanc Test Splits** each repeat the default profile's 3 Favorites, and **Blanc Test Profile** lists its own `example.org/fav` first. Nothing marks where Favorites end, loose pinned tabs begin or Today begins.
- **Folders are headings**, and nesting depth is the heading level: `##` top-level, down to `#####` for **Drafts**, four levels deep. Markdown has six heading levels, so a folder nested six or more levels deep has no level of its own. That's untested.
- **Folder order is Arc's**, and so is tab order within a folder. A loose pinned tab placed after a folder in Arc is still listed under Favorites, before every folder.
- **Kept:**
  - duplicate names as separate headings (two `## Research`, each with its own `### Papers`)
  - case-only names (`## research`)
  - a literal slash, which is distinguishable from nesting by heading level (`## Clients` › `### Active` versus `## Clients / Active`)
  - long names in full
  - empty folders, as headings with nothing under them
- **Dropped:**
  - splits: panes are plain list items under their folder or section
  - custom tab names: `Custom pinned name` isn't there
  - the Easel
  - every identifier
  - which Arc profile a Space uses
- **Items are bare links** (`- https://…`), without Markdown link syntax or titles.

### Counts against the sidebar

| Space | Test links in the export | In the sidebar |
|---|---|---|
| Blanc Test Nesting | 13: 4 under Favorites, 9 under folder headings | 13 web tabs |
| Blanc Test Splits | 18: 6 under Favorites, 12 under folder headings | 18 web tabs, 6 splits, 1 Easel |
| Blanc Test Profile | 4: `fav`, `w2`, `w3` under Favorites, `w1` under **Work** | 3 web tabs, 1 Favorite |

Every test link in the sidebar appears exactly where its folder or section puts it, so no tab is missing.

### What it means for Release 1

- **The export works as a fallback for links and folder paths.** It carries Space names, folder names, nesting, empty folders and folder order, which is enough to build path-named groups.
- **It can't carry provenance or support matching across computers:** it has no identifiers.
- **It can't preserve splits, custom names or the pinned/Today split.** The importer would have to treat everything under `## Favorites` as one ungrouped run.
- **Folder names are ambiguous in Markdown.** A folder named **Favorites** would look exactly like the Favorites section, and a folder name starting with `#` would read as a deeper heading. A Markdown importer needs rules for both, and they need a real sample.

## Still to check

- Arc ids compared with a second computer.
- Windows.
