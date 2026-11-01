# Arc 1.170.0 on macOS: sidebar file and data export (October 23, 2026)

This is the first source check called for in `docs/superpowers/specs/2026-10-23-arc-migration-design.md` (*Check the source first*). It checks three things on a Mac: whether the shipped F45 parser still reads Arc's final build, what Arc's new data export contains, and how the two compare.

**Result:**
- The parser still reads Arc 1.170.0's sidebar file, which has the same shape F45 was built and checked against on Arc 1.168.0.
- The new export is a Markdown list of bare links under headings. It carries no identifiers, tab titles, splits or pinned/Today sections, so it can't support matching imports across computers.
- Matching across computers is still unchecked; it needs a second computer.

All values below are counts, true/false results, hash prefixes, schema key names and Arc's own fixed labels. No URL, tab title, folder name or Space name is recorded.

## Environment

| | |
|---|---|
| System | macOS 27.2 (26B118), Apple M5 |
| Arc | 1.170.0 (89123). Arc's macOS release notes list 1.170.0 as the October 22, 2026 release (a Chromium 156 security update; the notes mention no other change). Installed on this Mac October 23 at 13:17 local time. |
| Blanc parser | `src/main/arc-sidebar.js` as of `89c4239d1` (unchanged on `main` at `0506b1a7e`), run under Node 22.17.0 |
| Sidebar | the owner's real sidebar, synced from their Arc account (the same account the October 12 Mac run used) |
| Driven by | Claude Code. Arc is a browser, so computer use could only view it; the owner ran Arc's export by hand. |

## Method

1. Copied `~/Library/Application Support/Arc/StorableSidebar.json` (440,739 bytes) into a private scratch folder (mode 0600). Size and modification time were identical before and after the copy, so Arc wasn't mid-save. SHA-256 begins `b043b2bd5be369dc`. Arc's own file was only read.
2. The owner ran **Arc > Settings > Advanced > Export Data**, which saved `Arc Data Export.md` (5,409 bytes) to Downloads. It was copied to the same private folder.
3. Three throwaway scripts, kept outside the repository, read the copies:
   - a census of the sidebar's schema and tree, plus a run of the shipped `parseArcSidebar` and `planSpaceCapture`
   - a census of the export's line shapes
   - a section-by-section match of the export against the sidebar, done by exact URL and heading text in memory, printing only counts and booleans

## Sidebar file

**Format.** Unchanged from what `arc-sidebar.js` documents:
- top-level keys `sidebarSyncState`, `version` (= 1), `sidebar`, `firebaseSyncState`
- `sidebar.containers` holds a `global` entry and one entry with `spaces`, `items` and `topAppsContainerIDs`
- Spaces use `newContainerIDs` with object markers `pinned` and `unpinned`, and still keep the older `containerIDs`

**Contents.**

| | Count |
|---|---|
| Spaces | 1 (untitled, default Arc profile) |
| Items | 88: 74 tabs, 4 folders (`list`), 5 split views, 3 item containers, 2 `welcomeToArc` |
| Pinned tabs | 71: 68 inside folders, 3 loose |
| Today tabs | 0 |
| Folders | 2 top-level, 2 nested one level down (maximum depth 2), 0 empty |
| Folders sharing a name in one Space | 0 |
| Folder names or `Parent / Child` paths over 40 characters | 0 |
| Split views | 5, all two-pane, all inside folders |
| Tabs with a custom name | 6 |
| Non-web tabs | 3 |
| Favorites row | 1 row, 3 tabs |

**Identifiers.**
- 76 of the 88 items have uppercase UUID ids. The other 12 are containers and built-in items with ids 10–58 characters long. No id appears twice.
- The Space's id is a 41-character string, not a UUID.
- Every item also carries `createdAt` and `originatingDevice`, and the file holds a `firebaseSyncState`. Together these suggest Arc Sync gives items the same ids on every computer, but that's unchecked: it needs this account's sidebar file from a second computer.

**What the shipped parser does with it.**

| | Result |
|---|---|
| Parse | succeeds; no error |
| Tabs kept | 68 of 71 pinned tabs. The 3 non-web tabs and the 2 `welcomeToArc` items are skipped (`skippedCount` 5). |
| Groups | 2: one per top-level folder. The 2 nested folders fold into their parent, so folder 1's group takes the tabs of both. |
| Splits | all 5 fold away; their tabs land in their folder's group |
| Pinned in Blanc | 3: only the loose pinned tabs. The 65 web tabs inside folders arrive unpinned. |
| Favorites | 3 |
| Over the 50-group or 500-tab caps | none |

## Data export (`Arc Data Export.md`)

| | |
|---|---|
| Size | 86 lines: 1 `#` heading, 3 `##` headings, 2 `###` headings |
| Items | 74 list items, all at the same indent. 72 are a single bare `scheme://…` address (`- <address>`); 2 are an address without `//`. |
| Markdown links, titles, custom names | none. Items carry the URL only. |
| Identifiers | none. The only UUIDs in the file are inside two URLs. |
| Front matter, comments, code blocks | none |

**Section by section, against the sidebar:**

| Export section | Matches in the sidebar |
|---|---|
| `#` heading, no items | not the Space's title (the Space is untitled); possibly the document title |
| `## Favorites`, 6 items | the 3 Favorites, plus the Space's 3 loose pinned tabs |
| `##` heading, no items | text equals top-level folder 1's name |
| `###` heading, 19 items | text equals a nested folder's name inside folder 1; all 19 are that folder's tabs, 6 of them in splits |
| `###` heading, 42 items | the other nested folder in folder 1; 42 tabs, 2 in splits |
| `##` heading, 7 items | text equals top-level folder 2's name; its 7 tabs, 2 in splits |

Every web and non-web tab in the sidebar appears in the export. Nothing in the export is missing from the sidebar.

## What this means for the plan

1. **Release 1 can build on the sidebar file.** Its shape hasn't changed between Arc 1.168.0 and 1.170.0, the final build.
2. **The export can only be a fallback for links and folder paths.** Folder nesting shows up as heading level (`##` top-level, `###` one level down). But the export drops:
   - tab titles and custom names
   - splits
   - the pinned/Today split, since loose pinned tabs are listed under Favorites
   - every identifier

   So it can't carry import provenance or support matching across computers. Matching has to come from the sidebar file.
3. **Folder tabs come in unpinned.** In Arc, folders sit in the pinned section, so 65 of this sidebar's 68 importable tabs are pinned in Arc and unpinned in Blanc. "Pinned tabs" in the plan needs a decision: keep tabs pinned inside their group (Blanc supports group-local pins), or document that only loose pinned tabs stay pinned.
4. **Splits sit inside folders.** All 5 splits here are inside folders, so Release 1's two-pane split import has to work inside path-named groups. Each pair is in one folder here, so Split View's rule that the initiating tab's group wins never comes into play.
5. **Not yet known:** whether ids match on a second computer, the Windows build, and how the export lays out several Spaces, named Spaces, Today tabs and deeper nesting.

## Coverage limits

This sidebar has:
- one untitled Space, on the default profile only
- no Today tabs
- no folders sharing a name, no empty folders
- nesting two levels deep at most
- two-pane splits only
- no long folder paths

That's too narrow to test most of Release 1's new rules.

**Next:**
- Build a deliberately rich test setup in Arc before December 22, covering:
  - several named Spaces and a custom-profile Space
  - Today tabs
  - duplicate and long folder names, an empty folder, nesting three or more levels deep
  - three- and four-pane splits
- Repeat this check on that setup.
- Repeat it on Windows.
- Compare item ids with the same account's sidebar file from a second computer.
