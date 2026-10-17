# Recording and offline stability checkpoint

This implementation is under the approved F12 spike, not a captured acceptance
corpus. The roundtrip driver acquires **only authored, controlled HTTPS pages**.
The owner-selected public feasibility probe attempted ten entrypoints; none
passed response admission ([results](../../../evidence/f12-public-feasibility-20261017/README.md)). Acceptance-corpus count is zero, and
`captureProvenanceVerified` remains false. No Chromium build is involved.

## Separation and persistence

- `recorder.mjs` is the only outbound client. It requires an explicit host
  allowlist, resolves and pins a public IPv4 address, verifies upstream TLS,
  refuses redirects, and never forwards Cookie or Authorization. Controlled
  tests explicitly supply a separate local upstream and CA; this is recorded
  as `networkMode: controlled-origin`, not public acquisition.
- `scrub.cjs` admits only small UTF-8 text bodies (HTML, CSS, JavaScript, JSON or
  plain text), decompresses before inspection, strips non-allowlisted headers,
  and refuses recognized sensitive URLs/bodies. It never rewrites request URLs.
  Raw acquisition remains in memory; a refused load cannot freeze a bundle.
  Fault records contain neutral codes, never raw URLs or error messages.
  Set-Cookie and request credentials are stripped before forwarding as well as
  persistence. This intentionally creates the sanitized replay input; the
  acquisition decisions are **not** the oracle.
- The scrubber is a conservative heuristic admission filter, **not a general
  anonymizer or proof that arbitrary public content has no identifiers**.
  Encoded/opaque bodies, binary payloads, unsupported charsets, response Vary,
  redirects and non-200 responses are refused. Human content/license review and
  a broader public acquisition protocol are still needed before real pages.
- `offline.mjs` has no outbound client, DNS lookup or recorder import. It
  verifies bundle/payload hashes and rechecks admitted content, serves only
  recorded URL/method pairs, and faults on every miss. A blocked request has no
  synthetic response. Recording stores downstream/upstream protocol separately;
  replay stores downstream with upstream explicitly null. Both transports
  currently speak HTTP/1.1; this does not claim an h2/h3 recording.

## Stability admission

`stability.mjs` compares two independent runs of the same frozen bundle, app,
engine/filter provenance and observation policy. It requires complete, fault-free
runs with matching decisions, context, parent navigation, referrer (the existing
engine input), and payload hashes. It does not select the intersection. Missing
or extra requests refuse the entire run. Only uniquely identifiable requests may
ignore arrival order; repeated identical contexts are rejected as ambiguous.

This first matcher supports **one main-frame navigation per profile and its
script/xhr subresources**, with direct `initiatorOrigin` presence/value and the
contract's navigation top-origin rule. Frameless requests (including browser
favicon requests), workers, subframes, redirects and opaque/unresolved origins
remain admission blockers. The driver declares a fixed authored page completion
predicate plus a 200 ms observation interval; this is **not** a general real-page
quiescence detector or a proof about requests after that interval. Public-page
completion, causal request/hop correlation and unsupported paths must be solved
before expanding beyond this controlled checkpoint.

The observer wraps the actual installed provider's `decide`, returns its result
unchanged and leaves listeners/rules/startup gates intact. HTTP(S) decisions are
scrubbed before logging. Only the predeclared file/blanc/blanc-chrome/data/devtools
schemes are excluded and counted; other schemes fault. Fixture certificate logs
and the driver are limited to the authored allowlisted hosts. Nothing edits the
installed app or permanent profile.

## Run

```sh
node --test experiments/chromium-extension-spike/fixtures/replay/pipeline/pipeline-test.mjs
node --test experiments/chromium-extension-spike/fixtures/replay/pipeline/network-test.mjs
node experiments/chromium-extension-spike/fixtures/replay/pipeline/roundtrip.mjs \
  /absolute/path/to/Electron /absolute/path/to/Blanc.app/Contents/Resources/app.asar \
  /absolute/path/to/asar/lib/asar.js /absolute/path/to/playwright/index.mjs \
  /absolute/path/to/new-evidence-directory
```

The driver requires installed Blanc 1.36.0; the measured run used Electron 44.8.0.
It uses a fresh CA per controlled run and a fresh disposable profile per browser
process, never keychain trust. It acquires once, freezes four sanitized
allowed responses, closes the upstream, then launches two fresh regular and two
fresh private profiles. Each replay observes six provider calls: four allow and
two block. CA private keys and profiles are removed only after owned children
exit; the installed ASAR hash is checked again. No raw browser stderr is saved.

Measured runs, including the failed first attempt, are in
[the evidence record](../../../evidence/f12-record-replay-20261017/README.md).
Next: extend context/completion admission and the reviewed acquisition protocol,
then capture stable real-page traffic and replay the same bytes in Chromium 157.

## Public feasibility probe (owner selected C)

`feasibility.mjs` uses the same five command-line paths as `roundtrip.mjs`, with
an explicit ten-entry public-page list in source and a fresh evidence directory.
It exercises the actual public upstream client (no controlled-origin override),
normal upstream certificate verification, the unchanged scrub policy, and the
real installed Electron blocker in one fresh **regular** profile per entry.
No login, personal profile, public bundle or oracle is captured.

The observer's summary-only mode persists no individual provider observations
or certificate hostnames. The recorder reports only bounded reason/category
enums, not rejected URLs/headers/bodies. Browser stderr is discarded (byte count
only). Only predeclared public entrypoints and aggregate diagnostics are saved.
No bundle freeze occurs, even if content is admissible. Keys and profiles are
removed after child exit; there is no keychain trust change.

The entry-host allowlist deliberately refuses unlisted CONNECTs. This is an
**initial feasibility bound**, not complete public-page capture: cross-origin
requests outside it are transport refusals, and root responses rejected before
rendering cannot reveal the page's tracker distribution. Record those limitations
separately from scrub refusals. Provider categories are Electron resource types;
transport categories are the browser's allowlisted Sec-Fetch-Dest values, with
unknown values collapsed to `unknown`. The 15-second interval is a probe window,
not a page-completion criterion. Refusal reason is the first failing gate, not an
exhaustive inventory of identifiers. IPv6-only upstreams remain unsupported;
public IPv4 exclusions now use the intended documentation /24s rather than /16s.

A and B remain owner decisions after inspecting C's results. This probe does not
authorize retaining raw recordings or relaxing the scrubber.

### Paired comparison is separate

Keep `compareReplays` strict for Electron oracle admission. The future fork
adapter feeds `../validate.py` independent decisions plus causally joined
transport events. An oracle-blocked/fork-allowed request with a matching context
is a blocking regression even if its response was never acquired. The validator
retains that difference and labels the missing response as a downstream coverage
limitation. It does not fabricate descendants, suppress unrelated harness faults,
or use a URL-only match to excuse a miss. These paired-event tests are synthetic;
no native fork adapter or real Chromium comparison is claimed.
