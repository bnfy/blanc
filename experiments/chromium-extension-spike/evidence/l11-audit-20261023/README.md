# L11 exact-head CI and audit — October 23, 2026

**L11 remains open. Readiness stays 9/12 (75%), delta 0.** Audited head `dc9d5556aee9f490f302111802fcb19a39f1986e`, draft PR #1028 targeting `codex/chromium157-rebase`; GitHub tests its synthetic merge `0b6577023786b7d2c0709406a7357d406ab1cba0` with base `5d19ffefe835b3400b481947d7e641c1e6016d6e`. This is an observation of that head, not a green claim for any subsequent evidence commit.

## Exact-head CI

The [paginated snapshot](ci-snapshot.json), at 2026-10-23 23:24:58 UTC, has **14 successful, one failed and six in-progress checks**, no commit statuses, and no skipped check runs at this checkpoint. Pagination requested 100 items per page and continued until an incomplete page. Three relevant workflows run against this head: Parity guards, Unit tests and CodeQL. The workflow definitions still govern which other workflows are triggered; absence is not a pass.

[Substrate job 120706267735](https://github.com/bnfy/blanc/actions/runs/40039280532/job/120706267735) failed the dependency-policy step. The [complete provider log](substrate.log.gz) and [annotations/security records](security-context.json) are retained. Token/settings/copy/API/blocklist/surface inventory, brand assets, compliance and compatibility checks passed before the failure. The job stopped before its later lint/unit steps, which must not be counted as passed. Other workflow results remain as recorded in the snapshot. macOS Unit, Windows workspace/shortcuts and CodeQL were still running; no complete platform/shutdown acceptance is asserted.

## Concrete dependency blockers

- **Electron 44.8.0:** [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9), high severity, published October 23, blocks compromised eMudhra intermediate certificate keys in Chromium and Node TLS. The advisory lists **44.9.1** as the first fixed 44.x version. The existing root lock pins 44.8.0. A compatible patched Electron update, matching runtime/provenance/compliance checks and fresh CI are required; no suppression or Electron diagnostic build was performed. [Official advisory](electron-advisory.json), [upstream fix](electron-fix.json).
- **Site Zod 4.6.5:** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), high severity, oversized array validation can exhaust memory. The current advisory lists **4.6.6** as first fixed version. Resolve the site's dependency graph to a patched version, regenerate affected compliance artifacts and rerun its tests/build and dependency audit. This turn did not change the lockfile or weaken policy. [Official advisory](zod-advisory.json).

The two import workspaces have no unsuppressed high/critical findings in this job; three companion findings are already VEX-accounted. This is the provider's result at this timestamp, not a permanent advisory guarantee.

The new certificate advisory also needs explicit native-fork disposition. The [source audit](scope-audit.json) finds the eight new certificate entries absent from the signed candidate's static Chromium blocklist. Chromium does register its CRLSet component, so static absence alone **does not establish runtime exposure or protection**. Verify the exact candidate's delivered CRLSet/chain rejection, or apply and qualify a narrow upstream mitigation. No claim that this is an Electron-only risk; no live interception test, candidate replacement or permanent-profile mutation occurred. L11 cannot close with this unresolved disposition.

## CodeQL and reviews

The current-head `javascript` job is still in progress. The actual `refs/pull/1028/merge` security endpoint returns **48 open alerts** belonging to the previous merge analysis `f5aed8584a110902d7fff77ed5da2e2219475c35`: 33 improper sanitization, 10 reflected XSS, three incomplete URL substring sanitization and two filesystem-race alerts. All listed paths are test/fixture or archived evidence harnesses. That location does not dismiss them. Review or repair each flow and check new-head results before clearance. A representative confirmed pattern interpolates `q.url` into fixture HTML and serialized values into evaluated source. Preserve original runtime evidence when repairing harnesses; syntax or a successful CodeQL job alone is not an alert disposition.

The seven recorded PR reviews are comment reviews on earlier commits; they are not approval of this head. [Full analysis, alert and annotation records](security-context.json). The initial branch-head-only security query returned no analyses; the corrected PR-merge-ref query found these alerts. Zero results from the wrong ref were **not** treated as clearance.

## Candidate binding and next actions

The signed artifact remains source `6b9a05a00f321bfbde617c181103d5a455ff45f3`, archive `a7fe468c648e1b3d096a49e663e06b182bb483353fb5c4bb1c37dc8349994aca`; [L8 exact-byte distribution acceptance](../l8-replacement-20261023/README.md) and [L6 frozen recovery](../l6-restore-scheduling-20261023/README.md) remain dated evidence for those bytes. This audit adds no native runtime pass. Any relevant production/security change needs candidate requalification.

Next: repair/dispose the dependency and CodeQL findings, resolve native certificate revocation coverage, then inspect complete exact-new-head CI and explicit skips. L4's real Google upgrade and L12 final go/no-go remain open; Decision 2 remains independent. No jobs were rerun, no code/dependency/build changes were made, no merge/release approved. Google baseline/ledger and permanent profiles/tabs remain separate; latency deferred; Electron diagnostic build pending approval/unstarted.
