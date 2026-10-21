# CodeQL remediation and native regression — October 17, 2026

Seven findings at aa26d71a are addressed without suppressions or exclusions.
[Remediation review](review.md) describes the query regex split, atomic file
publication, script literal encoding, and fixture-CA trust isolation. GitHub's
new-head scan is pending; local tests do not establish that the alerts cleared.

## Validation

- 84 focused tests pass; the seven local TLS/network tests also pass on rerun.
  Lint covers 44 files with zero errors or warnings.
- 12,830 recorded engine decisions compared in the VM: zero differences.
  All 5,123 candidate plus four control response bodies, and all 37 path fixture
  bodies, remain byte-identical to the previous generator output.
- Full native corpus: two fresh regular and two fresh private runs each pass
  5,123 candidates (2,503 blocked / 2,620 allowed), with zero decision/context
  differences. Full response hashes, DOM outcomes and authored children pass.
- No-referrer: all four runs pass 24 candidates (9 blocked / 15 allowed).
- Redirect/worker: eight fresh Electron/Chromium runs preserve GET redirect and
  dedicated-worker parity. Shared/service-worker behavior matches but unresolved
  top-frame/role identity remains a coverage gap, not admitted parity.
- Missing and tampered assets and terminated utility all fail closed; prohibited
  probe requests never reach the fixture server.

## Incremental build

One planned action, six executed steps, 29.95 s Siso / 34.983 s wrapper. Only the
compiled expected bundle hash changed; decoded filter/resource data and native
hook source are unchanged. The final guarded check reports zero actions. No GN,
args, toolchain, environment-record or cold-output change; no large-build override.
Footprint: 25 upstream files / 62 hunks; all 151 Git dependencies clean at pins.

Engine SHA256: `9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d`.
Framework SHA256: `98df017edeed1980ecd9fa428569eab91ea7b3bcde196080d2c1247bc93ca44d`.
[Fingerprints](fingerprints.json) include unchanged args and prepared source checks.

## Evidence and limits

Six lossless archives retain 79 original files (3,344,689 compressed bytes).
[inventory.json](inventory.json) records archive and individual-file SHA256s;
all were verified after packaging. Archives contain commands, logs, bundle and
licensing metadata, observations, comparisons and fail-closed results. No private
keys are archived. Disposable profile/key cleanup is recorded by the harnesses.
The 156 prototype and permanent profile were not changed.

No latency rerun is claimed for this bundle/framework. The previous latency
measurement belongs to aa26d71a; quiet-machine qualification remains open.
This remains synthetic fixture parity for the measured subset, not full F12
acceptance. Shared/service-worker identity, teardown, controlled fetch/cache,
subframes/opaque origins, broader resource/rule contexts, keepalive/speculation,
WS/WT interception, cosmetics/scriptlets, startup timeout/recovery and the private
real-page sample remain open. No baseline promotion; Task 0 upgrade gate unchanged.
