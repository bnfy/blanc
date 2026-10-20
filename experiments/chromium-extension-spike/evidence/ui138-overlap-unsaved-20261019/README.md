## Overlapping restore and unsaved page state — October 19, 2026

A held actual Session read overlaps two new regular-window creations and closure of one of those windows. The journal remains while held. After release, the original source UUID/URLs recover, the original and surviving new decoys remain, saved Spaces are unchanged and the journal clears. Two bounded runs pass. This is one delayed session restoration with concurrent window activity, not two independent overlapping SessionRestore operations or arbitrary interleavings.

A live authored form with a beforeunload handler refuses switching before any journal/tab/store mutation and preserves its typed value and 700px scroll. After removing the handler and crashing the owned browser, a synthetic valid v2 intent exercises source rollback. The settled-session repeat restores the saved source structure, but the form value is empty and scroll is zero: **unsaved form and scroll recovery fail**. The harness's procedural pass does not mean those acceptance cells pass. The recovery record carries URLs/group/pin/active structure, not live document state; full Spaces acceptance remains open.

An initial immediate crash attempt timed out waiting for three windows and journal clearance. It is retained as unresolved; adding four seconds of session-settling before the repeat is a narrower test, not a product fix or proof of the cause. Nonowner recovery-status errors also remain visible after successful source recovery. No arbitrary overlap, history/form serialization or power-loss claim.

Only disposable profiles and the public mock keychain were used. The Session read interposer is confined to the disposable launch; the final restart uses the normal binary without injection. Explicit crash-bubble bypass is test-only, not physical Restore acceptance. Test helper compilation is not a Chromium build. No product changes or native compilation; final guard zero actions/4.04s. Prior measured49files/114hunks unchanged within49/120, not re-enumerated. Owned browser/server/profile removed; retained preview untouched/unavailable.

Native input pending, latency deferred, Electron diagnostic build unapproved/unstarted. Remaining: exact concurrent restoration scheduling, immediate post-restore crash behavior, unsaved document state, real provider/hot-profile/power-loss qualification. Evidence: `evidence/ui138-overlap-unsaved-20261019/`.

39 archive members SHA-256 verified. No new unit-test count claimed.
