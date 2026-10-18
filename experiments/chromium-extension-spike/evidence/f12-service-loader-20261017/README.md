# Failed script-loader identity and update-correlation rejection

October 17, 2026. Eight fresh sessions across Electron/Chromium and regular/private
produce token-linked HTTP 404 response evidence before exact-target detach.
The blocking-hook request joins the initial worker token (native) or the unique
token-bearing Network event (Electron), the response on that session/token, and
the later detach. Profile, URL, method, actual initiator/referrer and HTTP status
are checked. The resulting context is **service_worker_script_loader**, phase
http-failed-initial-script, with executionRealm=unobserved. It is not an execution
origin, a running worker, or a fabricated controlled-client set.

This closes only HTTP-failed initial loader attribution with that complete token
chain. Startup failures without a response, missed tokens, runtime exceptions and
general lifecycle failures remain gaps. Wrong response IDs, success responses and
detach-before-response cannot satisfy this branch. No observer error is erased.
Only response URL/status/identity are newly retained, never headers or cookies.

The update investigation exposed a false acceptance in one captured Electron
session: two same-URL hook occurrences but only the initial token-bearing Network
event let the second occurrence reuse the initial worker token. The comparator
now requires a unique hook occurrence as well as a unique event. All eight captured
update occurrences are explicitly rejected as gaps in context-proof.json. This
corrects correlation logic; it does not claim update-script attribution is solved.
Same-URL update behavior still passes, as do 16 controlled-fetch contexts.

Source basis: content/browser/devtools/devtools_instrumentation.cc:2676-2750 emits
HTTP failure under the new worker token; service_worker_single_script_update_checker.cc
creates a browser-initiated update check with no relevant frame/tab. Native update
hook records expose no DevTools request ID. A later worker/event with the same URL
is insufficient evidence; solving that gap requires an independent loader identity
path on both runtimes. No native patch or build was made in this checkpoint.

95 focused tests pass, no skips. The ten-case worker-path regression is rerun with
the final guard. Three archives retain the fresh response run, the earlier path
regression, and the final regression; member/archive hashes are verified. Earlier
source hashes are retained as historical hashes, not claimed current snapshots.
Final verifier/source hashes are recorded separately. Profiles and certificate
keys are removed. Latency deferred; owner attention/agent time not measured.
