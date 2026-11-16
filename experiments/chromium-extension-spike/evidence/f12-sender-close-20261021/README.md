# Sender-closure checks — October 21, 2026

Blocked before runtime; no acceptance pass. Historical engine/runtime assets are missing and regeneration rejected the changed installed reference hash. See preflight.json. A scoped filename search under Projects, /private/tmp and /Applications found no other Blanc reference ASAR; backups elsewhere remain possible.

Required matrix: fetch keepalive and sendBeacon, regular/private, allowed/blocked destinations. Keep a survivor tab; record sender target identity, enqueue result, target destruction, native decision context and server arrival independently. Extend the GET-only fixture transport with explicitly authored POST methods and bounded body digests. Hold responses or authored redirects to distinguish requests queued before closure from continuation after closure. Receipt before closure alone is insufficient; sendBeacon true means queued, not delivered. Missing decisions must not be inferred as blocking. Preserve strict type, source/referrer and private-context evidence.

Recover authenticated historical assets/reference before paired parity runs, or explicitly reconcile a new baseline. No hash guard bypass, builds, latency runs or profile changes occurred. Electron diagnostic build remains pending approval.

## Authenticated native asset recovery — October 21, 2026

The native-assets blocker above is resolved. The earlier search missed root-level archive members (it matched `/engine.js` but not `engine.js`). `../f12-codeql-20261017/engine.tar.gz` retains the correct bundle. Its archive SHA256 and all 13 member sizes/hashes were verified against the committed inventory before restoring `/private/tmp/blanc-f12-native-assets`. Engine SHA256 is `9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d`; the recovered header exactly matches the current Chromium source header. Manifest and all licenses are retained. See `asset-recovery.json`.

The older `f12-native-20261017/engine/engine.js.gz` was also located, but its `e969dfa8...` bundle is superseded and must not be substituted. No hash guard was weakened or source/build changed. The original installed Electron reference ASAR remains unrecovered (current installed ASAR differs); paired Electron parity still cannot be claimed. Native-only sender-closure fixtures can now proceed using the recovered engine and existing native binary, with runtime authentication still to be observed. Recovery is not a runtime pass. Historical failed preflight retained for provenance.

## Native runtime result — October 21, 2026

Four bounded schedules pass: regular/private × fetch keepalive/sendBeacon. Each first verifies allowed and blocked live-sender controls, queues two POSTs to held same-origin endpoints, confirms the sender page closed and its exact CDP target was destroyed with a survivor tab still live, then releases 307 redirects. All four allowed terminal POSTs arrive after closure with the original body digest. All four blocked terminal requests have explicit native block decisions and zero server arrivals during the three-second observation. Native engine-ready records authenticate the recovered bundle.

Eight post-close redirect decisions retain request/factory IDs, POST, source/referrer, top origin and regular/private context. Fetch is xhr; beacon is ping. Beacon enqueue returns true, independently of eventual delivery. The validator checks these observations directly. The native frame_state remains live-at-entry: this describes initial entry, not a live sender at the later redirect; closure is proven independently by the target-destruction event.

This qualifies pre-enqueued POST continuation through one method-preserving 307 after page-target destruction, not initiation after destruction, process-crash/whole-browser shutdown, retries, other redirect methods, every keepalive path, or paired Electron parity. Browser background Google requests were refused by the authored-only proxy and retained in faults; no fixture authority/method/body or responder faults occurred. Socket reset diagnostics are retained. Raw native timing fields are incidental logging, not a latency run or claim.

No production source changes or builds. Syntax/scoped lint and the evidence validator pass. All four disposable sessions and their temporary profiles/certificate keys were closed and removed. Existing dev/permanent profiles untouched. Original Electron reference remains unavailable; latency deferred and diagnostic Electron build pending approval.
