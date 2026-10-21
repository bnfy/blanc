# uBO first-inspector readiness — October 21, 2026

PR #920 head b741855e macOS Intel desktop job119313770227 failed at test/desktop/ublock-origin.mjs:375: no inspector frame after ten seconds plus fifteen seconds diagnostic grace. The native injection returned ok:1 +10ms, selected/expected tab both3, showdom active, no late frame. Intel unit tests passed. Full provider log retained locally at /private/tmp/blanc-ci-b741855e-intel.log.

The first-open fixture reloaded the inspected page and used logger network output as readiness. That does not prove the asynchronous cosmetic engine required by the upstream inspector exists. The harness now waits up to ten seconds for the existing fixture scriptlet and procedural cosmetic filter to take effect in the reloaded document before activating the logger and opening its inspector. The inspector timeout is unchanged; disabled/broken filtering still fails at the precondition. The later delayed-bootstrap navigation/reconnect race remains exercised.

This is a targeted readiness correction. The CI log does not expose the inspector's internal early-return state, so exact causality for the Intel failure remains inferred; current-head Intel confirmation is required. The unchanged local baseline passed, so local success alone is not proof that the intermittent CI failure is eliminated.

No product/native code changes or builds. Latency benchmarking remains deferred; the Electron diagnostic build remains unapproved/unstarted. Existing Electron desktop acceptance uses disposable profiles and the installed runtime. Incidental harness timing output is retained, not a latency qualification. Separate profile-deletion cancellation failures and Google upgrade baseline work remain uncommitted and untouched.

Validation: unchanged baseline and patched full local uBO desktop suites both exit0. Patched first inspector appears, delayed-bootstrap reconnect succeeds, and full blocking/tools/profile/recovery/offline-restart suite passes. Syntax, scoped ESLint and diff whitespace checks pass. No CI rerun requested.
