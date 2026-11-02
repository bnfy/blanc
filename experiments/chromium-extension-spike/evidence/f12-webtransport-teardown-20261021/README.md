# Pending WebTransport service-worker and profile teardown — October 21, 2026

Four final isolated schedules pass on the unchanged native binary. Every held
request originates in an activated service worker. Each schedule first completes
a real HTTP/3 CONNECT/datagram exchange, then suspends only the verified child
Blanc Blocker utility and confirms the exact native pending request ID.

- Regular/private service-worker stop: CDP's exact version transitions from
  running/activated through stopping to stopped/activated. Its debugging target
  remains visible, so target disappearance is not the stop criterion. Resuming
  the utility produces a late allow decision but no server connection; the
  stopped worker's connector prevents creation. A fresh document connection works.
- Private context teardown: the disposable off-the-record BrowserContext is
  removed and its service-worker target destroyed before utility resume. No
  pending handshake arrives; the surviving regular context remains usable.
- Regular profile teardown through owned-browser clean shutdown: the browser
  disconnects while the worker request is held, and its blocker utility exits.
  No pending handshake arrives. This is whole-browser/profile shutdown, not hot
  deletion of a regular profile while another browser profile remains open.

The post-teardown observation is1.5seconds, bounded rather than indefinite.
`report.json` retains native records, worker versions, target/context identity,
verified process identities, actual server events and surviving-context controls.
`validate.py` independently checks the archived results. The initial two worker
attempts required a target-destroyed event and timed out; they are retained in
`initial-target-assumption.json`, not counted as passes. Its two profile cases
passed, but are not added to the final unique-case count.

No production change or native compile. Final build guard zero; prior upstream
56files/134hunks unchanged, not recounted. Native source/framework hashes match
the prior checkpoint. Scoped lint, syntax, validator and diff checks pass.
Disposable profiles and certificate private keys removed; retained preview and
Google baseline untouched. This does not qualify hot regular-profile deletion,
shutdown crash/restart, concurrent requests, extension/provider composition,
service-worker restart of an interrupted transport or arbitrary-duration races.
Next Decision2 request-path priority remains speculation initial requests and
consumption, with these narrower transport gaps retained. F12 is not accepted.
Native input pending, latency deferred, Electron diagnostic build pending approval.
