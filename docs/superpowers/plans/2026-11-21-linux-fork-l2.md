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

## Decisions this plan asks the owner for (approving the plan approves them)

1. **The owner-decision exclusions apply on Linux** exactly as on Windows (`windows-fork-exclusions.mjs`,
   now shared via L0's `linux-fork-exclusions.mjs`), with the updater reason reading "updates come from
   the system's package manager (Linux design §3)".
2. **Closing the last ordinary window quits on Linux,** dropping held Space pages and Recently closed
   entries, as on Windows and as shipping Blanc for Linux does (spec §4).
3. **Ctrl+Tab's real-key check on Linux runs under X11 only** (`xdotool` against Xvfb, shipping's CI
   method). Under Wayland, no hosted compositor takes injected keys; the owner checks it once in the VM.

## Facts this plan rests on (read 2026-11-21 on `chromium/next` 2439f5ee2)

- **Quit:** commit 4c189137f (W2 A2) closes the hold windows and mini windows when the last Island
  window goes, under `#if !BUILDFLAG(IS_MAC)` in `blanc_prototype_ui.cc`, so it already compiles for
  Linux. Only Windows has a test (`chromium/tests/windows-quit.mjs`, `process.platform` check at line
  19, clicks Chromium's close button at a Windows offset).
- **Ctrl+Tab:** `TabSwitchCommand` (`blanc_prototype_ui.cc:14554`), the `postTabSwitchKey` test hook
  (`:7975`) and the `tab_switch_keys.h` include (`:389`) are `#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)`.
  `tab_switch_keys_win.cc` (194 lines) watches keys through an `ui::EventHandler` on aura's `Env`; its
  only Windows API is `::GetKeyState` for Control, Tab and Alt (lines 150-152). `ui.gni:330` lists it
  under `is_win`. Tests: `native-tab-switch.mjs` (posted keys) and `windows-tab-switch-keys.mjs`.
- **Suite:** the L0 report `chromium/reports/f0-linux.json` and baseline
  `chromium/scenarios/baseline-linux-*.json` give the failing cases and first errors; L1's frame work
  changes them. Task 2 starts from a fresh run on L1's candidate, not from L0's numbers.
- **Scenarios tagged for Linux:** `island-and-commands.feature:320` (window buttons with the floating
  pill) and `vertical-tabs.feature:239` (the menu button moves into the rail), both
  `@test-platform-linux`, and `arc-spaces-import.feature:54` ("Given Blanc is running on Linux"). The
  fork's adapters (`chromium/tests/adapters/`) define `chromeButtonRects` and `mainMenuRequests` only
  for the Mac and Windows. On Windows these two Island cases needed Windows-only steps (W2 Task C2).
- **Screen sharing** under Wayland uses PipeWire and the desktop portal; hosted runners can't show the
  portal's picker (spec §6).

## Global constraints

- L0's and L1's Global Constraints hold unchanged (guarded server builds, the Windows-release rule,
  the checkout lock, no `--no-sandbox`, the AppArmor restriction left on, nothing public).
- Shared code moves only when its Mac and Windows behavior stays identical; a file renamed for sharing
  keeps its Windows test passing on the Windows candidate workflow before the change reaches
  `chromium/next`.
- Every non-passing case ends L2 in exactly one state: passing, excluded with a named owner decision
  or design section, or recorded in the triage file with its cause and the milestone that closes it.
  No case is excluded for being slow or flaky; flaky cases are diagnosed.

## Review Focus

1. **The last window closed while a download runs or a Glance is open.** Quit must still happen, and a
   running download must not keep a process alive: Task 1's quit check covers a download in progress
   and an open Glance.
2. **Ctrl released before Tab's key-up**, and **Ctrl+Shift+Tab**: the switch commits the right tab and
   never steps twice: Task 3's real-key check includes both sequences.
3. **Keyboard layouts where Tab sits behind a modifier, or a compose key is held:** the watcher must
   read key state from events, not from a layout-dependent keysym table; Task 3's unit test feeds
   synthetic aura key events with `EF_ALTGR_DOWN` set and asserts no switch starts.
4. **A second window on another workspace when the first closes:** that window keeps the process
   running; Task 1's check opens two windows and closes one first.
5. **Suite cases that pass only at the runner's 1x scale:** Task 2 reruns the Island layout features at
   `--force-device-scale-factor=2` and records any difference.

---

### Task 1: Closing the last window quits on Linux

**Files:**
- Create: `chromium/tests/linux-quit.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (a `quit` job on `chromium/next`)

**Interfaces:**
- Consumes: L1's `native-input-linux.mjs` (`click`, `windowGeometry`) and its button layout payload
  (to find Close on either side).
- Produces: `quit-<arch>.json`: `{cases: [{name, passed, exitCode, leftoverPids}]}`.

- [ ] **Step 1: Write `linux-quit.mjs`** on the model of `windows-quit.mjs`, X11 under `xvfb-run` with
  L1's window manager: (a) one window, one tab, Close → the browser and every child process exit
  within 10 s with code 0; (b) a tab closed first (a Recently closed entry held), then Close → exits;
  (c) a Space switched first (held pages), then Close → exits; (d) a mini window open, Close on the
  main window → both close and the process exits; (e) Review Focus 1: a download in progress and,
  separately, an open Glance → exits; (f) Review Focus 4: two ordinary windows, close one → the
  process stays, close the other → exits. Close is clicked by real input at the button the L1 layout
  payload reports.
- [ ] **Step 2: Run it** on the current candidate through the workflow (`-f only=quit`); expected PASS
  for (a)-(f) if 4c189137f covers Linux; any failure is a bug to fix in the `!IS_MAC` block, with the
  failing case kept as its regression test.
- [ ] **Step 3: Commit** `Fork Linux: the quit check (L2)`.

### Task 2: Every failing suite case fixed or recorded

**Files:**
- Modify: `chromium/tests/linux-fork-exclusions.mjs`, `chromium/tools/linux-fork-exclusions.test.mjs`
- Modify: harness files the diagnosis names (expected: `chromium/tests/adapters/island.mjs`,
  `chromium/tests/lib/platform.mjs`, the import discovery paths in `chromium/blanc/browser/ui/tab_import.inc`
  and `first_run.inc` for Linux's `~/.config/<browser>` folders)
- Create: `chromium/linux/triage-l2.md`, `chromium/reports/s1-linux.json`

- [ ] **Step 1: Run the full suite** on L1's candidate for x64 (`-f suite=f0`), save the baseline.
- [ ] **Step 2: Group the non-passing cases by first error** into the W2 categories (owner decision,
  runner environment, import discovery, single cases) and write the groups into `triage-l2.md` before
  changing anything.
- [ ] **Step 3: Owner-decision exclusions:** extend `linux-fork-exclusions.mjs` only with cases whose
  reason names an owner decision or a design section (its test already enforces that), including any
  Mac-only feature that has no Linux counterpart (dock menu, Touch ID passkeys, app icon catalog,
  Sunrise Gold).
- [ ] **Step 4: Runner environment:** fix harness assumptions (paths, missing Linux adapter
  definitions such as `chromeButtonRects` and `mainMenuRequests`, animations disabled on the runner)
  with a unit test per fix, mirroring W2 Task B2.
- [ ] **Step 5: Browser import on Linux:** Chrome, Chromium, Brave and Vivaldi profiles under
  `~/.config/google-chrome`, `~/.config/chromium`, `~/.config/BraveSoftware/Brave-Browser`,
  `~/.config/vivaldi`; a running Chrome recognized by its `SingletonLock` symlink; Arc import keeps
  `arc-spaces-import.feature:54`'s expected Linux behavior. One unit test per path table entry.
- [ ] **Step 6: Single cases:** diagnose each to a cause (a Linux behavior to fix behind
  `IS_LINUX`, a harness bug, or a recorded gap with its closing milestone); Review Focus 5's 2x rerun
  goes here.
- [ ] **Step 7: Rerun** on x64 and arm64; commit `triage-l2.md`, the baselines and
  `reports/s1-linux.json` with every case in one of the three end states. Commit
  `Fork Linux: S1 suite on Linux, every case fixed or recorded (L2)`.

### Task 3: Ctrl+Tab by most recent use

**Files:**
- Rename: `chromium/blanc/browser/ui/tab_switch_keys_win.cc` → `tab_switch_keys_aura.cc`, with the key
  state behind `bool ModifierDown(ui::KeyboardCode code)` in `tab_switch_keys_win.cc` (keeps
  `::GetKeyState`) and `tab_switch_keys_linux.cc` (state tracked from the aura events the handler
  already sees)
- Modify: `chromium/blanc/ui.gni` (`is_win || is_linux` for the shared file; one platform file each),
  `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (the three `IS_MAC || IS_WIN` blocks gain
  `IS_LINUX`), `chromium/tests/native-tab-switch.mjs` (runs on Linux)
- Create: `chromium/tests/linux-tab-switch-keys.mjs`, `chromium/tools/tab-switch-keys-gating.test.mjs`

**Interfaces:**
- Produces: `bool ModifierDown(ui::KeyboardCode code)` declared in `tab_switch_keys.h` (internal to the
  aura implementation), one definition per platform.

- [ ] **Step 1: Write the failing test** `tab-switch-keys-gating.test.mjs`: every
  `BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)` guard around `TabSwitchCommand`, `postTabSwitchKey` and the
  `tab_switch_keys.h` include also names `IS_LINUX`; `ui.gni` lists `tab_switch_keys_aura.cc` under
  `is_win || is_linux` and `tab_switch_keys_linux.cc` under `is_linux` only; no file uses `IS_POSIX`.
- [ ] **Step 2: Run it**; expected FAIL. **Step 3: Implement** the split; the Linux `ModifierDown`
  keeps a small state from `ui::KeyEvent`s (Control, Tab, Alt; AltGr ignored per Review Focus 3).
  **Step 4: Run** the test and the fork suite; expected PASS.
- [ ] **Step 5: Windows unchanged:** dispatch the Windows candidate workflow's tab-switch check on a
  Windows build from this commit before pushing; it must pass as before.
- [ ] **Step 6: `linux-tab-switch-keys.mjs`** (X11, `xdotool keydown/keyup` with real timing): hold
  Ctrl, Tab twice, release → the tab used two switches ago is active; Ctrl+Shift+Tab steps back; Ctrl
  released before Tab's key-up commits once (Review Focus 2); Esc cancels; the setting on `list`
  restores positional order. Add it to the workflow as job `keys`.
- [ ] **Step 7: Commit** `Fork Linux: Ctrl+Tab by most recent use on Linux (L2)`.

### Task 4: Linux-only Island cases and screen sharing

**Files:**
- Modify: `chromium/tests/adapters/island.mjs` (Linux `chromeButtonRects`, `mainMenuRequests` from L1's
  layout payload), the suite's Linux step definitions where a scenario has no Linux step
- Create: `chromium/linux/hand-checks-l2.md`

- [ ] **Step 1:** Make `island-and-commands.feature:320` and `vertical-tabs.feature:239` executable
  for the fork on Linux, reading L1's button layout payload so buttons on either side pass.
- [ ] **Step 2:** Screen sharing: on X11 the runner shares a tab and the whole screen through
  Chromium's own picker (the suite's capture scenarios); Wayland's portal picker is a hand check.
- [ ] **Step 3: `hand-checks-l2.md`** for the owner's VM: Ctrl+Tab by real keys under Wayland
  (decision 3); screen sharing a window through the portal; a day of ordinary use with anything odd
  noted. Commit `Fork Linux: Linux-only Island cases and hand checks (L2)`.

### Task 5: Record

- [ ] **Step 1:** Push to `chromium/next` after the fork suite and both patch checks pass; one Mac
  Studio GN regeneration only if a build file changed (Task 3's `ui.gni`), before the nightly.
- [ ] **Step 2:** `chromium/STATUS.md` Linux L2 table, `PLATFORMS.md` lines (quit, Ctrl+Tab, import,
  screen sharing), `reports/s1-linux.json`, and the VM answers in `hand-checks-l2.md`.

## L2 gate (all must hold)

1. `reports/s1-linux.json` committed for x64 and arm64; every non-passing case is excluded with a named
   reason or listed in `triage-l2.md` with its cause and closing milestone.
2. The quit check passes all six cases on X11.
3. The Ctrl+Tab real-key check passes on X11; the Windows tab-switch check still passes; the owner's
   Wayland check is recorded.
4. The Mac nightly and both Windows outputs are unaffected.

## Not in L2

Packaging, identity and the frame (L1); the beta channel, repository, update notifications and
release (L3); KDE-specific behavior; Electron profile import's Linux key storage (S2, spec §6).
