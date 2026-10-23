# L6 startup restoration repair and signed acceptance — October 23, 2026

**L6 is accepted again for the replacement candidate. `[■■■■■■■■□□□□] 8/12 (66.7%) · Δ +1 L6`.** The repair removes the pre-main-loop restoration entry observed in the retained failure. A deterministic event-order negative control rejects the older candidate and passes the replacement. All **125 frozen signed-candidate checkpoints** pass, including 92 recovery/startup checkpoints. The prior owner-approved recovery UI maps through unchanged source and assets. L8 remains open for distribution acceptance of these new bytes; no release or merge is approved.

## Finding and correction

The retained `7065f9c0` nonregular-record sequence rejected a FIFO and quit cleanly, then stalled after its original regular encrypted record was restored. Its [original report](original-failure/pipe-report.json) and [sample](original-failure/second-start-sample.txt.gz) show `StartupBrowserCreator` entering `SessionRestoreImpl::Restore`, `RunLoop::Run` and AppKit's first application loop from `PreMainMessageLoopRunImpl`. Idle workers alone do not establish a missing encryption callback. Six exact old signed repetitions (36 checkpoints), twelve signed diagnostic repetitions (72 checkpoints), and earlier online/offline controls passed; those reruns alone do not explain or close the original failure. The original test also overlapped stapling; that overlap is recorded, not established as its cause.

For sealed Blanc macOS **process startup with synchronous restoration**, the [production correction](production-review.diff) posts a non-nestable main-thread task. Startup unwinds into the normal browser main loop before invoking the existing native restoration/fallback helper. The task owns copies of command-line, startup-tab and first-run inputs, holds process/profile keep-alives and a weak profile, and rechecks shutdown and browser-creation permission. It never captures the original stack-owned creator. Shared-group/version notices still run after browser creation. Other platforms, ordinary Chromium, new/private profiles and explicit non-restore settings retain their existing paths.

The native session/encryption read, recovery UI, Quit contract, durability/error handling and fallback semantics are retained. No empty session is invented at a deadline and no competing retry read is added. The exact lost-callback mechanism in the original one-off stall was not directly observed; the observed early-loop entry is eliminated and the bounded regression contract is verified.

## Deterministic negative control

Existing Chromium startup tracing records **functional event order only**, without a latency comparison. The old `7065f9c0` candidate begins the restoration loop **before** `MainMessageLoopRun`; the repaired signed control and final stapled candidate begin it **after** that marker, on the same process/thread. [Old/new verification](diagnosis/ordering-verification.json), [final verification](ordering/final-verification.json), executable harness and compressed raw traces are retained. This is independent of the passing-checkpoint total. No benchmark or latency qualification was run.

## Exact candidate and frozen qualification

- Source `6b9a05a00f321bfbde617c181103d5a455ff45f3`; Chromium **157.0.8103.15**, arm64, macOS 27.2.
- Stapled ZIP SHA-256 **`a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca`**.
- Apple Accepted **`47e56224-454f-4765-9bd6-f7868a245f32`**; Developer ID Application: Anthony Loria, team XYGUCY4498. Staple/validation, strict deep signature and Gatekeeper pass. [Receipt](signed-qualification/notary-result.json), [final audit](signed-qualification/final-candidate-audit.json).
- Notarization and stapling finished **before** qualification. All **458 regular files and five symlinks** were frozen and compared after every suite, and again after the final event-order test. The notice fixture uses an unmodified clone; [all its files and symlinks also match the final master after testing](signed-qualification/notice-clone-frozen.json). All 17 executable, seven selected UI/blocker and 24 compliance hashes match the signed baseline. [Frozen record](signed-qualification/frozen-complete.json), [post-ordering verification](signed-qualification/post-ordering-frozen.json).
- [Local inventory/SBOM/provenance/checksums](artifact/) identify these bytes and source. This new packet has no new Sigstore authentication or hosted-download claim; those are L8 work. The prior downloaded artifact's acceptance is not substituted for this candidate.

| Final signed scope | Passing checkpoints |
| --- | ---: |
| Ordinary launch, two clean restarts without restore flag, explicit New Tab/startup URL preferences, private-only exclusion and regular-session continuation | 7 |
| Encrypted-only clean restart/loading-close/post-ack crash | 6 |
| Real filesystem write refusal, retry and crash | 4 |
| Split View focus/ratio and Recently Closed | 5 |
| Private lifecycle and restart exclusion | 10 |
| Grouped multiwindow/Spaces recovery | 6 |
| Actual Island close, pending unload, Cancel/Leave, last-tab and no warning | 6 |
| Nonregular encrypted record refusal and regular restart | 6 |
| Owner/profile teardown | 6 |
| Six complete targeted FIFO-refusal → clean Quit → regular encrypted restart cycles | 36 |
| Core functionality | 17 |
| Version/security notice and withdrawal controls | 16 |
| **Total** | **125** |

[Exact accounting and report paths](signed-qualification/local-runtime-summary.json) and executable fixtures are archived. The 49 pre-existing recovery checks retain their explicit crash-restore policy/restore-flag scopes; the seven normal-startup controls and targeted sequence exercise ordinary launch without a forced-restore flag. Real Preview keychain namespace is used. FIFO rejection is not proof of an unavailable real encryption provider. No arbitrary power-loss, permanent-profile migration or unlimited lifecycle guarantee is claimed.

The [source map](signed-qualification/unchanged-source-map.json) verifies all seven UI/blocker assets unchanged from owner-confirmed `7065f9c0`, plus exact native recovery UI hash `a1f62eaaadc84118376b265b5e41fa4d0279fbd36aa93c8f8e044047410c4dbe`. The existing explicit decision **“Accept mapped UI evidence; close L6”** applies to that unchanged UI. No new physical-input, spoken VoiceOver or waiting-screen observation is claimed.

## Build and retained setup incidents

Two temporary content-free diagnostic builds (30.73/28.16 seconds, six actions each) were followed by byte-for-byte removal of both instrumented source changes and a **32.89-second/eight-action normal incremental repair build**. The final native guard is zero; fresh inventory **72 upstream files/178 hunks**, under the owner's standing authorization. [Removal proof](diagnosis/diagnostic-removal.json), [build/guard and seven capture/eleven counter tests](build-and-source/) are retained. No hooks, clean rebuild, toolchain/GN change, latency benchmark or Electron build.

The initial ad-hoc diagnostic blocked in `KeychainPassword::GetPassword`/`SecItemCopyMatching`; it is a test identity/authentication incident, not the original failure's cause. During UI inspection after that diagnostic process had stopped, binding its application path unintentionally opened the bare prototype with the default Chromium profile. It displayed New Tab and was quit normally; the owner was informed. Default Chromium profile byte preservation is not claimed for that incident. Subsequent diagnostics used a matching Developer ID and explicit disposable profiles. Shipping Blanc, the retained owner Preview and the separate Google baseline were not relaunched or altered.

Two 1Password CLI attempts timed out before Apple submission. After the owner unlocked 1Password, the existing CLI authorization prompt was approved; notarization succeeded. The first result aggregator assumed every fixture used per-check `pass`; three existing assertion fixtures use `value` plus final `pass=true`. Its schema was corrected and all original reports validated without repeating runtime tests. A Python hash helper was similarly corrected for system Python compatibility. [Setup accounting](signed-qualification/initial-summary-schema-error.json). None is a product failure or an extra passing checkpoint.

## Acceptance and remaining gates

Accepted L1/L2/L3/L5/**L6**/L7/L9/L10: **8/12**. L4 authentic Google upgrade, L8 replacement-artifact distribution/provenance, L11 exact-head CI/audits and L12 final readiness/go/no-go remain open; Decision 2 remains independent. The Google ledger/baseline remains separate and uncommitted. Original source/output, permanent Shipping/owner Preview tabs and the Google instance remain outside the test fixtures. Latency is deferred; Electron diagnostic build is pending approval/unstarted. [Cleanup](signed-qualification/cleanup-fixtures.json) removes 42 completed owned fixture directories and the notice clone after evidence capture; signed masters/archives, raw logs and the original failure fixture remain. Authorized signing access is retained. Run `python3 validate.py` to verify the archived hashes and result accounting.
