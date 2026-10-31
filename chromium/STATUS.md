# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved.
D7, F0.7, cold builds, new platform machines, D1–D6, D8 and V2 remain pending.

## Current work
- F0.1: canonical operating rules established; spike frozen for new work.
- F0.2: selected baseline reconstructed with six verified journal preimages,
  excluding the unbuilt Glance/language overlay without modifying the checkout.
- Source patch reproduces 79 tracked files; 41 custom files relocated.
- Incremental foundation build passed: 44 steps in 1m41s; normal zero-action
  guard passed. Regular/private native smoke passed; two clean exits.
- F0.3/F0.6: pending. F0.8 hosted source-check workflow prepared; no
  self-hosted runner installed. F0.5 runner still pending.
- F0.5 baseline: NOT RUN. Shipping has 578 scenario declarations; no fork
  scenario pass count exists yet. All declarations mapped; runner remains to be implemented.

## Candidate
Existing verified development app remains open; use the durable launch receipt.
No replacement candidate promoted. Preserve 157 fallback and signed masters.

## Next
Implement the fork scenario runner and required test hook.
Archive/compression of historical raw evidence remains a separate operation;
no historical evidence or draft is deleted.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — shipping scenarios on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | Not run |
| Windows | Not run |
| Linux | Not run |

578 shipping scenario declarations are inventoried; inventory is not a fork run.

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
| Verified | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 |
| Total | 79 | 79 | 79 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-fbdb706908013250; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
