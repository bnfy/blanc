# Loading-tab close history acknowledgement — October 22, 2026

The Island now distinguishes a destroyed initial/uncommitted tab from a tab that has navigation history. Chromium deliberately excludes the former from TabRestoreService. When that service has no entries, the Island rebuilds and flushes the remaining open session instead of demanding a flush of a nonexistent history file. Cancellation remains a normal outcome. Existing history entries and outstanding partial-close repairs retain their original persistence path; backend flush failure semantics are unchanged.

The prior warning is retained in [the previous close control](../pending-tab-shutdown-repair-20261022/old-close.json). Five schedules pass on the minimal repaired, self-contained ad-hoc package:

| Result | Check |
| --- | --- |
| `loading-close.json` | Actual held GET, close without rejection, clean restart retains other tabs/order/selection; closed pending URL is not requested again. |
| `cancellation-history-final.json` | Real native beforeunload prompt dismissed; close resolves quietly and retains the tab. Subsequent close, Recently Closed restore and restart retain the committed tab. |
| `history-eio.json` | Injected native encrypted Tabs-file flush EIO still rejects acknowledgement. |
| `session-eio.json` | Injected native encrypted Session-file flush EIO still rejects the new no-history acknowledgement path. |
| `native-crash-control.json` | SIGKILL immediately after acknowledged close; explicit native Restore Tab recovers the surviving window/order/selection, with no closed loading tab. |

Crash recovery is explicit in this fixture, not automatic. The first `loading-close-crash.json` and later `final-crash.json` wrongly assumed that the window must automatically reopen. They show only the new blank window. Native Restore Tab on the original repaired package recovers the saved window separately, proving the data was retained. A speculative preference-write addition did not change automatic reopening and was removed; the normal binary was restored incrementally. No automatic crash-restore repair is claimed. The first cancellation fixture also wrongly expected a returned boolean from the host API, which intentionally returns no value; that failed assertion is retained in `cancellation-history.json`. The corrected check requires successful completion and retained-tab state.

`final-*` results are the intermediate preference experiment, not the final production implementation. Its four non-crash schedules pass, but its automatic-crash assertion fails; they are retained rather than counted again. The final implementation matches the first package's source SHA in `artifact-verification.json`. All package payload hashes and helper identities match its manifest. Fault injection is restricted by exact disposable profile path and armed only around the tested operation; it is not part of the product.

Seven capture tests, eleven patch-counter tests, one launcher test, script syntax and diff checks pass. Fresh upstream footprint is 59 files / 142 hunks. Initial incremental build: 42.81 seconds; preference experiment: 48.36 seconds; final minimal-repair restoration: 43.74 seconds. Final guard: zero actions. No cold build, latency test, Electron build, permanent-profile modification or dev restart. Google baseline and dev tab snapshots match before/after. The tested app ZIP is retained locally; disposable app copies/profiles are cleaned after process checks.

Host is macOS 27.2; this does not qualify the approved macOS 26 preview target. Physical input, automatic crash-reopening policy, the previously intermittent restored-profile stall, private/managed/multiwindow permutations, and signed candidate isolation remain open. Launch progress stays 1/12 (8.3%), delta 0.
