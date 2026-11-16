# WebTransport deletion admission repair — October21

The hot-profile deletion failure from f12-webtransport-profile-crash-20261021
is repaired within its reproduced boundary. Before completing a held transport
decision, the gate now checks BrowserContext shutdown and Chromium's profile
marked-for-deletion state, as well as weak context/document lifetime. The
profile object can remain allocated while workers drain; this no longer admits
a new connection once deletion is marked. The check runs on the existing UI
completion path, preserving upstream extension errors and fail-closed behavior.

The same native-deletion schedule now records context_alive=true,
profile_unavailable=true and decision block/result-1 for the held request. No
HTTP/3 server arrival follows utility resume. The independently running Profile1
still exchanges datagrams, clean restart leaves Default absent, and fresh
transport works. Regular/private browser-crash/restart controls also pass without
pending-request replay. The runner now requires an explicit deletion refusal;
it cannot pass merely because the server happened to be unavailable.

Four service-worker/profile teardown regression schedules and eight real HTTP/3
baseline/enforcement controls are retained separately. Earlier failure evidence
is preserved in its original archive. validate.py checks the repaired three-case
report; supplementary reports retain their own assertions and outcomes. This is
bounded native qualification, not all F12/provider/lifecycle acceptance.

One guarded incremental build33.43seconds/six steps; final guard0. Only
Blanc-owned native source changed; prior upstream56files/134hunks unchanged,
not recounted. No GN/toolchain/cache change. Scoped ESLint, syntax, validators
and diff checks pass. Source/binary/engine hashes in provenance.json and all
archive member hashes retained. Full build log /private/tmp/blanc-wt-delete-fix-build.log.

Concurrent delete/cancel transitions, new requests during deletion, multiple
profiles deleting simultaneously, power loss and provider composition remain
unqualified. This is completion-time admission, not immediate destruction of
all pending gates. Speculation request-path qualification remains open.
Disposable profiles/keys removed, Google baseline and retained preview untouched.
Claude's primary plan updated; native input pending, latency deferred, Electron
 diagnostic build pending approval/unstarted. No release or Decision2 approval.
