# Private-profile multi-registration attribution — October24

**One final bounded scenario:10checks passed.** Two service-worker registrations share one script URL within a disposable off-the-record browser context, with distinct scopes and clients. The existing regular one-registration close/recovery sequence was not rerun. No production code/build/signing change, research logging, latency measurement or Google-profile use.

## Identity and observations

The accepted signed14706b0e candidate/archive18a0c2ca was launched with a new task profile. A new `Target.createBrowserContext` context hosted both pages. [Report](report.json) records their matching browser-context IDs; the native Island state identifies that same context as private. Only one page appeared in the captured Island list, so the final assertion uses native private status plus both page-to-context bindings rather than claiming both were rendered in one snapshot. This is not a new physical UI/VoiceOver test.

- Each registration's browser `clients.matchAll` output contains its own client ID and URL. The IDs differ across the two scopes.
- Both registrations use the same served worker script bytes/URL. Their responses return actual FetchEvent client IDs and `clients.get` URLs, matching their independently listed clients and scopes.
- Both serve their named fixture caches without network arrivals.
- Concurrent native registration.update calls install v2 at the same script URL; each scope retains its original client identity. ServiceWorker protocol events independently show two registration IDs with two activated version IDs each.
- Deleting alpha's **explicitly named fixture cache** causes alpha to reach the network once while beta continues to serve its cached v2 response. CacheStorage is origin-wide: this does not claim automatic security isolation between same-origin registrations. It verifies the fixture's named-cache routing and attribution.
- A regular-profile page at the same origin sees no registrations/caches. After private-context disposal, a fresh private context also sees neither. This verifies the observed context lifecycle, not a forensic no-disk-write claim.

The last four observations cover new private/multi-registration requirements; they are not additional copies of the previous regular-profile checks. All10final assertions are counted once.

## Preserved fixture failures

The initial worker string had a missing closing brace and failed script evaluation before any check passed. A syntax-only check found it; the fixture was corrected without changing the app. The next attempt passed four assertions but failed its overly specific two-page Island snapshot check. Its context membership and native private indication were present; the corrected final check retains both requirements without assuming simultaneous UI population. [Initial report](initial-report.json), [snapshot attempt](ui-snapshot-report.json), and original scripts remain archived; neither attempt counts toward10final passes.

Every attempt exited normally. Only the three task profiles were removed after exit; private contexts were explicitly disposed. [Cleanup](cleanup.json). The launcher/native executable/framework/metadata still match the accepted inventory; [binding](runtime-input-binding.json). Permanent Preview/Shipping and Google profiles were not used. Electron stayed paused.

## Remaining scope

This qualifies the stated fresh private context/two same-origin registrations/two clients/concurrent update/cache-eviction schedule. It does not prove cross-origin access, arbitrary update permutations, persisted private data forensic absence, multiple browser-profile deletion, a hidden loader-request-to-registration token join, block-rate equivalence or aggregate F12 acceptance. Those claims are not inferred from these passes.9/12launch gates remain accepted; latency and final Decision2 remain open.
