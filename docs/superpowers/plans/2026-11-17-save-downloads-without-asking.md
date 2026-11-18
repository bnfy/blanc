# Save Downloads Without Asking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New downloads save straight to the Downloads folder under a free name, unless the new "Ask where to save each file" setting is on (#1591).

**Architecture:** A pure module picks a free file name. `downloads.js` asks an injected policy (set from `main.js`, like `setDownloadRequesterCheck`) whether to ask and which folder to use, and calls `item.setSavePath()` in `will-download` when it shouldn't ask. A device-local boolean `askWhereToSave` (default `false`) drives the policy and has a switch in Settings → General → Browsing.

**Tech Stack:** Electron main process (CommonJS), `node:test`, Blanc's copy catalog (`copy/messages/*.json`).

**Spec:** `docs/superpowers/specs/2026-11-17-save-downloads-without-asking-design.md`

## Global Constraints

- Setting key `askWhereToSave`, boolean, default `false`; device-local: never in `SYNCED_KEYS`; listed in `settings-schema/schema.json` `internalDefaults`.
- Default applies to existing profiles too (no migration keeps old behavior).
- With `askWhereToSave` on, behavior is exactly today's (no save path set).
- A file already on disk is never overwritten.
- Retry keeps reusing its remembered path (`retrySavePaths`), which wins over a chosen path.
- Private tabs follow the same setting.
- English copy changes update every selectable language (`de`, `es`, `fr`, `pt-BR`, `it`) in the same PR, acknowledged with `npm run copy:ack`.
- The Electron app only; nothing under `chromium/`.

## Review Focus

- A server-suggested name containing `/`, `\` or `..` must still land inside the Downloads folder (Task 1 test).
- A dotfile such as `.env` gets `.env (1)`, not ` (1).env` (Task 1 test).
- Two downloads of the same file at once get different names (Task 2 test).
- A cancelled or failed download releases its reserved name, so the next one gets the plain name (Task 2 test).
- A missing or unwritable Downloads folder falls back to the dialog instead of failing the download (Task 2 test).

---

### Task 1: Free-name picker

**Files:**
- Create: `src/main/download-path.js`
- Test: `test/unit/download-path.test.js`

**Interfaces:**
- Produces: `chooseDownloadPath({ folder: string, filename: string, exists: (p: string) => boolean, reserved: Set<string> }) -> string | null` and `downloadReservationKey(p: string) -> string` (lowercases, so reservations never collide on case-insensitive disks). Returns `null` when no free name is found within 10 000 tries. Never adds to `reserved` itself.

- [ ] **Step 1: Write the failing tests**

Use a fake `exists` backed by a `Set` of absolute paths and `path.join` for expectations. Cases:

```js
test('uses the suggested name when it is free', ...)            // 'report.pdf' -> join(folder,'report.pdf')
test('numbers a taken name before the extension', ...)          // report.pdf taken -> 'report (1).pdf'; (1) also taken -> 'report (2).pdf'
test('keeps compound archive extensions together', ...)         // 'site.tar.gz' taken -> 'site (1).tar.gz'; also .tar.bz2, .tar.xz, .tar.zst
test('numbers a dotfile after its name', ...)                   // '.env' taken -> '.env (1)'
test('a name without an extension gets the number at the end', ...) // 'README' taken -> 'README (1)'
test('skips reserved names, ignoring case', ...)                // reserved has downloadReservationKey(join(folder,'Report.PDF')) -> 'report.pdf' becomes 'report (1).pdf'
test('never leaves the folder', ...)                            // '../../etc/passwd', 'a/b.txt', 'a\\b.txt': path.dirname(result) === folder
test('falls back to "download" for an empty or dot-only name', ...) // '', '  ', '.', '..' -> join(folder,'download')
test('returns null when every candidate is taken', ...)         // exists: () => true
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/download-path.test.js`
Expected: FAIL, cannot find module `../../src/main/download-path`.

- [ ] **Step 3: Implement `chooseDownloadPath` and `downloadReservationKey` in `src/main/download-path.js`**

No `require('electron')`. Clean the name first: replace `/`, `\` and NUL with `_`, trim, and use `download` if the result is empty, `.` or `..`. Split base and extension: a compound extension from `['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst']` (case-insensitive) when the name ends with one, else `path.extname`, except that a name whose only dot is the first character has no extension. Candidates: `base + ext`, then `` `${base} (${n})${ext}` `` for n = 1…9999. A candidate is free when `!exists(p) && !reserved.has(downloadReservationKey(p))`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/unit/download-path.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/download-path.js test/unit/download-path.test.js
git commit -m "Downloads: pick a free file name in a folder (#1591)"
```

### Task 2: Save without asking in `will-download`

**Files:**
- Modify: `src/main/downloads.js` (the `will-download` handler, lines 69–106, its `done` handler, and `module.exports`)
- Test: `test/unit/downloads-auto-save.test.js` (new; reuse the electron stub, `FakeItem` and `FakeSession` harness from `test/unit/downloads-resume-retry.test.js`, with `getFilename()` taking a constructor argument)

**Interfaces:**
- Consumes: `chooseDownloadPath`, `downloadReservationKey` from Task 1.
- Produces: `setDownloadSavePolicy(policy: { askWhereToSave: () => boolean, folder: () => string } | null)` exported from `downloads.js`. With no policy set (default), downloads behave as today.

- [ ] **Step 1: Write the failing tests**

Each test uses a fresh temp folder from `fs.mkdtempSync` as `folder()`.

```js
test('without a policy no save path is set (today\'s dialog)', ...)       // item.savePath === ''
test('asking on: no save path is set', ...)                                // askWhereToSave: () => true
test('asking off: saves into the folder under the suggested name', ...)    // savePath === join(dir,'one.zip')
test('an existing file is never overwritten', ...)                         // write join(dir,'one.zip') first -> 'one (1).zip'
test('two downloads of the same name at once get different names', ...)   // start two before either is done -> 'two.zip', 'two (1).zip'
test('a finished or cancelled download releases its name', ...)           // start, emit done 'cancelled', start again -> 'three.zip'
test('a missing folder falls back to the dialog', ...)                     // folder: () => join(dir,'gone') -> savePath === ''
test('a retry keeps its remembered file', ...)                             // interrupted non-resumable item with savePath set; retryDownload(id); new item's savePath equals the original
test('private downloads follow the same policy', ...)                      // setupDownloads(new FakeSession(), ..., { private: true })
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/downloads-auto-save.test.js`
Expected: FAIL, `setDownloadSavePolicy` is not a function.

- [ ] **Step 3: Implement in `src/main/downloads.js`**

Module state: `let savePolicy = null;` and `const reservedPaths = new Set();`. In `will-download`, after the retry-path block: if no retry path was applied, `savePolicy` is set and `savePolicy.askWhereToSave()` is false, then check the folder with `fs.accessSync(folder, fs.constants.W_OK)` (any throw → leave the dialog), call `chooseDownloadPath({ folder, filename: item.getFilename(), exists: fs.existsSync, reserved: reservedPaths })`, and on a non-null result `item.setSavePath(p)`, add `downloadReservationKey(p)` to `reservedPaths` and keep the key on `entry.reservedKey`. Release it as the first line of the `done` handler, before the `replaced` and deleted-profile early returns. Wrap the policy calls in `try` so a throwing policy leaves the dialog.

- [ ] **Step 4: Run to verify it passes, with the neighbors**

Run: `node --test test/unit/downloads-auto-save.test.js test/unit/downloads-resume-retry.test.js test/unit/private-downloads.test.js test/unit/downloads-row-model.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/downloads.js test/unit/downloads-auto-save.test.js
git commit -m "Downloads: save to the Downloads folder unless asked to ask (#1591)"
```

### Task 3: The setting, its switch, and main's wiring

**Files:**
- Modify: `src/main/settings.js` (`DEFAULTS` near line 268, sanitizing near 572, `setSettings` whitelist near 701)
- Modify: `settings-schema/schema.json` (`internalDefaults`)
- Modify: `src/main/main.js` (beside `setDownloadRequesterCheck(...)`, line ~15675; import `setDownloadSavePolicy` with it, line ~210)
- Modify: `src/renderer/pages/settings.html` (new row after `#reuseNewTabSetting`, Browsing card)
- Modify: `src/renderer/pages/settings.js` (new block after the `supports('reuseNewTab')` block, ~line 779)
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json`
- Test: `test/unit/download-ask-setting.test.js` (new, source assertions in the style of `test/unit/new-tab-reuse.test.js:60-75`)

**Interfaces:**
- Consumes: `setDownloadSavePolicy` from Task 2.
- Produces: `settings.getSettings().askWhereToSave: boolean`; element ids `askWhereToSaveSetting`, `askWhereToSave`, `askWhereToSaveHint`; copy keys `settings.general.askWhereToSave.label` and `.hint`.

- [ ] **Step 1: Write the failing test**

```js
test('askWhereToSave is a device-local boolean, off by default', () => {
  assert.match(settings, /\n  askWhereToSave: false,\n/);
  assert.match(settings, /if \(typeof partial\.askWhereToSave === 'boolean'\) clean\.askWhereToSave = partial\.askWhereToSave;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /askWhereToSave/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('askWhereToSave'));
});
test('main gives downloads the setting and the Downloads folder', () => {
  assert.match(main, /setDownloadSavePolicy\(\{[\s\S]*askWhereToSave:[\s\S]*getPath\('downloads'\)/);
});
test('Settings shows the switch with its hint', () => {
  assert.match(html, /<input id="askWhereToSave" type="checkbox"[^>]*aria-describedby="askWhereToSaveHint"/);
  assert.match(page, /askWhereToSave\.checked = settings\.askWhereToSave === true;/);
  assert.match(page, /window\.bowserPages\.settings\.set\(\{ askWhereToSave: askWhereToSave\.checked \}\)/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/download-ask-setting.test.js`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Implement**

- `settings.js`: `askWhereToSave: false` in `DEFAULTS`; `if (typeof data.askWhereToSave !== 'boolean') data.askWhereToSave = DEFAULTS.askWhereToSave;`; the whitelist line from the test.
- `schema.json`: add `"askWhereToSave"` to `internalDefaults` after `"reuseNewTab"`.
- `main.js`: `setDownloadSavePolicy({ askWhereToSave: () => settings.getSettings().askWhereToSave === true, folder: () => app.getPath('downloads') });`
- `settings.html`/`settings.js`: copy the `reuseNewTab` row and block, with `=== true` for the checked state and the ids above.
- Copy (English, exact):
  - label: `Ask where to save each file`, note: `Settings → General → Browsing: label of the switch (off by default) that shows a Save As dialog for every download. When it's off, downloads go straight to the Downloads folder.`
  - hint: `When this is off, downloads go straight to your Downloads folder, and a file with the same name gets a number added.`, note: `Settings → General → Browsing: hint under Ask where to save each file.`
  - Translate both into `de`, `es`, `fr`, `pt-BR`, `it`, then `npm run copy:ack -- <locale> settings.general.askWhereToSave.label settings.general.askWhereToSave.hint` for each locale, then `npm run copy:build`.

- [ ] **Step 4: Run the checks**

Run: `node --test test/unit/download-ask-setting.test.js && npm run copy:check && npm run substrate:check && npm run browser-api:check && npm run lint && npm run test:unit`
Expected: all pass. If `browser-api:check` reports the settings payload, add `askWhereToSave` to the contract, run `npm run browser-api:build`, and commit the vectors diff.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js settings-schema/schema.json src/main/main.js src/renderer/pages/settings.html src/renderer/pages/settings.js copy/ src/renderer/pages/strings.*.js src/main/ublock-strings.json test/unit/download-ask-setting.test.js browser-api/
git commit -m "Settings: Ask where to save each file, off by default (#1591)"
```

### Task 4: Check it in the app and record it

**Files:**
- Modify: `docs/press/release-notes/unreleased.md` (a `## Changed` section above `## Still open`)
- Modify: `spec/parity-matrix.md` F11 row only if its wording mentions the dialog

- [ ] **Step 1: Check in a dev run (outside the sandbox)**

Run `npm start`, download the same small file twice from a local page (`python3 -m http.server` serving a test file with a `download` link), and confirm: no dialog, `~/Downloads/<name>` then `~/Downloads/<name> (1)`, both rows in `blanc://downloads/`. Turn the switch on and confirm the dialog returns. Delete the two test files afterward.

- [ ] **Step 2: Add the release note**

```markdown
## Changed

- **Downloads save straight to your Downloads folder.** Blanc no longer asks
  where to save each file; a file with the same name as one already there gets
  a number added. To be asked every time, turn on **Ask where to save each
  file** in Settings → General (#1591).
```

- [ ] **Step 3: Commit**

```bash
git add docs/press/release-notes/unreleased.md spec/parity-matrix.md
git commit -m "Release note: downloads save without asking (#1591)"
```
