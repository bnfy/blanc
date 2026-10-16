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
  empty output directory with no configured compilation cache. They are
  recorded on their own and are never added into the routine cost columns
  (prepare, compile fixes, incremental builds, re-verification), which are
  what recurs per milestone.
- Chrome milestones ship every two weeks since Chrome 153; record the
  cadence in force in the row so later readers can tell what each rebase
  was keeping up with.
- A stopped rebase is still a row: fill what was measured, mark the outcome
  `stopped`, and say which criterion stopped it.

## Summary table

| # | Date | From tag | To tag (commit) | Cadence in force | Machine / toolchain | Anchors broken | Files patched before → after | Prepare and anchor fixes (wall / attention) | Cold build (wall, actions) | Compile errors | Compile fixes and incremental builds (wall) | Re-verification (wall, result) | Owner attention | Agent time | Calendar span | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | `156.0.8078.36` (`5a93aa59e304`) | `157.0.8103.6` (`41520584daa6`), proposed | two weeks (since Chrome 153) | owner's Mac, Xcode 27.1 (`27A9275`), Apple Silicon | — | 20 → — | — | — | — | — | — | — | — | — | not started: awaiting cold-build approval |

Column notes: *Anchors broken* counts `prepare.mjs` anchors that no longer
matched (details below). *Files patched* counts upstream files `prepare.mjs`
edits, excluding Blanc's own new files. *Cold build* is the single
`--build --allow-large-build` run from the empty output, including any
cached continuation after an interruption, with Siso's reported action
count. *Calendar span* runs from the first fetch to the last re-verification
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
| Started / finished | `_______` / `_______` |
| Wall-clock | `_______` |
| Siso actions | `_______` |
| Interruptions and cached continuations (each: when, why, `--allow-large-build` needed) | `_______` |
| Peak disk during build | `_______` |

### Compile errors and incremental rebuilds

| Error (file:line, one line) | Cause | Fix | Rebuild wall-clock, actions |
| --- | --- | --- | --- |
| | | | |

### Re-verification

Same checks as the milestones in `results.md`; each is pass / fail /
not run, with the evidence file.

| Check | Result | Evidence |
| --- | --- | --- |
| Prototype launches on a disposable `--user-data-dir`; Island renders | | |
| Island tab control (create, switch, close, navigate, back, forward, reload, stop, ⌘L/⌘T) | | |
| Live Web Store install, native prompt (one extension) | | |
| One extension update from Google's endpoint | | |
| Favorites: heart, ⌘D, `/save`, switcher | | |
| Pin, mute, reorder | | |
| Named tab groups | | |
| Start page: bookmarks and TopSites | | |
| Automated bridge checks | | |
| Native-input checklist | | |

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
