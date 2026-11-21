## October 19 closed-group persistence repair

The pinned closed-group writer now appends the collapsed boolean after its existing timestamp.
The reader optionally reads that trailing field, initialized false for legacy records. The
existing record prefix/command ID is unchanged; old readers ignore the extra field. This
compatibility conclusion is source-backed, not a legacy-binary runtime acceptance claim.
Already-written old records have no recoverable collapse bit and still restore expanded.
The transform has exact anchors and independent presence markers for repeat preparation.

All six strict final-binary native bridge cases pass: collapsed blue and expanded pink,
each restored cross-window, from a persisted closed-group entry after SIGKILL, and as a
saved whole window after a second SIGKILL. Exact colors/names/two-tab membership survive;
the same-named decoy stays unchanged. Four kills verify the owned profile and Crashed marker,
with bounded six-second persistence waits. This repairs the previously archived failing
collapsed closed-group case. No native-button, power-loss or mid-write syscall claim.

One guarded incremental build:30.42s Siso/35.98s wrapper,six steps. Final guard0/6.00s.
Fresh footprint **41 upstream files / 100 hunks**, within the narrow October19 amendment
(41/120) applying the owner's earlier allowance to raise the40-file ceiling if needed.
Only new upstream path:components/sessions/core/tab_restore_service_impl.cc. No other budget,
scope, GN/toolchain/cache or acceptance relaxation. Future patch-consolidation audit remains.
Eleven patch-counter tests and two-module scoped ESLint pass; syntax and whitespace pass.
Initial npx ESLint attempt could not resolve the registry; existing local ESLint was used.

Disposable profile/server removed; final preview restarted with original two tabs/empty status.
Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Legacy/malformed trailing field runtime, private/multi-profile/unsaved/multiple concurrent
restores, mid-write/OS reboot and broader lifecycle/visual cases remain gaps. EarlierF12/Task0
and planitem4 remain open. Cold-build column unchanged; this is routine repair/testing.

41 hash-verified archive members; profiles/raw browser logs excluded.
