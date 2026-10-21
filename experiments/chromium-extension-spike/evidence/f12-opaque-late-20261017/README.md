## Opaque late delivery and duplicate suppression — October 17, 2026

Native-only checkpoint on the unchanged Chromium 157 binary.
Two fresh native regular profiles each create eight document kinds twice: opaque
srcdoc, data, blob, sandboxed blob, nested opaque srcdoc/data/blob, and child-origin
blob. Native first-inline effects and original security origins are checked before
any diagnostic delivery. No private uBO or Electron parity claim is added.

- **8 actual extension repeat-delivery passes:** data and nested-data documents
  receive two deliberate late deliveries through raw `chrome.tabs.executeScript`.
  The real engine's assembled injector executes, its main-world attempt count rises
  by at least two, and its body count remains one. The upstream isolated injector
  sentinel is deliberately reset; the shared main-world once marker is not reset.
- **8 opaque-srcdoc delivery gaps:** direct and nested sandboxed srcdoc callbacks
  explicitly refuse access at origin `null`, even with `matchAboutBlank: true`.
  The earlier wrapper hid this error; it is now archived. Permissions are unchanged.
- **16 blob delivery gaps:** `webNavigation.getAllFrames` omits the blob leaf.
  A separate all-frames diagnostic message probe supplies browser-owned sender
  metadata for reachable parents, but no matching blob document. No frame id or
  parent origin is substituted. The pinned `IsValidUrl` source excludes blob from
  webNavigation's accepted schemes; the all-frames omission's deeper cause remains
  unproved. An omitted frame is not proof that every possible extension path fails.
- **32 direct mechanism passes:** the same real engine main-world payload is also
  delivered twice by explicit Playwright evaluation in each actual document realm.
  Attempts rise by exactly two, bodies remain one, origins and early effects stay
  unchanged. This is diagnostic duplicate-suppression evidence, **not extension
  delivery acceptance**. The fixture supplies the selection origin for this direct
  test; unresolved extension frame ids use a diagnostic-only `-1`. New document
  cycles prove marker state is per realm, not retained from the previous document.

Seven negative verifier tests reject missing main-world arrival despite successful
API callbacks, repeated bodies, missing direct attempts, replaced opaque origins,
stale/wrong document identity, silently discarded blob candidates and changed
payload bytes. Both final runs independently verify. Three failed harness attempts
remain excluded: Playwright's stale empty opaque URL twice, then assuming blob
appeared in webNavigation. The final harness reads `location.href` in the actual
realm and records absent extension identity as a gap.

**209 focused tests and 109-file lint pass.** The first sandboxed unit invocation
failed on loopback `listen EPERM`; the permitted run passed without code changes.
No native or payload code changed. Guarded plan: **zero actions, 3.77 seconds**;
no compile launched. App/framework hashes match the prior checkpoint. The last
measured upstream footprint remains 31 files / 74 hunks (not remeasured here).
Both final runs took 13.33 and 13.07 seconds; these are harness wall times, not
latency measurements. All five attempted disposable profiles were removed.

Claude Code plan: Spike B remains in progress. Production opaque-srcdoc/blob late
reachability, mixed/unknown/top-level/deeper/fenced contexts, ancestor/CSP rules,
arbitrary scriptlets, lifecycle/filter generations and privilege containment remain
open. Previous network, private and gate-safety matrices were not rerun for this
harness-only change. Latency stays deferred. Electron diagnostic proposal §8 is
still unchecked; no checkout/build started. Task 0 and plan items 3–6 are unchanged.

## Reproduction and archive

`archives.json` records hashes for each archive and member. Runtime contains all
five attempts, with attempts 01–03 excluded and 04–05 independently verified.
The source archive is the final harness; earlier attempted source hashes are
historical. Build/check logs preserve the sandbox failure and successful rerun.
The unchanged payload delta, full inventory, pin and licence are included.
No private keys or user profiles are retained.

After extracting `runtime.tar.gz`:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-late-verify.mjs EXTRACTED/run04
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-late-verify.mjs EXTRACTED/run05
```

Each verifier reads the actual hashed main-world and assembled payload files.
Runtime reproduction uses `opaque-late-run.mjs CONFIG OBSERVED_PAYLOAD NEW_EVIDENCE`,
with the archived config and unchanged payload. It uses fresh disposable profiles,
fixture TLS, offline proxy and origin-preserving host rules. Direct evaluation
is intentionally diagnostic and must never be reported as production injection.
