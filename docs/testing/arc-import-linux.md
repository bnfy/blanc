# Arc Spaces import: Linux test plan (F45)

The Arc import reads `StorableSidebar.json`, a file whose format Arc never
documented. The parser was built against open-source exporters and synthetic
fixtures, so the spec's release gate requires a real Arc sidebar to be
imported on a Mac, on a Windows PC and through Linux's Choose file… before any
public claim. This plan is the Linux part; the others are `arc-import-mac.md`
and `arc-import-windows.md` in this folder. See
`docs/superpowers/specs/2026-10-11-arc-spaces-import-design.md` and F45 in
`spec/features.md`.

Arc never shipped on Linux, so Blanc doesn't look for it there. Someone moving
from Arc copies `StorableSidebar.json` from their Mac or PC and picks it with
**Choose file…**. This plan checks that path: the Linux file dialog, and that
a sidebar from another computer reads the same on Linux.

## Before you start

**You need:**

- A Linux desktop (any distribution and desktop environment Blanc supports).
- A copy of a real `StorableSidebar.json`. Use the same file as a Mac or
  Windows run of this plan if you can, so the counts can be compared:
  - on a Mac, `~/Library/Application Support/Arc/StorableSidebar.json`;
  - on Windows,
    `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json`.

  Copy it with Arc quit. Move it privately, for example on a USB drive or
  with `scp` on your own network. Don't send it by email or chat, or through
  a synced or shared folder.
- Node.js 22 and Git, and a Blanc build from `main` at a known commit:
  - **Dev build:** `git checkout main && git pull && npm install && npm
    start`. A dev build keeps its data in a separate `-Dev` folder, so your
    everyday Blanc profile is untouched. It checks Patron licenses against
    Polar's **sandbox**, so a real Patron key will not activate there. For
    step 6, buy a sandbox key with Polar's test card (see
    `docs/polar-setup.md`) and enter it in Settings → Patron.
  - **Packaged build:** the other way to test the Patron path, with a real
    key. `npm run dist:dir` builds an unpacked app in `dist/`. A packaged
    build uses your everyday Blanc profile.

**Do steps 3–9 by hand** in the running app. An automated run through the
test hook is a useful extra check, but it replaces the native file picker and
nobody sees the sheet, so it doesn't count as these steps. Record which steps,
if any, were automated.

**Write down:**

- the distribution and version, the desktop environment, and whether the
  session is Wayland or X11;
- where the sidebar file came from (Mac or Windows), and that machine's Arc
  version;
- the Blanc commit (`git rev-parse --short HEAD`) or build number;
- whether the build is dev or packaged.

**Privacy:** the sidebar holds your own URLs and Space names. Record counts,
pass/fail and short notes only. Never paste URLs, Space names or screenshots
of your sidebar into evidence that will be shared.

## 1. Put the file in place and record its hash

```
mkdir -p ~/arc-test
mv <the copied file> ~/arc-test/StorableSidebar.json
sha256sum ~/arc-test/StorableSidebar.json
```

If the file came from a Mac or Windows run of this plan, the hash matches
that run's step 1 hash: it's the same file. Step 10 runs `sha256sum` again,
and the two hashes must match: Blanc only reads the file.

## 2. The file parses

From the `blanc` folder on the build's commit:

```
node -e "require('./src/main/arc-import-source').readArcSidebarFile(process.argv[1]).then(r => console.log(r.error ?? JSON.stringify({ spaces: r.spaces.map(s => ({ tabs: s.tabs.length, folders: s.folders.length, profile: s.arcProfile })), favorites: r.favorites.length, skipped: r.skippedCount }, null, 1)))" ~/arc-test/StorableSidebar.json
```

It prints counts only.

- **Pass:** no error, and one entry per Space.
- For the same file, every count matches the Mac or Windows run's step 2. If
  there is no such run, compare your smallest Space with Arc on the machine
  the file came from, as the Mac plan's step 1 describes.

If this step errors or the counts are off, stop and record exactly what
differs. That is a parser finding, and the rest of the plan depends on it.

## 3. Detection

Start Blanc and open Bring Your Tabs (Ctrl+L, then `/bring-tabs`).

- **Pass:** the Arc row says "Arc never came to Linux. Copy
  StorableSidebar.json from your Mac or PC, then choose it here." and offers
  only **Choose file…**.
- **Pass:** nothing is read until you choose a file.

## 4. Choose file… and preview

Click **Choose file…** and pick `~/arc-test/StorableSidebar.json` in the file
dialog.

- The dialog is titled "Choose Arc's StorableSidebar.json" and its file-type
  filter reads "Arc sidebar file". Record which dialog appeared (GTK, KDE or
  the desktop portal).
- Each Space appears with the tab and folder counts from step 2.
- Untitled Spaces are named `Space 1`, `Space 2`… in Arc's order.
- A Space with its own Arc profile shows "Used its own Arc profile, so you may
  need to sign in again."
- If step 2 reported skipped items, a line says how many can't come across.
- The Favorites checkbox shows the count from step 2.
- Spaces with no tabs can't be selected.
- Cancelling the dialog leaves the sheet as it was, with no error.

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
a packaged build with your key.

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

## 8. Wrong files

- Pick any other JSON file. Blanc shows "That file isn't an Arc sidebar.
  Look for StorableSidebar.json."
- Make the copy unreadable, pick it, then make it readable again:

  ```
  chmod 000 ~/arc-test/StorableSidebar.json
  chmod 600 ~/arc-test/StorableSidebar.json
  ```

  (Run the first command, pick the file in Blanc, then run the second.)
  Blanc shows "Blanc couldn't open that file. Check its permissions and try
  again."

## 9. Closing and reopening

Open the preview, close the sheet (✕, Escape or a click outside), then reopen
Bring Your Tabs.

- It starts again at the browser list, with no stale preview.

## 10. The file is unchanged

```
sha256sum ~/arc-test/StorableSidebar.json
```

The hash must match the one from step 1. Then delete the copy:

```
rm -r ~/arc-test
```

There is no "Arc saving" step on Linux: no Arc is running to save the file.

## Recording the result

Copy this into the evidence for the release that first ships F45:

```
Arc Spaces import — Linux (Choose file…)
Linux: <distribution and version>, <desktop environment>, <Wayland | X11>
Sidebar from: <Mac | Windows>, Arc <version>; same file as that run: <yes | no>
Blanc: <commit or build>, <dev | packaged>
Run: <by hand | steps automated through the test hook: …>

| Step | Result | Notes (counts only) |
|------|--------|---------------------|
| 1 File in place, hash | done | matches source run's hash: yes/no |
| 2 File parses | pass/fail | spaces=, tabs per space=, folders=, favorites=, skipped=, custom profiles= |
| 3 Detection | pass/fail | |
| 4 Choose file… and preview | pass/fail | dialog= |
| 5 Windows (no Patron) | pass/fail | windows= |
| 6 Spaces (Patron) | pass/fail/not run | |
| 7 Favorites | pass/fail | |
| 8 Wrong files | pass/fail | |
| 9 Close and reopen | pass/fail | |
| 10 File unchanged | pass/fail | |
```

A failure in step 2 or step 4 is a parser finding. Record what differed so it
can be reproduced with a fixture.
