# Chromium rebase ledger

One row per rebase of the prototype patch set onto a new upstream Chromium
tag, plus one detail section per row. This is the measured record that
`docs/chromium-migration-implementation-plan-2026-10-16.md` (§2 spike gate,
§4 A2, §5 criterion 1, §6 Task 0) and the owner's Decision 2 read. **No
rebase has been run yet; the table below is the template, and its first row
is filled only after the owner approves the Task 0 cold build in
`task0-cold-build-request.md` §7.**

Rules for filling it in:

- Every figure is measured on the machine named in the row, never estimated.
  An unmeasured cell says `not measured`, not a guess.
- Times are wall-clock unless the column says attention. **Owner attention**
  is time the owner spent on the rebase (approvals, decisions, hands-on
  fixes, watching a foreground build does not count); **agent time** is
  the time Codex or Claude were actively working on it.
- The **cold build** columns are a clean-build recovery benchmark for an
  empty output directory with no configured compilation cache. **Cold-build
  time is the accumulated runtime of the build process itself**: the sum of
  the `build.mjs --build` invocations that bring the empty output to the
  first complete `chrome` target, excluding repair time (editing sources
  between invocations) and idle gaps (an interrupted build left overnight).
  Log every invocation once in the invocation table, marked either
  *cached continuation* (resuming the same build after an interruption, no
  source change) or *recompilation after a fix* (a source change in
  between); only the first kind counts toward the cold-build column, the
  second kind counts toward compile fixes. The cold-build column is never
  added into the routine cost columns (prepare, compile fixes, incremental
  builds, re-verification), which are what recurs per milestone.
- Chrome milestones ship every two weeks since Chrome 153; record the
  cadence in force in the row so later readers can tell what each rebase
  was keeping up with.
- A stopped rebase is still a row: fill what was measured, mark the outcome
  `stopped`, and say which criterion stopped it.

## Summary table

| # | Date | From tag | To tag (commit) | Cadence in force | Machine / toolchain | Anchors broken | Files patched before → after | Prepare and anchor fixes (wall / attention) | Cold build (accumulated build runtime, actions) | Compile errors | Compile fixes and incremental builds (wall) | Re-verification (wall, result) | Owner attention | Agent time | Calendar span | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | `156.0.8078.36` (`5a93aa59e304`) | `157.0.8103.6` (`41520584daa6`), proposed | two weeks (since Chrome 153) | owner's Mac, Xcode 27.1 (`27A9275`), Apple Silicon | — | 20 → — | — | — | — | — | — | — | — | — | not started: awaiting cold-build approval |

Column notes: *Anchors broken* counts `prepare.mjs` anchors that no longer
matched (details below). *Files patched* counts upstream files `prepare.mjs`
edits, excluding Blanc's own new files. *Cold build* is the accumulated
runtime of the build invocations from the empty output to the first
complete `chrome` target, cached continuations included, repair time and
idle gaps excluded, with Siso's reported action count. *Calendar span* runs from the first fetch to the last re-verification
result. *Outcome* is `passed`, `passed with divergences` (listed below),
`stopped (criterion N)` or `not started`.

## Rebase 0: `156.0.8078.36` → `157.0.8103.6` (proposed)

Status: **not started.** Approval: `task0-cold-build-request.md` §7, open.

### Environment

| | |
| --- | --- |
| Source checkout | `/Users/anthonyjloria/Projects/BlancChromium157/src` (sibling; existing checkout untouched) |
| Output | `/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype` |
| `args.gn` | `is_debug=false is_component_build=false symbol_level=0 target_cpu="arm64"` (same digest as the existing output: `_______`) |
| Xcode / SDK | `_______` |
| Clang revision and version (`third_party/llvm-build/.../cr_build_revision`) | 156: `_______` · 157: `_______` · changed: yes / no |
| Free space before / after | 480.7 GiB (October 16) / `_______` |
| Checkout size / output size after | `_______` / `_______` |

### Fetch and generation

| Step | Wall-clock | Notes |
| --- | --- | --- |
| Fetch at tag + one-time hooks | `_______` | |
| `prepare.mjs` first run | `_______` | refused unknown version until `expectedVersion` updated: yes / no |
| `gn gen` (after prepare) | `_______` | re-run count if `BUILD.gn` changed again: `_______` |
| `--record-environment` | `_______` | |
| `--check` plan inspection | `_______` | planned actions: `_______`; buildflag-generation stop hit: yes / no |

### Anchors broken

One line per `prepare.mjs` anchor that no longer matched.

| Upstream file | Hunk (what the anchor targets) | Cause (moved / renamed / API changed / removed) | Fix | Minutes |
| --- | --- | --- | --- | --- |
| | | | | |

Files patched before → after: 20 → `_______`. New native files unchanged /
changed: `_______`.

### Cold build (clean-build recovery benchmark; not routine cost)

| | |
| --- | --- |
| Approved by the owner on | `_______` |
| First invocation started / first complete `chrome` target finished | `_______` / `_______` |
| Accumulated build runtime (sum of the *cached continuation* rows below) | `_______` |
| Calendar span of the above, for contrast (includes idle gaps) | `_______` |
| Siso actions, total | `_______` |
| Peak disk during build | `_______` |

Build invocations, one row each, in order. *Kind* is `cold start`, `cached
continuation` (same sources, resumed after an interruption) or
`recompilation after fix` (sources changed since the previous invocation;
counted under compile fixes, not here).

| # | Started | Runtime | Actions | Kind | `--allow-large-build` | Why it ended (complete / interrupted: cause) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | cold start | yes | |

### Compile errors and incremental rebuilds

| Error (file:line, one line) | Cause | Fix | Rebuild wall-clock, actions |
| --- | --- | --- | --- |
| | | | |

### Re-verification

Same checks as the milestones in `results.md`; each is pass / fail /
not run, with the evidence file.

| Check | Milestone it preserves | Result | Evidence |
| --- | --- | --- | --- |
| Prototype launches on a disposable `--user-data-dir`; Island renders; header tint follows the page | Island-only window | | |
| Island tab control (create, switch, close, navigate, back, forward, reload, stop, ⌘L/⌘T/⌘A, Escape, type-to-open) | Island interaction | | |
| Live Web Store install with the native permission prompt (one extension) | Web Store gate | | |
| One extension update from Google's endpoint, surviving restart | Verified version upgrade | | |
| Extension action popup opens from the Island's Extensions button and takes focus; Escape and ⌘L return focus to the Island | Expanded Island extensions view; four Island focus fixes | | |
| Favorites: pill and panel hearts, ⌘D (including while the Island has focus), `/save [folder]`, Quick Switcher, live start-page refresh | Favorites, history and Island search; ⌘D | | |
| History: `/history`, switcher ranking and dedup; `/clear` on the disposable profile expires every visit and the start page's recent sites refresh | `/clear` on a disposable profile | | |
| Private window: no Favorites or history listed, hearts hidden, `/save`, `/clear` and ⌘D refused silently, keyboard checks pass | Private-window guards | | |
| Pin, mute, reorder: row controls, `/pin`, `/mute`, drag, ⌥⇧↑/↓, pinned boundary respected | Pin, mute and reorder | | |
| Named tab groups: `/group`, `/ungroup`, `/close-group`, headers fold/unfold, switcher focus, cross-group drag and reorder; grouping a pinned tab unpins it (known divergence) | Named tab groups | | |
| Start page: four layouts and dynamic wallpaper selectable from Customize, choice persists across restart and propagates to another open start page; bookmarks and TopSites listed | Blanc start-page native integration | | |
| Dock icon is Sunrise Dark from the bundle | Sunrise Dark Dock icon | | |
| Build guard: `--check` plan inspection, lock, environment pin behave as before | Build cache safeguards | | |
| Automated bridge and DOM checks (the milestone scripts) | all | | |
| Native-input checklist (CGEvent mouse and keyboard) | all | | |

New divergences from Electron found in this rebase: `_______`.

### Effort and outcome

| | |
| --- | --- |
| Owner attention | `_______` |
| Agent time (Codex / Claude) | `_______` / `_______` |
| Calendar span | `_______` |
| Criterion 1 (plan §5: more than two owner-days of attention, or more than one calendar week including builds) | not hit / hit |
| Outcome | `_______` |
| What to change in `prepare.mjs` or the fork layout before the next rebase | `_______` |
