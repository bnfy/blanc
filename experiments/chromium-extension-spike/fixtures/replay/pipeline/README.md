# Recording and offline stability checkpoint

This implementation is under the approved F12 spike, not a captured acceptance
corpus. The runnable driver acquires **only authored, controlled HTTPS pages**.
No public page has been acquired. Acceptance-corpus count is zero, and
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
