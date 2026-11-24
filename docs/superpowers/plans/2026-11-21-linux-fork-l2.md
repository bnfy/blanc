# Linux fork L2: daily driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax. Codex implements; Claude reviews each task before the next starts.

**Goal:** the Linux preview behaves like a browser someone could use every day: every S1 suite case
that fails on Linux is fixed or recorded with its cause, closing the last window quits, Ctrl+Tab steps
through tabs by most recent use with real keys, and the Linux-only Island cases have tests. L2 is the
spec's "Daily driver" rung.

**Architecture:** the same shape as Windows W2 ([plan](2026-11-18-windows-fork-w2.md)): owner-decision
exclusions shared with the Mac and Windows; runner-environment fixes in the harness; real browser gaps
fixed in `chromium/blanc/` behind `BUILDFLAG(IS_LINUX)` or shared with Windows where the code is
aura-generic; a triage record for whatever stays. Every check runs on L1's installed-package
candidate on hosted `ubuntu-24.04` (x64) and `ubuntu-24.04-arm` (arm64).

**Tech stack:** Chromium 158.0.8127.2, the fork's Cucumber suite (`chromium/tests/runner.mjs`), Node
22, GitHub Actions, `xvfb`, `weston`, `xdotool`.

**Spec:** [`docs/superpowers/specs/2026-11-21-linux-fork-design.md`](../specs/2026-11-21-linux-fork-design.md)
§4 (quit, screen sharing) and §5's L2 row. **Before it:** [L1](2026-11-21-linux-fork-l1.md) Tasks 2 and
3 (identity and frame) must be on `chromium/next`, since most frame-shaped failures close there. L2 can
start alongside L1's packaging tasks (4 to 7); its suite runs use the unpacked candidate until L1's
install check passes, then the installed one.

**Review:** Codex reviewed this plan on 2026-11-21 (10 findings: 3 blockers, 5 errors, 2 gaps); all
are folded in below.

**Approved by the owner on 2026-11-21**, with the decisions below.

## Decisions this plan asks the owner for (approving the plan approves them)

1. **The owner-decision exclusions apply on Linux** exactly as on Windows (`windows-fork-exclusions.mjs`,
   now shared via L0's `linux-fork-exclusions.mjs`), with the updater reason reading "updates come from
   the system's package manager (Linux design §3)".
2. **Closing the last ordinary window quits on Linux,** dropping held Space pages and Recently closed
   entries, as on Windows and as shipping Blanc for Linux does (spec §4).
3. **Ctrl+Tab's real-key check on Linux runs under X11 only** (`xdotool` against Xvfb, shipping's CI
   method). Under Wayland, no hosted compositor takes injected keys; the owner checks it once in the VM.
4. **Passkeys on Linux are Chromium's own path:** Chromium has no Linux platform authenticator, so
   device-bound passkeys come from security keys or a phone. `private-tabs.feature:40` (an ephemeral
   private-tab passkey) is excluded on Linux with that reason; it is not covered by Windows' Windows
   Hello decision.
5. **No app icon catalog on Linux,** as on Windows (owner decision 2026-10-19: the extra Sunrise icons
   are macOS-only): `settings-and-theming.feature:12` and `supporter-and-session.feature:7` and `:12`
   are excluded on Linux.
6. **`island-and-commands.feature:320` is excluded on Linux** as on Windows: Chromium draws the window
   buttons (Linux design, owner decision 3), so there are no floating Island window controls; L1's frame
   check is the evidence for the native buttons.

## Facts this plan rests on (read 2026-11-21 on `chromium/next` 2439f5ee2)

- **Quit:** commit 4c189137f (W2 A2) closes the hold windows and mini windows when the last Island
  window goes, under `#if !BUILDFLAG(IS_MAC)` in `blanc_prototype_ui.cc`, so it already compiles for
  Linux. Only Windows has a test (`chromium/tests/windows-quit.mjs`, `process.platform` check at line
  19, clicks Chromium's close button at a Windows offset).
- **Ctrl+Tab:** `TabSwitchCommand` (`blanc_prototype_ui.cc:14554`), the `postTabSwitchKey` test hook
  (`:7975`) and the `tab_switch_keys.h` include (`:389`) are `#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)`.
  `tab_switch_keys_win.cc` (194 lines) watches keys through an `ui::EventHandler` on aura's `Env`,
  installed lazily inside `CurrentTabSwitchKey()` (`:144`), i.e. while the first Ctrl+Tab is already
  being dispatched; Windows covers that first press with `::GetKeyState` (`:150-152`). The posted-key
  test hook installs the watcher before dispatch, so it can't see that gap. Its key classifier checks
  Alt but not `EF_ALTGR_DOWN`; it also uses `<windows.h>` and `VK_*` (`:7`, `:74-95`, `:126-131`).
  `ui.gni:330` lists it under `is_win`. Tests: `native-tab-switch.mjs` (posted keys) and
  `windows-tab-switch-keys.mjs`.
- **Suite:** the L0 report `chromium/reports/f0-linux.json` and baseline
  `chromium/scenarios/baseline-linux-*.json` give the failing cases and first errors; L1's frame work
  changes them. Task 2 starts from a fresh run on L1's candidate, not from L0's numbers. A full run
  requires the candidate to equal the single `currentCandidates.linux` id (`runner.mjs:47,145-146`), so
  x64 and arm64 can't both be "current"; `chromium/linux/run-suite.mjs:31-43` writes one report name;
  `slice-report.mjs:6-16,24-27` drops `exclusionReason`. The workflow's `only` input filters F0 case ids,
  not jobs, and each job starts from the unpacked candidate with a blocker override
  (`chromium-linux-candidate.yml:12-28,122-127`, `fixture.mjs:105-106`).
- **Import:** Linux already has the Chrome, Chromium, Brave, Vivaldi and Edge paths and `SingletonLock`
  symlink detection (`first_run.inc:233-251`, `tab_import.inc:85-93`); the Arc case is blocked by the
  test adapter (`chromium/tests/adapters/import.mjs:19-25`), not the browser.
- **Quit with a download:** `blanc_prototype_ui.cc:14458-14485` holds the close-confirmation path a
  running download goes through; read it before changing the shared `!IS_MAC` block.
- **Floating controls and the rail:** `island-and-commands.feature:320` needs three Island-drawn
  floating buttons, which Linux won't have (decision 6). `vertical-tabs.feature:239` stays: its step
  asserts the menu button at a fixed `(8, 8)` (`vertical-tabs.steps.js:1796-1801`), which leading
  caption buttons move. `mainMenuRequests` already works on every platform (`adapters/island.mjs:146-147`).
- **Screen sharing:** the suite's capture scenarios exercise the microphone
  (`fork-steps/capture.mjs:3-15`); `native-display-share.mjs` auto-selects a tab and never opens the
  picker (`:5-9`, `:24-25`, `:35-43`).
- **Screen sharing** under Wayland uses PipeWire and the desktop portal; hosted runners can't show the
  portal's picker (spec §6).

## Global constraints

- L0's and L1's Global Constraints hold unchanged (guarded server builds, the Windows-release rule,
  the checkout lock, no `--no-sandbox`, the AppArmor restriction left on, nothing public).
- Shared code moves only when its Mac and Windows behavior stays identical. A file changed for
  sharing is proven on Windows before it reaches `chromium/next`: commit it to a review branch, build
  `BlancWinPrototype` from it through the guard while no Windows release is in progress, ship that
  candidate, and run the Windows workflow's posted-key and real-key tab-switch checks on it; record the
  unchanged-argument GN plans for both Windows and both Mac outputs and the next passing Mac nightly.
- Every native fix is checked on a candidate built from it: guarded build, package, ship, dispatch by
  SHA-256. Final L2 checks run from the installed `/opt/bnfy/blanc-prototype/chrome` as an ordinary
  user (L1's installed mode), per architecture, on a fresh runner that installs the verified package.
- Mandatory fixes are limited to S1 cases and the cases this plan names; anything else that fails is
  recorded, not chased.
- Every non-passing case ends L2 in exactly one state: passing, excluded with a named owner decision
  or design section, or recorded in the triage file with its cause and the milestone that closes it.
  No case is excluded for being slow or flaky; flaky cases are diagnosed.

## Review Focus

1. **The last window closed while a download runs or a Glance is open.** Quit must still happen, and a
   running download must not keep a process alive: Task 1's quit check covers a download in progress
   and an open Glance.
2. **Ctrl released before Tab's key-up**, and **Ctrl+Shift+Tab**: the switch commits the right tab and
   never steps twice: Task 3's real-key check includes both sequences.
3. **AltGr held, or focus lost mid-switch:** AltGr+Tab never starts a switch, and losing activation
   during a switch cancels it and clears the held state, so the next Ctrl+Tab starts fresh; Task 3's
   posted-key cases send AltGr-flagged events and a deactivation.
4. **A second window on another workspace when the first closes:** that window keeps the process
   running; Task 1's check opens two windows and closes one first.
5. **Suite cases that pass only at the runner's 1x scale:** Task 2 reruns the Island layout features at
   `--force-device-scale-factor=2` and records any difference.

---

### Task 1: Closing the last window quits on Linux

**Files:**
- Create: `chromium/tests/linux-quit.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (input `check` with values `smoke`,
  `frame`, `install`, `quit`, `keys`, `suite`, selecting jobs; each job installs the verified package for
  its architecture first, as L1's install job does)

**Interfaces:**
- Consumes: L1's `native-input-linux.mjs` (`click`, `windowGeometry`) and the `buttons` list of L1's
  `windowButtons` message, which gives Close's rect on whichever side it is.
- Produces: `quit-<arch>.json`: `{cases: [{name, passed, exitCode, leftoverPids}]}`.

- [ ] **Step 1: Write `linux-quit.mjs`** on the model of `windows-quit.mjs`, X11 under `xvfb-run` with
  L1's window manager: (a) one window, one tab, Close → the browser and every child process exit
  within 10 s with code 0; (b) a tab closed first (a Recently closed entry held), then Close → exits;
  (c) a Space switched first (held pages), then Close → exits; (d) a mini window open, Close on the
  main window → both close and the process exits; (e) Review Focus 1: a download in progress and,
  separately, an open Glance → exits; (f) Review Focus 4: two ordinary windows, close one → the
  process stays, close the other → exits. Close is clicked by real input at the rect the
  `windowButtons` list gives for `close`, after checking the target window is the one meant
  (`windowGeometry`). Before each click the check records every descendant PID of the browser; after
  it, it checks which survive before the fixture's own cleanup runs, so cleanup can't hide a leftover.
  For (e), read the close-confirmation path first: if a running download asks before closing, the check
  answers the dialog as a person would and expects the quit after it; change nothing shared unless a
  case actually fails.
- [ ] **Step 2: Run it** on the current candidate through the workflow (`-f check=quit -f arch=x64`,
  then `arm64`); expected PASS
  for (a)-(f) if 4c189137f covers Linux; any failure is a bug to fix in the `!IS_MAC` block, with the
  failing case kept as its regression test.
- [ ] **Step 3: Commit** `Fork Linux: the quit check (L2)`.

### Task 2: Every failing suite case fixed or recorded

**Files:**
- Modify: `chromium/tests/linux-fork-exclusions.mjs`, `chromium/tools/linux-fork-exclusions.test.mjs`
- Modify: harness files the diagnosis names (expected: `chromium/tests/adapters/island.mjs`,
  `chromium/tests/lib/platform.mjs`, the import discovery paths in `chromium/blanc/browser/ui/tab_import.inc`
  and `first_run.inc` for Linux's `~/.config/<browser>` folders)
- Modify: `chromium/tests/runner.mjs` and `chromium/linux/run-suite.mjs` (per-architecture current
  candidates: `currentCandidates.linux = {x64, arm64}`, report names `s1-linux-<arch>.json`),
  `chromium/tools/slice-report.mjs` (keep `exclusionReason`), their tests
- Modify: `chromium/tests/adapters/import.mjs` (accept `linux` for Arc's file choice)
- Create: `chromium/linux/triage-l2.md`, `chromium/reports/s1-linux-x64.json`,
  `s1-linux-arm64.json`, and the index `chromium/reports/s1-linux.json` (`{arch: {candidate,
  tarSha256, runId, report, reportSha256}}` plus each case's disposition)

- [ ] **Step 1: Per-architecture candidates:** failing tests first (the runner accepts either
  architecture's recorded candidate and refuses any other; reports never overwrite each other;
  `slice-report` keeps `exclusionReason`), then implement. Run the full suite on L1's candidate for x64
  (`-f check=suite -f arch=x64`), save the baseline.
- [ ] **Step 2: Group the non-passing cases by first error** into the W2 categories (owner decision,
  runner environment, import discovery, single cases) and write the groups into `triage-l2.md` before
  changing anything.
- [ ] **Step 3: Owner-decision exclusions:** `linux-fork-exclusions.test.mjs` pins an exact allowlist,
  so extend that allowlist and the exclusions together, each Linux-specific entry with its own reason:
  decisions 4, 5 and 6 of this plan by case id, plus any Mac-only case (dock menu, Touch ID) the run
  shows, citing the decision or design section that makes it Mac-only. No reason is copied from a
  Windows-only decision.
- [ ] **Step 4: Runner environment:** fix harness assumptions (paths, a Linux `chromeButtonRects`
  from L1's `buttons` list, animations disabled on the runner) with a unit test per fix, mirroring W2
  Task B2.
- [ ] **Step 5: Browser import on Linux:** the browser's paths already exist (Facts), Edge included;
  keep them. Fix the Arc adapter so `arc-spaces-import.feature:54` runs on Linux, and exercise against
  a synthetic browser home: discovery of each browser, a dangling `SingletonLock` symlink (not
  running), a live one (running), and Arc's copied-file chooser.
- [ ] **Step 6: Single cases:** diagnose each to a cause (a Linux behavior to fix behind
  `IS_LINUX`, a harness bug, or a recorded gap with its closing milestone); Review Focus 5's 2x rerun
  goes here.
- [ ] **Step 7: Commit** the fixes and `triage-l2.md` so far: `Fork Linux: S1 failures fixed or
  triaged (L2)`. The final per-architecture runs and reports happen in Task 5, after Tasks 3 and 4.

### Task 3: Ctrl+Tab by most recent use

**Files:**
- Create: `chromium/blanc/browser/ui/tab_switch_keys_aura.{h,cc}` holding the platform-neutral parts
  of today's `tab_switch_keys_win.cc` (the `Env` event handler, the window tracking, and a
  `TabSwitchKeyState` that is fed events); `tab_switch_keys_win.cc` keeps `<windows.h>`, `VK_*` and its
  `::GetKeyState` first-press fallback; new `tab_switch_keys_linux.cc` installs the watcher before the
  first accelerator can run (when the first Island window is created) instead of lazily
- Modify: `chromium/blanc/ui.gni` (`is_win || is_linux` for the shared file; one platform file each),
  `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (the three `IS_MAC || IS_WIN` blocks gain
  `IS_LINUX`), `chromium/tests/native-tab-switch.mjs` (runs on Linux)
- Create: `chromium/tests/linux-tab-switch-keys.mjs`, `chromium/tools/tab-switch-keys-gating.test.mjs`

**Interfaces:**
- Produces (internal to the aura implementation): `class TabSwitchKeyState { void OnKeyPressed(const
  ui::KeyEvent&); void OnKeyReleased(const ui::KeyEvent&); void OnDeactivated(); TabSwitchKey
  Current() const; }` — AltGr-flagged events (`ui::EF_ALTGR_DOWN`) never count as Control or Alt;
  `OnDeactivated` clears every held key. `void InstallTabSwitchWatcher()` for Linux's early install.

- [ ] **Step 1: Write the failing test** `tab-switch-keys-gating.test.mjs`: every
  `BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)` guard around `TabSwitchCommand`, `postTabSwitchKey` and the
  `tab_switch_keys.h` include also names `IS_LINUX`; `ui.gni` lists `tab_switch_keys_aura.cc` under
  `is_win || is_linux` and `tab_switch_keys_linux.cc` under `is_linux` only; no file uses `IS_POSIX`.
- [ ] **Step 2: Run it**; expected FAIL. **Step 3: Check the pin:** under X11 and Wayland, the order in
  which aura's `Env` handlers and the accelerator see Ctrl+Tab, how Shift+Tab arrives (`VKEY_TAB` with
  `EF_SHIFT_DOWN`, or a back-tab code), and whether losing activation delivers releases or nothing;
  write it in `PLATFORMS.md`. **Step 4: Implement** the split per the Interfaces block. Extend
  `native-tab-switch.mjs` (posted keys) with AltGr-flagged events and a deactivation mid-switch (Review
  Focus 3). **Step 5: Run** the test and the fork suite; expected PASS.
- [ ] **Step 6: Windows unchanged:** per Global Constraints, build and ship a Windows candidate from
  this commit and pass both Windows tab-switch checks before the change reaches `chromium/next`.
- [ ] **Step 7: `linux-tab-switch-keys.mjs`** (X11, `xdotool keydown/keyup` with real timing), each case
  in a **fresh browser process** so the first real Ctrl+Tab is tested, with four tabs whose recent order
  differs from their positional order: hold Ctrl, Tab twice → no tab activates while Ctrl is down;
  release → the tab used two switches ago is active (not the positional neighbor); Ctrl+Shift+Tab
  steps back; Ctrl released before Tab's key-up commits once (Review Focus 2); Esc cancels; the
  setting on `list` restores positional order. Workflow job `keys`.
- [ ] **Step 8: Commit** `Fork Linux: Ctrl+Tab by most recent use on Linux (L2)`.

### Task 4: Linux-only Island cases and screen sharing

**Files:**
- Modify: the `vertical-tabs.feature:239` step (`vertical-tabs.steps.js:1796-1801`) so the menu
  button's expected position follows L1's leading button width instead of a fixed `(8, 8)`
- Create: `chromium/tests/linux-display-share.mjs`, `chromium/linux/hand-checks-l2.md`

- [ ] **Step 1:** Make `vertical-tabs.feature:239` pass on Linux with buttons on either side (decision
  6 covers `:320`).
- [ ] **Step 2: `linux-display-share.mjs`** (X11): a page calls `getDisplayMedia`; Chromium's own picker
  opens; the check chooses a tab, then (separately) the whole screen, by real input; asserts the page
  receives a live track of that surface, the Island's capture chip shows it, and Stop ends the track.
  Wayland's portal picker is a hand check.
- [ ] **Step 3: `hand-checks-l2.md`** for the owner's VM: Ctrl+Tab by real keys under Wayland
  (decision 3); screen sharing a window through the portal: the portal's choice, a live stream of that
  window in the page, and Stop ending it; a day of ordinary use with anything odd noted. Commit
  `Fork Linux: Linux-only Island cases and hand checks (L2)`.

### Task 5: Record

- [ ] **Step 1:** Push to `chromium/next` after the fork suite and both patch checks pass; one Mac
  Studio GN regeneration only if a build file changed (Task 3's `ui.gni`), before the nightly.
- [ ] **Step 2: Final runs:** build, package, ship and dispatch a candidate per architecture from the
  pushed commit; on fresh runners that install the verified package, run the suite, quit, keys and
  display-share checks from the installed path as an ordinary user. Write `s1-linux-x64.json`,
  `s1-linux-arm64.json` (each through `slice-report.mjs`) and the index `s1-linux.json` with every
  case's disposition, candidate hashes and run ids.
- [ ] **Step 3:** `chromium/STATUS.md` Linux L2 table, `PLATFORMS.md` lines (quit, Ctrl+Tab, import,
  screen sharing), and the VM answers in `hand-checks-l2.md`.

## L2 gate (all must hold)

1. `reports/s1-linux.json` and both per-architecture reports committed, from candidates built after
   every L2 fix; every non-passing case is excluded with a named reason or listed in `triage-l2.md` with
   its cause and closing milestone.
2. The quit check passes all six cases on X11.
3. The Ctrl+Tab real-key check passes on X11 from a fresh process; both Windows tab-switch checks pass
   on a Windows candidate built from the shared change; the owner's Wayland check is recorded.
4. The X11 screen-share check passes for a tab and the whole screen; the owner's portal check is
   recorded.
5. The Mac nightly and both Windows outputs are unaffected.

## Not in L2

Packaging, identity and the frame (L1); the beta channel, repository, update notifications and
release (L3); KDE-specific behavior; Electron profile import's Linux key storage (S2, spec §6).
