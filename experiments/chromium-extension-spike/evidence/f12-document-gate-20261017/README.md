# Document-start gate and native update-loader identity — October 17, 2026

This checkpoint implements two opt-in Chromium 157 mechanisms. It does not close
full Spike A/B acceptance, change the verified baseline, or qualify latency.

## Measured results

- **12/12 Chromium loads** pass first-inline constant/getter and immediate-fetch
  prevention: normal and CSP pages, first visit/reload/fresh navigation, twice.
  The matching **12 Electron loads still fail** both early checks. No injection
  observer, fixture delay or preinstalled answer was used. The independent timing
  report deliberately says overall document-start parity is false.
- Seven safety checks pass: regular/private separation, scriptlet exception after
  filter reload, replacement generation, cross-host navigation without stale
  payload reuse, popup/stale-generation rejection, and missing-payload timeout.
  Timeout stops the first inline script; the original document was fetched, but
  its authored immediate fetch never reached the proxy.
- Four fresh cosmetic sessions / eight normal+CSP pages retain static CSS,
  `has-text` insertion/text/attribute/move and late fetch protection. Early timing
  differs intentionally (Chromium passes, Electron fails). The verifier's explicit
  `--separate-timing` mode reports that difference; default strict parity still
  rejects it. It never removes other DOM or transport differences.
- **12 native update-loader joins** pass: eight concurrent unchanged-byte checks
  across two registrations sharing one URL, plus four changed-byte checks. Both
  regular and private profiles are covered. Each browser-generated token joins
  one actual hook row to the checked registration/version and full scope,
  independently validated against lifecycle records. Storage key is recorded
  directly at the native call site; it lacks an independent Electron comparison.
  Checked version means
  the old version being compared, not a fabricated new execution realm.
- Eight Electron collision identities remain gaps. The existing paired context
  validator remains strict; native enrichment alone is not cross-runtime proof.
  Changed-byte behavior passes in eight fresh sessions, including 16 controlled
  fetch contexts and eight HTTP-failed initial loader identities. Cache-only
  ownership and broader lifecycle attribution remain open.
- Ten prior uBO readiness/reload/private/background-loss checks and the missing
  startup-handshake probe pass again with the new flag enabled.
- **162 tests pass; 84-file lint clean; final build guard: zero actions.**
  Current inventory: **31 upstream files / 74 hunks**, within 40/120.

## Mechanisms and bounds

`--blanc-ubo-document-start` enables a synchronous document-bound Mojo request at
Chrome's `RunScriptsAtDocumentStart`. The browser checks exact committed URL,
main-frame identity, profile, live background document and filter generation.
Only the actual registered uBO background can obtain pending jobs and return code
through the authenticated control endpoint. The active pinned scriptlet engine
produces the main-world payload, honoring hostname rules and exemptions. Main
frame late injection retains isolated-world code only; subframes retain upstream
behavior and **do not gain this early guarantee**.

A three-second timeout, 64-job ceiling, one-MiB reply ceiling and weak document
references bound the prototype. Reload begin cancels pending jobs. Failure stops
page scripts. The background polls at 20 ms; this is a correctness prototype, not
a production scheduler or a latency-qualified design. No CSP policy is loosened;
the browser executes the authorized payload through its privileged main-world API.
Private uBO stays disabled and private Blanc Blocker remains independent.

`--blanc-worker-update-log` wraps the factory at the actual update checker call
site, carrying its registration/version/scope/storage-key values. Each outgoing
check receives a unique token before it reaches the interception factory. If an
upstream DevTools ID already exists, instrumentation leaves it alone and the proof
stays missing. No public service-worker header remains changed; no Chrome
extension dependency is added to content. This flag logs disposable fixture
metadata only. The unmodified Electron runtime supplies no equivalent identity.

## Build and failed attempts

All invocations are retained in `invocations.jsonl` and `build-and-checks.tar.gz`.
No output was cleaned/recreated and no args/toolchain changed.

| Attempt | Wall seconds (guard included) | Result |
| --- | ---: | --- |
| build01 | 55.62 | Stopped deliberately after 33 completed actions when a 430-action dry run expanded to 2,789. Initial public-header approach abandoned. |
| build02 | 15.65 | Missing `BrowserContext` include and Chromium inline-definition style errors; no successful build claim. |
| build03 | 13.26 | Pinned Blink API spelling `FromUtf8` corrected. |
| build04 | 43.98 | Success, 10 executed/reported steps, final check zero actions. |

The narrowed factory wrapper avoids the widely included header. Restoring its
pristine bytes initially left a new timestamp, which Siso still treated as dirty.
After verifying both restored files byte-for-byte against pristine HEAD, their
exact recorded Git-index timestamps were restored. The hashes and metadata are
in `pristine-metadata-restoration.json`; no object timestamp was changed. The
inspected plan dropped to seven actions. The aborted and failed work is routine
repair overhead, **not a new cold benchmark**. Total guarded build invocation
wall time: 128.51 s. Owner attention and agent time were not measured.

Safety attempt 01 timed out during background initialization: the new static
import ran scriptlet dependencies before uBO platform setup. Lazy import after
readiness fixes it; attempt 02 passes, attempt 03 adds the cross-host test and
passes. Both payload variants and all runtime reports are archived. Source
snapshot is the final checkpoint; earlier native failures retain logs and the
three attempted checker files, not a complete historical source tree.

## Evidence and verification

Seven lossless archives and per-member SHA-256 hashes are listed in
`archives.json`. Build/check logs, proof summaries, generated payload changes,
final source snapshot, raw lifecycle/hook/DOM/arrival records, failed attempts and
cleanup reports are retained. Generated uBO integration retains GPL-3.0-or-later
terms; unchanged pinned upstream is identified by `ublock/pinned.json`. All test
profiles and fixture CA private keys were removed. Only authored fixtures and
public source/metadata are archived.

After extracting the archives into one directory `E`, run from this branch:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/document-start-verify.mjs E/timing E/safety03
node experiments/chromium-extension-spike/fixtures/replay/synthetic/update-loader-verify.mjs E/collision 8
node experiments/chromium-extension-spike/fixtures/replay/synthetic/update-loader-verify.mjs E/changed 4
node experiments/chromium-extension-spike/fixtures/replay/synthetic/service-update-collision-verify.mjs E/collision
node experiments/chromium-extension-spike/fixtures/replay/synthetic/service-lifecycle-verify.mjs E/changed
node experiments/chromium-extension-spike/fixtures/replay/synthetic/ubo-cosmetic-verify.mjs E/cosmetics --separate-timing
node experiments/chromium-extension-spike/ubo-readiness-verify.mjs E/readiness01.json E/unready01.json
```

Remaining: Electron early scriptlet correction in a separate shipping-change
review; independent Electron update identity; subframes/opaque and broader
scriptlet/lifecycle coverage; component privilege containment; recovery UI;
private real-page sample and remaining request paths. Latency stays explicitly
deferred, including the new synchronous gate's overhead. Items 3–6 remain
unstarted, Task 0 upgrade gate stays open, and 156/permanent profiles stay intact.
