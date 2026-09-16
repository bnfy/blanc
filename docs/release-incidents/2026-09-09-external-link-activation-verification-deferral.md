# External-link activation merge verification deferral

**Date:** 2026-09-09
**Scope:** [PR #312](https://github.com/bnfy/blanc/pull/312)
**Decision:** Squash merge may proceed after CI passes; the remaining native
verification is deferred for merging, not waived for release.

The owner requested “squash merge” after the PR summary explicitly identified
the fresh signed-candidate and affected-Mac checks as pending. This records that
merge authorization without treating the missing checks as passed.

## Verified evidence

- On the rebased source with Electron 44.2.0, all 1,609 unit tests passed.
- The Electron external-link lifecycle and shared tab-handoff smokes passed,
  including delayed-chrome hide/minimize cancellation and profile routing.
- An earlier signed candidate, before the rebase, passed the standard macOS
  LaunchServices matrix with ten hidden and ten minimized repetitions.

## Deferred evidence and risk

- Build and verify a fresh signed candidate from the merged source.
- Confirm an actual email-link click on the affected Mac and delivery from
  another desktop/full-screen Space. The owner's exact hidden/minimized
  failure was not reproduced in the isolated baseline.
- Complete the background-only LaunchServices matrix on the fresh candidate;
  the earlier repeat was interrupted when Terminal became foreground.

The exact reported failure or a native timing regression could remain despite
the passing isolated checks. These cases remain unverified. Merging does not
authorize a release, and this record does not waive the ordinary release gates.
Complete the deferred checks before tagging or publishing a release containing
the fix. Detailed prior evidence is in the
[verification record](../verification/2026-09-09-external-link-activation.md).
