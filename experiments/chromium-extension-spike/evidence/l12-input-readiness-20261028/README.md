# L12 input repair and prospective measurement tooling

October 28, 2026. L12 remains NO-GO; no acceptance criterion changed.

## Repaired stale timing inputs

Both saved timing configurations referenced earlier engine directories. The new config uses `artifacts/procedural-groups-combined-20261028`, matching the current signed source `73217ee50b6f2e4eaa8eb8b27f75df8c2cff9bd2`. The signed archive remains SHA256 `c788b98acc46637fedcfe69c72159561471d569e12f3a8191a7b5c2b5182adfd`.

The read-only `../../tools/verify-timing-inputs.py` verifies the receipt's 262 file hashes, native-only selection, original idle admission, native trace configuration, absence of diagnostic overrides, production engine/manifest equality with the signed candidate, and corpus count (5,123 candidates plus four controls). Separate preparation verified the current renderer bytes embedded in the native framework. Changed digest, Electron selection, and disabled idle admission negative controls reject; see verification.json.

This is an input change detector, not an authenticated receipt or a benchmark launcher. The configuration points to the native build output, not the signed executable. Matching signed engine assets does not confer signed-runtime acceptance. Playwright's complete dependency tree is not frozen by this receipt. Before an authorized measurement, verify runtime dependencies, rerun this read-only verifier, and retain the runner's explicit `--require-idle` admission. Latency remains deferred; no browser or measurement launched.

## Prevent loss of future rebase accounting

`../../tools/rebase-effort.py` records explicit start/stop intervals for owner, agent and machine separately using monotonic time and a boot identity. Append operations lock and fsync the ledger. Reboot-crossing intervals remain uncertain; unfinished intervals are not counted. Synthetic controls verify these cases and reject unmatched stops and overlapping starts. No real owner attention was recorded or invented.

Use a durable ledger outside Git for the next genuinely necessary rebase. Record source/target pins, patch inventory, purpose and build admission alongside it. Owner intervals require actual owner activity; agent elapsed time is not a substitute. Run `python3 tools/rebase-effort.py LEDGER report` to inspect totals. Historical human effort remains unknown, and no dummy rebase or cold build was started.

## Remaining dependencies, without waivers

`remaining-reference-cases.json` extracts the existing 44 mismatches without running tests. Native protection passes these retained outcomes; reference procedural delivery and first-inline timing do not. Preserve the neutral controls and existing comparator evidence. This is a reference-side work dependency, not a reason to weaken Chromium; Electron remains paused.

The original >=90% idle timing measurement is still missing. Actual operating-cost sources and prospective active rebase effort are also missing. The connected GitHub fetch tool rejected the cache-usage API endpoint as unsupported, so no storage/billing amount was inferred. No CI polling, status-only commit, signing operation, build, profile mutation or passed-suite rerun occurred in this checkpoint.
