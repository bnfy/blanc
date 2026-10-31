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
  candidate; 622 adapters undefined; 2 mobile-only cases excluded. Full F0.5
  adapter work remains incomplete. JSON/JUnit and source mappings are committed.

## Candidate
Existing verified development app remains open; use the durable launch receipt.
No replacement candidate promoted. Preserve 157 fallback and signed masters.

## Next
Continue F0.5 step adapters; carry forward valid unchanged checks.
Use HANDOFF.md for a compact fresh-chat entry point.
Archive/compression of historical raw evidence remains a separate operation;
no historical evidence or draft is deleted.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — executable shipping cases on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | 3/627 executable cases pass; 0 failed; 622 undefined/not run; 2 excluded — [baseline](scenarios/baseline-macos-19b83f79bd18b94c.json) |
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
