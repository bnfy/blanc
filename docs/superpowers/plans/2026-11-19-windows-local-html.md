# Local HTML files on Windows — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local HTML file that Windows hands to Blanc opens in the same static preview window macOS uses (bnfy/blanc#1630).

**Architecture:** A pure parser picks absolute HTML paths out of a Windows command line; `main.js` sends them, at cold start and on `second-instance`, to the existing `openLocalHtmlFiles`, which on ECS builds opens `local-html-preview.js`. The NSIS installer adds an "Open with" registration. A production smoke proves it on a packaged Windows build.

**Tech Stack:** Electron main process (CommonJS), `node --test`, NSIS (`build/installer.nsh`), GitHub Actions (`release-windows-linux.yml`).

**Spec:** `docs/superpowers/specs/2026-11-19-windows-local-html-design.md`

## Global Constraints

- Windows only: every other platform's command-line behavior is unchanged (`localHtmlPathsFromArgv` returns `[]` off `win32`).
- Extensions come from `HTML_EXTENSIONS` in `src/main/local-html-files.js` (`.htm`, `.html`, `.xht`, `.xhtm`, `.xhtml`); never a second list.
- No change to `src/main/local-html-preview.js`, `local-html-files.js`'s checks, or the http/https default-browser registration.
- The installer never writes `UserChoice` or any default; it only adds Blanc as a choice.
- Release notes say the file opens as a static preview with scripts and other files blocked; no claim of Firefox-like rendering.

## Review Focus

1. **8.3 short paths** (`C:\Users\KEVIN~1\REPORT~1.HTM`): Explorer can pass them. Expect acceptance (uppercase `.HTM` still matches). Test in Task 1.
2. **A path after `--`** (`Blanc.exe -- C:\a.html`): expect it opens. Test in Task 1.
3. **Command line with the executable and Chromium switches** (`C:\…\Blanc.exe`, `--user-data-dir=C:\x.html`): expect neither is treated as a document. Test in Task 1.
4. **UNC path** (`\\server\share\a.html`): expect acceptance; the preview reads it once like any file. Test in Task 1.
5. **Second launch with a file while Blanc runs**: expect the preview opens and the main window is not raised over it. Covered by the smoke in Task 3.

---

### Task 1: Parse local HTML paths from a Windows command line

**Files:**
- Modify: `src/main/startup-urls.js` (add the function; update the header comment, which says paths "fail closed", to say Windows HTML paths go to the preview)
- Test: `test/unit/startup-urls.test.js`

**Interfaces:**
- Produces: `localHtmlPathsFromArgv(argv: unknown, { platform?: string } = {}) => string[]`, exported beside `webUrlsFromArgv`. `platform` defaults to `process.platform`. Returns the qualifying arguments unchanged, in order.

- [ ] **Step 1: Write the failing tests** in `test/unit/startup-urls.test.js`:

```js
const win = (argv) => localHtmlPathsFromArgv(argv, { platform: 'win32' });

test('Windows command line yields absolute HTML paths only', () => {
  assert.deepEqual(win([
    'C:\\Program Files\\Blanc\\Blanc.exe',
    '--user-data-dir=C:\\x.html',
    'C:\\Users\\k\\Report.html',
    'D:\\a.XHTML',
    'C:\\Users\\KEVIN~1\\REPORT~1.HTM',
    '\\\\server\\share\\page.htm',
    'relative.html',
    'C:\\Users\\k\\notes.pdf',
    'https://example.com/a.html',
    'C:\\bad\0.html',
  ]), [
    'C:\\Users\\k\\Report.html',
    'D:\\a.XHTML',
    'C:\\Users\\KEVIN~1\\REPORT~1.HTM',
    '\\\\server\\share\\page.htm',
  ]);
});

test('paths after the -- separator count', () => {
  assert.deepEqual(win(['Blanc.exe', '--', 'C:\\a.html']), ['C:\\a.html']);
});

test('other platforms and bad input yield nothing', () => {
  assert.deepEqual(localHtmlPathsFromArgv(['/Users/k/a.html'], { platform: 'darwin' }), []);
  assert.deepEqual(localHtmlPathsFromArgv(['/home/k/a.html'], { platform: 'linux' }), []);
  assert.deepEqual(win(null), []);
  assert.deepEqual(win([42, {}]), []);
});
```

- [ ] **Step 2: Run** `node --test test/unit/startup-urls.test.js`. Expected: FAIL, `localHtmlPathsFromArgv is not a function`.

- [ ] **Step 3: Implement** `localHtmlPathsFromArgv` in `src/main/startup-urls.js` per the spec's Parsing rule, using `path.win32.isAbsolute` and `HTML_EXTENSIONS.has(path.win32.extname(arg).toLowerCase())` from `./local-html-files`. Use `path.win32` explicitly, never `path`, so the tests mean the same thing on the macOS and Linux unit runners.

- [ ] **Step 4: Run** `node --test test/unit/startup-urls.test.js test/unit/local-html-files.test.js`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Read local HTML paths from a Windows command line (#1630)"`.

### Task 2: Open those paths at cold start and on a second launch

**Files:**
- Modify: `src/main/main.js` — import at line 397; `second-instance` handler at 1580–1590; the comment at 1885–1893; cold-start handoff at 17526.
- Test: `test/unit/startup-urls.test.js` (no new main.js unit test: source-lifted tests fail open here; Task 3's smoke is the proof).

**Interfaces:**
- Consumes: `localHtmlPathsFromArgv` (Task 1); existing `openLocalHtmlFiles(paths: string[])` in `main.js`.

- [ ] **Step 1: Cold start.** Right after `openExternalUrls(urlsFromArgv(process.argv.slice(1)))`, call `openLocalHtmlFiles(localHtmlPathsFromArgv(process.argv.slice(1)))`.

- [ ] **Step 2: Second launch.** In `second-instance`, compute `files = localHtmlPathsFromArgv(commandLine)` once, call `openLocalHtmlFiles(files)` after `openExternalUrls`, and change the raise condition to `!urlsFromArgv(commandLine).length && !files.length`.

- [ ] **Step 3: Comment.** Rewrite the comment above `const urlsFromArgv` (main.js:1890) to say Windows HTML paths now reach `openLocalHtmlFiles`, and typed `file:` URLs, page file links and other file types stay rejected.

- [ ] **Step 4: Run** `npm run lint && npm run test:unit`. Expected: PASS, no new warnings.

- [ ] **Step 5: Commit** `git commit -m "Open local HTML files Windows hands to Blanc (#1630)"`.

### Task 3: Prove it on a packaged Windows build

**Files:**
- Modify: `test/desktop/ecs-local-html-smoke.cjs` (replace the `production && platform !== 'darwin'` throw at line 186 with a Windows branch; Linux production still throws, with its message updated to say Linux isn't covered)
- Modify: `.github/workflows/release-windows-linux.yml` (Windows "Verify public ECS file isolation and protected playback" step, after `ecs-production-smoke.mjs`)

**Interfaces:**
- Consumes: `candidatePaths(app)` from `test/desktop/ecs-candidate-paths.cjs` (Windows production returns `executable: <app>\Blanc.exe`).

- [ ] **Step 1: Windows production launch.** On `win32` in production, round 0 spawns `executable` with `[...args, html]` (cold start). Round 1 spawns `executable` with `args` only, waits for a `page` target, then spawns a second `executable` with `[`--user-data-dir=${profile}`, html]` and waits for its exit (it hands off and quits) before waiting for the `blanc-local-preview:` target. Both rounds run the existing isolation, reload (round 0) and navigation-denied assertions unchanged.

- [ ] **Step 2: Add to the workflow** after the `ecs-production-smoke.mjs` line:

```powershell
node test/desktop/ecs-local-html-smoke.cjs dist/win-unpacked output/ecs-native/local-html-windows.json
if ($LASTEXITCODE -ne 0) { throw 'Windows local HTML preview smoke failed' }
```

- [ ] **Step 3: Run it on a hosted runner** with a validation build: `gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f platform=windows`. Expected: the new step passes and `local-preview.png` shows "Selected document renders". If validation mode skips this step, run the smoke from a branch-only job against the same `dist/win-unpacked` and record the run id.

- [ ] **Step 4: Run** `node --test test/unit/ecs-production-updater.test.js test/unit/full-ecs-candidate.test.js`. Expected: PASS (they pin which workflows run this smoke).

- [ ] **Step 5: Commit** `git commit -m "Check Windows local HTML preview in the release build (#1630)"`.

### Task 4: Register Blanc under "Open with" for HTML files

**Files:**
- Modify: `build/installer.nsh` (`customInstall`, `customUnInstall`, and the comment block at lines 74–86)
- Test: `test/unit/default-browser-packaging.test.js` (replace the `doesNotMatch(install, /FileAssociations/)` assertion at line 58)
- Docs: `CLAUDE.md` "Windows & Linux" paragraph (the sentence "The installer deliberately claims no `.htm`/`.html` file associations…"), and `AGENTS.md` if it carries the same sentence; `docs/superpowers/specs/2026-07-04-default-browser-design.md` (one dated amendment: Windows command-line HTML paths now open the preview); `docs/press/release-notes/unreleased.md` (Added: open local HTML files on Windows, as a static preview).

**Interfaces:**
- Consumes: `HTML_EXTENSIONS` from `src/main/local-html-files.js` (the test reads it to check every extension is registered and removed).

- [ ] **Step 1: Write the failing test.** Assert that `install` contains: `!define BLANC_HTML_PROGID "BlancHTML"`; `WriteRegStr SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'`; for each ext in `HTML_EXTENSIONS`, `WriteRegStr SHELL_CONTEXT "Software\Classes\<ext>\OpenWithProgids" "${BLANC_HTML_PROGID}" ""` and `WriteRegStr SHELL_CONTEXT "${BLANC_CLIENT_KEY}\Capabilities\FileAssociations" "<ext>" "${BLANC_HTML_PROGID}"`; each of those before `shell32::SHChangeNotify`. Assert `uninstall` contains `DeleteRegKey SHELL_CONTEXT "Software\Classes\${BLANC_HTML_PROGID}"` and, per ext, `DeleteRegValue SHELL_CONTEXT "Software\Classes\<ext>\OpenWithProgids" "${BLANC_HTML_PROGID}"`. Assert `install` never mentions `UserChoice`.

- [ ] **Step 2: Run** `node --test test/unit/default-browser-packaging.test.js`. Expected: FAIL on the missing ProgId.

- [ ] **Step 3: Implement** the registration per the spec's Installer bullet (ProgId default value "Blanc HTML Document", `FriendlyTypeName` the same, `DefaultIcon` `$INSTDIR\${APP_EXECUTABLE_FILENAME},0`). Rewrite the comment block to say HTML files are offered under Open with and open as a static preview, never as the default.

- [ ] **Step 4: Run** `node --test test/unit/default-browser-packaging.test.js && npm run test:unit`. Expected: PASS.

- [ ] **Step 5: Update the docs** listed above.

- [ ] **Step 6: Commit** `git commit -m "Offer Blanc under Open with for HTML files on Windows (#1630)"`.

### Task 5: Hand check in the Windows 11 VM

No code. Uses the signed validation installer from Task 3's run (or a new one after Task 4).

- [ ] **Step 1:** Install it as a normal per-user install in the VM (see the VM notes: resume it first, x64 Blanc runs emulated on ARM64).
- [ ] **Step 2:** Right-click a test `.html` (one with a script, a linked CSS file and a `data:` image) → **Open with**. Expected: Blanc is listed; choosing it opens the preview with the text and `data:` image, without the script's effect or the CSS. Repeat with Blanc already running.
- [ ] **Step 3:** Check Settings → Default apps → Blanc lists `.htm`/`.html` as choices and the `.html` default hasn't changed.
- [ ] **Step 4:** Uninstall. Expected: Blanc is gone from Open with. Then reinstall the public release so the VM's next updater check is meaningful.
- [ ] **Step 5:** Record the results in the PR description, including what wasn't checked.
