# Ctrl/Middle-click physical packaged-app check waiver — October 2, 2026

This records the merge gate for [PR #470](https://github.com/bnfy/blanc/pull/470), fixing [issue #468](https://github.com/bnfy/blanc/issues/468). It is not a public release record.

Automated evidence at code commit `57d17091e5954dfee8a04e8e1c4baa487e601a5a`:

- The native modified-click regression passed all 80 click, sandbox, and referrer cases plus three restricted-tab recreation checks on [Ubuntu 24.04](https://github.com/bnfy/blanc/actions/runs/37038782032/job/110945690800) and [Windows](https://github.com/bnfy/blanc/actions/runs/37038782032/job/110945741916), using official Electron 44.5.1.
- The [Linux launch/window smoke](https://github.com/bnfy/blanc/actions/runs/37039467562/job/110945720507) passed DNS startup and window geometry persistence.
- All required PR checks passed, including the full unit suite, lint, and OAuth compatibility.

**Unperformed evidence and risk:** the fix has not been verified in the installed packaged app on an affected physical machine. Hosted Electron tests cannot rule out differences in packaged-app behavior, system input handling, or window focus on that machine. These checks remain unverified, not passed.

After that missing evidence and risk were stated, the owner answered **“Approve waiver for merge only”** to the explicit question asking whether to waive the physical packaged-app check for merging PR #470 only.

This written approval waives that check solely for merging PR #470 after the required checks pass. It does not waive physical packaged-app verification for release, updater handoffs, tagging, or any other public release gate, and it does not authorize publishing a release.
