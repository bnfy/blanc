# Result

Work in progress from `b4bd80c5`; local only, no push.
Current candidate: `macos-9320a60d81bec2f7`; config `s4c-tabs-4-runtime-config.json`.
S4c native gate and all eight requested scenarios pass on this candidate.

| Queue item | State |
| --- | --- |
| 1 S4c tabs, Other devices, Send | Done for requested cases; native icon upload blocked by frozen bridge |
| 2 S4d shared Spaces | Pending |
| 3 Final full gate and scenarios | Pending |
| 4 Vertical/Island leftovers | Pending |
| 5 Beta identity | Pending |
| 6 Sparkle updater | Pending |
| 7 Review 0041 | Pending |

| Baseline evidence | Pass | Fail | Undefined |
| --- | ---: | ---: | ---: |
| S4c focused native gate | 3 | 0 | 0 |
| S4c requested sync scenarios | 8 | 0 | 0 |
| S4b clean gate, completed before this work | 20 | 0 | 0 |
| S4b sync.feature | 9 | 0 | 9 |
| S4b internal-pages.feature | 10 | 0 | 0 |
| S4b island-and-commands.feature | 72 | 0 | 1 |
| S4b vertical-tabs.feature | 9 | 4 | 7 |

Lost passes: not yet measured on a new candidate.
Owner input: none currently. Final-build and signed updater qualification remain unverified.

## Initial handoff

Waited for PID 91996 (the pre-existing `desktop-sync.mjs` run) to exit without
interference. Its `../evidence/foundation/s4b-clean-gate/result.json` records all
20 checks passing. Started a retained `caffeinate -d -i -t 28800` assertion.
The frozen bundle already exposes `phone.setTabs`, remote-device and Send calls;
no bundle, shim or hash change is required for S4c. Shipping sources, acceptance
specifications and desktop tests remain read-only.

## S4c implementation in progress

The first native tabs build (`macos-beb7c4e228eb1682`,
`s4c-tabs-1-runtime-config.json`) passed the focused local gate:
`s4c-tabs-1-gate/result.json`. Three checks passed: account setup, pairing,
and the combined tabs/Send check (default off, bidirectional tabs, private
exclusion, Send in both directions, and sharing-off retraction). This is not
final-candidate credit. An actual opener-policy tab and restart assertion
have since been added to the gate and still need a run.

`s4c-tools-2.tap` passes 244 tests and `s4c-patches-2.txt` passes reconstruction
(155 outputs, 552 canonical files). These precede the subsequent policy
persistence work and must be refreshed before commit. The first tool run's
three failures were stale asset hashes, the Settings allowlist needing its new
boolean-only method, and a new test incorrectly expecting a retracted flag
rather than shipping's empty presence record. No shipping assertion changed.

The eight-case scenario run `s4c-tabs-3-cases` finished 7 pass, 1 fail (:20). The :20 attempt
found an adapter setup error: a sharing click was attempted before the control
was ready and its false return ignored; the account's share switch stayed off.
The adapter now waits for an accepted click and checks sharing is on.

Native exports aggregate default-profile windows, defer during restoration or
Space switches, exclude private and inherited-policy tabs, and use the frozen
`phone.setTabs` entry. Read/rename/Send endpoints are allowlisted. Native Send
resolves the tab rather than trusting a renderer-supplied URL. Work in progress
preserves the sticky policy mark across session, Recently closed and Spaces,
and adds the Send to Device context menu. Generated Island renderers, the
shipping trees, frozen bundle/shims/hash and `live/` remain unchanged.

The fourth guarded build completed 34 incremental steps in 37.32 seconds.
`s4c-tools-3.tap`: 244 pass; `s4c-patches-3.txt`: 155 outputs / 552 canonical
files reconstruct; `s4c-page-shim.tap`: 3 pass. Expanded gate attempt 4 hit
a lazy CDP page connection error before the opener fixture; the harness now
connects before bringing that page forward. No product failure inferred.

S4c limitation from the same frozen bridge: incoming icon records can render,
but `__listen` installs an empty tabicons snapshot provider and the nativeImage
shim cannot encode native icons. Native favicon upload needs an approved bridge
extension; the receiving fixture sends shipping's actual PNG via encrypted
local-Worker records. This is not evidence of native favicon upload.

### S4c result

`s4c-tabs-4b-gate/result.json`: 3/3 checks pass on
`macos-9320a60d81bec2f7`, including actual opener-policy exclusion and policy
persistence across native session restore. Tabs and Send converge both ways
with the independent peer. Consent defaults off and turning sharing off
retracts the Mac inventory. This focused run is not the full gate.

`s4c-tabs-4-cases/baseline.json`: all eight requested scenarios pass
(:7, :13, :20, :88, :104, :114, :120, :129), including received PNG decoding,
rename, reflow, and remote-row search. The previous :20 failure was the
adapter's ignored not-ready control; it now awaits the real control and checks
its state. No shipping step or assertion was weakened.

S4c precommit checks: 244/244 tool tests and patch reconstruction (155 upstream
outputs / 552 canonical files) pass; `git diff --check` passes.
