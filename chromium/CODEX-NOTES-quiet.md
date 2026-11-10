# Result

Queue 3 in progress; local commits only. Absolute owner hold on `out/BlancBeta`.

| Item | State |
| --- | --- |
| 1 lazy restore :99 | Done: patch 0051; unchanged scenario passes; full regression owed |
| 2 protections/private/page state | Under investigation; no pass claimed |
| 3 vertical :129 | Owed shipping v1.46.0 comparison |
| 4 whole inventory | Owed once on final candidate; top ten owed |
| 5 regression | Owed full desktop Sync then five features after product changes |

Cause of :99: Chromium's Recently closed and startup restore paths schedule
background loads after creating rendererless tabs. They become live without
selection; this is a product defect, not a snapshot projection error.
Current candidate: macos-8ee06275e7c42d9d; `q3-restore-1-runtime-config.json`.
Final candidate pending remaining items.
Baseline five files: 142 pass / 3 fail / 4 undefined; desktop Sync 22/22.
Lost passes: not yet measured. Final result tables and ranked gaps pending.
Unverified: startup restore end-to-end, remaining items and final inventory/regression.
No push, publication, signing, Apple, production services, 1Password or live tree.

## 1 — Lazy restore

`q3-restore-before` reproduces the unchanged scenario failure twice. A separate
isolated native observation saw both restored tabs with `rendererPid: 0`, then
both with real renderer PIDs within one second without activation. The
production `BrowserLiveTabContext::AddRestoredTab` unconditionally schedules
background loading; startup's `SessionRestoreImpl::FinishedTabCreation` also
submits every restored tab to the loader. Patch 0051 preserves rendererless
background rows in both paths; activation remains Chromium's normal visibility
and controller load path. App windows retain their existing restore policy.
Shipping references: `src/main/session-restore.js` (restored tabs born quiet),
`src/main/main.js` `createQuietTabsBatch` (`asleep: true`), and `tab-sleep.js`.

Build preflight stopped before compilation on pending generated flags after the
provided wrapper regenerated the prototype graph. Pinned args SHA remains
414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057.
The generated-header delta is the existing queue-2 flag
`BLANC_BETA_LOCAL_QUALIFICATION=false`; all existing prototype flags and the
pinned SDK/compiler remain unchanged. Generate only this prototype header,
then repeat guarded preflight. No beta output or toolchain action authorized.

`q3-restore-after`: unchanged :99 passes on macos-8ee06275e7c42d9d.
Guarded incremental build: 18 actions, 34.48s after the single header action.
Precommit: q3-restore-precommit.tap 291/291; reconstruction 159/573 passes.
Full regression is reserved for the final candidate after items 2 and 3.
