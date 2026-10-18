# Offline uBO component admission — October 17, 2026

The pinned 1.75.0 payload (all 658 pinned hashes verified) loads using normal
ComponentLoader::Add and a fixed-ID, command-switch-gated browser allowlist.
Only generated manifest key and incognito=not_allowed differ from the payload.
No AddOrReplace, ordinary MV2 override or extension-core patch is used.

The successful runtime record proves the uBO background target exists, the real
popup loads, runtime version/id match and isAllowedIncognitoAccess is false.
All upstream traffic is rejected by the probe's local HTTP/CONNECT server;
DNS outside loopback is disabled. The fresh profile is removed after each run.
Switch-presence checks are diagnostic guardrails, not a security sandbox.
Component feature auto-grants remain broader than ordinary extension privileges.

This is **admission only**, not blocking parity, startup readiness, functional
private-window coverage or safe list reload. There is no authenticated hold yet.
No latency run was performed and no permanent profile was opened.

The first incremental compile failed on restricted ScopedAllowBlocking use.
The repair passes the verified manifest from the launcher and compiles/links in
33.35 seconds (6 completed steps). Cache, toolchain and GN arguments preserved.
Footprint: 25/62 → 27 upstream files / 65 hunks, below 40/120.
95 context regression tests and three component tests pass; lint is clean.

Failed runtime attempts remain saved: non-ASCII command-line manifest; Playwright
omitting the background page despite a real CDP target; nested CDP evaluation
timeout; wrong popup filename. The final probe uses the actual popup-fenix.html.
Those failures are not counted as passes. Public-key material is not a private key.

## Update-script identity remains open

At pinned content/browser/service_worker/service_worker_single_script_update_checker.cc
198–230, no relevant frame exists, throttles are constructed before the separate
browser request ID is made, and no worker DevTools token is assigned there.
The subsequent service_worker_updated_script_loader.cc has no DevTools request-ID
join. Reusing the initial script token or matching a new realm by URL would be a
false attribution. Existing strict occurrence-ambiguity tests remain passing;
no update-script context has been promoted to accepted by this checkpoint.
Next work needs an independently observed loader identity on both runtimes,
including unchanged-byte/cache validation paths, before claiming that gap closed.

Reproduce packaging with `node ubo-component.mjs FRESH_PAYLOAD`, then run
`node ubo-component-probe.mjs CONFIG PAYLOAD RESULT` from the experiment directory.
Use the isolated 157 binary and a local config with Playwright and UI paths.
`sha256.json` identifies archived evidence. Timing is build elapsed time, not
owner attention or agent effort; those remain unmeasured.
