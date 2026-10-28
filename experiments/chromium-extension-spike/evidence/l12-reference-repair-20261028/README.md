# Isolated reference delivery repair

The owner resumed only the unresolved L12 reference repair/checks. Original authenticated Blanc 1.36.0 ASAR remains unchanged (SHA-256 `5b4b78c8790c3af193a2c893564c674f2b05c75481d1b5673c0428dde60203ab`). Each run extracts a fresh copy. This is a corrected comparator, not a claim about shipped 1.36.0 or an Electron runtime rebuild.

The correction enables Ghostery extended selectors, rejects incompatible cached/seed configurations, bundles the original reference selector evaluator into its sandboxed preload, and delivers scriptlets synchronously through Electron's main-world execution API. It does not relax CSP or expose an IPC bridge to page JavaScript. The main process derives URL from the sending main frame and checks attached/enabled session and site exceptions.

Attempt 1 retained 40 failures because the packaged engine seed disabled extended selectors; the early scriptlet check passed. Attempt 2 passed all 80 assertions (regular/private, two repetitions), including the formerly disputed protective outcomes and neutral/nonmatching controls; no renderer errors were recorded. These use the same authored rules and page, not the production list as evidence for every website.

Review then identified that initial CSS must use the reference's existing ownership/cleanup registry. The final ownership correction passed all 56 checks in attempt 3: the same affected delivery cases plus disable/re-enable and site-exception cleanup in regular/private profiles. No renderer errors were recorded. Both profiles produced identical hashes for all three corrected files. Full-corpus available-load timing for this exact corrected source completed: all 312 pages and 12 repetitions validate, with 6,406 observed requests each. The source hashes in both profile records match the authenticated repair. See `timing-report.json` and `timing-page-manifest.json`. Electron values use the JS provider-observer interval and must not be compared as if they were native hook-to-applied-decision values. Original reference failures and all local fixture profiles are retained durably under `Chromium Preview/evidence/l12-reference-repair-20261028`.

No Chromium source, signed candidate, original reference artifact, Google baseline or permanent profile changed. L12 remains open.

The corrected three-file source packet and policy report are now Sigstore-authenticated in `authenticated-packet/`. Verification passed for `anthony@bnfy.me` with issuer `https://github.com/login/oauth`; all three checksum entries and the source archive readback match. The original reference ASAR is not modified or republished.

## Final verification

The final authenticated repair now passes **112 browser assertions** across two regular/private repetitions with identical outcomes and source hashes. Four direct CSS-owner checks additionally verify clear/clearAll, disabled insertion, and removal of a pending insertion after permission revocation. The driver failure in attempt 4 is retained: it issued a reload while the native command's deferred reload was in progress. The driver now awaits that command's load event; repair source and assertions were unchanged. Attempt 5 completes the second repetition.

Both native and corrected-reference timing evidence includes `timing-pages.jsonl.gz`: each line preserves the exact raw page record and its SHA-256. All 312 records in each archive were read back, hash-verified and checked for valid results. No failed observation was omitted from its original run.
