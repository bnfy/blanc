# F39 Windows and Linux packaged-verification deferral

**Date:** 2026-09-07
**Scope:** PR #205, Bring Your Tabs (F39)
**Decision:** Merge may proceed with Windows and Linux source-session behavior explicitly unverified.

## Verified evidence

- The corrected direct open-tab implementation passed its unit and runnable F39 desktop acceptance
  suites before the PR refresh.
- A Developer ID-signed macOS candidate exposed installed Chromium-family profiles and read an
  explicitly selected real Brave profile after Full Disk Access was granted.
- The migration remained read-only until apply, kept Favorites separate, and was dismissed before
  creating imported tabs during the packaged macOS verification.

## Deferred evidence

- **Windows:** locked-session quit/retry and the post-exit read have not been verified in a packaged
  Windows build.
- **Linux:** an installed Chromium-family cleartext session read has not been verified in a packaged
  Linux build.

The product owner reported that Parallels Desktop was too unreliable to produce trustworthy Windows
or Linux results and explicitly authorized proceeding with the deferral. These cells remain
unverified—not passed and not failed. F39 remains `PLANNED` in the parity record, and release or
marketing claims must not say Windows/Linux open-tab migration has been verified.

## Follow-up

Run both packaged gates when stable native or virtualized test environments are available. Any
failure is release-blocking for a platform-specific verification claim and must be fixed or recorded
in a new dated waiver before that claim changes.
