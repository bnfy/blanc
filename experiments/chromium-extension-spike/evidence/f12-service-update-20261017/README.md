# Same-URL service updates and observer lifecycle

October 17, 2026. No native build; latency deferred.

Eight final sessions pass: Electron/Chromium, regular/private, twice each.
After v1 controls the page, the fixture server changes only worker.js response
bytes. The page calls the existing registration's update(), observes controller
replacement and receives v2 from the new controller. The server records exactly
two worker.js responses with the expected distinct v1/v2 hashes. This is a real
same-URL update, not a second script URL registration. Failed registration,
controlled network/cache response and blocked-fetch behavior also pass.

The observer failure was exposed by the authored 404 script: a target attaches
but disappears before setup/resume completes. The old finally block could replace
the original Network.enable error with a resume error. The observer now retains
each command error and reconciles it against an observed exact-session detach at
close, accounting for protocol-error-before-detach ordering. Only session-not-found
or the exact inspected-target-closed error plus that detach becomes an explicit
Observer.detachedDuringSetup event with contextComplete=false. Other errors stay
faults. It skips resume when detach was already observed and waits for setup tasks
before finishing evidence. No URL guess or fixture-intended identity is used.

All final runs have zero unexplained observer faults; failed-startup interruptions
remain recorded. This **does not close strict failed-script or controlled-fetch
context acceptance**. Same-URL changed-byte behavior is measured; unchanged-byte,
HTTP validator/cache variants, in-flight reassignment, multiple clients, cache
eviction and restart remain gaps. No full Spike A acceptance or latency claim.

Five archives preserve diagnostic, failed and passing attempts plus the existing
worker-path regression. The first same-URL attempt had correct behavior but failed
on the newly exposed Network.enable/target-close error; it is not a pass. Archive
and member hashes were independently reopened and verified. Final source hashes
match committed sources; earlier runs retain their own hashes, not claimed exact
source snapshots. Profiles and fixture certificate keys were removed.

Validation: final eight sessions and independent raw-record verifier pass;
existing ten-case worker-path comparison passes across eight sessions; 92 focused
tests pass with no skips; 58-file lint clean. The first sandboxed test invocation
had three loopback-listen EPERM errors (retained); authorized rerun passed 92/92.
No native/upstream change, no new build output. Owner attention and agent time
were not measured. Timing brackets in reports are test invocations, not latency.
