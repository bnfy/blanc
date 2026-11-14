# Concurrent WebTransport and deletion cancellation — October21

Four bounded regular/private schedules exercise eight simultaneous pending
requests each: four document and four service-worker requests, with four allowed
and four filter-blocked destinations. All32 batch decisions are individually
identified by native pending IDs and complete once. Sixteen allowed CONNECTs
exchange real HTTP/3 datagrams; sixteen blocked requests do not reach the server.
Positive controls precede each batch and fresh connections succeed afterwards.

Two schedules additionally invoke native removal of the disposable Default
profile from a separate regular Profile1 picker while all eight decisions are
held by suspending the verified child blocker utility. A real before-unload
prompt is dismissed to cancel deletion. The page remains open and the persisted
profile registry retains Default before the utility resumes. Both regular and
private request batches then resolve according to filtering, without stale
profile-unavailable refusals. This tests cancellation during scheduling, before
committed deletion; it does not claim reversal of an already deleted profile.

Initial cancellation attempts threw while reading an asynchronously unwritten
Local State profile registry. Those fixture errors are retained separately and
not counted as passes. The final fixture waits boundedly for registry persistence
and preserves the same native cancellation/request assertions. Earlier concurrent
passes are also not added to the final unique-case count.

report.json retains request/result associations, eight distinct native IDs per
batch, server observations, native dialogs/cancellation milestones and owned
process identities. validate.py independently verifies the archived outcomes.
One-second post-batch observations are bounded, not arbitrary-load stress.
No production source change or build; guard0 and native artifact hashes unchanged.
Prior56files/134hunks unchanged, not recounted. Scoped lint/syntax/diff checks and
validator pass. Disposable profiles and certificate keys removed; retained
preview and Google baseline untouched.

Not qualified: queue limits/saturation, higher concurrency, simultaneous profile
deletions, repeated cancellation cycles, cancellation during other teardown
stages, mixed providers or machine power loss. Speculation initial-request and
consumption qualification remains the next request-path priority. F12/Decision2
remain open. Claude's primary plan updated; native input pending, latency
deferred, Electron diagnostic build pending approval/unstarted.
