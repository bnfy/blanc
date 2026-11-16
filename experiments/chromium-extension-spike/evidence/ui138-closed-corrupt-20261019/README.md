## October 19 Recently Closed corruption and torn-record checks

Five isolated cases mutate Tabs_* in both plaintext and encrypted session stores, with the
owned browser stopped: intact control, invalid eight-byte header, final-byte removal,
half-file truncation, and missing files. Original sizes and hashes and changed sizes/hashes
are recorded. Session_* files are not mutated. Truncation models a partial write; no live
write interruption, concurrent writer, fsync/durability, disk-full or power-loss claim.

| Case | Original closed fixture entries visible | Fresh entry persists and reopens |
| --- | --- | --- |
| intact | 1 | pass |
| invalid-header | 0 | pass |
| tail-cut | 0 | pass |
| mid-cut | 0 | pass |
| missing | 0 | pass |

The intact control establishes saved Recently Closed data. Loss of old entries after corruption
is recorded as data loss, not recovered history. In every case the browser remains usable;
clear/new-tab/close creates a fresh native entry, a clean restart preserves it, and reopening
through the native bridge yields the expected URL. The seed private-tab control does not
appear in exposed closed entries. No fatal or dangling-pointer diagnostic across the run.
This does not prove absence of private data from every underlying byte or hidden window entry.

No production changes or compilation: guard zero4.26s, native hashes unchanged; footprint
40files/97hunks not re-enumerated. Disposable profile/copies/server removed and preview original
tabs preserved. Native input pending unlock, latency deferred, Electron diagnostic build
unapproved/unstarted. Larger history/group/window entries, invalid command lengths, disk errors,
concurrent writes and native recovery choices remain gaps. Plan item4 and F12/Task0 gates open.

31 hashed evidence members; profile and session binaries/raw logs excluded.
