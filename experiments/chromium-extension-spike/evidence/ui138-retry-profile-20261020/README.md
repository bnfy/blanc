# Retry profile shutdown and mutation evidence

### October 20 — Retry-specific profile shutdown and tab mutations

Six clear/encrypted disposable schedules exercise the unchanged normal binary. Each first forces initial-window flush failure, then holds the next retry's fallback fsync. Full-browser shutdown is requested while held; releasing the flush allows the process to exit. Restart restores source, decoy and new window UUIDs/URLs. This covers full-browser shutdown and its profile lifetime, not hot deletion of one profile while another remains alive, nor a directly instrumented Profile destructor ordering claim.

Mutation schedules add two tabs and remove the captured original tab during the held retry, or add two tabs and pin the last tab (moving it to the front). After release, a current-state save acknowledgement is observed. An abrupt process crash followed by restart retains exact ordered URLs and pinned flags under the same window UUID, while source/decoy UUIDs and URLs stay unchanged. The pin schedule also requests active-tab selection, but active selection is not asserted across restart and is not qualified here. These are bounded structural changes, not arbitrary grouping, split/move-window, beforeunload, mutation during callback dispatch or every stale-callback branch.

All six task profiles/servers removed; retained preview untouched and unavailable to read-only verification, so its tabs were not reverified. Tests use cleanly primed disposable profiles, explicit clear/encrypted feature flags and disposable restart crash-bubble bypass. No native input claim. No native source change or compilation; final guard zero actions/5.17s. Previous measured footprint49 files/117 hunks unchanged within49/120. Latency deferred; Electron diagnostic build unapproved/unstarted. Hot profile deletion, actual provider/hardware failures, before-ack crash loss, first-ever profile initialization, unpersisted recent edits and broader mutation/lifecycle remain open.

Archive members: 174. SHA-256: `c892e32f0be4f92cec4e1d9f2b773670673db9c519dcf7c2f271c190d19ec655`.
