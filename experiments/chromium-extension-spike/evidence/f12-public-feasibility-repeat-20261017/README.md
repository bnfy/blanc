# Repeat C after ordinary response handling — October 17, 2026

The owner requested supported Vary, entrypoint resolution, empty responses and
refusal counts by actual request category and party. This repeat retains the
strict identifier/body gates, real Electron blocker, aggregate-only persistence
and fresh disposable profiles. No private raw corpus policy was chosen.

## Primary output: subresource refusal distribution

| Electron category | First-party observed | Third-party observed | Refusal rate |
| --- | ---: | ---: | --- |
| script | 0 | 0 | Not measurable |
| xhr | 0 | 0 | Not measurable |
| image | 0 | 0 | Not measurable |

These are **unavailable measurements, not zero-percent refusal rates**. All ten
initial documents were refused before their scripts/subresources could load.
One additional `other` request had unknown party, status 200 and
`body-type-unsupported`; its purpose/URL was not retained. It was not a 204.
Nothing about tracker skew, blocker parity or a representative first-/third-party
mix follows from this sample.

[Machine-readable category summary](summary.json) and [aggregate report](report.json)
are the primary outputs. Diagnostic party uses registrable domains with private
suffixes via installed tldts-experimental, against observed top frame; missing
context stays unknown. Proxy refusals use the observer's bounded in-memory
category join, never persist rejected URLs, and retain separate Sec-Fetch-Dest.
Categories do not replace native context/initiator correlation evidence.

## Why the documents still failed

| Final recording entrypoint | Browser response status | First refusal |
| --- | ---: | --- |
| https://en.wikipedia.org/wiki/Web_browser | 200 | vary-unsupported |
| https://developer.mozilla.org/en-US/docs/Web | 200 | encoded-or-opaque-body |
| https://www.bbc.com/ | 200 | vary-unsupported |
| https://www.theguardian.com/international | 200 | encoded-or-opaque-body |
| https://www.reuters.com/ | 401 | status-unsupported |
| https://apnews.com/ | 403 | status-unsupported |
| https://www.nytimes.com/ | 403 | status-unsupported |
| https://www.theverge.com/ | 200 | vary-unsupported |
| https://arstechnica.com/ | 200 | encoded-or-opaque-body |
| https://www.nasa.gov/ | 200 | encoded-or-opaque-body |

Totals: **3 uncontrolled-Vary refusals, 4 encoded/opaque-body refusals, 3
non-success-status refusals (one 401, two 403)**. All are first-party mainFrame
requests. Vary support moved four pages from a header stop to the existing
body privacy gate. This does not prove their content contains personal data:
the conservative heuristic also refuses opaque/minified or identifier-like data.
It was not relaxed to obtain a sample.

The header-only preflight recorded original→final mappings and status for each
entrypoint. **No redirect occurred in these ten preflights**; original and final
URLs are equal. The three status failures were 401/403, not presumed apex or
scheme redirects. Controlled network tests separately prove safe redirect
resolution and loop/sensitive-location refusal. Capture starts at a resolved
root; redirect graph admission remains unsupported. Preflight headers are
recorded separately from browser traffic and statuses can differ.

The status-200 other request remained unsupported after genuinely empty untyped
200/204 bodies were admitted. No raw response/body type is retained, so this
record does not identify its payload. Known-empty support does not justify
silently accepting arbitrary binary content.

## Implementation and validation

- Vary retains the original value and records controlled request selection.
  Accept-Encoding is fixed to identity; Host derives from the URL. Other
  allowlisted forwarded values (or absence) must match on replay. Unknown,
  Cookie, Authorization and wildcard fields refuse. This does not assume
  Electron and Chromium send identical languages or user agents.
- Empty untyped status-200/204 responses are admitted; nonempty untyped bodies
  and nonempty 204s refuse. Sensitive body/URL and binary gates remain.
- Every paired-validator report now states that fork false negatives with
  unavailable blocked responses are a **lower bound**: a missed script gets 502,
  never executes, and cannot generate its follow-on requests. No block-rate
  number is claimed here. This caveat also appears in the replay contract.
- 16 pipeline, 7 controlled TLS/IP/redirect and 15 paired-validator tests pass;
  targeted ESLint on ten JavaScript modules is clean. Controlled run-06 verifies
  ordinary acquisition plus regular/private paired replays on the final source.

## Runtime, scope and cleanup

Preflight began 2026-10-17T18:35:54.418Z; browser probe ran
2026-10-17T18:35:57.340Z to 2026-10-17T18:38:40.787Z. The same ten original
entrypoints were used, each in a fresh regular profile, with a 15-second window.
The entry/final-host allowlist is bounded; unknown CONNECTs would remain transport
faults, and this is not full cross-origin capture. No such CONNECT fault was
needed to explain this result. The headers-only preflight is HTTPS-only and
bounded to six attempts. Private-profile bias was not measured.

All owned children exited, keys/profiles were removed, pending upstream actions
were zero and installed ASAR hash was unchanged. All ten summary-only runs
confirm individual provider/certificate log files were absent. No public body,
raw browser stderr, HAR, certificate key, rejected URL or response-header value
is committed. Only safe predeclared/mapped entrypoints, enum/count diagnostics,
versions, hashes, statuses and timing are retained. No public bundle was frozen.

Invocation: same five arguments as the first feasibility run, with destination
`/private/tmp/blanc-f12-public-feasibility-02`. Full command is in
[the first-run record](../f12-public-feasibility-20261017/README.md); the controlled
regression uses roundtrip.mjs with destination `/private/tmp/blanc-f12-record-replay-06`.
No Chromium build, prepare/GN, source/output/profile change, promotion or cold
column change. Attention was not measured.

The public-corpus route remains unable to supply the requested distribution
under the current privacy policy. Further access-status bypasses or accepting
opaque public bodies would be different decisions, not ordinary transport fixes.
A/B is still unchosen; no raw/private capture authority is inferred.

Controlled run-06 passed with final source hashes: four allowed responses frozen,
upstream shut down, two fresh regular and two fresh private replays each matching
six decisions (four allow, two block). All child/profile/key cleanup and installed
ASAR checks passed. Its source hashes match the seven implementation modules.
