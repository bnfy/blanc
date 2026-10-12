# Arc Spaces import: Mac test plan (F45)

The Arc import reads `StorableSidebar.json`, a file whose format Arc never
documented. The parser was built against open-source exporters and synthetic
fixtures, so the spec's release gate requires a real Arc sidebar to be
imported on a Mac (and on Windows and Linux, in their own plans) before any
public claim. This plan is the Mac part of that gate; the others are
`arc-import-windows.md` and `arc-import-linux.md` in this folder. See
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
  - a Space that uses its own Arc profile.

  If your sidebar has only one Space, or none with its own profile, add a
  temporary Space for the test (in Arc, give it its own profile and a few
  tabs) before step 1, and delete it after step 11.
- A Blanc build from `main` at a known commit:
  - **Dev build:** `git checkout main && git pull && npm install && npm
    start`. A dev build keeps its data in a separate `-Dev` folder, so your
    everyday Blanc profile is untouched. It checks Patron licenses against
    Polar's **sandbox**, so a real Patron key will not activate there. For
    step 6, buy a sandbox key with Polar's test card (see
    `docs/polar-setup.md`) and enter it in Settings → Patron.
  - **Packaged candidate:** the other way to test the Patron path, with a
    real key. Build one with `npm run dist:dir` (its preflight requires your
    Mac signing certificate and provisioning profile), or use a signed
    candidate. A packaged build uses your everyday Blanc profile.

**Do steps 3–9 and 11 by hand** in the running app. An automated run through
the test hook is a useful extra check, but it replaces the native file picker
and nobody sees the sheet, so it doesn't count as these steps. Record which
steps, if any, were automated.

**Write down:**

- the macOS version and chip (Apple Silicon or Intel);
- Arc's version (Arc menu → About Arc);
- the Blanc commit (`git rev-parse --short HEAD`) or build number;
- whether the build is dev or packaged.

**Privacy:** your sidebar holds your own URLs and Space names. Record counts,
pass/fail and short notes only. Never paste URLs, Space names or screenshots
of your sidebar into evidence that will be shared.

## 1. Count in Arc, then quit it and record the file's hash

Arc saves its sidebar whenever it changes, even when you only expand a
folder. So count first, while Arc is open. In your smallest Space, note:

- the number of web tabs: pinned tabs, tabs inside folders (including nested
  folders and split views) and Today tabs;
- the number of top-level folders;
- the number of web pages in the top row of Favorites (the same for every
  Space).

Then quit Arc and record the file's hash:

```
shasum -a 256 ~/Library/Application\ Support/Arc/StorableSidebar.json
```

Keep Arc quit until step 11. Step 10 runs the same command, and the two
hashes must match: Blanc only reads the file.

## 2. The real file parses

From the `blanc` folder on the build's commit:

```
node -e "require('./src/main/arc-import-source').readDetectedArcSidebar().then(r => console.log(r.error ?? JSON.stringify({ spaces: r.spaces.map(s => ({ tabs: s.tabs.length, folders: s.folders.length, profile: s.arcProfile })), favorites: r.favorites.length, skipped: r.skippedCount }, null, 1)))"
```

It prints counts only.

- **Pass:** no error, and one entry per Space in Arc's order.
- Your smallest Space's `tabs` and `folders` match the counts from step 1.
  Notes, Easels and non-web pages are not tabs; they count toward `skipped`.
- `favorites` matches step 1's count.
- A Space that uses its own Arc profile shows `"profile": "custom"`.

If this step errors or the counts are off, stop and record exactly what
differs. That is a parser finding, and the rest of the plan depends on it.

## 3. Detection

With Arc still quit, start Blanc and open Bring Your Tabs (⌘L, then
`/bring-tabs`).

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

Use a build where Patron is active: a dev build with a Polar sandbox key, or
a packaged candidate with your key.

- Select two Spaces and click **Create 2 spaces**.
  - Both appear in the space switcher (**Spaces** in the ⌘L panel's
    footer), named after the Arc Spaces.
  - No window switches to them.
- Open one of them. Its tabs, pinned tabs and groups match step 5's mapping.
- Import the same Space again. The new space is named `Name (Arc)` rather
  than replacing the first one.
- Optional, if you have enough spaces to get near the 25-space limit: select
  more Spaces than fit. Blanc says how many fit and creates nothing.

## 7. Favorites

Add one of Arc's top-row Favorites to Blanc Favorites by hand first (open the
site in Blanc and click the heart). Then import with only the Favorites
selected (clear the Space checkboxes; the button reads **Add Favorites**).

- The other Favorites land in a Favorites folder named **Arc**.
- The one you added by hand is not duplicated and keeps its place.

## 8. Choose file…

Copy `StorableSidebar.json` to a folder that isn't synced, such as
`~/arc-test` (with iCloud's Desktop & Documents turned on, the Desktop is
uploaded). In Bring Your Tabs, click **Choose file…** and pick the copy in the
Finder dialog.

- The preview matches step 4.
- Picking any other JSON file shows "That file isn't an Arc sidebar."

Delete the copy afterwards.

## 9. Closing and reopening

Open the preview, close the sheet (✕, Escape or a click outside), then reopen
Bring Your Tabs.

- It starts again at the browser list, with no stale preview.

## 10. Arc's file is unchanged

With Arc still quit, run step 1's `shasum` command again. The hash must match
the one from step 1.

## 11. Arc saving while Blanc reads

This step comes last because it changes Arc's file on purpose. Open Arc and
keep changing its sidebar (move tabs between folders) for a couple of minutes
while clicking **Bring Spaces from Arc** again and again. Arc only saves its
sidebar every so often, so a few quick clicks can all finish before it saves
at all.

- Each attempt either shows a normal preview or "Arc was saving its sidebar.
  Try again in a moment." Never a partial or broken preview. The message may
  never appear: Arc's saves are quick. Record how many attempts you made and
  whether it appeared.
- Quit Arc and open it again. The changes you made are still there: Blanc's
  reads never get in the way of Arc saving.

If you added a temporary Space for the test, delete it now.

## Recording the result

Copy this into the evidence for the release that first ships F45:

```
Arc Spaces import — Mac
macOS: <version>, <Apple Silicon | Intel>
Arc: <version>
Blanc: <commit or build>, <dev | packaged>
Run: <by hand | steps automated through the test hook: …>

| Step | Result | Notes (counts only) |
|------|--------|---------------------|
| 1 Count in Arc, hash | done | |
| 2 Real file parses | pass/fail | spaces=, tabs per space=, folders=, favorites=, skipped=, custom profiles= |
| 3 Detection | pass/fail | |
| 4 Preview | pass/fail | |
| 5 Windows (no Patron) | pass/fail | windows= |
| 6 Spaces (Patron) | pass/fail/not run | |
| 7 Favorites | pass/fail | |
| 8 Choose file… | pass/fail | |
| 9 Close and reopen | pass/fail | |
| 10 Arc file unchanged | pass/fail | |
| 11 Arc saving | pass/fail | attempts=, saving message seen= |
```

A failure in step 2 or step 4 is a parser finding. Record what differed (for
example "tabs 12 in Blanc, 14 in Arc; the missing two are inside a split
view") so it can be reproduced with a fixture.

Results recorded with the first version of this plan (#709) used an older
order, in which Arc stayed open from step 3. Their steps 9, 10 and 11 are now
11, 9 and 10, and their end-of-plan hash could not match, because Arc saved
its own changes in the meantime.
