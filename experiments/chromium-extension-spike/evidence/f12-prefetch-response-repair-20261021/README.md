# Prefetch response revalidation repair — October 21, 2026

The opt-in Blanc Blocker now revalidates HTTP(S) navigation responses before
commit, including responses served from prefetch. Chromium navigation throttles
own the asynchronous check; callbacks use weak pointers, a 35-second timer bounds
waiting, and only an explicit allow resumes. Failure cancels with
ERR_BLOCKED_BY_CLIENT. Work is posted after DEFER to handle synchronous engine
failure safely. The gate is absent without Blanc assets and excluded from the
separate uBO component-probe path. Non-HTTP(S) responses proceed normally.

Two repaired regular/private schedules wait for real Ready prefetch, kill only
the verified disposable owner's blocker utility, prove fresh-request refusal,
then attempt link consumption. Both receive explicit navigation-response-decision
block/-1; navigation fails and the fixture document title does not commit. No
additional server request occurs. Four regression schedules retain healthy
regular/private dedicated consumption and refusal when loss precedes prefetch.

This supersedes the observed post-ready-loss gap in the earlier diagnostic only
for these schedules. Revalidation covers HTTP(S) navigation responses generally,
not just prefetch; the extra asynchronous engine round-trip is not benchmarked.
Latency remains deferred. Timeout/teardown races in this new throttle, subframes,
redirects, policy changes, cross-origin serving, BFCache and prerender activation,
and uBO remain unqualified. No full F12 or Decision 2 completion claim.

One missing Referrer include caused the retained initial compile failure. The
corrected guarded incremental build passed in 43.79 seconds/8 steps; final guard
zero. Fresh inventory56files/135hunks, one additional hunk in an already patched
file. Ceiling updated58/135 under standing owner authorization; consolidation
later. Eleven counter tests, fixture syntax/lint and evidence validation pass.
Disposable profiles/keys removed; permanent profiles/tabs and separate Google
baseline untouched. Native input and Electron diagnostic build pending.

Archived build text has trailing whitespace normalized; original logs remain in
/private/tmp/blanc-prefetch-repair-build.txt and build2.txt.
