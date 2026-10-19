# Durable Spaces window identity — proposed budget amendment

Status: proposed October 19, 2026; **not approved, not applied, not compiled**. Existing ceiling remains 41 upstream files / 120 hunks. Owner asked to continue identity work and report any needed increase.

The attached design sketch adds three existing upstream paths and seven pinned zero-context diff hunks: session_service_base.cc (2), session_restore.cc (2), browser_live_tab_context.cc (3). Against the last measured 41/100 this gives a projected 44 files / 107 hunks. This is a count of the drafted hooks, not a final patch inventory or build result. Further changes must be recounted; no additional files are implicitly authorized.

## Implementation contract after approval

A regular-window UUID is browser-owned data independent of its title, URLs, focus, tab IDs or current session ID. A new window receives a new UUID. Restore paths attach a validated persisted UUID before snapshot-driven recovery can run. Missing, malformed or duplicate restored identities must remain ineligible, rather than silently generating a replacement identity that appears to match.

The three draft hooks preserve the UUID when rebuilding session commands, export/import it for closed-window restoration, and import it during normal session restoration. The existing SessionService::AddWindowExtraData API can record incremental identity updates without changing session_service.cc. Proposed WindowIdentity/RestoreWindowIdentity helpers and kWindowIdentityKey in the sketch are not implemented yet; their declarations/definitions belong in Blanc-owned native files.

A versioned switch intent must include the source UUID. Recovery waits for session restoration to settle, selects exactly one same-profile matching window, and refuses missing/duplicate identities. It must not overwrite unrelated windows. Existing version-1 journals have no UUID and must keep their restricted fallback/refusal behavior, never infer an identity from URLs. Revalidate identity and live tab membership after asynchronous disk work.

Identity persistence needs ordering proof: scheduling AddWindowExtraData is not evidence of a durable save. Inspect the session backend's flush/acknowledgement facilities before permitting a switch that depends on a newly stored UUID. If there is no supported acknowledgement, record this as a remaining prerequisite; do not claim crash-safe identity from a queued command.

## Acceptance work

Two regular windows (including equal URLs/titles), private exclusion, normal session restore and closed-window restore must preserve/route only the intended UUID. Exercise session command rebuild, missing/invalid/duplicated identities, source-window closure, source navigation during disk work, crashes before/after staging/removal and during recovery, and journal failures with identity present. Keep an unrelated window byte-for-byte equivalent at the snapshot level. Verify no duplicate recovery or history pollution. All builds remain guarded increments in the existing output. Latency deferred; native input and the Electron diagnostic build pending.

## Approval

- [ ] Raise only the upstream file ceiling from 41 to 44; retain 120 hunks. Awaiting owner response to the explicit budget question.

No source/output/profile was changed for this design checkpoint. No native build or new runtime acceptance is claimed. This request does not change Task 0, baseline promotion or any other F12 gate.
