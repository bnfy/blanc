# Signed cross-origin navigation repair — October 27

Source `3d5d46a3c09fa13c6127e8e8abb65f6b3477f87c` packages the previously verified native repair. The Developer ID signature, Apple notarization submission `97e85148-7b49-42eb-930b-6d9bccbd2f7e` (Accepted), stapling, ticket validation, strict verification and Gatekeeper assessment pass. Stapled archive SHA-256: `6f533ca0e6d24186291e8ce19b8c1117c3ef4c8bf3a1f83498607a8ec4d374a2`.

All 20 affected regular/private cross-origin main-frame replacement checks passed on the notarized app, including destination commit, request/profile attribution and absence of the observed network-service crash; both browsers exited normally. Launch logs retain other Chromium diagnostics. Only the two owned test profiles were removed after process checks. Previous passed suites were not rerun.

The final audit found 17 ARM64 executables and 10 Preview identities, and matched signed pre-notary hashes after stapling; the frozen audit records all eight certificate keys. Comparing disposable signature-stripped framework copies with the tested native output found only three changed bytes, within the Mach-O `__LINKEDIT` virtual-size field. Of 74 existing UI/blocker files, 72 match the prior signed candidate byte for byte; the other two HTML files match after normalizing their preview-build metadata tag.

This is bounded affected-path qualification, not aggregate F12, Decision 2, distribution or release approval. The previous signed candidate and unrelated Google baseline remain untouched. Electron remains paused and latency deferred.
