# Windows/Linux shutdown follow-up

## Shutdown teardown follow-up — 2026-10-19

Reproduced `TypeError: Object has been destroyed` in the official Electron binary: the helper's destroyed callback dereferenced `win.webContents` after BrowserWindow destruction. All three platform brokers now capture the original contents reference and revoke that authority without reading the dead window. The runtime lock hashes explicitly track this reviewed teardown change; this is not renewed screen-sharing/audio acceptance. Failure diagnostics now read the on-disk exception log independently of the dead inspector. The audit inventory was regenerated (only main.js hash changed).

176 focused tests pass. All three new lifetime regression tests failed before the fix; isolated native helper destruction reproduced the exception before and exits zero afterward for all three variants. Scoped ESLint and audit inventory checks pass. Full local unit attempt is retained, not claimed green: absent seed, release refs, dependency/environment issues and the then-stale inventory produced 21 failures. Full desktop attempts still stop with Playwright Target crashed before the shutdown assertion; actual Windows/Linux end-to-end acceptance awaits CI.

Reviewed all nine failed jobs on61d492e7: two shutdown jobs exit1; substrate has stale main.js inventory; both unit jobs and all four desktop jobs fail only the same two inventory assertions (complete provider logs checked after diagnostics truncation). No additional CI failure cause found. No jobs silently rerun.

No Chromium/native compilation, latency run, or diagnostic Electron build; existing official Electron used only for probes. Chromium footprint unchanged. Plan remains in progress, prior gates unchanged. Evidence: `evidence/windows-shutdown-followup-20261019/`.
