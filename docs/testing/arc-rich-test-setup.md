# Arc rich test setup (Arc migration, Release 1)

The first source check on Arc 1.170.0 (`docs/evidence/arc-1-170-mac-sidebar-and-export-2026-10-23.md`) used the owner's real sidebar: one untitled Space, nesting two levels deep and nothing else unusual. That's too narrow for Release 1's new import rules in `docs/superpowers/specs/2026-10-23-arc-migration-design.md`.

This plan builds three labeled test Spaces in Arc covering:
- deep nesting
- duplicate, case-only and long folder names
- a literal `/` in a folder name
- empty folders
- two-, three- and four-pane splits, inside folders and in Today
- custom tab names
- Today tabs and a non-web item
- a Space on its own Arc profile, with its own Favorites

`scripts/arc-test-setup-check.cjs` then reads Arc's sidebar file and confirms the build matches this plan exactly.

Group and tab caps (50 and 500 per Space) aren't built here. They're Blanc's own logic, independent of Arc's file format, so unit fixtures cover them.

## Where it lives

New Arc accounts can't be created since October 22, 2026, so the Spaces go into the owner's **real Arc account** (owner's choice, October 24, 2026).
- Arc Sync copies them to the owner's other computers. That's intended: it gives the second-computer id comparison.
- Every link is on `example.com` or `example.org`. Nothing personal goes into the test Spaces.
- Delete the three Spaces and the **Blanc Test** Arc profile once the checks below are recorded (see *Clean up*).

## Build it

Build in the order listed: the check compares Arc's sidebar order, top to bottom.
- **Links:** type each link without `https://`, for example `example.com/p1`.
- **Custom names:** rename a tab in the sidebar.
- **Pinning:** put the tab in the pinned area above the divider.
- **Nesting:** make a folder inside another folder by dragging it in.
- **Splits:** open the tabs together in Split View (Arc allows up to four).
- **Section names:** "Pinned" is the area above the divider; "Today" is below it.

### Space 1: `Blanc Test Nesting` (default profile)

Pinned, top to bottom:

1. Tab `example.com/p1`, renamed to **Custom pinned name**
2. Tab `example.com/p2`
3. Folder **Research**
   - Tab `example.com/r1`
   - Folder **Papers**
     - Tab `example.com/r2`
     - Folder **2026**
       - Folder **Drafts**
         - Tab `example.com/r3`
4. A second folder **Research** (same name, same level)
   - Tab `example.com/r4`
   - Folder **Papers**
     - Tab `example.com/r5`
5. Folder **research** (lowercase)
   - Tab `example.com/r6`
6. Folder **Clients**
   - Folder **Active**
     - Tab `example.com/c1`
7. Folder **Clients / Active** (a folder whose own name contains a slash)
   - Tab `example.com/c2`
8. Folder **Long folder name that runs well past forty characters**
   - Folder **Another long nested folder name here**
     - Tab `example.com/l1`
9. Folder **Empty**, with nothing in it
10. Folder **Only empty inside**
    - Folder **Empty child**, with nothing in it

Today:

1. Tab `example.com/t1`
2. Tab `example.com/t2`

### Space 2: `Blanc Test Splits` (default profile)

Pinned, top to bottom:

1. Split view: `example.com/s1` | `example.com/s2`
2. Folder **Split folder**
   - Split view: `example.com/s3` | `example.com/s4`
   - Split view: `example.com/s5` | `example.com/s6` | `example.com/s7`
3. Folder **Four pane**
   - Split view: `example.com/s8` | `example.com/s9` | `example.com/s10` | `example.com/s11`
4. Folder **Mixed**
   - Tab `example.com/s12`
   - Folder **Nested split**
     - Split view: `example.com/s13` | `example.com/s14`
5. Tab `example.com/r1` (the same link as in Space 1)

Today:

1. Split view: `example.com/s15` | `example.com/s16`
2. Tab `example.com/s17`
3. An Arc Note (any text), or a native Easel, as a non-web item. The October 24 build used an Easel: Arc 1.170.0 offered **New Easel** but no **New Note** command. Move the Easel to Today and keep it after `s17`.

### Space 3: `Blanc Test Profile` (its own Arc profile)

Create this Space with a **new Arc profile named Blanc Test**.

Pinned, top to bottom:

1. Folder **Work**
   - Tab `example.org/w1`
2. Tab `example.org/w2`

Today:

1. Tab `example.org/w3`

Favorites (the top row, while in this Space): `example.org/fav`

## Check the build

Wait a few seconds after the last change so Arc saves, then run:

```bash
node scripts/arc-test-setup-check.cjs
```

**What it reads:**
- It reads `~/Library/Application Support/Arc/StorableSidebar.json` and never writes to it. Pass a path to read a different copy.
- It describes only the three **Blanc Test** Spaces. Every other Space in the file is reported as a count.
- If Arc saves while it's reading, it says so; run it again.

**What it reports:** either "matches … exactly" or each difference, such as a folder in the wrong place, a missing custom name or a split with the wrong number of panes. Fix the setup in Arc until it matches.

## Then run these checks

1. **Format on the rich setup.**
   - Repeat the counts-only source check from the 1.170.0 evidence against this setup.
   - Repeat it against a fresh **Arc > Settings > Advanced > Export Data**.
   - Record especially:
     - how the export lays out several named Spaces, Today tabs and nesting three or more levels deep
     - how Arc stores three- and four-pane splits
     - how Arc stores the custom profile's Favorites row
2. **Second computer.** Once Arc Sync has copied the Spaces to another Mac signed in to the same account:
   - On each Mac, run `node scripts/arc-test-setup-check.cjs --ids ids-<mac>.json`.
   - Compare the two files. Keys are sidebar positions and values are SHA-256 prefixes of Arc's ids, so matching values mean Arc keeps the same id for that item on both computers.
   - Neither file contains Arc's raw ids.
3. **Windows.** If Arc for Windows is signed in to the same account, run the check against `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json` and compare its `--ids` file too. If it isn't, build the same setup there by hand and run the check.
4. **Current importer.** Import the three Spaces with the shipped F45 importer and record what it does today: how folders flatten, how splits fold, which tabs stay pinned. That's the baseline Release 1 changes.

Record results under `docs/evidence/`, counts and test names only, like the 1.170.0 evidence.

## Clean up

After the checks are recorded:
- Delete the three **Blanc Test** Spaces and the **Blanc Test** Arc profile in Arc.
- Delete the three supplementary **Blanc QA** Spaces and their **Blanc QA** Arc profile too.
- Arc Sync removes them from the other computers.
- Delete any `ids-*.json` files.
