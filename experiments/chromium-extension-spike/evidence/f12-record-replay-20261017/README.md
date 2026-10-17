# Controlled recorder and replay evidence — October 17, 2026

Historical checkpoint at `833130c8`. Source-match statements below refer to that
checkpoint. Later review changes and their controlled regression are recorded in
[the public-feasibility evidence](../f12-public-feasibility-20261017/README.md).

This is authored fixture traffic, not the >=2,000 blocked / >=2,000 allowed
real-page acceptance corpus. No public pages were acquired and no Chromium
builds, source, output or profile changes occurred. Task 0 promotion stays open.

| Attempt | Result | Observation |
| --- | --- | --- |
| run-01 | Failed | Invalid `data:,` favicon was ignored by shipping Blanc. Its browser-process `/favicon.ico` fetch became a seventh provider call without frame or initiator. No bundle or oracle was produced. |
| run-03 | Passed | Cleanup/error-handling refactor; complete acquisition plus four offline processes. |
| run-04 | Passed | Stricter missing-field validation; complete acquisition plus four offline processes. Final seven implementation hashes match this run. |
| run-02 | Passed | Authored upstream now provides a valid inline SVG favicon. One acquisition plus four fresh offline browser processes; six decisions each, four allow / two cancel. Both regular and private pairs stable. |

No request was dropped to repair run-01. Source inspection of installed behavior
(`favicon-policy.js` / `favicon-sanitizer.js`) explains the browser-process fetch:
non-image data URLs are ignored, then the app fetches the origin favicon with
Session.fetch and no referrer. The fix changes only the **authored controlled
page**, not acquired public content or shipping code. Frameless traffic remains
an admission blocker. The failed report preserves its original source hashes;
run-04 hashes match the seven committed implementation files; run-02 predates the final cleanup/error-handling refactor.

Run-02 ran 18:20:53.027–18:21:01.347 UTC. It used installed Blanc 1.36.0's extracted
ASAR and official Electron 44.8.0, real Blanc Blocker, separate fresh profiles,
scoped fixture TLS and mock keychain. The upstream was closed before all offline
runs. Cookie/auth were absent at the controlled upstream; its Set-Cookie sentinel
was removed before forwarding/persistence. Four allowed response bodies are in
the frozen bundle. Two blocked URLs have decisions but no fabricated responses.

All provider calls within the fixture's declared completion interval, trust
results, protocol legs, bundle and payload hashes, environment hashes and
stability outputs are retained. Request timestamps are observation timestamps,
not latency measurements. Each run's parent identifies the single navigation;
this is not yet worker/redirect/general causal-graph coverage.

Runs 02, 03 and 04 confirm all owned browser children exited, disposable tree removed and
installed ASAR unchanged. Run-01 confirms tree removal and ASAR unchanged; its
older driver did not emit the explicit ownedChildrenExited field. No private
keys, temporary profiles or raw browser diagnostics are committed.

Invocations (from `/private/tmp/blanc-f12-spike-a`):

```sh
NODE=/Users/anthonyjloria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
$NODE experiments/chromium-extension-spike/fixtures/replay/pipeline/roundtrip.mjs \
  /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron \
  /Applications/Blanc.app/Contents/Resources/app.asar \
  /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js \
  /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs \
  /private/tmp/blanc-f12-record-replay-01
# Same command, fresh destination /private/tmp/blanc-f12-record-replay-02, after fixture/cleanup fix.
```

Unit checks: pipeline **13/13**, controlled TLS network **4/4**. Negative cases
include encoded identifiers, credential/header removal, sensitive bodies,
wrong upstream CA, replay misses, ambiguous repeated requests, unstable graphs,
changed payload/decision/referrer/profile and missing context/environment.
Active owner/agent attention was not measured. These wall clocks are not native
build time and add nothing to the clean-build benchmark.

Cleanup verification run-03: 2026-10-17T18:22:29.584Z to 2026-10-17T18:22:37.404Z. Same invocation with
`/private/tmp/blanc-f12-record-replay-03`; passed after removing an unsafe throw
from a finally block without weakening child-exit or failure checks. Targeted
ESLint on all 9 modules: zero errors/warnings; syntax and whitespace clean.

Final run-04: 2026-10-17T18:23:19.753Z to 2026-10-17T18:23:27.494Z; same command with
`/private/tmp/blanc-f12-record-replay-04`. Passed after tightening admission so
two runs missing the same top-frame origin, referrer, decision or payload hash
cannot agree their way into an oracle. New regression test covers matching
omissions on both sides. All 13 pipeline tests and targeted ESLint pass.
