# Named Workspaces merge waiver — September 13, 2026

PR #340 changes platform-sensitive Electron window, tab-residency, and persistence behavior. Product revision `d06981da45b879b65a8e3fed46bb9c21c9603b49` passed 1,790 unit tests, the full 152-scenario / 908-step desktop suite, the focused 11-scenario / 43-step Named Workspaces suite, Parity guards, and CodeQL.

Current-revision Windows/Linux validation, a signed macOS package build, and affected-machine confirmation were not completed. The available Windows/Linux, signed macOS, and packaged-migration evidence covers the earlier product revision `970bd6f963fdc18b2337107a0cbb640a0b914897`, before the final transaction fixes. The remaining risk is a packaged or platform-specific regression in secondary-window close rollback, partial-save reporting, or workspace click handling that the local Electron and unit suites did not expose.

After this missing evidence and risk were stated, the owner explicitly approved waiving those checks and accepted the risk for the squash merge of PR #340. The waiver authorizes this merge only. Current-revision native/package validation and the other documented release gates remain required before selecting, tagging, or publishing a release.
