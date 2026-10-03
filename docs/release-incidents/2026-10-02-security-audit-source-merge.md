# Security-audit source merge authorization — October 2, 2026

This records source integration for [PR #471](https://github.com/bnfy/blanc/pull/471), [#472](https://github.com/bnfy/blanc/pull/472), [#473](https://github.com/bnfy/blanc/pull/473), [#474](https://github.com/bnfy/blanc/pull/474) and [#475](https://github.com/bnfy/blanc/pull/475), not a public release or deployed Worker change.

The owner requested **“squash merge”** after the remediation, code-review findings and their corrections were reported. That latest instruction authorizes merging the reviewed source through the protected PR workflow despite the previously stated pending affected-machine gates. It supersedes the earlier draft delivery status; it does not certify an unperformed test or authorize a release or deployment.

Missing evidence and risk remain explicit: real Ubuntu 22.04/24.04 desktop sessions and the signed staged Windows **Restart Now** handoff beginning in public v1.25.0 have not been completed. Hosted namespace tests, signed packaging, real PowerShell verification and synthetic retry tests cannot establish the startup, window-focus or installer handoff behavior on affected physical machines. The Linux refusal policy may stop browsing on restricted user systems, and a Windows handoff defect could prevent installation or relaunch. These checks remain pending for release; no earlier waiver is carried forward.

Automated evidence before source integration includes all 2,006 unit tests, lint and substrate, the Ubuntu 22.04/24.04 launcher/namespace matrix, the private Linux replacement rehearsal and [native Windows run 37040930798](https://github.com/bnfy/blanc/actions/runs/37040930798) at `88280bbea46e5a68b264741eb8461131e94d2e4a`. Required checks must pass again against the current protected main before each squash merge. Source changes inherited from newer main receive their own integration checks; historical candidate evidence is not relabelled as a test of the final merged source.

R3 locator-only sync authorization and R5 non-atomic concurrency/deletion risks remain open. Source integration is neither acceptance of those risks nor independent audit closure. Public desktop remains v1.25.0 until a separately authorized release; the sync-limit Worker change remains undeployed. No signing identity, encryption format, sync identity or existing user-data migration is changed by this authorization.

## Integration validation

Integrated candidate `469212495628bcde55d36bd42292e9479a900bb6`, containing
current main plus all audit code changes, passed lint, all 2,015 unit tests and
`substrate:check`. Local macOS modified-link validation passed 80 click,
sandbox and referrer cases plus three restricted-tab recreation cases at Linux
branch `5982fb9a7a2a772a6ed38bda0d1a9d920d19c001`. Its hosted Windows/Linux
modified-link checks and private Linux updater rehearsal
[37044854067](https://github.com/bnfy/blanc/actions/runs/37044854067) also passed.
These are synthetic/local or hosted checks, not physical desktop confirmation.

## Source milestones

| PR | Subsystem | Squash commit |
| --- | --- | --- |
| [#473](https://github.com/bnfy/blanc/pull/473) | Linux launch enforcement | `10a9e8d715c3b140772df504ded0b20d6e512223` |
| [#471](https://github.com/bnfy/blanc/pull/471) | Font-recipient guard | `5d2acc932b55ee86f4c2bc4d4ab029a4c1c7dbd5` |
| [#472](https://github.com/bnfy/blanc/pull/472) | Windows installer trust and retry recovery | `c084cf1450185854889fee7b6e65e18e6b2253da` |
| [#474](https://github.com/bnfy/blanc/pull/474) | Compatible sync v1 request limits | `90cdccebbf0ca2bd0d12c7d312c1be506183a527` |

All four code PRs passed their refreshed checks on protected main. Merged
app/Worker source `90cdccebbf0ca2bd0d12c7d312c1be506183a527` matches tested combined
candidate `469212495628bcde55d36bd42292e9479a900bb6` byte-for-byte across
code, scripts, tests, dependency manifests and workflows. PR #475 records the
source inventory and milestones; its documentation commit is not a release
identity. CodeQL alert 61 was reported fixed at 18:12:13 UTC after PR #471;
this closes that specific test guard alert, not the audit findings.
