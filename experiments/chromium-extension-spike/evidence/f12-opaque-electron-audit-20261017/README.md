# Private/opaque subframes and Electron update instrumentation assessment

October 17, 2026. Harness and source assessment only; existing native binary and
payload from `f12-subframe-trace-20261017` were reused. No native edit/build,
latency measurement, physical input claim, baseline promotion or shipping
Electron change. Both spikes remain in progress.

## Bounded observations

Final `attempt03`: two fresh sessions for each Electron/Chromium × regular/private
combination, seven frame cases each, **56 cases** total. The independent verifier
checks actual frame origins, first inline execution, late property descriptors,
fetch promises, proxy arrivals and actual private cancellation records. Authored
responses exist for allowed and blocked URLs; no upstream network fallback.

| Scope | Result |
| --- | --- |
| Private, scripts enabled, both runtimes | 24/24: first/late uBO constant absent, allowed probe resolves and arrives once, blocked probe rejects and never arrives. This measures private policy/outcomes, **not private uBO scriptlet acceptance**. |
| Private cancellation attribution | 12/12 Chromium plus 6/12 Electron have exact URL-matched private Blanc Blocker cancellation records in this bounded one-request-per-case fixture. Electron's other six srcdoc/data records are refused by the existing scrubber: attribution **gap**, no invented provider context. This URL match is not used for worker update identity. |
| Regular HTTP and sandboxed HTTP | Chromium 4/4: first-inline constant/getter and immediate-fetch suppression pass, including actual opaque `null` origin. Electron 0/4 early; late constant/getter appears. |
| Regular inherited/opaque srcdoc, data, inherited blank | Chromium 0/8 early; late flag absent. Electron 0/8 early; late flag appears only in the two blank cases. These remain scriptlet coverage gaps. |
| Sandbox without allow-scripts | 8/8: authored first-inline and fetch probes never run. Sandbox enforcement only, never a scriptlet/blocking pass. Electron regular late privileged flag appears; Chromium's does not. No inference that the page executed is made from that privileged effect. |

Literal opaque origin `null` remains distinct from absence. Frame handles are
obtained through the owning iframe element; names are not trusted across opaque
navigation. Non-HTTP scheme behavior, CSP inheritance, blob, fenced/nested opaque
frames, recreation and broader scriptlets remain unqualified. This fixture is
not the full parity corpus or its decision-context contract.

`frame-proof.json` has **30 scoped passes / 26 explicit gaps**. The six private
attribution gaps still record their independently observed private-policy
outcomes. A verifier success means these bounded assertions hold, not that all
56 cases satisfy full acceptance.

## Electron assessment

[Assessment and proposed patch boundary](../../electron-update-instrumentation.md).
Electron v44.8.0 pins Chromium 152.0.7977.167, confirmed by DEPS and the runtime.
Source snapshots and original licenses are in `electron-source-audit.tar.gz`;
`source-provenance.json` records exact official URLs, hashes and byte sizes.
The parent checker owns the old registration/version metadata; the request
reaches the Electron proxy/hook without an exported join. The candidate carries
a per-load token in an otherwise-empty existing diagnostic field and exports
it behind an opt-in gate, with a profile-scoped browser-owned metadata record.
It is **not implemented, compiled or validated**. Applied Electron patch-queue
compatibility remains to inspect. A separate Electron diagnostic build requires
separate approval; no such build started. Existing native update joins remain
bounded evidence; independent Electron update identity remains a gap.

## Attempts, checks and cleanup

- `attempt01`, 50.44 s: stopped after four observations when opaque srcdoc frame
  name lookup timed out. The frame had already issued its probes. Excluded.
- `attempt02`, 46.12 s: four Electron sessions completed; native first session
  stopped at blank-frame DOM readiness. Explicit about:blank navigation raced
  the synchronous document.write. Excluded from final totals.
- `attempt03`, 65.06 s: all eight sessions complete after element.contentFrame
  lookup and writing into the default blank document. Full raw observations,
  source hashes, arrivals, refusal faults and final cleanup are retained.
- First unit invocation: nine loopback EPERM failures under the shell sandbox.
  Authorized loopback rerun: **181/181** pass; final verifier-only rerun 9/9.
  Final lint **93 files**, zero errors/warnings. No tests were suppressed.
- Final guarded plan: **zero actions**, 5.97 s check, no compilation. Last measured
  footprint **31 files/74 hunks** is unchanged by these harness/docs-only edits.
- `cleanup.json`: no owned runtime processes; all three ephemeral roots removed,
  including fixture CA private keys and disposable profiles. Existing prototype,
  original tabs, permanent profile and 156 output were not operated on.
- Four lossless archives have per-member/whole-file hashes in `archives.json`.
  `sources.tar.gz` captures current experiment code; the failed attempts retain
  their runner hashes and raw partial results, not an assertion of successful
  reproduction. `checks.tar.gz` includes invocation records, configuration and
  failed/successful test logs. No captured real-page or authenticated data.

## Reproduction

With the existing disposable-session dependencies and the previous verified
uBO payload, from the repository root:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-run.mjs CONFIG_JSON PAYLOAD_DIR NEW_EVIDENCE_DIR
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-verify.mjs NEW_EVIDENCE_DIR
node --test experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-test.mjs
```

The config schema and actual paths used are in `checks.tar.gz/config.json`.
`documentStart: true` is required for the native HTTP assertions. No native
build is part of these commands. Extract `frames.tar.gz` and run the verifier
against `attempt03` for an independent archived-result check.
