# Pending-save group, split and owner checks — 2026-10-20

Four final schedules on production2cc16f2a reach46diagnostic checkpoints: three pass and one fails. No product repair or native compile in this checkpoint.

- Group rename during held retry Session write survives immediate post-ack crash/restart (12 checkpoints). This is bounded evidence for rename, not all group mutations.
- Split ratio changes live from50/50 to35/65 while the actual Session write is held. The fixture waits until35/65 is observed, then releases the write, awaits successful close acknowledgement and immediately kills the browser. Restart restores50/50. Failed assertion after10diagnostic checkpoints. The structural signature does not include split ratio, so this mutation has no explicit revalidation protection.
- A5.5second settled control restores35/65 (13 checkpoints), confirming delayed persistence rather than permanent inability to save it.
- Requesting window destruction while the retry save is held is confirmed by one remaining host. Release does not crash the browser; the decoy window survives immediate crash/restart and accepts a fresh history close (11 checkpoints). This qualifies bounded liveness/decoy recovery, not destroyed-source restoration or destructor ordering.

Initial ratio attempt inspected the snapshot before layout application and failed before crash; retained separately, excluded from results. Initial owner attempt missed the remaining content/blank tab and timed out with two hosts; retained and not called owner-destruction acceptance. Final fixture explicitly closes disposable content targets excluding decoy/host, then any remaining about:blank and verifies one host.

Raw logs remain in corresponding /private/tmp/blanc-save-lifecycle-* roots. Profiles removed after process-exit verification. Test-only crash-bubble bypass and scoped syscall interposition remain fixture-only. Retained preview untouched. Final no-compilation guard schedules0actions, prior upstream54files/128hunks unchanged. Broader grouping/collapse/color/membership, split focus/layout variants, private/owner ordering and physical input remain unqualified. Latency and Electron diagnostic build remain pending.
