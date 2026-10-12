# Arc Spaces import: Windows test plan (F45)

The Arc import reads `StorableSidebar.json`, a file whose format Arc never
documented. The parser was built against open-source exporters and synthetic
fixtures, so the spec's release gate requires a real Arc sidebar to be
imported on a Mac, on a Windows PC and through Linux's Choose file… before any
public claim. This plan is the Windows part; the others are
`arc-import-mac.md` and `arc-import-linux.md` in this folder. See
`docs/superpowers/specs/2026-10-11-arc-spaces-import-design.md` and F45 in
`spec/features.md`.

Windows adds two things the Mac run can't show:

- **Where the file is.** Arc for Windows keeps its sidebar inside a Store
  package folder:

  ```
  %LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_<suffix>\LocalCache\Local\Arc\StorableSidebar.json
  ```

  Blanc matches the folder by its prefix and uses it only when exactly one
  matches. This run answers the spec's open question about the suffix.
- **Arc and Blanc sharing the file.** Windows can stop one program writing a
  file another has open. Blanc must never get in the way of Arc saving.

## Before you start

**You need:**

- A Windows PC with Arc installed and a sidebar you use, ideally with:
  - at least two Spaces;
  - a folder, and a folder inside a folder;
  - a split view;
  - some Today (unpinned) tabs;
  - top-row Favorites;
  - a note or Easel, if Arc for Windows has one for you;
  - a Space that uses its own Arc profile.

  If your sidebar has only one Space, or none with its own profile, add a
  temporary Space for the test (in Arc, give it its own profile and a few
  tabs) before step 1, and delete it after step 11.
- Node.js 22 and Git, and a Blanc build from `main` at a known commit:
  - **Dev build:** in PowerShell, from your `blanc` folder:
    ```
    git checkout main
    git pull
    npm install
    npm start
    ```
    A dev build keeps its data in a separate `-Dev` folder, so your everyday
    Blanc profile is untouched. It checks Patron licenses against Polar's
    **sandbox**, so a real Patron key will not activate there. For step 6,
    buy a sandbox key with Polar's test card (see `docs/polar-setup.md`) and
    enter it in Settings → Patron.
  - **Packaged candidate:** the other way to test the Patron path, with a
    real key: a signed validation installer from the native workflow (see
    `CLAUDE.md`), or an unsigned `npm run dist:dir` build. A packaged build
    uses your everyday Blanc profile.

**Do steps 3–9 and 11 through the real interface**, either by hand or with an
agent that operates the real Arc and Blanc windows on screen (for example
Codex with computer use). Both use the real Windows Open dialog and see the
sheet. An automated run through the test hook or Playwright is a useful extra
check, but it replaces the native file picker and nobody sees the sheet, so
it doesn't count as these steps. Record how the steps were run.

An agent follows the same rules as a person:
- Its output, logs and files carry counts only (see **Privacy** below).
- It opens and quits only Arc and the Blanc build under test.
- It never enters payment details. Step 6 waits for a Patron key the owner
  provides.

**Write down:**

- the Windows version and edition, and the processor (x64 or Arm);
- Arc's version (Arc menu → About Arc);
- the Blanc commit (`git rev-parse --short HEAD`) or build number;
- whether the build is dev or packaged.

**Privacy:** your sidebar holds your own URLs and Space names. Record counts,
pass/fail and short notes only. Never paste URLs, Space names or screenshots
of your sidebar into evidence that will be shared. The package folder's
suffix is a publisher id, not personal data; record it.

## 1. Count in Arc, then quit it and record the file's hash

Arc saves its sidebar whenever it changes, even when you only expand a
folder. So count first, while Arc is open. In your smallest Space, note:

- the number of web tabs: pinned tabs, tabs inside folders (including nested
  folders and split views) and Today tabs;
- the number of top-level folders;
- the number of web pages in the top row of Favorites (the same for every
  Space).

Then quit Arc. Check in Task Manager that no Arc process is left running.

List Arc's package folders, then record the file's hash, in PowerShell:

```
Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter 'TheBrowserCompany.Arc_*' | Select-Object -ExpandProperty Name
Get-FileHash -Algorithm SHA256 "$env:LOCALAPPDATA\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json"
```

- Record the folder name's suffix (the part after `TheBrowserCompany.Arc_`)
  and how many folders were listed.
- If more than one folder is listed, Blanc can't tell which is Arc's, so it
  offers only Choose file… (by design). Record which folder holds
  `StorableSidebar.json` and run the rest of the plan with that file: step
  2 with the file command from step 2 of `arc-import-linux.md`, and steps
  4–7 through **Choose file…**.

Keep Arc quit until step 11. Step 10 runs the same `Get-FileHash` command,
and the two hashes must match: Blanc only reads the file.

## 2. The real file parses

From the `blanc` folder on the build's commit, in PowerShell:

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

With Arc still quit, start Blanc and open Bring Your Tabs (Ctrl+L, then
`/bring-tabs`).

- **Pass:** an Arc row offers **Bring Spaces from Arc** and **Choose file…**.
- **Pass:** opening the sheet alone does not read the file (nothing is
  imported until you choose).
- With more than one Arc package folder (step 1), the row says "Arc isn't
  installed here…" and offers only **Choose file…**. Record that as the
  expected result, not a failure.

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
  - Both appear in the space switcher (**Spaces** in the Ctrl+L panel's
    footer), named after the Arc Spaces.
  - No window switches to them.
- Open one of them. Its tabs, pinned tabs and groups match step 5's mapping.
- Import the same Space again. The new space is named `Name (Arc)` rather
  than replacing the first one.

## 7. Favorites

Add one of Arc's top-row Favorites to Blanc Favorites by hand first (open the
site in Blanc and click the heart). Then import with only the Favorites
selected (clear the Space checkboxes; the button reads **Add Favorites**).

- The other Favorites land in a Favorites folder named **Arc**.
- The one you added by hand is not duplicated and keeps its place.

## 8. Choose file…

Copy the file to a folder that isn't synced (with OneDrive backup turned on,
the Desktop and Documents are uploaded):

```
New-Item -ItemType Directory -Force C:\arc-test | Out-Null
Copy-Item "$env:LOCALAPPDATA\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json" C:\arc-test\
```

In Bring Your Tabs, click **Choose file…** and pick the copy in the Windows
Open dialog.

- The dialog is titled "Choose Arc's StorableSidebar.json" and its file-type
  filter reads "Arc sidebar file".
- The preview matches step 4.
- Picking any other JSON file shows "That file isn't an Arc sidebar."

Delete `C:\arc-test` afterwards.

## 9. Closing and reopening

Open the preview, close the sheet (✕, Escape or a click outside), then reopen
Bring Your Tabs.

- It starts again at the browser list, with no stale preview.

## 10. Arc's file is unchanged

With Arc still quit, run step 1's `Get-FileHash` command again. The hash must
match the one from step 1.

## 11. Arc saving while Blanc reads

This step comes last because it changes Arc's file on purpose. Open Arc and
keep changing its sidebar (move tabs between folders) while clicking **Bring
Spaces from Arc** a few times.

- Each attempt either shows a normal preview or "Arc was saving its sidebar.
  Try again in a moment." Never a partial or broken preview. The message may
  never appear: Arc's saves are quick. Record how many attempts you made and
  whether it appeared.
- Arc shows no error about saving or a file in use.
- Quit Arc and open it again. The changes you made are still there: Blanc's
  reads never get in the way of Arc saving.

If you added a temporary Space for the test, delete it now.

## Recording the result

Copy this into the evidence for the release that first ships F45:

```
Arc Spaces import — Windows
Windows: <version and edition>, <x64 | Arm>
Arc: <version>
Arc package folder suffix: <suffix>, folders matched: <n>
Blanc: <commit or build>, <dev | packaged>
Run: <by hand | real interface driven by <agent> | steps automated through the test hook: …>

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
| 11 Arc saving | pass/fail | attempts=, saving message seen=, Arc kept its changes= |
```

A failure in step 2 or step 4 is a parser finding. Record what differed (for
example "tabs 12 in Blanc, 14 in Arc; the missing two are inside a split
view") so it can be reproduced with a fixture. If Arc for Windows stores
something the Mac run didn't show, note its kind (not its contents) the same
way.
