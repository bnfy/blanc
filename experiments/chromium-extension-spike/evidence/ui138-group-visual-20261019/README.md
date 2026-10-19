## October 19 group visual restoration checks

Two-tab blue/collapsed and pink/expanded groups were closed and reopened through the native
Recently Closed bridge. Then each was moved into a separate window, its expected collapsed
state explicitly set and recorded before shutdown, and the saved window restored after browser
restart. This separates group-entry behavior from the state saved for window restoration.

| Fixture | Restore path | Color retained | Collapsed state retained |
| --- | --- | --- | --- |
| blue-collapsed | group entry | True | False |
| blue-collapsed | saved window | True | True |
| pink-expanded | group entry | True | True |
| pink-expanded | saved window | True | True |

Closed-group restoration expands the blue group: collapsed state is NOT retained on that path.
Saved-window restoration retains it. Names, two URLs and group membership remain intact in all
four cases; blue/pink colors remain exact. The expanded control remains expanded. No repair or
Electron behavior comparison is claimed; whether group expansion is the desired product policy
remains open. Harness pass flags represent completion/structural checks, not all visual parity;
the separate groupVisual/windowVisual fields retain the failed collapsed-state comparison.

Initial named-color rejection and an overlapping shutdown/relaunch timeout are retained;
final runs use hex colors and wait for owned processes to exit. No fatal/dangling diagnostics.
No production change or compile; guard zero5.42s, native hashes unchanged;40files/97hunks not
re-enumerated. Disposable profiles/server removed; preview preserved. Native input pending,
latency deferred, Electron diagnostic build unapproved. All-color/mixed-group/private/crash
visual persistence and physical rendering remain gaps. Plan item4/F12/Task0 gates remain open.

29 hashed archive members; profiles/raw logs excluded.
