# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved.
D7, F0.7, cold builds, new machines, D1/D2/D4–D6/D8/V2 and replacement D3
remain pending. D3 beta-only no-DRM exception accepted; EME notice/handoff required.

## Current work
- F0.1: canonical operating rules established; spike frozen for new work.
- F0.2: selected baseline reconstructed with six verified journal preimages,
  excluding the unbuilt Glance/language overlay without modifying the checkout.
- Source patch reproduces 79 tracked files; 41 custom files relocated.
- Incremental foundation build passed: 44 steps in 1m41s; normal zero-action
  guard passed. Regular/private native smoke passed; two clean exits.
- F0.3/F0.6: pending. F0.8 hosted source checks passed on cdf30501; no
  self-hosted runner installed. F0.5 preview hook built; runtime gate and
  replay checks passed in regular/private fixtures and without opt-in.
- F0.5 initial partial-adapter baseline recorded: 3 cases passed on the native
  candidate; 622 adapters undefined; 2 mobile-only cases excluded. F0.5 remains incomplete: the owner-defined finish line is a stable runner
  with adapters for every S1-tagged case; later adapters start with their slice. JSON/JUnit and source mappings are committed.

## Candidate
Existing verified development app remains open; use the durable launch receipt.
No replacement candidate promoted. Preserve 157 fallback and signed masters.

## Handoff — paused for Claude
- Completed runner infrastructure: pinned shipping-core callback loader, explicit
  missing-adapter errors, isolated per-case context and native world adapters.
  Four adapter unit checks passed. This expansion has not had a native baseline
  run; the existing 3/627 result below remains the last measured baseline.
- Next: finish and validate S1-tagged adapter coverage, then F0.3 and F0.6.
  Later-slice adapters are deferred until their slice starts. No new gate credit.
- Process inspection at handoff found no active Chromium build or test run.
  No browser was closed or relaunched. Preserve the development launch receipt.
- Codex is paused; Claude owns the bounded repository task until handback through
  this PR branch. No further build, test or source work is scheduled by this chat.

## Intentionally uncommitted
No canonical `chromium/` changes are intentionally left uncommitted by this
handoff. Existing work outside the canonical tree is preserved, not staged:
- `AGENTS.md` and `docs/chromium-migration-implementation-plan-2026-10-16.md`:
  earlier local guidance/planning edits, outside this finished runner change.
- `experiments/chromium-extension-spike/`: earlier modified source and extensive
  untracked drafts, generated candidates and raw evidence. These are historical,
  mixed-qualification work; do not bulk-add them or treat them as integrated.
- Outside Git: durable profiles, credentials/signing access, caches, apps and raw
  foundation fixtures remain local. Google baseline and Electron stay separate.
Use `git status --short` for the exact preserved paths. Nothing was discarded.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — executable shipping cases on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | 3/627 executable cases pass; 0 failed; 622 undefined/not run; 2 excluded — [baseline](scenarios/baseline-macos-19b83f79bd18b94c.json)<br>S1 rows: 3/253 pass; 0 failed; 250 undefined; 0 excluded |
| Windows | Not run (627 cases) |
| Linux | Not run (627 cases) |

627 executable cases from 578 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux |
| --- | ---: | ---: | ---: |
| Not started / unassessed | 42 | 79 | 79 |
| Research only | 1 | 0 | 0 |
| Drafted | 11 | 0 | 0 |
| Implemented | 0 | 0 | 0 |
| Built, isolated (legacy) | 9 | 0 | 0 |
| Integrated, partial (legacy) | 16 | 0 | 0 |
| Integrated | 0 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 |
| Total | 79 | 79 | 79 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-19b83f79bd18b94c; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
