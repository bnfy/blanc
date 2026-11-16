# macOS Fork Remaining Work: Claude and Codex Split

> **For agentic workers:** this plan has two lanes. Codex runs one task card from §5 per `codex exec` run and nothing else. Claude runs §6 with superpowers:executing-plans and audits every Codex result (§4) before it reaches `chromium/next`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** bring every macOS requirement row in `chromium/tracker.json` to Integrated, and close the work outside the rows (shipping target, importer), so Windows and Linux bring-up starts from a finished macOS reference.

**Architecture:** the split follows the one hard constraint: there is one Chromium tree and one build at a time, on the Mac Studio. Claude owns everything that needs a build (native code, patches, GN). Codex owns work that is proven without a build: test code, Node tooling and fixtures, run on the MacBook Pro against a staged copy of the nightly's Blanc Prototype. The two lanes never edit the same files.

**Tech stack:** Chromium 158 fork (`chromium/`), Node test harness (`chromium/tests/`, CDP), Node tooling (`chromium/tools/`), Codex CLI 0.166.0 (`~/.npm-global/bin/codex`).

**Spec:** `docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md` (rows, §7 migration table, §9 divergences) and its plan beside it. Starting state: `chromium/STATUS.md`, first entry under Current work (2026-11-16), and `chromium/tracker.json` at `d30c6553a`.

## Global Constraints

- Fork work lands on `chromium/next` by merge, never rebase or force-push. Only Claude pushes there.
- One Chromium build at a time, only through `chromium/tools/build.mjs` on the Mac Studio, never while a release is prepared (`records/RELEASE-IN-PROGRESS`) or the nightly runs (02:00).
- One native test browser at a time per machine. Tests drive pages through CDP; nothing moves the owner's real pointer or keys on the MacBook Pro.
- `chromium/tests/macos-fork-exclusions.mjs`, `chromium/release/standing.json` and the spec's divergence register change only on the owner's word.
- A row moves to Integrated only on a full or `--only` runner result, or a `native-*.mjs` result, on the tracker's current candidate. A row moves to Verified only after the owner's manual accessibility and visual checklist; this plan does not attempt Verified.
- No commit carries a model name trailer.

## 1. What is left (from the tracker at `d30c6553a`)

| Group | Rows | Needs a build? | Lane |
| --- | --- | --- | --- |
| Not rechecked | F49, F50 wallpaper; F54 clock Font & color; F58 Reading Mode; F59 Ctrl+Tab recent order | No, to find out; yes, to fix | Codex tests, Claude fixes |
| Implemented, unproven | N1 Forget/Clear all; N13 site mute, page tint; N14 mouse gestures; N15 local HTML; N17 Invite; F51 What's New | Same | Codex tests, Claude fixes |
| Runner gaps | `platform-services.feature:25`, `private-tabs.feature:40`, `supporter-and-session.feature:12` | No | Codex |
| Shipping target | inventory pinned to `8a4e57e78` (v1.48.0-36); shipping is v1.49.1 | No | Codex |
| Importer fixtures and vectors | plan M.1, spec §7 | No | Codex |
| Not started, native | N2 capture indicator; N3 screen-sharing picker; N16 trust receipt, diagnostics; N18 Dock menu, badge, Check for updates; N20 tab import and handoff pages; X2 protected-video notice | Yes | Claude |
| Importer, native | plan M.2–M.4 | Yes | Claude |
| Known bugs | window size after relaunch (`vertical-tabs.feature:58`); Spaces menu fade (`F41-named-workspaces.feature:211`) | Yes | Claude |
| Real-device | R2, R3 Sync with a real iPhone; F22 replacement channel, Intel, bridge | Owner | Out of scope here |

Out of scope: F38, F42, X1 (owner chose Web Store extensions), Windows, Linux, Android, Verified.

## 2. Owner decisions this plan waits on

| # | Decision | Blocks |
| --- | --- | --- |
| O1 | Codex may launch Blanc Prototype test windows on the MacBook Pro while you use it (CDP only, one at a time) | every Codex task that runs a browser (C1, C2) |
| O2 | Wording and design of the protected-video notice (STATUS says to show you options first) | K8 |
| O3 | D5: migrate site sign-ins, or sign in again | K9's last step (M.4) only |

## 2a. Changes after staging (2026-11-16)

- **O1 answered: yes.** The staged app is at `~/Projects/Blanc-Codex/` and passes a four-case runner smoke there.
- **Codex cannot run the browser tests.** Its sandbox refuses the harness's helper processes (`spawnSync /bin/ps EPERM`; loopback listening needs `network_access=true` as well). Owner's choice: Codex stays sandboxed and writes the tests without running them; Claude runs each on the staged app and hands the output to one fix-up run. So in C2 Codex reports no pass or fail, and every selector, hook and world call it uses must already appear in a working test.
- **C1 moves to Claude.** Last night's run names what the three undefined cases lack: the updater case needs a signed feed, the private-passkey case needs Touch ID on a signed build, and the Patron case needs a native `setSupporterActive` hook. None is test-only work.
- **C2 runs in batches of three rows:** C2a F49, F50, F54; C2b F59, N1, N17; C2c F58, N13, F51. C3 and C4 need no browser and are unchanged.

## 2b. Progress and changes (2026-11-16, later)

- **C2a landed** (ee26ec3d5): F49, F50, F54 Integrated.
- **C2b landed** (71d6ca969): N1 Integrated. Codex reported F59 and F58 blocked, correctly: F59 (Ctrl+Tab recent order) is not built in the fork, and F58 has nothing that observes Reading Mode open. Both join the Claude lane as **K11** (build F59: the `tabSwitchOrder` setting, shipping's switcher card, and a held-Ctrl test helper) and **K12** (fill `readerActive` from native, then test F58).
- **C2c is cancelled for Codex.** Its rows can't be tested blind without touching the owner's Mac: N13 plays audio, N17 opens the mail app or writes the clipboard, F51 needs a release-version hook. Claude tests them with the harness's isolation.
- **C3 moves to Claude.** The scenario change to v1.49.1 is small (44 lines in two feature files), but the pin is shared by `tests/lib/shipping-core.cjs`, the tracker and eleven unit tests that compare the fork's ports with shipping, and moving it goes with a renderer sync and a build. It becomes **K13**, a shipping-target move like the one to v1.48.0.
- **C4 is running** (importer fixtures and answer key). It is Codex's last card in this plan.

## 2c. Codex lane finished (2026-11-16)

- **C4 landed** (c2274c41d): the fixture generator and answer key, 15 tests. Codex's lane in this plan is done: three cards landed, each one commit inside its allowed files, none rejected.
- **Two new owner questions for K9**, raised by the answer key: **O4** which Chromium profiles get the synced keys of the single device-wide `settings.json`; **O5** which non-secret `sync.json` fields migrate.
- What remains is all Claude lane (§6 plus K11–K13) and needs Mac Studio builds.

## 3. Codex operating contract

These rules are pasted verbatim at the top of every brief. They exist because of how the October fork work went wrong (124 continuation sections in a day, numbered draft copies, 22 `CODEX-NOTES-*.md` files, integration deferred).

1. **One card, one run, one commit.** Do the card you were given. When its Done-when holds, commit once and stop. Do not start another card, refactor, or "while I'm here" anything.
2. **Paths.** You may create or edit only the paths the card lists under Files. Never touch: `chromium/patches/`, `chromium/upstream*/`, `chromium/lanes/`, `chromium/blanc/` (any file), `chromium/STATUS.md`, `chromium/tracker.json`, `chromium/tests/macos-fork-exclusions.mjs`, `chromium/release/`, `src/`, `site/`, any `*.cc`, `*.h`, `*.mm`, `*.inc`, `*.gn`, `*.gni`. A commit that touches any of them is rejected whole.
3. **No builds, no SSH, no network installs, no `git push`.** The app under test is the staged copy named in the card. If a card seems to need a build, that is a BLOCKED result.
4. **A failing product check is a finding, not a bug for you to fix.** Write the test so it fails on the real defect, mark that check `expected-fail` in the report with what you observed, and leave product code alone.
5. **Never weaken a check to make it pass.** No raised timeouts beyond the card's number, no deleted assertions, no new exclusions, no retries added around a failing step. If a shipping scenario cannot be bound honestly, report it as BLOCKED with the reason.
6. **Numbers come from the repo.** Any threshold, count or default you assert must be read from shipping source at the pinned commit (`git show 8a4e57e78:<path>`), and the report cites the path and line.
7. **No notes files in the repo.** No `CODEX-NOTES-*`, no drafts, no numbered copies. Your only prose output is the report file the run was given (`-o`).
8. **Time box.** If the card is not done after 45 minutes of work or three failed attempts at the same step, stop and report BLOCKED. Do not loop on self-review; run the card's Verify commands once at the end, fix what they show, run them once more, and stop.
9. **Report format**, exactly:

```
CARD: <id>
RESULT: DONE | BLOCKED
COMMIT: <sha or none>
FILES: <one path per line>
VERIFY: <each command, then its last 5 lines of output>
FINDINGS: <product defects found: test, check, observed vs expected, shipping source cited>
ASSUMED: <everything you relied on but did not check>
BLOCKED-BECAUSE: <only if BLOCKED>
```

## 4. How Claude runs and audits each card

- [ ] **Stage once (K0):** copy the nightly's `Blanc Prototype.app` (candidate `macos-4f9e9bb648216395`) from the Mac Studio to `~/Projects/Blanc-Codex/app/`, write `~/Projects/Blanc-Codex/runtime-config.json` for it (embedded assets), and check that the copy's framework SHA-256 is `4f9e9bb6…d04a`. Create worktree `~/Projects/Blanc-Codex/repo` on branch `codex/fork-lane` from `origin/chromium/next`, with `node_modules` linked.
- [ ] **Run a card:** write the brief (contract §3 + the card, verbatim) to the scratchpad, then

```bash
~/.npm-global/bin/codex exec -C ~/Projects/Blanc-Codex/repo -s workspace-write -o <scratchpad>/<card>.report.md - < <scratchpad>/<card>.brief.md
```

  in the background, outside the sandbox. One Codex run at a time. Stop it at 60 minutes wall clock.
- [ ] **Audit, from primary sources, never from the report:**
  1. `git -C ~/Projects/Blanc-Codex/repo diff --name-only origin/chromium/next...HEAD` lists only the card's Files. Otherwise reject the commit.
  2. Exactly one new commit.
  3. Run the card's Verify commands myself; results must match the report.
  4. Read every new assertion against shipping source at `8a4e57e78`. Reject invented numbers.
  5. Positive control: for each new test, break the thing it checks (a temporary local edit to the staged assets or the fixture) and see it fail.
  6. Read ASSUMED and check each line.
- [ ] **Land:** merge `codex/fork-lane` into `chromium/next` when the audit passes, run the fork unit suite, push. Findings become K2 items. Record the card in STATUS in one entry.
- [ ] **Stop rule:** two rejected runs of the same card means Claude does that card inline; no third Codex run.

## 5. Codex task cards

Every card's Verify ends with the fork unit suite:
`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs` → `fail 0`.

`CFG=~/Projects/Blanc-Codex/runtime-config.json`. Each run writes to a new folder under `~/Projects/Blanc-Codex/out/`.

### C1: Bind the three undefined shipping cases

**Files:** `chromium/tests/fork-steps/*.mjs`, `chromium/tests/adapters/*.mjs`, `chromium/tests/*adapters.test.mjs`.

**Why:** these three are the only cases the runner cannot judge: `spec/acceptance/platform-services.feature:25` (in-app updater), `spec/acceptance/private-tabs.feature:40` (private-tab passkeys), `spec/acceptance/supporter-and-session.feature:12` (Patron).

- [ ] Read each scenario's steps: `git show 8a4e57e78:spec/acceptance/<file>`.
- [ ] Find which step is unbound: run `node chromium/tests/runner.mjs $CFG <out> --only=<case id>` and read `baseline.json` for the step whose result is `undefined`.
- [ ] Add the missing step adapter in the existing style of `fork-steps/`, reading state through the test hook or CDP only.
- [ ] Add a unit test beside the adapter that binds the step text.

**Done when:** each of the three `--only` runs ends `pass` or `fail`, never `undefined`. A `fail` is a finding. If a step needs a signed update feed, Touch ID, or a Polar key, that case is BLOCKED; say which, and do not add an exclusion.

### C2: Recheck tests for the eleven unproven rows

**Files:** new `chromium/tests/native-recheck-<row>.mjs` (one per row), `chromium/tests/fixtures/` (new files only).

One file per row, each modeled on `chromium/tests/native-mouse-gestures.mjs` (same imports, `NativeFixture`, `assertRendering`, a `result.checks` array written to `<out>/result.json`). Each check's expected value is read from shipping at `8a4e57e78`; cite the file.

| Row | What the test must show | Shipping source to read |
| --- | --- | --- |
| F49 | Customize → Your image sets the Start Page wallpaper; Wash and Fade change it; it survives a relaunch | `src/main/wallpaper.js`, `src/main/wallpaper-model.js`, `src/renderer/pages/newtab-wallpaper.js` |
| F50 | Customize → Color sets a fill; it survives a relaunch | same |
| F54 | Billboard clock Font & color offers Instrument Sans Condensed, Inter, Roboto Flex; a choice applies and persists | `src/renderer/pages/newtab.js`, `clock-art.js` |
| F58 | `/reader` and the View menu item open Chromium's Reading Mode on an article fixture (owner decision: native Reading Mode) | `chromium/STATUS.md` "Native-versus-port decisions" |
| F59 | With `tabSwitchOrder` `recent`, Ctrl+Tab through CDP key events picks by last use and shows the card after 150 ms; `list` goes by position | `src/main/tab-switcher.js` |
| N1 | The Recently closed band lists a closed tab; Forget removes one entry; Clear all empties it; private tabs never appear | `src/main/closed-tabs.js` |
| N13 | Mute Site silences a playing fixture and survives a relaunch (V21); Match site colors off clears the page tint | `src/main/site-mute.js`, `src/main/page-tint-controller.js`, `src/main/page-tint-policy.js` |
| N14 | Run the existing `native-mouse-gestures.mjs` unchanged on the staged app | — |
| N15 | Run the existing `native-local-files.mjs` unchanged | — |
| N17 | `/invite` puts shipping's invite text on the clipboard when no mail app answers | `src/main/invite-friend.js` |
| F51 | With a test version reported, the What's New pill shows once and its link opens the changelog | `chromium/STATUS.md` S2.4 entry |

- [ ] Write each test, run it: `node chromium/tests/native-recheck-<row>.mjs $CFG <out>`.
- [ ] For N14 and N15 only run and report; add no file.

**Done when:** nine new test files exist, each runs to completion, and the report lists every check as `pass` or `expected-fail` with what was observed. Fixing nothing is correct.

### C3: Move the scenario inventory to v1.49.1

**Files:** `chromium/tools/scenario-inventory.cjs` (the pinned commit, tag and expected count only), `chromium/scenarios/inventory.json` (generated), `chromium/tests/fork-steps/*.mjs` and `chromium/tests/adapters/*.mjs` (new step bindings only).

- [ ] Set the pin to tag `v1.49.1` (`673ff2eb052011b1efd14438a397a57d457de241`); run `node chromium/tools/scenario-inventory.cjs`; set the expected declaration count to what it prints.
- [ ] List, in the report, every scenario added, removed or changed since `8a4e57e78` (`git diff 8a4e57e78 v1.49.1 -- spec/acceptance`).
- [ ] For each added or changed scenario, bind any new step text. Do not run the suite: the staged app predates the pin, and `tracker.json` is Claude's.

**Done when:** `node chromium/tools/scenario-inventory.cjs --check` passes and the report's list is complete. Claude then updates the tracker's pin with `--sync-mapping` and runs the changed cases.

### C4: Importer fixtures and expected vectors (plan M.1)

**Files:** new `chromium/tools/importer-fixtures.mjs`, `chromium/tools/importer-fixtures.test.mjs`, `chromium/tests/fixtures/importer/` (generated).

- [ ] Read spec §7's migration table and, for each migrated store, shipping's writer at `v1.49.1` (`src/main/store.js`, `settings.js`, `bookmarks.js`, `history.js`, `session-restore.js`, `local-profiles.js`, `start-page-pins.js`).
- [ ] `importer-fixtures.mjs --out <dir>` writes a synthetic Electron `userData` folder (Personal plus one named profile; Favorites, history, settings, `session.json` v2 with groups and a split, Spaces, pins) using only made-up data, and beside it `expected.json`: the values the importer must produce, keyed by the spec §7 row.
- [ ] Deterministic: the same command twice gives byte-identical output (test asserts it).
- [ ] No real profile data, no secrets, no Sync or Patron keys (those are M.3, Claude's).

**Done when:** the unit test passes and `expected.json` has an entry for every "migrated" row of spec §7; rows the spec marks as not migrated or undecided (D5) are listed in the report, not guessed.

Card order: C1, C2, C3, C4. C2 may be split into two runs (first five rows, then the rest) if the first hits the time box.

## 6. Claude lane (native; builds on the Mac Studio)

Each item: a failing `native-*.mjs` or scenario first, then the change, an incremental build through the guard, the test on the new candidate, fork unit suite and `check-patches.py`, push. One item in flight at a time.

- [ ] **K0** Stage the Codex workspace (§4) and start C1.
- [x] **K1** (done 2026-11-16, patch 0087: AppKit's replayed window state overrode the session's bounds) Window size after relaunch. Next step is already named in STATUS: a Prototype build that logs which code creates the first window and with what bounds. Done when `vertical-tabs.feature:58` passes 10 of 10.
- [ ] **K2** Fix each finding from C1 and C2, smallest first. Each fix turns its `expected-fail` check into a pass and moves the row in the tracker.
- [ ] **K3** N18: Dock menu (New Window, New Private Tab, New Mini Window as shipping), app badge, Check for updates in the app menu wired to Sparkle. Test: extend `native-app-menu-about.mjs`.
- [ ] **K4** N2: capture indicator chip and popover from Chromium's `MediaStreamCaptureIndicator`; truthful `permissions.query` is already Chromium's. Test: fake-device capture fixture, chip on and off.
- [ ] **K5** N3: screen sharing through Chromium's native picker, checked in an Island window (no toolbar anchor) and in a Glance. Likely a small patch like 0081.
- [ ] **K6** N16: trust receipt and diagnostics export in Settings → About, reading the fork's own release manifest.
- [ ] **K7** N20: tab import and handoff pages and the `blanc-import:` scheme; un-hide Bring Your Tabs paths that depend on it.
- [ ] **K8** X2: protected-video notice with Open in Blanc, after O2. Retires the `no-drm-handoff` standing waiver (owner's word needed to set `until`).
- [ ] **K9** Importer M.2 in the browser process against C4's fixtures and `expected.json`; M.3 key re-wrap; M.4 after O3.
- [ ] **K10** Spaces menu fade flake (`F41…:211`), last: it passes on rerun and blocks nothing.
- [ ] **After C3:** move the tracker pin, run changed cases on the then-current candidate, fix or record gaps.
- [ ] **Close-out:** a full nightly on the final head; refresh the tracker from it as on 2026-11-16; list what remains for the owner's Verified checklist.

## Review Focus

What neither lane's tests catch by themselves, most likely first:

1. A Codex test that passes for the wrong reason (reads the fork's own state back instead of shipping's expected value). Audit step 5's positive control is the guard.
2. A Codex assertion with an invented number. Audit step 4.
3. Test windows stealing focus from the owner on the MacBook Pro mid-typing. If it happens once, Codex's browser runs move to off-hours or stop (O1).
4. A staged app that no longer matches the tracker's candidate after Claude's first K-build: Codex cards keep using the staged nightly copy on purpose; Claude reruns their tests on the new candidate when landing.
5. `expected.json` encoding a migration choice the spec leaves open. Anything D5 touches stays out.
