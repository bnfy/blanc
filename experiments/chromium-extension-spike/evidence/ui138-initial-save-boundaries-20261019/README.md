# Initial-window save boundary evidence

### October 19 — Initial-window save failures and pre-write crash boundary

Six disposable-profile schedules pass their bounded assertions on the unchanged normal binary, in explicit clear and encrypted session modes. Injected EIO at both macOS barrier-flush and fallback fsync sets `initialWindowSaveFailed=true`, while `initialWindowSaved=false`. Removing the fault leaves that failed status during the one-second observation; automatic retry is not implemented or claimed. The new window happened to restore after this flush-error process crash because writes had already reached the OS; that is not durability or power-loss evidence.

Holding the first selected Session write before its syscall keeps both saved/failed flags false. SIGKILL while held loses the new unacknowledged window in both modes, while the previously saved source and decoy return with exact UUIDs/URLs. This is a measured pre-save data-loss boundary, not a recovery pass for that new window. Paired release controls remain unsaved while held, then acknowledge success after release and restore the new window after SIGKILL. Marker PID/path evidence confirms the owned browser and expected clear/encrypted store. The crash helpers match either session store but the recorded selected path is explicitly asserted; release helpers select the exact store. No hardware or power-loss simulation is claimed.

Profiles were primed and cleanly closed before these tests. Restart uses crash-bubble bypass only in disposable profiles; native Restore remains untested. No Chromium source edit or compilation; final guard zero actions/5.16s. Last measured footprint remains49 files/117 hunks within49/120. All six task profiles and servers removed; retained preview untouched (host unavailable, tabs not reverified). Native input pending, latency deferred, Electron diagnostic build unapproved. Remaining gaps include retry after an initial save failure, actual provider/hardware failure, pre-ack recent edits, first-ever profile persistence and broader lifecycle.

Archive members: 170. SHA-256: `9008b921fedeb7ceba5717b3b29264ed11ea417518f426843714e76b90c5012d`.
