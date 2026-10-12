# Arc Spaces import: Mac test plan (F45)

The Arc import reads `StorableSidebar.json`, a file whose format Arc never
documented. The parser was built against open-source exporters and synthetic
fixtures, so the spec's release gate requires a real Arc sidebar to be
imported on a Mac (and on Windows and Linux, in their own plans) before any
public claim. This plan is the Mac half of that gate. See
`docs/superpowers/specs/2026-10-11-arc-spaces-import-design.md` and F45 in
`spec/features.md`.

The automated desktop scenarios (`@F45`, run by `npm run
test:acceptance:desktop`) already cover the behavior with fixtures. This plan
checks the one thing they can't: that a real Arc sidebar on a real Mac reads
and imports correctly.

## Before you start

**You need:**

- A Mac with Arc installed and a sidebar you use, ideally with:
  - at least two Spaces;
  - a folder, and a folder inside a folder;
  - a split view;
  - some Today (unpinned) tabs;
  - top-row Favorites;
  - a note or Easel;
  - if you have one, a Space that uses its own Arc profile.
- A Blanc build from `main` at a known commit:
  - **Dev build:** `git checkout main && npm install && npm start`. A dev
    build keeps its data in a separate `-Dev` folder, so your everyday Blanc
    profile is untouched. It checks Patron licenses against Polar's
    **sandbox**, so a real Patron key will not activate there.
  - **Packaged candidate:** needed to test the Patron path with a real key.
    Build one with `npm run dist:dir` (its preflight requires your Mac
    signing certificate and provisioning profile), or use a signed
    candidate.

**Write down:**

- the macOS version and chip (Apple Silicon or Intel);
- Arc's version (Arc menu → About Arc);
- the Blanc commit (`git rev-parse --short HEAD`) or build number;
- whether the build is dev or packaged.

**Privacy:** your sidebar holds your own URLs and Space names. Record counts,
pass/fail and short notes only. Never paste URLs, Space names or screenshots
of your sidebar into evidence that will be shared.

## 1. Arc's file is left unchanged

Arc rewrites this file whenever it runs, even when you only expand a folder,
so a hash only proves something across a stretch where Arc stayed quit. Quit
Arc, then record the file's hash:

```
shasum -a 256 ~/Library/Application\ Support/Arc/StorableSidebar.json
```

Record it again each time you are about to open Arc, and right after you quit
it. Each hash taken before you open Arc must match the one taken after you
last quit it: Blanc only reads the file. Arc stays quit for everything except
the hand count in step 2 and step 9.

## 2. The real file parses

From the `blanc` folder on the build's commit:

```
node -e "require('./src/main/arc-import-source').readDetectedArcSidebar().then(r => console.log(r.error ?? JSON.stringify({ spaces: r.spaces.map(s => ({ tabs: s.tabs.length, folders: s.folders.length, profile: s.arcProfile })), favorites: r.favorites.length, skipped: r.skippedCount }, null, 1)))"
```

It prints counts only.

- **Pass:** no error, and one entry per Space in Arc's order.
- Pick your smallest Space and count it by hand in Arc:
  - `tabs` is every web tab: pinned tabs, tabs inside folders (including
    nested folders and split views) and Today tabs;
  - `folders` is the number of top-level folders;
  - notes, Easels and non-web pages are not tabs; they count toward `skipped`.
- `favorites` matches the number of web pages in Arc's top row.
- A Space that uses its own Arc profile shows `"profile": "custom"`.

Record the hash before you open Arc to count (it must match step 1's), and
again after you quit Arc.

If this step errors or the counts are off, stop and record exactly what
differs. That is a parser finding, and the rest of the plan depends on it.

## 3. Detection

With Arc quit, start Blanc and open Bring Your Tabs (⌘L, then `/bring-tabs`).

- **Pass:** an Arc row offers **Bring Spaces from Arc** and **Choose file…**.
- **Pass:** opening the sheet alone does not read the file (nothing is
  imported until you choose).

## 4. Preview

Click **Bring Spaces from Arc**.

- Each Space appears with the tab and folder counts from step 2.
- Untitled Spaces are named `Space 1`, `Space 2`… in Arc's order.
- A Space with its own Arc profile shows "Used its own Arc profile, so you may
  need to sign in again."
- If step 2 reported skipped items, a line says how many can't come across.
- The Favorites checkbox shows the count from step 2.
- Spaces with no tabs can't be selected.

## 5. Without Patron: one window per Space

With Patron not active (a dev build with no sandbox key), select two Spaces
and click **Open 2 windows**.

- Two new windows open, one per Space, in Arc's order.
- In each window:
  - loose pinned tabs come first and are pinned;
  - each top-level folder is a group with the folder's name in lowercase,
    and nested folders and split views are inside it;
  - Today tabs follow, ungrouped.
- Only the selected tab in each window loads; the others stay quiet until
  opened.
- The window you started in is unchanged.

## 6. With Patron: one space per Arc Space

Use a build where Patron is active: a packaged candidate with your key, or a
dev build with a Polar sandbox key.

- Select two Spaces and click **Create 2 spaces**.
  - Both appear in the space switcher (Spaces in the footer), named after
    the Arc Spaces.
  - No window switches to them.
- Open one of them. Its tabs, pinned tabs and groups match step 5's mapping.
- Import the same Space again. The new space is named `Name (Arc)` rather
  than replacing the first one.
- Optional, if you have enough spaces to get near the 25-space limit: select
  more Spaces than fit. Blanc says how many fit and creates nothing.

## 7. Favorites

Add one of Arc's top-row Favorites to Blanc Favorites by hand first. Then
import with only the Favorites selected (clear the Space checkboxes; the
button reads **Add Favorites**).

- The other Favorites land in a Favorites folder named **Arc**.
- The one you added by hand is not duplicated and keeps its place.

## 8. Choose file…

Copy `StorableSidebar.json` to the Desktop. In Bring Your Tabs, click
**Choose file…** and pick the copy.

- The preview matches step 4.
- Picking any other JSON file shows "That file isn't an Arc sidebar."

## 9. Arc saving while Blanc reads

Record the hash (it must match the one from after the count in step 2), then
open Arc. Keep changing its sidebar (move tabs between folders) for a couple
of minutes while clicking **Bring Spaces from Arc** again and again: Arc only
saves its sidebar every so often. Then quit Arc and record the hash.

- Each attempt either shows a normal preview or "Arc was saving its sidebar.
  Try again in a moment." Never a partial or broken preview.

## 10. Closing and reopening

Open the preview, close the sheet (✕, Escape or a click outside), then reopen
Bring Your Tabs.

- It starts again at the browser list, with no stale preview.

## 11. Finish

With Arc still quit, record the hash. It must match the one you recorded
after quitting Arc in step 9. It will not match step 1's, because Arc
rewrote its own file while it was open in steps 2 and 9.

## Recording the result

Copy this into the evidence for the release that first ships F45:

```
Arc Spaces import — Mac
macOS: <version>, <Apple Silicon | Intel>
Arc: <version>
Blanc: <commit or build>, <dev | packaged>

| Step | Result | Notes (counts only) |
|------|--------|---------------------|
| 1 Arc file unchanged | pass/fail | |
| 2 Real file parses | pass/fail | spaces=, tabs per space=, folders=, favorites=, skipped= |
| 3 Detection | pass/fail | |
| 4 Preview | pass/fail | |
| 5 Windows (no Patron) | pass/fail | |
| 6 Spaces (Patron) | pass/fail/not run | |
| 7 Favorites | pass/fail | |
| 8 Choose file… | pass/fail | |
| 9 Arc saving | pass/fail | |
| 10 Close and reopen | pass/fail | |
| 11 Arc file unchanged | pass/fail | |
```

A failure in step 2 or step 4 is a parser finding. Record what differed (for
example "tabs 12 in Blanc, 14 in Arc; the missing two are inside a split
view") so it can be reproduced with a fixture.
