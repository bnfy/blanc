# v1.27.0 release acceptance: loading-fixture readiness

The foreground release attempt from merged source `73291caf` stopped before
signing, creating a tag/draft or publishing. All 2,225 unit tests passed. The
broader acceptance suite passed 166 of 168 scenarios; workspace partial-save
recovery and quiet-tab Glance failed after both allowed attempts.

A diagnostic run reproduced both failures without changing production code:

- Workspace returned `protected-pages`, reason `active-page`. Its fixture draft
  was fully loaded, but the reset-created New Tab still had `isLoading: true`.
  The intended injected session-commit failure had not been reached.
- Both Glance fixture titles were present while their tabs and native contents
  still had `isLoading: true`. They used separate renderer processes; shared
  renderer protection was not the cause. Quieting correctly refused the loading
  reference tab.

The workspace commit-failure step now waits for all its fixture tabs to finish
loading before injecting the original write failure. The Glance fixture waits
for both titles and completion of loading before asserting quiet eligibility.
No sleeps, production guards, deadlines or assertions were weakened. The
original disk-failure cause, recoverable workspace identity, preserved draft and
actual quiet/wake behavior remain required.

The seven affected workspace/Glance scenarios and all 46 steps pass with
`--retry 0`. The complete suite and protected-branch checks must pass before
restarting the release. The version remains unused: no v1.27.0 tag or draft
existed after this failed attempt. These are fresh isolated fixture results;
no personal data or raw browsing logs are included.
