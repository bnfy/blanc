# Prefetch response timeout and tab teardown — October 21, 2026

Four bounded regular/private schedules exercise the existing repaired binary:
response timeout and consuming-tab closure. No native code or build change.

Each schedule warms the engine, waits for a real Ready speculative response,
verifies the disposable profile's unique browser and blocker utility child, then
SIGSTOPs only that utility. Link navigation selects the prefetched response
(CDP PrefetchResponseUsed), while navigation remains unresolved at the source URL
and no response-decision completion is logged. This establishes the pending
navigation observation without adding a diagnostic delay inside native code.

Timeout schedules await the native35s response timer, not the45s fixture deadline.
They record an explicit response-decision block/-1 and navigation failure. After
SIGCONT, late replies do not add another response decision or commit the fixture
document. Tab-close schedules close the consuming tab while unresolved; after
resumption there is no response completion for its destroyed navigation. Both
modes retain exactly the initial prefetch server arrival. Fresh same-context
navigation after resumption succeeds, checking utility/browser survival.

These waits exercise functional deadlines, not latency benchmarking. Late-reply
observation is bounded to1.5s plus the fresh navigation; it is not an indefinite
absence proof. Weak callback destruction is behaviorally exercised, not traced
with native destructor instrumentation. Profile deletion, last-window shutdown,
redirects, subframes, cross-origin serving, BFCache/prerender, uBO and broader
concurrent lifecycle combinations remain open. F12/Decision2 remain in progress.

Fixture syntax/lint, archived validator and member hashes checked. Binary, engine
and source hashes match the repair; final incremental guard zero. Prior56files/
135hunks unchanged. Disposable profiles and certificate keys removed. Google
baseline remains separate; permanent profiles/tabs untouched. Latency deferred;
physical native input and Electron diagnostic build pending.
