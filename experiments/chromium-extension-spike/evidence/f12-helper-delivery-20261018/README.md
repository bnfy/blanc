# Procedural helper delivery checkpoint — October 18, 2026

The generated pinned uBO payload routes four additional messaging injection sites
through the existing completion barrier: procedural contentscript-extra,
cosmetic logger, noscript spoof, and the element-picker procedural helper.
The wrapper now returns the real completion promise/results, retaining uBO's
empty-array result for refusal. Readiness and capacity refusals never dispatch.
No await separates readiness, acquisition, and browser API dispatch.

## Verified scope

- Two real procedural-helper schedules (drain and timeout/retry) pass. The
  diagnostic delays acknowledgement after the real API returns a nonempty
  result, not renderer execution. The real has-text fixture is hidden after
  release, and reload stays held while the completion lease remains outstanding.
- All four existing native/upstream completion schedules pass with this payload.
- 272 focused regression tests pass. The first sandbox run had ten loopback
  EPERM failures; the permitted run passed all tests. Both logs are retained.
- 125 module lint checks and two wrapper checks pass. Initial lint setup failed
  due to absent local node_modules, then a duplicate configured global; corrected
  configuration and results are retained. An exploratory npx lint attempt was
  interrupted without producing lint results; the installed tool was used.
- Guard check reports zero native actions (5.06 seconds). No native compile,
  GN, toolchain or build-argument changes. Both binary hashes match 249b086c.
- Each runtime report confirms its disposable tree was removed. All fixture
  certificate/private-key trees were under those deleted trees.

## Remaining gaps

Runtime pause coverage for cosmetic logger, noscript and picker is still not run.
Their generated call sites and shared promise behavior are covered by the source
anchors and tests, not claimed as native runtime acceptance. Dashboard/logger
survey API sites, CSS insertion and other injection channels remain outside this
checkpoint. Exact target-document identity across navigation, async effects,
changed-rule semantics, BFCache/prerender/crash/background recreation, and full
containment remain open. No full network parity, Electron, private-window, or CSP
matrix rerun is claimed here. Latency stays deferred; the separate Electron
instrumentation build remains unapproved and unstarted. Task 0 stays open.

`record.tar.gz` retains both complete runtime roots, fixtures, observations,
source snapshots, check logs and invocation records, plus ordinary/diagnostic
payload deltas from the pinned upstream files and the GPL licence. `inventory.json`
contains every archive member digest, archive digest and full payload inventories.
All members were read back and hash-verified. The inherited payload modifications
retain GPL-3.0-or-later; this is a bounded experiment, not production acceptance.
