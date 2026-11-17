# Save downloads without asking (#1591)

Date: November 17, 2026. Size: a small change.

## Intent

Today every download in the desktop app opens Save As and waits, on every
platform: `will-download` in `src/main/downloads.js` never sets a save path, so
Electron falls back to its dialog. Downloading several files in a row means
confirming each one. Chrome and Safari save to the Downloads folder without
asking by default. Issue #1591 asks for that, with the dialog kept as an option.

## Decisions (owner, November 17, 2026)

- **Default: save without asking, for everyone, existing profiles included.**
  Existing users see downloads stop asking after the update; the release note
  says so and points to the switch.
- **A switch keeps the dialog available**: Settings → General → Browsing,
  "Ask where to save each file" (off by default).

## Approaches

1. **Chosen: Blanc sets the path when the download starts.** With the switch
   off, `will-download` calls `item.setSavePath()` with a free name in
   `app.getPath('downloads')`.
2. `session.setDownloadPath()` only changes the folder the dialog opens in; the
   dialog still shows and duplicate names aren't handled. Rejected.
3. Keep the dialog with the name prefilled: still one confirmation per file,
   which is the complaint. Rejected.

## Design

- **Setting** `askWhereToSave` (boolean, default `false`), device-local: not in
  `SYNCED_KEYS`, listed in `settings-schema/schema.json` `internalDefaults`,
  sanitized in `settings.js` and accepted by the `setSettings` whitelist like
  `reuseNewTab`. Settings row and copy (label and hint) in `en.json` and every
  selectable language in the same change.
- **Free name, pure module** (new `src/main/download-path.js`, unit-tested, no
  `require('electron')`): given a folder, a suggested filename, an "exists"
  check and a set of names already reserved, return `name.ext`, else
  `name (1).ext`, `name (2).ext` …, keeping compound extensions such as
  `.tar.gz` together and falling back to `download` for an empty name.
  Chromium's sanitized `item.getFilename()` is the input; the module still
  strips path separators so a name can never leave the folder.
- **Reservations**: a chosen path is reserved from `will-download` until that
  item's `done`, so two simultaneous downloads of the same file get different
  names. A file already on disk is never overwritten.
- **Order inside `will-download`** is unchanged around it: the requester check
  and deleted-profile cancel run first; a retry still reuses its remembered
  path; only a new download with the switch off gets a chosen path. With the
  switch on, behavior is exactly today's.
- **Only clicked downloads skip the dialog** (added after the branch review):
  a download without a user gesture (`item.hasUserGesture()`) still shows
  Save As, so a page can't write files into Downloads by itself, and
  "Save Image As…" always asks, as its label promises. A retry keeps its
  name reserved, and a retry from the list picks a free name if its file was
  taken meanwhile. The downloads list shows the name actually used.
- **The name is claimed on disk** (added with the review's minors): Blanc
  creates the empty file before Chromium writes into it, so no other app can
  take the name in between, and a folder Blanc can't write to (Windows
  permissions included) shows Save As. A download that doesn't finish removes
  its empty file, never one with data in it. Numbering stops at `(100)`, as in
  Chrome, and then shows Save As; a name too long for `(100)` to fit in 255
  bytes is shortened, keeping its extension. `test:save-downloads:desktop`
  checks the real download path on Linux and Windows CI.
- **Private tabs** follow the same switch. The file lands in Downloads; its row
  stays memory-only as now.
- If the Downloads folder is missing or unwritable, fall back to the dialog
  for that download rather than failing it.

## Non-goals

- Choosing a different folder (could come later).
- The Chromium fork (Blanc Beta), which has Chromium's own "Ask where to save"
  preference; this change is Electron only.
- Per-file-type rules or opening files when they finish.

## Left to the builder

- Whether the `browser-api` contract or its vectors need the new settings
  field (`npm run browser-api:check` will say).
- Test coverage: unit tests for `download-path.js` and the setting's
  sanitizing; an acceptance or desktop check that a download completes
  without a dialog and that a second same-name download gets `(1)`.
- Release note in `docs/press/release-notes/unreleased.md` and the F11 row in
  `spec/parity-matrix.md` if its wording mentions the dialog.
