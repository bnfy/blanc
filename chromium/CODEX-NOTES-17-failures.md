# macOS acceptance repair — the supplied 17-failure task

2026-11-09, `chromium/s3-into-migration`. The supplied filters contain **18 distinct cases**, all accounted for below. These are scoped acceptance results, not macOS beta qualification or full shipping parity.

Only the supplied `rebuild.sh` and `run-cases.sh` wrappers were used for native builds and acceptance. Builds and runs were serial. The owner's `live/` app/profile, shipping sources/steps/specifications, generated Island shipping copies and Sync implementation were not edited. Commits are local; nothing was pushed.

## Cases

| Case | Status | Cause, fix and local commit |
| --- | --- | --- |
| `vertical-tabs.feature:43` | fixed | Shipping's viewport transport inspected the 68 px Island strip before selecting vertical layout. The fork step selects vertical layout, resizes the actual window and observes its full-height strip; real rail metrics and reduced-motion support unblock the original assertions. `103370ce`. |
| `vertical-tabs.feature:58` | not fixed | The viewport and effective-width defects are fixed in `103370ce`: cap the rail to the available pane while retaining the preferred width. All geometry assertions now pass, then the scenario reaches the unavailable Profile Sync export adapter. Sync is explicitly outside this task. |
| `vertical-tabs.feature:74` | fixed | The viewport fix reaches the real title-hover assertions. The fork page shim now implements reduced-motion emulation through CDP so the original accessibility/motion checks run. `103370ce`. |
| `vertical-tabs.feature:99` | fixed | The utility sheet ignored the vertical rail/page-pane origin. Native effective rail width and host sheet placement now agree; adapters measure the actual rail and sheet. `103370ce`. |
| `vertical-tabs.feature:110` | fixed | The palette helper toggled an already-open panel closed. Close the existing panel before opening the palette and measure the real pane-centered overlay. `103370ce`. |
| `vertical-tabs.feature:120` | fixed | The Find capsule must fit the minimum window beside the rail. Use effective rail width for overlay constraints and await the actual capsule bounds. `103370ce`. |
| `vertical-tabs.feature:217` | not fixed | The viewport is repaired, but the native Settings sheet has no vertical-tab text-size preference/control. The shipping step waits for `#tabLayout`; the fork lacks the requested text-size integration. The existing Settings integration lives in explicitly excluded `chromium_settings_handler.inc` and was not extended in this task; the scenario also later requires Profile Sync exclusion evidence. No fabricated preference or skipped assertion. |
| `blank-tab-affordance.feature:34` | fixed | Closing the last tab created the replacement blank page without opening/focusing the Island. Track that exact replacement through successful close, then open the Island with address focus only if it is still active. `ad350b75`. |
| `quiet-tabs.feature:8` | fixed | Native discard retained oversized page state and reported a constant false fallback flag. Trim old history state and active state above shipping's 512 KiB base64 budget, retaining native navigation ownership, URL/title/history and real trim provenance. `1e34c0fd`. |
| `quiet-tabs.feature:118` | fixed | Chromium's transient reuse policy held a pending-reuse reference on the discarded page's dedicated renderer. Patch 0041 releases only that policy's reference on discard, preserving shared-process and native shutdown protections. The existing adapter still checks real OS PID liveness. `1e34c0fd`. |
| `F41-named-workspaces.feature:34` | not fixed | The quiet tab and workspace ownership survive. The failure is the separate `quiet.pinned === true` assertion: native `AddToNewGroup` unpins the tab before quieting, because Chromium's native model cannot represent grouped pinned tabs. Correct support requires a coherent fork model across pin/group operations, restore and workspace serialization; reporting a synthetic pinned field would hide the product gap. |
| `glance.feature:98` | stale scenario | The shipping When installs its restore probe in `glanceCardPage()`, but Then reads it from `mainChromePage()`. Native diagnostics found the probe on `glanceCardFrame` with the correct `null` value, and absent on `strip` (undefined). The wrong-surface assertion remains unchanged/failing. |
| `glance.feature:538` | fixed | Push auto-hide translated the whole native host, including the Glance card. Keep the card's host fixed and animate only the strip; preserve the corresponding native hit region. `54d65cc2`. |
| `island-and-commands.feature:359` | fixed | The same host translation offset the card by 98 px when changing styles. The card now keeps its window coordinates across push/float transitions. `54d65cc2`. |
| `island-and-commands.feature:295` | fixed | Secondary-window floating views were looked up using logical window labels as CDP target IDs. Resolve the native window ordinal to the actual host target and observe its floating surface. `54d65cc2`. |
| `split-view.feature:110` | fixed | Pane navigation passed `blanc://mahjong/` directly to Chromium. Reuse the adapter's existing public-to-native internal URL translation before navigation; the original state/label assertion now succeeds. `eb15ee0b`. |
| `split-view.feature:159` | fixed | Explicitly stack the pill above split headers and observe real stacking independently from current visibility. Relaunch then exposed a missing cursor watcher when registration followed window activation: initialize activation sampling at registration. `54d65cc2`. |
| `tabs-and-groups.feature:112` | stale scenario | Neither pinned shipping `6479ed3a314e4fd6219b8de1598bacffa78b4d7c` nor the current Electron overlay renders a tucked-away row for collapsed groups. `tabGroups.tucked` remains only in the catalog. No source, step or specification changed to manufacture the obsolete row. |

## Diagnostic evidence and limits

Evidence root: `/Users/anthonyjloria/Projects/BlancChromium158/evidence/foundation` (`E` below). Original failures were reproduced with `codex17-vertical-before` / `codex17-vertical-unblocked` and `codex17-other-before`.

- `codex17-glance-diag.log` records the misplaced focus probe and native card/page coordinates. All temporary probe logging was removed.
- `codex17-quiet-targeted.log` records the dedicated page still live after discard with pending reuse count 1. `codex17-quiet-policy-targeted.log` records that renderer absent after the policy fix, followed by a passing wake/storage/process-count assertion. Temporary native and adapter diagnostics were removed before the final build.
- The first state-trimming trial used the session-restore `NavigationEntry::SetPageState` API. Native acceptance caught a reload DCHECK because it replaced the entry's SiteInstance. The final implementation trims a cloned frame entry while retaining navigation ownership; this rejected trial is not in the commits.
- Full vertical-file run `codex17-vertical-full` improved from 0 pass / 7 fail / 13 undefined to 7 pass / 6 fail / 7 undefined. Its additional failures are newly reached cases, not lost prior passes. Full blank-tab run `codex17-blank-full` passed all four cases.

The quiet patch adds two pinned upstream inputs and changes two upstream files in six hunks. Patch 0041 releases the policy reference only when all process frames belong to the discarded page; it does not kill processes directly, bypass unload/worker/request protections, change toolchains, or relax quiet eligibility. Final patch reconstruction reports 145 upstream output files and 551 custom files. The desktop stack now has 40 patch files, 487 hunks and 141 distinct patched paths (the reconstructed output also includes unchanged pinned inputs).

## Final candidate and verification

Candidate: `macos-c50cd71293d37d45`, embedded assets, runtime config `$E/codex17-final-runtime-config.json`. Final build log: `$E/codex17-final-build.txt` (guarded incremental, 6 actions, 32.56 s).

The full eight-feature run contains **357 selected cases: 275 pass, 10 fail, 72 undefined**, compared with the morning's 261 / 18 / 78. Exact wrapper output: `$E/codex17-final-features.output.txt`; case-level comparison: `$E/codex17-final-features-comparison.txt`; raw baseline: `$E/codex17-final-features/baseline.json`.

| Feature | Morning pass/fail/undefined | Final pass/fail/undefined |
| --- | --- | --- |
| F41-named-workspaces.feature | 60/1/23 | 59/2/23 |
| blank-tab-affordance.feature | 3/1/0 | 4/0/0 |
| glance.feature | 40/2/27 | 41/1/27 |
| island-and-commands.feature | 69/2/2 | 71/0/2 |
| quiet-tabs.feature | 23/2/3 | 25/0/3 |
| split-view.feature | 29/2/1 | 31/0/1 |
| tabs-and-groups.feature | 37/1/9 | 37/1/9 |
| vertical-tabs.feature | 0/7/13 | 7/6/7 |


The only lost morning pass is `F41-named-workspaces.feature:182`, outside the requested 18. Its shipping setup explicitly asserts the Light-theme mark without selecting Light; reset uses System. On this run macOS reports `Dark`, and `$E/codex17-theme-diagnostic.log` observes `prefers-color-scheme: dark === true` in the ordinary strip. The expected no-edge Light mark differs from the correct edged Dark mark. The same case fails again in `$E/codex17-theme-diagnostic.output.txt`. The shipping assertion and product theme behavior remain unchanged; the temporary read-only probe was removed. This environmental failure remains visible rather than being counted as a pass.

The five newly reached vertical failures were undefined in the morning: `:9` waits for the blocker to start on a restored blank-only profile; `:129` reaches the grouped-pin model assertion; `:146` awaits a private favicon intentionally absent from the snapshot; `:239` expects the Linux menu on this Mac runner; `:249` lacks the page shim's `pressSequentially`. They are recorded in the comparison, not silently skipped or described as passes.

Full-feature command:

```sh
bash "$SP/run-cases.sh" codex17-final codex17-final-features 'vertical-tabs.feature:,blank-tab-affordance.feature:,quiet-tabs.feature:,F41-named-workspaces.feature:,glance.feature:,island-and-commands.feature:,split-view.feature:,tabs-and-groups.feature:'
```

Required pre-commit checks: `/usr/local/bin/node --test chromium/tools/*.test.mjs` and `python3 chromium/tools/check-patches.py`. Receipts: `$E/codex17-quiet-tools.tap`, `$E/codex17-quiet-patches.txt`, and the final notes-commit receipts `$E/codex17-notes-tools.tap`, `$E/codex17-notes-patches.txt`. Both commits passed all 231 tool tests and patch reconstruction (145 upstream outputs / 551 custom files). The static expected output count was updated from 143 to 145 for the two newly pinned files; no reconstruction check was removed.

`SP=/private/tmp/claude-502/-Users-anthonyjloria-Projects-BlancChromium158-repo/600bf6e0-4d53-4534-b112-7ab3638fd2e4/scratchpad`.


## Final combined run

**13 passed, 4 failed, 1 undefined**: 13 fixed, 2 stale scenarios, 3 not fixed. No pass required an automatic retry. This is the final native acceptance run; no native source or adapter changed afterward. Final runtime code commit: `1e34c0fd`.

```sh
bash "$SP/run-cases.sh" codex17-final codex17-final-18 'vertical-tabs.feature:43:,vertical-tabs.feature:58:,vertical-tabs.feature:74:,vertical-tabs.feature:99:,vertical-tabs.feature:110:,vertical-tabs.feature:120:,vertical-tabs.feature:217:,blank-tab-affordance.feature:34:,quiet-tabs.feature:8:,quiet-tabs.feature:118:,F41-named-workspaces.feature:34:,glance.feature:98:,glance.feature:538:,island-and-commands.feature:359:,island-and-commands.feature:295:,split-view.feature:110:,split-view.feature:159:,tabs-and-groups.feature:112:'
```

Exact stdout from `$E/codex17-final-18.output.txt`:

```text
F41-named-workspaces.feature:34:plain fail retried | Expected values to be strictly equal:  false !== true  | missing: []
blank-tab-affordance.feature:34:plain pass  |  | missing: []
glance.feature:98:plain fail retried | cancel restored focus toward a control that no longer exists + actual - expected  + undefined - null  | missing: []
glance.feature:538:plain pass  |  | missing: []
island-and-commands.feature:295:plain pass  |  | missing: []
island-and-commands.feature:359:plain pass  |  | missing: []
quiet-tabs.feature:8:plain pass  |  | missing: []
quiet-tabs.feature:118:plain pass  |  | missing: []
split-view.feature:110:plain pass  |  | missing: []
split-view.feature:159:plain pass  |  | missing: []
tabs-and-groups.feature:112:plain fail retried | Timeout waiting for a "3 tabs tucked away" row for work: false | missing: []
vertical-tabs.feature:43:plain pass  |  | missing: []
vertical-tabs.feature:58:plain undefined  | The fork has no Profile Sync export to read synced settings from | missing: []
vertical-tabs.feature:74:plain pass  |  | missing: []
vertical-tabs.feature:99:plain pass  |  | missing: []
vertical-tabs.feature:110:plain pass  |  | missing: []
vertical-tabs.feature:120:plain pass  |  | missing: []
vertical-tabs.feature:217:plain fail retried | waitForFunction timed out: false | missing: []
```

