# Native execution crash and background recreation — October 18, 2026 EDT

## Observed result

`run07/report.json` passes the strict `native-recovery-verify.mjs` proof:

- Real debugger pause inside native ExecuteScript, one pending native lease;
  actual filter reload held before Page.crash. After the renderer crashes,
  pending becomes zero, reload completes and the replacement document has
  first-inline protection and an untouched marker.
- Reloading the actual extension background document produces a new JS realm
  and ready engine. A new page passes first-inline protection, allows the
  authored allowed request and blocks the authored blocked request.
- Four live native/upstream drain and timeout/retry schedules pass. The BFCache
  restore and queued-crash targeting regression also pass; prerender activation
  remains a gap, not ordinary-navigation acceptance.

The pre-fix run03 shows actual crash with pending still one. Chromium retains a
valid weak document for the crash page. PendingDeliveries now retires a lease
only if the document is absent or its renderer frame is not live. It does not
retire merely inactive/BFCache documents or use a timeout as completion proof.

Background recreation here is a **document reload**, not background process
crash, automatic restart policy, or proof that live work survives lost provider
state. Original caller identity, asynchronous side effects and broader lifecycle
and containment remain open. Latency was not measured. Electron diagnostic build
remains unapproved and unstarted. No production or baseline promotion.

## Validation and build

299 tests and 145 scoped module lint checks pass. One preserved-output guarded
incremental build: 35.07 s wrapper, 31.39 s Siso, six executed steps, one initial
planned action. Final guard: zero. Fresh footprint: 40 upstream files / 92 hunks,
within 40/120 budget at its file ceiling. No toolchain, GN args, cold output,
156 checkout, permanent profile or original tab changes.

## Evidence limits and retained failures

`record.tar.gz` contains reports, fixtures, final harness/verifier sources,
native sources, build/test logs, invocation timing, source audit and GPL
component diagnostic deltas. `inventory.json` hashes every member and archive.
The unchanged ordinary payload is referenced with a complete file-hash map in
`payload-reference.json`; diagnostic changes and upstream license are archived.
Binary hashes describe this newly compiled build.

Attempts01–06 are retained, not promoted to complete passes.01 stalled without
stage records and required exact-profile termination; cleanup was verified.
02–03 expose the old native lease failure.04–05 used obsolete post-crash
renderer/debugger handles.06's native recovery passed but its background check
raced the old ready realm.07 requires new-realm readiness atomically. Historical
intermediate sources were not all saved; source03 and the final sources are
included, so only final07 is the exact-source acceptance run. The first ordering
proof command mistakenly supplied a file where a directory was required; the
corrected proof passes without rerunning or changing the runtime evidence.
All disposable profile/certificate roots were removed. No private keys included.

The requested Electron 1.38 UI/UX migration is next; its source inventory is
[`ui-refresh-20261018.md`](../../ui-refresh-20261018.md), not implemented here.
