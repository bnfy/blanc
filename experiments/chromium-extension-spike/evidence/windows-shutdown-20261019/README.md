# Windows shutdown candidate repair — October 19, 2026

CI e4ea5f37: workspace-regressions Windows failed first launch shutdown at window-close-quit-smoke.mjs:107, process alive after10seconds. All39workspace scenarios and primary-close smoke passed. The log did not expose remaining windows or establish the cause.

Source inspection found final-close teardown using cooperative close() on the internal display-capture helper, whose existence prevents window-all-closed. Candidate repair uses destroy() only for that helper after no runtime windows remain on Windows/Linux. macOS policy and user-document close/checkpoint path unchanged. This closes a plausible helper shutdown stall; the historical CI cause remains unproven until runtime evidence.

Desktop regression gives the hidden helper a close-event veto before closing the visible window, requiring teardown independent of cooperative close. Timeouts now report remaining windows and uncaught log with a bounded inspector wait; deadline is unchanged and timer cleared.

28 targeted last-window/dock/lazy-capture unit tests pass; repository ESLint passes both edited files. Local official Electron attempts (baseline, injected veto, candidate) all failed with Playwright Target crashed before shutdown assertion; these are NOT desktop passes or proof of historical cause. No live test processes remained after checks. Windows CI required. No Chromium build, latency test or diagnostic Electron build. User explicitly requested this shutdown fix on #920; it touches shipping Electron main.js/test outside experiments.
