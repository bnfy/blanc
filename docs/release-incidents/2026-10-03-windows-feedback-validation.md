# Windows reliability candidate — merge approval, October 3, 2026

This records the owner decision for [PR #499](https://github.com/bnfy/blanc/pull/499).
It is a private-candidate merge record; no public release is authorized here.
The implementation/package candidate is `e56273752995c4730cdf7787039d61ea7c7ffe6d`.
The [verification report](../verification/2026-10-03-windows-feedback.md) retains
exact artifacts, SHA-256 digests, superseded failures and bounded test results.

## Disclosed evidence and remaining risk

Windows testing used the exact private x64 candidate in Parallels Windows 11
ARM64 emulation, with owner-authorized native keyboard input. The browsing,
tab/shortcut/Settings sequence passed; normal exit and restoration of all 116
original application files passed. The original user profile was never launched.
Automated native Windows/Linux/macOS, Store browsing and private package checks
passed. All twelve checks also passed on the report-only head
`8ff013a4abaec8a4f2b1197454bad47afc1a7180` before updating from current main.

Interactive Linux desktop regression remains unperformed. The disposable x64
Ubuntu 22.04/24.04 attempts stopped at desktop setup/OS launcher failures before
Blanc testing. Actual Blanc sandbox refusal in those guests was not observed.
No physical Linux desktop is available. Hosted Ubuntu checks and Windows VM
results do not establish machine-specific physical desktop behavior. The
reporter's broader Windows freeze remains unreproduced. Immediate typing before
a new address panel is ready remains an unclaimed limitation. Those risks were
retained in the report and disclosed before approval; no unperformed test is
marked passed.

## Owner authorization

The assistant's immediately preceding message identified acceptance of the
Windows VM evidence and an explicit waiver of the incomplete Linux desktop test
as the remaining owner decision before merge, citing AGENTS.md and stating that
Linux desktop behavior remains unverified. The owner then instructed:

> squash merge

That written instruction to proceed after disclosure is recorded as acceptance
of the delegated Windows VM evidence and approval to merge with the remaining
Linux desktop gate waived for this candidate. The assistant explicitly stated
this interpretation before continuing. This is candidate-specific approval;
prior v1.26.0 waivers are not used. It authorizes the normal protected squash
merge, not an admin bypass, a release, website deployment or a public reply.

## Integration and cleanup

Strict main-branch status checks require an up-to-date branch. The candidate
incorporated main `932cbd51` (the separately merged golden Horizon Shield and
webmail signature-header fixes) without conflicts. Required checks must pass
on the integrated head before squash merge. Exact earlier private package/VM
claims remain bound to `e5627375`; the integrated tree has not been represented
as the same private package. Public packaging/release verification remains a
separate future action.

Both disposable Ubuntu test VMs and all setup disk/download/seed images were
deleted at the owner's request, removing about 12.28 GiB of allocated files.
The original Windows VM and ARM Ubuntu VM remain intact. Small private logs,
the cleanup inventory and verified checksums remain in ignored local storage.
