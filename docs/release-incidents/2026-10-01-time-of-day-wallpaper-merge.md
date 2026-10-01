# Time-of-day wallpaper merge authorization — October 1, 2026

PR #453 adds the free, optional local-clock wallpaper switcher. The owner approved the artwork, requested code review, and asked for the review finding to be fixed. The macOS close/reopen timer regression was reproduced before the fix and passed afterward. All six PR checks passed on `d0c53b5665a9cab9f0df09213bcc22ae4d78c548`.

## Owner merge instruction

The owner was told that Windows/Linux desktop confirmation remained pending and that the PR was still a draft. After reviewing the implementation and the completed fix, the owner explicitly instructed: “squash merge”. That instruction authorizes the merge despite the outstanding manual desktop acceptance hold. This record preserves the exception for merging only; it does not mark any unperformed check as passed or authorize a public release.

The missing evidence is installed Windows/Linux wallpaper acceptance across phases, layouts and theme/private styling, including activation, resume and hidden-tab timers. Hosted validation does not rule out platform-specific appearance or lifecycle differences on real desktops. Windows/Linux package validation run `36917674758` passed on initial wallpaper commit `f8bd3fa3`; the follow-up macOS close fix was validated locally with the Electron regression, 25 focused unit tests, lint, substrate guards and startup recovery through Dock reopen.

## Release gates

Manual Windows/Linux acceptance remains unperformed. Complete it, or obtain a separate explicit release waiver after explaining the remaining evidence and risk, before tagging or publishing a release. The ordinary protected-branch checks and existing release verification remain required. No public release, updater publication, site deployment or Flatpak launch is authorized by this merge instruction.
