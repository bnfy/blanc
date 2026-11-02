# Chromium 157.0.8103.15 update — October 22–23, 2026

The requested update compiles and the replacement Developer ID–signed, notarized preview passes the bounded security, recovery and isolation checks. This is a candidate checkpoint, not public-release approval or complete security signoff.

## Source and build

Target: `1aa07b638799e59656559ae6c6649d4b197f555e`, version `157.0.8103.15`. Six overlapping Blanc patch files merged cleanly; inventory remains **62 upstream files / 156 zero-context hunks**. Nine changed dependency pins were verified after compilation. All five previously identified upstream memory-safety commits are included and eight affected files match upstream. The earlier missing-fix review describes the superseded .6 candidate; it is not the new candidate's status. No complete CVE or exploitability audit is claimed.

The owner approved one isolated large rebuild after the 43,586-action dry run. The original .6 source/output remains unchanged (HEAD and five recorded file fingerprints). Compiler executable/revision, SDK and GN arguments are unchanged. The copied Siso cache was relocated through export/import while retaining digests, timestamps and command hashes.

The default-worker invocation completed 18,003 actions with zero failures in 28m28.56s, then was gracefully interrupted under heavy memory pressure. Cached work resumed with eight local workers: **Build Succeeded**, 32,396 steps in 2h20m44.55s. Aggregate: 50,399 completed actions / 2h49m13.11s. These include generator/noexec work; they are neither C++ compilation counts nor a latency benchmark. Final guarded dry run: **zero actions**. Twenty-three final focused tests and scoped lint pass. The stale fixed-68px test now checks the existing dynamic header reservation; no product layout changed.

## Signed artifact

Archive SHA256: `d9924b7e5398b95f21e1107cb146eaf0f1e53387e9c850fc720b33e4adbe50cb`. Apple submission `17bf3b2f-3528-4fc3-b17e-2db0a4833e43`: **Accepted**, stapled and ticket-validated. Strict deep signature and Gatekeeper pass. Identity: Anthony Loria / XYGUCY4498. Seventeen Mach-O files are arm64, ten bundle identities are inspected, and development/debug/library-validation exceptions are absent. Only the .15 framework is bundled. Code and selected asset hashes match before/after stapling and after tests.

## Bounded runtime acceptance

All **76 recorded checks** pass on the replacement signed code:

- Regular security17 and private security16: Trusted Types, allowed packaged markup/icons, bridge/iframe/internal-file fetch boundaries, private diagnostic exclusion and regular positive control. Private fixture URL rows in History: zero.
- Encrypted persistence/loading close/crash6; real filesystem write-refusal/retry/crash4.
- Active/inactive Split ratios/focus/restart/Recently Closed5; private Split/group/pin/Spaces exclusion/disposal/restart10.
- Nonregular FIFO refusal, preserved regular encrypted record and clean shutdown6.
- Side-by-side independent ownership, reciprocal restart, actual restored documents, app removal and both processes exiting12. Installed Shipping Blanc code hashes remain unchanged. Only disposable app copies/profiles were used.

These do not claim fresh owner physical-input/VoiceOver acceptance, power-loss guarantees, every provider-failure case, full feature parity, or completion of all release gates. The preceding owner L2 record remains tied to its original artifact; these are new automated regression results.

## Retained failures and separation

The first signing transfer timed out on default and IPv4 routes; it succeeded after the owner woke the signing Mac. The first 1Password attempt timed out; notarization succeeded after the owner unlocked it. Initial read-only SQLite URI probes could not open the disposable DB; a closed no-WAL byte copy was queried instead, and original bytes remained unchanged. No runtime scenario failed in the final suites. Existing SSH access remains retained per owner preference.

Google baseline remains separate: original source/output fingerprints unchanged, Google9225 and dev9248 endpoints still reachable with empty target lists; no relaunch or profile changes. Google upgrade ledger/evidence is excluded from this publication. Latency deferred; Electron diagnostic build pending and unstarted. Source review/cost acceptance, full security review, Google upgrade, remaining release acceptance and final artifact approval remain open.

Raw logs are compressed losslessly; large dry-run/cache exports remain local. `SHA256.json` verifies the published evidence members.
