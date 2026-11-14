# L6 close-history warning repaired — October 23, 2026

**Reopened L6 regression resolved; bounded signed recovery acceptance reinstated.** On the previously accepted signed `8439cabc` candidate, a fresh unpinned New Tab close deterministically returns “Tab closed, but history persistence failed or timed out.” in 50 ms. The native close succeeds; the refusal is from attempting to flush a closed-history file that Chromium intentionally never created. This reproduces the owner-observed message without an injected fault. The original owner session did not record which tab-close request produced its message; no lost-tab or filesystem-failure claim is inferred from that warning alone.

## Narrow correction

Chromium’s `TabRestoreServiceHelper::IsTabInteresting` excludes an unpinned New Tab with one navigation. The Island previously recognized only initial/uncommitted tabs. Its destruction watcher now also recognizes that existing native exclusion, capturing pinned state before closure. **Pinned New Tabs and New Tabs with prior navigation keep their required historical flush.** The surviving open session is still rebuilt, flushed and revalidated on every regular close. Existing closed entries still require their history flush. Backend flush/error semantics, private exclusion, unload cancellation, UI focus, dispatch authority and keychain/profile namespaces are unchanged. [Reviewed native diff](native-review.diff).

The old signed negative control reproduces the false warning; ordinary close and same-process prior-history controls pass. The replacement passes the previously failing case, native pinned/history boundaries and a clean-restart/loaded-history control. Real immutable-file Session write failure still refuses acknowledgement, then retry succeeds after flags are removed. The separate historical-page failed-write/retry/immediate-crash schedule passes too. This fixes the false warning without hiding real storage errors.

## Exact replacement artifact

- Source `f4996df4e88c775bc1947a574b2bd7a0f9ad7539`; Chromium 157.0.8103.15, arm64, macOS 27.2.
- Signed/stapled ZIP SHA-256 `bc145e5ea41278971fd3384d0334d15f7140e0d4170e6b05f8e6a8d8f5c52bca`.
- Apple Accepted `9a8bd400-bb73-4555-8740-f2e09f115fd6`; Developer ID Application: Anthony Loria, team XYGUCY4498. Stapling, Gatekeeper and strict deep signature pass.
- All 17 executable and seven selected UI/blocker hashes match the signed baseline after testing and notarization. [Final audit](final-candidate-audit.json), [receipt](notary-result.json), [summary](summary.json).
- One guarded **37.63-second / six-step incremental build**, final guard zero. Fresh inventory **70 upstream files/173 hunks**, unchanged. No hooks, toolchain/GN changes, cold build, latency test or Electron build.

## Signed-candidate checks

**70 passing checkpoints**, separate from the old negative control and nine local ad-hoc preflight checks:

| Scope | Passing checkpoints |
| --- | ---: |
| Empty New Tab, pinned restore, navigated New Tab/back history, ordinary/prior-history close | 9 |
| Empty-history Session filesystem refusal and retry, ordinary/prior-history controls | 5 |
| Closed disposable-profile restart with loaded history before first close | 4 |
| Actual Island × button on a fresh start page, native success, no banner/phantom history | 3 |
| Full bounded signed recovery suite: encrypted clean restart/loading-close/crash (6), filesystem refusal/retry/immediate crash (4), Split/Recently Closed (5), private lifecycle/exclusion (10), grouped multiwindow/Spaces (6), native unload Cancel/Leave/last-tab/no banner (6), nonregular-record/clean-Quit (6), owner/profile teardown (6) | 49 |

Reports and executable fixtures are archived beside this record. Node 22.14.0; real Preview keychain namespace, no mock keychain or research build. Native dialogs are handled through Chromium’s actual dialog protocol; Island-button activation is DOM-driven, not a new owner physical-input claim. Nonregular FIFO rejection is not proof of an encryption-provider outage. Crash-restore policy/explicit Restore limitations remain those recorded in the bounded fixtures.

The prior owner-approved “Restoring your tabs” UI is [source-identical](recovery-ui-source-map.json); the prior explicit decision “Accept mapped UI evidence; close L6” remains applicable. No fresh waiting screen or unavailable-provider VoiceOver observation is claimed. [L5 mapping](l5-source-mapping.json) preserves the owner’s existing input/VoiceOver acceptance through unchanged UI assets and controls; this run does not invent another spoken pass.

Seven capture and eleven patch-counter tests pass. Initial fixture/permission mistakes are retained separately: the first baseline fixture used Chromium’s internal instead of Blanc’s displayed New Tab URL; a first prepare was denied access to macOS icon tooling; the first capture command named a nonexistent file; and the first inventory requested a tag absent from this isolated checkout. Corrected runs pass. Initial SSH used a malformed unrelated global config; isolated `-F /dev/null` succeeds without changing that file. None is counted as a product failure or passing targeted check.

## Gate status and preservation

**`[■■■■■■■■□□□□] 8/12 launch gates accepted (66.7%) · Δ +1 L6`.** Accepted L1/L2/L3/L5/L6/L7/L9/L10. L4 real Google upgrade, L8 final distribution/provenance, L11 exact-head CI/audits and L12 final go/no-go remain open; Decision 2 remains independent. Historical warning/pending acceptance records are retained, superseded by this scoped repair and replacement-artifact qualification. No merge, public release, general power-loss durability or unlimited lifecycle guarantee.

Only completed disposable test profiles and isolated remote signing staging/jobs are removed. Existing owner review windows/tabs, permanent profiles, original source/output and the separate Google baseline/ledger remain unchanged. Master signed app/ZIP/receipts and previously authorized signing access are retained. Latency deferred; Electron diagnostic build pending approval/unstarted. Validate archived hashes and gate/test accounting with `python3 validate.py`.
