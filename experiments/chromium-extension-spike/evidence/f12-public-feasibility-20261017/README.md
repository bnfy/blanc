# Owner-selected C: public recording feasibility — October 17, 2026

Historical checkpoint `6f2aad42`; source-match statements refer to that revision.
The [response-handling repeat](../f12-public-feasibility-repeat-20261017/README.md)
records later changes and their source-matched controlled regression.

The owner selected **C — Measure refusal rates first**. This measured the
existing policy on ten fixed unauthenticated public entrypoints, with normal
upstream TLS verification and the real Blanc Blocker. No policy relaxation,
private raw corpus or final A/B selection is implied.

**Result: 0/10 initial documents admitted; 10/10 refused.** Seven first refusals
were `vary-unsupported`; three were `status-unsupported`. One additional request
on NASA's probe was refused as `body-type-unsupported` (Electron type `other`,
transport Sec-Fetch-Dest `empty`). Its URL was not retained, so we do not claim
its purpose. No script/image/stylesheet/fetch distribution was obtained.

| # | Predeclared public entrypoint | Initial-document first refusal |
| --- | --- | --- |
| 1 | https://en.wikipedia.org/wiki/Web_browser | vary-unsupported |
| 2 | https://developer.mozilla.org/en-US/docs/Web | vary-unsupported |
| 3 | https://www.bbc.com/ | vary-unsupported |
| 4 | https://www.theguardian.com/international | vary-unsupported |
| 5 | https://www.reuters.com/ | status-unsupported |
| 6 | https://apnews.com/ | status-unsupported |
| 7 | https://www.nytimes.com/ | status-unsupported |
| 8 | https://www.theverge.com/ | vary-unsupported |
| 9 | https://arstechnica.com/ | vary-unsupported |
| 10 | https://www.nasa.gov/ | vary-unsupported |

[Aggregate summary](summary.json) and [complete diagnostic report](report.json)
contain only the predeclared entrypoints, counts/enums, source/app hashes,
versions, timestamps and cleanup evidence. No public body, response headers,
rejected URL, individual provider call, HAR, screenshot, raw browser stderr,
certificate hostname log, CA key or disposable profile is committed. The probe
never calls `freeze`. Summary-only instrumentation returns the real provider's
result unchanged; its unit test checks that a sensitive URL produces only a
category/reason count and no log write. All ten runs report raw observation files
absent. No public oracle or corpus records were produced.

## Interpretation and limits

This is **a recording-feasibility result, not a block-rate or tracker-bias
measurement**. All ten document requests were allowed by the real blocker, then
refused by the recorder before normal page rendering. "Admitted" in the observer
histogram means the request metadata passed its scrub, not that its response or
page passed recording admission. The refused response prevents downstream
requests, so the experiment cannot estimate how many tracker URLs or hashed
assets would be rejected on an otherwise fully loaded page.

The first failing gate is recorded, not every possible reason. The three
unsupported statuses are not persisted as exact HTTP status codes, so they
cannot be attributed to redirects, bot defenses or another status from this
record. The entry-host allowlist would refuse unknown CONNECT hosts; no such
fault occurred here. IPv6-only sites remain unsupported. Each page has a fixed
15-second probe interval, not a general completion predicate. The sample is
purposeful and small, not statistically representative.

A committed corpus under the **current** policy is not viable on this sample.
The result alone does not justify a private raw corpus: ordinary response
handling already stops the run before identifier bias can be measured. Next
useful experiment: explicitly model supported Vary request/response selection
and record safe status classes, keep credential/identifier handling strict, then
repeat C. This recommendation does not change the current policy or owner scope.

## Runtime and validation

Runtime: 2026-10-17T18:27:58.351Z to 2026-10-17T18:30:41.684Z.
Each entry used a fresh disposable regular profile and a fresh extracted copy of
installed Blanc 1.36.0, on the provided Electron runtime. The actual public-client
path was used, with no test-origin override. Fixture CA trust existed only in
those Sessions; upstream used ordinary certificate verification. No keychain
trust was installed. All child processes exited, keys/profiles were removed,
no upstream actions remained pending, and installed ASAR hash was unchanged.

Invocation (from `/private/tmp/blanc-f12-spike-a`):

```sh
/Users/anthonyjloria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  experiments/chromium-extension-spike/fixtures/replay/pipeline/feasibility.mjs \
  /private/tmp/blanc-f12-runtime/dist/Electron.app/Contents/MacOS/Electron \
  /Applications/Blanc.app/Contents/Resources/app.asar \
  /private/tmp/blanc-electron-drag-fix/node_modules/@electron/asar/lib/asar.js \
  /private/tmp/blanc-electron-drag-fix/node_modules/playwright/index.mjs \
  /private/tmp/blanc-f12-public-feasibility-01
```

The ordinary full-observation pipeline is separately rerun as controlled run-05
in this directory after shared recorder/observer changes. Paired comparator
transport tests are synthetic: they establish that a causally joined,
context-matching block→allow difference survives a response miss, but do not
claim a native fork adapter exists. Unknown/unjoined misses remain faults.

Validation: 14 pipeline tests, 5 controlled TLS/IP tests and 15 paired-validator
tests pass; targeted ESLint on ten JavaScript modules has no errors/warnings.
No native build/prepare/GN, source/output/profile change or baseline promotion.
Task 0's upgrade gate remains open. Attention was not measured; wall clock is
not a native build cost.

Controlled run-05 passed: one acquisition, then two fresh regular and two fresh
private offline runs with upstream shut down; six decisions each (four allow,
two block), both pairs stable. Its seven implementation hashes match this
revision. Cleanup passed. Same recorded roundtrip invocation as earlier, with
new destination `/private/tmp/blanc-f12-record-replay-05`.
