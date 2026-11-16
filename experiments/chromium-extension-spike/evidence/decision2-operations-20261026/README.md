# Completed CI and operating inputs — October 26, 2026

Read-only review of PR#1028 at `732b34fb1b3b745e8fe5d2c7b0b2e48d183c797d`. All29checks are completed:25success, two modified-link Electron failures, two skips. Status list empty; diagnostics pagination reports `hasMore:false`. No reruns, builds, profile changes or latency measurements.

CodeQL `121759335722` explicitly reports **No new alerts**, zero annotations. Substrate is successful; its previously retained full log confirms4,175unit tests and no unsuppressed high/critical findings in the four dependency workspaces (three existing companion VEX entries remain). macOS, Intel macOS and Windows unit/desktop checks pass. `windows-shutdown.json` records passing Windows last-window shutdown/tab preservation and closed-primary-window checks. These hosted desktop jobs exercise the shared Electron product, not native Chromium platform acceptance.

The two failures remain Electron44.9.1 sandbox duplication: `test/desktop/modified-link-click-smoke.mjs:168` receives `allowed` instead of `SecurityError`, on Ubuntu and Windows. Full provider logs were read in the prior repair checkpoint and their exact new-head failure excerpts are retained in `failure-evidence.json`. Electron remains paused. L11's existing all-green wording is not met, and no requirement is waived. L4/L12 and Decision2 remain open; readiness stays9/12.

## New operating inputs

- Connected repository metadata verifies `bnfy/blanc` is public. Every non-skipped job in the four exact-head runs uses standard `ubuntu-latest`, `windows-latest`, `macos-latest`, `macos-15` or `macos-15-intel` labels. No larger/self-hosted native builder was observed.
- Raw job APIs were queried with `per_page=100`; returned list lengths equal all four `total_count` values. There are28workflow jobs,26non-skipped; the separate CodeQL result accounts for the29checks. Exact API start/completion intervals total4,156s (69m16s), with8,420s elapsed span. This is CI execution/availability evidence, not human attention, browser latency, a billing export or native-build cost.
- All four artifact APIs return total_count0. No account-wide artifact/cache usage, invoice, hardware/power or signing allocation was obtained.
- [GitHub's current billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions), checked October26, makes standard hosted runner compute free for public repositories; larger runners are charged and storage/cache have separate limits. The narrow compute-policy inference does not establish zero total project spend. `billing-policy.json` records this distinction.

The [bounded operating proposal](../../decision2-operating-proposal-20261026.md) now specifies existing Macs/signing, no new paid service or hosted Chromium builder, affected-only requalification, named ownership/suspension, unchanged stop rules and prospective active-time/cash recording on the next necessary update. It is a proposal, not affordability/engine/release approval. No additional rebase is performed for measurement.

The existing signed repair archive/source remain unchanged. Google baseline and its ledger are excluded. Electron paused; latency deferred.
