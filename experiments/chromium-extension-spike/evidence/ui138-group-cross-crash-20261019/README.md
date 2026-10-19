## October 19 cross-window group and crash persistence checks

Two regular-profile fixtures: blue/collapsed and pink/expanded, each with two URLs. A second
window contains a same-named decoy group. Closing the source group and restoring its entry
from the second window restores both tabs into the caller window with exact membership, name,
color and collapsed state; the decoy's native ID and visual fields remain unchanged.

Two owned-browser SIGKILLs per fixture then test separate persistence paths. The first happens
after closing the group and waiting six seconds; after normal restart the entry is restored
through Recently Closed. The second happens with the restored group moved to its own two-tab
window and its intended collapsed flag explicitly set/recorded before waiting six seconds.
After normal restart that saved window is restored through Recently Closed. Each kill verifies
the owned profile command and persisted Crashed marker. No OS power-loss, interrupted syscall,
automatic crash-restore or native recovery-button acceptance is claimed.

| Initial state | Cross-window group | Closed group after crash | Saved window after crash |
| --- | --- | --- | --- |
| Collapsed blue | pass | **FAIL: expanded** | pass |
| Expanded pink | pass | pass | pass |

The persisted closed-group failure is real, not treated as acceptance. The pinned upstream
`tab_restore_service_impl.cc` writer serializes title/color/saved identity/timestamp but no
collapsed bit; its reader explicitly constructs single closed groups with is_collapsed=false
(lines519-523). The bridge repair retains in-memory metadata but cannot recover an omitted
on-disk field. Whole-window restoration uses different metadata and retains collapse.
No production repair is included in this checkpoint. A compatible closed-group serialization
change is a follow-up; its upstream footprint must be audited before implementation.

The first cross-window assertion selected a group by duplicate name and failed despite the
correct restored state; corrected tests identify it by both tabs' native membership. That
harness failure and the strict persisted-collapse failure are retained. Final proof files use
completed=true for a finished observation and pass=false/outcome=collapsed-state-difference
for the known failure; a zero harness exit does not turn that case into a pass.

No native change or compile. Guard zero actions3.95s; binary hashes unchanged; footprint remains
40files/97hunks (not re-enumerated). Disposable profile/server removed; original preview tabs
and empty status preserved. Native input pending unlock, latency deferred, Electron diagnostic
build unapproved/unstarted. Private/multi-profile/multiple overlapping restores, unsaved groups,
mid-write/OS reboot and broader crash/visual paths remain unqualified. Plan item4 and earlier
F12/Task0 gates remain open.

31 hashed archive members, all verified; no profile or raw browser log committed.
