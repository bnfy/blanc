
# Data/blob and nested-opaque document coverage — October 17, 2026

This is bounded native document coverage, not full Spike A/B acceptance.
The native gate now accepts data/blob along with about documents only when the
exact browser-committed URL matches and its browser-owned tuple/precursor is
HTTP(S). Every opaque parent must carry that same tuple; selection stops at the
first non-opaque parent and requires an exact match there. Mismatches, unknown
precursors, no parent, unsupported ancestors and chains beyond 64 hops receive
no added payload. No ancestor is skipped to borrow the visible top tab. This is
rule selection only, never inherited origin privileges or substituted network
context. Document/profile/generation binding and once-only payload remain.

Four fresh native regular/private sessions cover nine cases each. **14 regular
early checks** pass over data, blob, sandboxed blob, nested opaque srcdoc/data/blob
and child-origin blob. Host-specific first-inline markers prove top-vs-child rule
selection. **16 private-policy checks** have actual Blanc cancellation records
with the observed initiator (including opaque `null`); private uBO stays disabled.
Six of the 36 cases remain gaps: four cross-owner blob navigations are rejected
by Chromium before an inspectable document, and two regular mismatched-chain
data documents receive no early payload. Browser rejection is not a native
scriptlet/selection pass. The private mismatched chain still has its own network
cancellation proof and is not counted as private uBO coverage.

Two more fresh regular sessions exercise explicit exceptions and the baseline
again: seven exception outcomes and seven baseline early outcomes pass; four
mismatch/navigation gaps remain. The latter session is labelled `restored` in
raw data but is a **fresh-session baseline**, not an in-place filter-generation
restoration claim. The 56-case Electron/native matrix is also rerun on this
binary; its proof and exact scoped counts are in this checkpoint's evidence.
Inherited deduplication and document-gate safety regressions are rerun separately.
Full 5,123-URL network parity and full previous ancestor matrices remain historical.

One guarded incremental build: **36.01 s wrapper / 32.36 s Siso, eight steps**
after a two-action plan. Final guard zero. Fresh measured footprint **31 upstream
files / 74 hunks**. **202 focused tests / 106-file lint pass**. No cold output,
GN-args/toolchain changes, latency run or Electron diagnostic build. §8 of that
separate proposal remains unchecked. Plan items 3–6 and Task0 remain unchanged.

Two failed harness attempts are retained/excluded: the first assumed a rejected
cross-owner blob had a visible document; the second evaluated that absent
execution context and stalled. Only its verified disposable browser was stopped
with SIGTERM so the runner saved evidence and removed its profile. The final
probe uses actual browser console rejection without evaluating a missing realm.
All final and failed-run cleanup reports, raw observations, source snapshots,
binary hashes, invocation logs and independent verification are archived.

Remaining: cross-owner/unknown-precursor and mismatched chains, top-level data/blob,
deeper/fenced contexts, opaque-specific ancestor rules and CSP permutations,
opaque extension late-path reachability, arbitrary scriptlets/lifecycle/recovery,
component containment, independent Electron update identity and Electron early
timing. Qualified latency remains explicitly deferred, including gate overhead.

Final regression evidence: the eight-session56case matrix verifies **44 scoped
passes /12 Electron early gaps** (native12early,24private attribution and8sandbox
no-script enforcement). Four inherited repeat-delivery proofs and seven gate
safety checks pass; two opaque extension late-delivery attempts remain unproved.
These scoped categories are not summed into full provider acceptance.

## Archive and reproduction

`archives.json` provides whole-file and member hashes for runtime, final source,
build/check logs and the unchanged observed payload delta/pin/license. Runtime
includes both failed attempts and all final observations; the failed attempts'
source hashes are historical, while the source archive is the final version.
No fixture private keys, user profiles or real-page traffic are committed.
`archive-verification.json` records independently extracted proof verification.

After extracting runtime.tar.gz to a fresh directory:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/nonhttp-context-verify.mjs EXTRACTED/contexts03
node experiments/chromium-extension-spike/fixtures/replay/synthetic/nonhttp-context-verify.mjs EXTRACTED/exceptions --exceptions
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-verify.mjs EXTRACTED/frames --inherited --opaque-about --data
node experiments/chromium-extension-spike/fixtures/replay/synthetic/scriptlet-dedup-verify.mjs EXTRACTED/dedup/report.json
```

Runtime reproduction uses the recorded binary, config and unchanged observed
payload from this archive. Nine-case context coverage is native-only; the
separate seven-case frame matrix supplies this checkpoint's Electron comparison.
No broad Electron blob observer admission was added. Existing156/permanent
profiles, installed Electron and the pending diagnostic-build proposal stay
untouched. Qualified latency remains deferred.
