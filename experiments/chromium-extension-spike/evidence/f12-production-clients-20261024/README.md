# Production worker update/cache/multi-client attribution — October24

**Ten new regular-profile functional checks pass; a separate focused protocol-identity check passes.** The first run is retained as incomplete because its eleventh assertion lost its observer. These are bounded complementary records, not an eleven-pass single run or full F12 acceptance. No previously accepted test suite was repeated and no product code changed.

## Candidate and isolation

The unchanged notarized14706b0e candidate/archive18a0c2ca ran through its sealed launcher in fresh task profiles. [Launcher/native executable/framework/metadata hashes](runtime-input-binding.json) match the authenticated inventory after testing. No research flags, private logs, engine replacements or custom filter inputs were supplied. A loopback fixture supplied ordinary service-worker and network content. Owner/Google profiles and Electron were not used. Every process exited normally; [only the four task profiles were removed](cleanup.json). No build, signing or latency measurement.

## Functional evidence

[Original run](functional-report.json) contains ten successful assertions and the preserved final observer failure. The fixture uses one registration, two distinct controlled page URLs and browser-generated client IDs:

1. The browser's `clients.matchAll` snapshot reports two distinct client IDs and their actual URLs under one registration scope.
2. Each cached response returns `FetchEvent.clientId`, independently resolved `clients.get` URL and worker version, matching the separately captured client inventory. Cache hits produce no server request.
3. Client A's network response retains A's identity. Client B starts a separately identified network request whose server response is held.
4. Closing A removes only A from the browser client inventory. Releasing B's held response still returns B's ID/URL and expected network bytes.
5. Changing only the worker script response bytes at the same URL and calling native registration.update replaces the controller withv2. Remaining client B retains its ID and scope.
6. B receives newv2cached bytes with no server request; after explicit fixture-cache eviction, the same request reaches the server exactly once and returns network bytes with B's identity.

Client IDs and URLs come from browser APIs, not preseeded answers. Server records independently distinguish cache absence from a network arrival. Version labels are authored fixture content corroborated by changed script hashes and the native update operation. This is browser-observable response/client attribution; it does **not** claim an independent hidden URLLoader request-to-registration token join or a new block-rate measurement.

## Protocol identity and fixture corrections

The first run observed ServiceWorker events through client A, then deliberately closed A. Its functional update passed, but its final protocol assertion did not observe replacement activation. That failure remains in the original report.

A separate probe performs only the missing identity assertion: attach the observer to surviving B, close A, perform the same-URL update and wait for **this exact fixture script URL**. [Final identity report](identity-report.json) contains one successful assertion: two distinct activated browser version IDs belong to one native registration ID/scope. It does not rerun the ten cache/network assertions.

Two intermediate probe errors are retained: a read before the new page exposed serviceWorker, and a wait that mistakenly counted unrelated built-in extension workers. The final wait is scoped to the fixture's exact URL and registration. None is counted as a pass, product regression, or justification to weaken the final assertion.

## Remaining limits

Regular-profile, one-registration, two-client behavior is now qualified for the recorded schedule. Private-mode and multiple distinct registration/version ownership are not newly qualified here. Arbitrary caches, redirects, races, worker crashes and all hidden request-token joins remain outside this record. Existing signed security, prefetch, prerender and L8 results are retained without reruns. Aggregate F12/Decision2 approval remains open;9/12launch gates unchanged. Electron paused, Google baseline separate, latency deferred.
