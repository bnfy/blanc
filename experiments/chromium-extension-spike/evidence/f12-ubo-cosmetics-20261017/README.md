# uBO cosmetics and same-URL update collision — October 17, 2026

This is bounded **synthetic fixture parity**, not full F12 acceptance or a
real-web result. No native code changed: plan inspection scheduled zero actions;
no build ran. Latency remains deferred. 156 and permanent profiles untouched.

## Cosmetic and scriptlet observations

Four fresh sandboxed regular sessions (Electron/Chromium, two each), two authored
pages per session, normal and restrictive CSP. Actual pinned uBO 1.75.0 processes
save the authored user filters and reload their lists through their real APIs;
automatic list updating is disabled. No substituted blocking engine or patched
content-script result. The fixture CSP permits its own nonce script and denies
page styles; inline probe execution is asserted.

All eight pages agree and pass the bounded functional checks: static selector
hiding, `:has-text` after insertion/text/attribute changes and moving nodes,
negative controls staying visible until they match, and a later `no-fetch-if`
request returning an empty body without reaching the offline server. Its allowed
control reaches the server and returns the authored response. The later constant
read is true. **The first inline page script reads the constant as false on all
eight pages**: matching late injection is not document-start acceptance. This is
a shared timing failure under this fixture, not evidence of its cause or a claim
that every scriptlet is late. Early fetch-scriptlet execution was not tested.

`ubo-cosmetic-verify.mjs` recomputes outcomes from raw snapshots and transport
observations. Six rejection tests cover shared failures, negative controls,
fixture misses, fetch bypass and cross-runtime timing differences. First attempt
`cosmetic01` retained two unmanifested favicon requests per Electron run; it is
exploratory evidence, not admitted acceptance. `cosmetic02` explicitly serves a
204 favicon and has no fixture misses. Only enumerated blocked Google background
attempts are allowed by the verifier; the offline server never forwards them.

## Update identity collision

Eight sessions, both runtimes and regular/private twice. Each has two activated
registrations with different scopes and the **same script URL**, followed by
concurrent unchanged-byte `update()` calls. Four script arrivals per session have
the same body hash; lifecycle observations prove two distinct registration,
version and target IDs. Both updates complete with no installing/waiting worker.

All **16 update hook identities remain gaps** (`service-script-target-ambiguous`).
The initial/update phase separation labels request occurrences only; it is never
used to choose a registration. URL, arrival order and timing cannot distinguish
two owners. The raw verifier reconstructs lifecycle identities and re-runs strict
correlation. The existing single-registration changed/unchanged evidence remains
valid behavior evidence, not a loader-to-registration proof. The next identity
step requires a shared observable registration/version token at the update
loader boundary in both runtimes; no speculative correlation was added.

## Evidence and limits

Three lossless archives retain all raw runs, source fingerprints, observer records,
DOM snapshots, transport attempts and cleanup reports. `capture-source` contains
the exact run sources, including the pre-favicon probe. Profiles and fixture CA
keys were removed; no private keys are archived. Reports contain session brackets,
not measured owner attention or agent time. Independent verifiers are in the
synthetic harness directory. 138 focused tests pass; ESLint: 73 files, no errors
or warnings. Native footprint unchanged at last measured 27 files / 65 hunks.

Remaining: document-start timing, other procedural operators/scriptlets,
subframes/opaque origins, wider lifecycle and request paths, private uBO (disabled
by current prototype policy), component privilege containment, production recovery
UX, update identity and qualified latency. Spike A cosmetics are not established
by Spike B's uBO checks. No plan item is marked complete by this checkpoint.
