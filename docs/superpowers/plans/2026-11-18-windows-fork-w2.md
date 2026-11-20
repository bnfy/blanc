# Windows fork W2: daily driver

> **For agentic workers:** execute inline (superpowers:executing-plans). Steps use checkbox syntax.

**Goal:** the Windows preview behaves like a browser someone could use every day: its files name
Bananify Creative, closing the last window quits, every suite case that fails on Windows is either
fixed or recorded with its cause, Windows-only behavior has tests, and the two hand checks are done.
W2 is the design's "Daily driver" rung: "The S1 suite on Windows, with real gaps fixed or recorded".

**Spec:** [`docs/superpowers/specs/2026-11-17-windows-fork-design.md`](../specs/2026-11-17-windows-fork-design.md).
**Before it:** [W1](2026-11-17-windows-fork-w1.md), done 2026-11-18. Candidate
`windows-x64-e42f9e5a532cdf96`: 591 of 667 executable cases pass, 47 fail, 23 undefined, 6 excluded
(`chromium/scenarios/baseline-windows-x64-e42f9e5a532cdf96.json`, run 44236176647).

**Decisions this plan asks the owner for (approving the plan approves them):**
1. **The Mac's owner-decision exclusions apply on Windows too.** These are product decisions, not
   platform ones: no 1Password SDK fill, Chromium's Reading Mode, no built-in Dark Reader, no updater
   in the test build, V12's custom search engine validation, V18's profile deletion dialog, no Electron
   listener counts. They cover 20 of the 70 non-passing cases.
2. **Passkeys on Windows are Chromium's own Windows Hello path** (the "Chromium's own feature first"
   rule). `private-tabs.feature:40` becomes a question in a Windows hand check, as it is in the Mac's
   passkey check, not a simulated authenticator.
3. **Closing the last ordinary window on Windows quits Blanc,** dropping held Space pages and Recently
   closed entries, as Cmd+Q does on the Mac and as shipping Blanc for Windows does.

## Facts this plan rests on (read 2026-11-18 on `chromium/next` at 95f96d40a)

- The company name: `chrome_exe.rc`/`chrome_dll.rc` take their version resource from
  `chrome_version.rc.version`, filled from the GN argument `branding_file_path`
  (`build/config/chrome_build.gni`), which defaults to Chromium's `BRANDING` (`COMPANY_FULLNAME=The
  Chromium Authors`). The beta already points it at `//blanc/branding/beta/BRANDING` (patch 0046).
  `mini_installer`'s version resource reads the same file. A Windows-only argument therefore needs no
  patch and leaves the Mac untouched.
- The lingering process: `SpaceHold` (`blanc/browser/ui/blanc_prototype_ui.cc`) keeps a Space's
  pages and Recently closed's held tabs in a hidden popup `Browser` per profile, which "outlive[s]
  every ordinary window and end[s] when Blanc quits" (owner, 2026-11-06). On the Mac the app stays open
  after its last window, so this never showed. On Windows the hidden `Browser` keeps the process
  running. A tab close parks its page there, so the bug needs a closed tab (or a Space switch) first.
  Nothing in the fork observes `BrowserList` today.
- The 70 non-passing cases, grouped by first error (from the baseline):
  - 22 are covered by decision 1 or 2, or are Linux-only (`arc-spaces-import:53`) (see Task B1).
  - 24 are import discovery: `tab-migration` 14 (`{"sources":[],"unavailable":[]}`),
    `browser-migration` 3 (no detected profile), `arc-spaces-import` 7 ("Bring Spaces from Arc" not
    available). `tab_import.inc` and `first_run.inc` (`browser_import::DataHome`, `kBrowsers`) already
    have Windows paths; the harness's `chromeProfileRoot` writes `Google/Chrome/User Data` under the
    browser home. Where they disagree is not yet known.
  - 4 are `interface-language` ("The path argument must be of type string. Received undefined"):
    the harness has no Windows path for something it reads.
  - 3 are animations on a runner whose Windows animations are off: `vertical-tabs:74`,
    `glance:498` (`opacity 0.14s` read as `none`), `newtab-layouts:240`.
  - 3 are runner-variable since W1 Part A: `glance:337`, `vertical-tabs:146`, `F41:435`.
  - 2 need Windows-only steps (undefined): `island-and-commands:320` (window buttons with the floating
    pill) and `vertical-tabs:239` (the menu button moves into the rail).
  - 12 are single cases to diagnose: `F41:69` (EBUSY on a fixture file), `downloads:7` and `:13`
    (downloads end "interrupted"), `link-routing:28` and `local-profiles:27` (an uncaught page
    exception during profile deletion), `tabs-and-groups:292` (a local-file home page),
    `newtab-layouts:21` (Mahjong's control rail outside the board), `split-view:53` and `:76` (pane
    widths), and the three app icon cases `settings-and-theming:12`, `supporter-and-session:7`, `:12`
    (no `#blancAppIcon` on Windows; shipping Blanc for Windows has no icon catalog).
- Ctrl+Tab by most recent use: `TabSwitchCommand` returns early unless `BUILDFLAG(IS_MAC)`; the key
  watcher is `blanc/browser/ui/tab_switch_keys_mac.{h,mm}` (`CurrentTabSwitchKey`,
  `WatchTabSwitchKeys`, `PostTabSwitchKeyForTesting`). Shipping ships recent order on Windows.

## Global constraints

- Windows work goes to `chromium/next` (merge, never rebase or force-push); the fork unit suite
  (`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`) and
  `python3 chromium/tools/check-patches.py` (both lanes) pass before every push.
- Build only through the guard on the Linux server (`build.mjs SRC --check`, then `--build
  --out=BlancWinPrototype`), never while another `siso ninja` runs there. Review any plan over 1000
  actions before `--allow-large-build`; re-record the environment only after reviewing what changed.
- A change to a shared `BUILD.gn` needs the Mac Studio's GN files regenerated with unchanged arguments
  before the next nightly, and never while `records/RELEASE-IN-PROGRESS` exists. Never run
  `ninja -t` in the Mac Studio's outputs.
- Shared C++ is syntax-checked on the Mac Studio (flags from `out/<name>/obj/**/<target>.ninja`).
  A change that alters the Mac binary waits for the nightly to prove it.
- Mac behavior does not change unless a task says so.
- An exclusion names its decision; a case Windows can't pass yet stays a recorded failure, never an
  exclusion (`windows-fork-exclusions.mjs`).
- Signing runs need the owner's approval on GitHub; nothing signed is published or kept as an
  Actions artifact. No public claim about a Windows build.

## Review focus

1. **Quitting with a Space or Recently closed held:** closing the last window after a Space switch
   (not only after a tab close) must also quit. Task A2's check covers both.
2. **Quitting with a mini window or a Glance open:** a mini window doesn't count as an ordinary
   window (shipping's rule), so closing the last ordinary window still quits and closes it. Task A2.
3. **Closing one of two windows** must not close the hold: held pages stay for the other window.
   Task A2's unit test.
4. **Ctrl+Tab released while another app takes focus** cancels the switch, and Esc can't cancel on
   Windows (the Start menu takes Ctrl+Esc). Task C1's real-key test covers the blur.
5. **The company name in every file of the installer,** not only `chrome.exe`: `chrome.dll`,
   `setup.exe` and `mini_installer.exe`. Task A1's check reads all four.

---

## Part A: two fixes people would notice

### Task A1: the files name Bananify Creative

**Files:**
- Create: `chromium/blanc/branding/win/BRANDING`
- Modify: `chromium/windows/args/prototype-x64.gn` (add `branding_file_path`)
- Modify: `chromium/windows/identity.md`, `chromium/tools/windows-identity.test.mjs`
- Modify: `chromium/tests/windows-install.mjs` (a new check, `versionResources`)

**Interfaces:**
- Produces: install check item `versionResources` (true when `CompanyName` is `Bananify Creative`
  and `ProductName` is `Blanc Prototype` in all four files).

- [ ] **Step 1: Failing test.** In `windows-identity.test.mjs`, test `the Windows preview's BRANDING
      names Bananify Creative and Blanc Prototype`: parse `chromium/blanc/branding/win/BRANDING` as
      `KEY=value` lines and assert `COMPANY_FULLNAME` and `COMPANY_SHORTNAME` are `Bananify Creative`,
      `PRODUCT_FULLNAME` and `PRODUCT_SHORTNAME` are `Blanc Prototype` (the `identity.md` name),
      `PRODUCT_INSTALLER_FULLNAME` is `Blanc Prototype Installer`, `COPYRIGHT` names both Bananify Creative and The
      Chromium Authors as the beta's does, and the Windows args file sets
      `branding_file_path = "//blanc/branding/win/BRANDING"`. Run it; it fails (no file).
- [ ] **Step 2: Write the BRANDING file** with the beta's keys, the preview's names, no `MAC_*` keys
      (the file is Windows-only), and add the argument to `prototype-x64.gn`. Run the test; it passes.
- [ ] **Step 3: Check what the argument rebuilds.** On the server, list every user of
      `branding_file_path` at the pin (`gn refs out/BlancWinPrototype //chrome/app/theme/chromium/BRANDING`
      before, and the new file after `gn gen`), then `build.mjs SRC --check --out=BlancWinPrototype`.
      Record the planned action count. If it is over 1000, stop and show the list before building.
- [ ] **Step 4: Install check item.** In `windows-install.mjs`, after install, read each file's
      version info with PowerShell `(Get-Item FILE).VersionInfo` for `chrome.exe`,
      `<version>\chrome.dll`, `<version>\Installer\setup.exe` and the installer itself, and set
      `versionResources`. Add it to `required`.
- [ ] **Step 5: Build, package, run.** Guarded build, `package-candidate.mjs`, `ship-candidate.sh`,
      then the candidate workflow with `suite=smoke`. Expect the install check 12 of 12.
- [ ] **Step 6: Commit** (`Fork W2: the Windows preview's files name Bananify Creative`). Update
      `identity.md` and the open line in `windows/signing.md` and `PLATFORMS.md`.

### Task A2: closing the last window quits

**Files:**
- Modify: `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (`SpaceHold`; a `BrowserListObserver`)
- Create: `chromium/tests/windows-quit.mjs`
- Modify: `.github/workflows/chromium-windows-candidate.yml` (run it after the frame check)

**Interfaces:**
- Produces: `windows-quit.mjs CANDIDATE_FOLDER RESULTS_FOLDER`, writing `quit.json` with checks
  `plainQuit`, `quitAfterTabClose`, `quitAfterSpaceSwitch`, `quitWithMiniWindow`.

- [ ] **Step 1: Failing check.** `windows-quit.mjs` launches the candidate like `windows-smoke.mjs`
      (same `runtimeConfig`), and for each case starts a fresh profile, does the case's setup through
      the test driver, closes every ordinary window with a real click on Windows' close button
      (`windows-desktop.mjs` `clickSteps`), and requires the browser process to exit within 10 s.
      Setup: none; close one of two tabs; save a Space, switch to another and back; open a mini
      window. On a failure, before killing the process, record CDP `Target.getTargets` from the
      browser endpoint (it stays up while the process lives) in `quit.json`.
- [ ] **Step 2: Run it** on the W1 candidate through the workflow (`-f only=` is not needed; the check
      is its own step). Expect `plainQuit` true and the three others false, with the hold's
      `about:blank#blanc-hold` page among the remaining targets. If the targets show something
      else, stop: the cause is not the hold, and this task is re-planned from what they show.
- [ ] **Step 3: Unit-level rule.** Add `bool ShouldCloseHolds(const std::vector<BrowserKind>&
      remaining)` beside `SpaceHold`, where `BrowserKind` is `{kOrdinary, kMini, kHold, kOther}`:
      true when no `kOrdinary` window remains. Test it in the fork's existing C++ test source for
      the prototype UI if one compiles on the server; otherwise keep the rule in this one function
      and let `windows-quit.mjs` be its test. Cases: one hold and nothing else, true; one hold and
      one ordinary, false; one hold and one mini, true; no windows, true.
- [ ] **Step 4: Implement.** Off the Mac only (`#if !BUILDFLAG(IS_MAC)`): observe `BrowserList`;
      in `OnBrowserRemoved`, when `ShouldCloseHolds` says so, close each profile's hold window and
      any mini windows. Closing them lets Chromium's normal last-browser shutdown run. Held pages
      end as they do on Cmd+Q on the Mac; saved Spaces are already on disk.
- [ ] **Step 5: Run** the quit check and the frame check on the new candidate: all true. Run the
      suite cases that use Spaces and Recently closed (`-f only=` on `F41-named-workspaces`,
      `tabs-and-groups`): nothing that passed fails.
- [ ] **Step 6: Commit** (`Fork W2: closing the last window on Windows quits`). Remove the line
      from `PLATFORMS.md`. Shared C++ changed, so Mac Studio syntax check before the push.

## Part B: every failing case fixed or recorded

### Task B1: the owner's decisions as Windows exclusions

**Files:**
- Modify: `chromium/tests/windows-fork-exclusions.mjs`
- Test: the existing exclusions test beside `macos-fork-exclusions.mjs` (extend it to Windows)

- [ ] **Step 1: Failing test.** Every Windows exclusion's key is a case in the latest Windows
      baseline, and every reason names an owner decision or a V-number, like the Mac's. Add a test
      that the Windows list contains exactly these keys: the nine 1Password cases (`glance:187`,
      `:197`, `platform-services:50`, `:64`, `:76`, `:88`, `:98`, `:105`, `:112`), the three
      `reader-mode` cases, the four Dark Reader cases (`settings-and-theming:49`, `:57`, `:65`,
      `:74`), `platform-services:25` (updater), `navigation-and-context-menu:83` (V12),
      `local-profiles:17` (V18), `quiet-tabs:28:example-45` (Electron listener counts),
      `private-tabs:40` (decision 2) and `arc-spaces-import:53` (Linux only).
- [ ] **Step 2: Add them,** each with the Mac's reason text, `private-tabs:40` with decision 2's.
      The Mac's three "Windows/Linux-only UI" exclusions are not copied: they are Task C2's work.
- [ ] **Step 3: Commit** (`Fork W2: the owner's product decisions as Windows exclusions`).

### Task B2: the runner's environment

**Files:**
- Modify: `.github/workflows/chromium-windows-candidate.yml` (a step that turns Windows animations on)
- Modify: whichever harness file the `interface-language` error points to (from the run's stack)

- [ ] **Step 1: Animations on.** Before the suite, set `SPI_SETCLIENTAREAANIMATION` to true through
      `SystemParametersInfo` (PowerShell with an inline P/Invoke), and print its value read back.
- [ ] **Step 2: Find the `interface-language` path.** Run `-f only=interface-language` and read the
      stack in its report; fix the harness to give Windows the path it needs (the OS language
      source on Windows is the user's `Control Panel\International` and the browser's own locale,
      not a file). Add a unit test in the harness's own test for the new platform branch.
- [ ] **Step 3: Run** `-f only=` on the 7 cases (`vertical-tabs:74`, `glance:498`,
      `newtab-layouts:240` and the 4 `interface-language`): pass, or each one's remaining cause
      recorded in the triage table (Task B4).
- [ ] **Step 4: Commit.**

### Task B3: browser import on Windows

**Files:**
- Modify: `chromium/blanc/browser/ui/first_run.inc` or `tab_import.inc`, or the harness
  (`chromium/tests/lib/fixture.mjs`, `platform.mjs`), whichever the diagnosis names
- Test: `chromium/tests/platform.test.mjs` for a harness change

- [ ] **Step 1: Diagnose.** Run `-f only=tab-migration.feature:7`; from the case's `browser.log`
      and the fixture home on the runner, compare the folder the browser looks in
      (`DataHome()` + `kBrowsers[i].root`, or `--blanc-test-browser-home`) with the one the fixture
      wrote. Do the same for one `browser-migration` and one `arc-spaces-import` case (Arc's Windows
      path is a Store package folder under `%LOCALAPPDATA%\Packages`). Write the cause into the
      triage table.
- [ ] **Step 2: Failing test** for the mismatch at its source (a `platform.test.mjs` case for a
      harness path, or a `kBrowsers`/`ArcPath` expectation in the identity-style tests for native
      paths), then the fix.
- [ ] **Step 3: Run** `-f only=` on the three features: the 24 cases pass or each remaining one is
      recorded with its cause.
- [ ] **Step 4: Commit.** Update the "Electron profile import" line in `PLATFORMS.md`.

### Task B4: the single cases, and the triage record

**Files:**
- Create: `chromium/reports/w2-windows-triage.md` (one row per non-passing case: case, first
  error, cause, outcome: fixed / excluded with decision / open with milestone)
- Modify: as each diagnosis names

- [ ] **Step 1: Diagnose each** of the 9 other single cases and the 3 runner-variable ones from their
      reports, one at a time (superpowers:systematic-debugging): read the first error, reproduce
      with `-f only=`, find the cause. Expected kinds: Windows file locking (`F41:69` EBUSY, the
      profile deletion exceptions), Windows download safety checks (`downloads`), `file:` URL form
      (`tabs-and-groups:292`), window sizes at the runner's scale (`split-view`, Mahjong).
- [ ] **Step 2: App icon cases.** Read the three cases' shipping steps: if shipping runs them only
      on the Mac (Windows has no icon catalog by the owner's 2026-10-19 decision), the fork's
      Settings is right to show none, and they are recorded as not applicable on Windows. Ask the
      owner to approve that as an exclusion before adding it.
- [ ] **Step 3: Fix** what is the fork's or the harness's fault, each with its failing test first,
      one commit per cause.
- [ ] **Step 4: Commit** the triage record.

## Part C: Windows-only behavior

### Task C1: Ctrl+Tab by most recent use

**Files:**
- Rename: `tab_switch_keys_mac.h` → `chromium/blanc/browser/ui/tab_switch_keys.h` (same three
  functions; the Mac's `.mm` includes the new name)
- Create: `chromium/blanc/browser/ui/tab_switch_keys_win.cc`
- Modify: the `.gni`/`BUILD.gn` source list that holds the `.mm`; `blanc_prototype_ui.cc`
  (`TabSwitchCommand` and its call sites: `IS_MAC` → `IS_MAC || IS_WIN`)
- Test: `spec/acceptance` Ctrl+Tab cases through the suite, and a real-key check

**Interfaces:**
- Consumes/produces exactly the header's existing contract: `TabSwitchKey CurrentTabSwitchKey()`,
  `void WatchTabSwitchKeys(base::RepeatingCallback<void(const std::string&)>)`,
  `bool PostTabSwitchKeyForTesting(gfx::NativeWindow, const std::string&)`.

- [ ] **Step 1: Failing test.** Run the Ctrl+Tab recent-order cases with `-f only=` on the W1
      candidate: they step positionally. Record which cases.
- [ ] **Step 2: Implement `tab_switch_keys_win.cc`** with an `ui::EventHandler` added as a pre-target
      handler on `aura::Env`: it records whether the key event being dispatched is Ctrl+Tab or
      Ctrl+Shift+Tab (`CurrentTabSwitchKey`), and while watching sends `release` on Control up,
      `closePick` on Ctrl+W (marked handled), `cancel` on any other key and on the window losing
      activation (`wm::ActivationChangeObserver`), and `cancelSoon` on a mouse press. Esc is not a
      cancel key on Windows (the Start menu takes Ctrl+Esc); the blur cancels, as in shipping.
      `PostTabSwitchKeyForTesting` dispatches synthesized `ui::KeyEvent`s through the window's
      `WindowTreeHost`.
- [ ] **Step 3: Real-key check.** Add a case to `windows-frame.mjs` (or a sibling) that holds Ctrl,
      presses Tab twice and releases with `keySteps` from `windows-desktop.mjs`, then asserts the
      tab two steps back in use order is active; and one that switches to another window mid-hold
      and asserts nothing changed.
- [ ] **Step 4: Run** the recent-order cases and the real-key check: pass. Mac Studio syntax check
      for the shared files; the Mac's binary changes only by the header's name.
- [ ] **Step 5: Commit.** Remove the Ctrl+Tab line from `PLATFORMS.md`.

### Task C2: the Windows-only Island cases

**Files:**
- Modify: the fork's step definitions for `island-and-commands.feature:320` and
  `vertical-tabs.feature:239` (in the fork adapters, beside the Mac's), and whatever native or
  Island change they show is missing

- [ ] **Step 1: Read both scenarios** against decision W1-1 (Windows' own caption buttons). Where a
      scenario expects shipping's drawn window buttons, it describes behavior the owner changed:
      write the fork's Windows version of the steps (the caption buttons are present with the
      floating pill and hidden with it; the menu button moves into the rail), and record the
      difference in `PLATFORMS.md`.
- [ ] **Step 2: Implement** the steps, run the two cases, fix what fails.
- [ ] **Step 3: Commit.**

## Part D: hand checks

### Task D1: on a real Windows desktop

On the Parallels VM (Windows 11 on Arm, which runs the x64 build under emulation; say so in the
record), with the signed installer from the draft release:
- [ ] Snap Layouts appear on hover over maximize, and snapping works.
- [ ] Settings → Default apps lists Blanc Prototype and can make it the default; links from another
      app then open in it.
- [ ] A passkey on a site that offers one goes through Windows Hello (decision 2), in a normal and a
      private window.
- [ ] Record each in STATUS's W2 section with a screenshot. These are hand checks, not gates.

## W2 gate (all must hold)

1. The install check passes 12 of 12, with the four files naming Bananify Creative.
2. The quit check passes all four cases.
3. A full suite run on the W2 candidate has every non-passing case in the triage record with its
   cause and outcome, and nothing that passed on `windows-x64-e42f9e5a532cdf96` fails.
4. Ctrl+Tab by most recent use passes its cases and the real-key check on Windows.
5. Mac: the fork unit suite, both lanes' patch checks, and the next nightly pass.
6. STATUS has a W2 table, `PLATFORMS.md` is current, and `reports/w2-windows.json` and the new
   baseline are committed.

## Not in W2

The executable's name; the updater; a Windows beta without test hooks; outbound isolation for the
Windows suite; uploading crash reports; Windows on Arm builds; the rebase to a newer Chromium.
