# Decision 2 review package — October 22, 2026

**Recommendation: finish the finite acceptance items below, then request Decision 2. Do not approve migration or release from this packet alone.** This is the completed evidence reconciliation and review agenda, not a claim that missing runtime evidence exists. Baseline: PR #1028 at `8b421954`; historical runtime archives retain their own binary/source identities. No build, latency run, Electron diagnostic build or profile change was performed for this package.

## Six required package items

| Requirement from the primary plan | Available deliverable | Remaining acceptance |
| --- | --- | --- |
| Measured Task 0 rebase | [Rebase ledger](rebase-ledger.md): 9,587.120 seconds accumulated cold build, one broken anchor/API change | Actual Google extension upgrade; human attention not measured. No 157 promotion. Google baseline stays separate. |
| A1 patch design/count | [A1 design](a1-patch-budget-design.md); latest recorded footprint 56 files/135 hunks | Review consolidation design, rerun authoritative inventory for frozen candidate; historical 49/117 is not current. |
| Updated feature parity | Current execution table in [primary plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md), plus scope below | Full parity remains unclaimed; enabled candidate features need bounded smoke. |
| Matched visual comparison | Prior geometry/theme evidence is reusable supporting evidence | Capture resting, panel, palette, find and private at identical sizes in native and existing Electron app; record every material difference. No new Electron build authorized. |
| Mac VoiceOver | Acceptance procedure below | Run physical keyboard/pointer and VoiceOver; CDP does not substitute. |
| Staffing/CI cost | [One-page cost sheet](decision2-cost-sheet-20261022.md) | Owner maintenance commitment and actual billing/attention inputs remain decisions, not measured facts. |

## F12 disposition and provenance

[Aggregate acceptance](f12-acceptance-status.md) governs. [October 21 reconciliation](evidence/f12-reconciliation-20261021/README.md) verified 38 archives/1,269 members at that checkpoint. Its socket-absence and untested-prefetch statements are historical, superseded by subsequent implementation/evidence:

- [WebSocket integration](evidence/f12-socket-speculation-20261021/README.md): native enforcement and actual handshake evidence; bounded pending lifecycle checks are recorded in the aggregate.
- [WebTransport enforcement](evidence/f12-webtransport-enforcement-20261021/README.md): real HTTP/3, followed by worker/lifecycle and cancellation tests. [Admission investigation](evidence/f12-webtransport-admission-20261021/README.md) distinguishes upstream throttling under held utility work from normal mixed decisions.
- [Prefetch response repair](evidence/f12-prefetch-response-repair-20261021/README.md), [readiness reconciliation](evidence/f12-prefetch-readiness-reconciliation-20261022/README.md), and [private-only cross-profile acceptance](evidence/f12-prefetch-private-only-cross-profile-20261022/README.md) establish bounded enforcement/consumption/recovery. Earlier unproven cross-profile ownership claims remain withdrawn.

Do not add checkpoint counts across overlapping runs or call archive integrity current-head equivalence. Remaining F12 requirements: current-candidate source/binary mapping, applicable prerender/pre-prefetch disposition, service-worker update attribution, production cosmetic/recovery UI acceptance, and uBO provenance/lifecycle gaps. Qualified latency stays deferred. Neither spike is accepted and no blocker-engine decision is implied. Do not pick uBO or remove enabled protections merely to reduce this list.

## Finite next work and stop rules

1. **Scope decision:** review [preview proposal](mac-preview-scope-proposal.md). Owner approves scope and maintenance responsibility; this closes only the scope decision, not artifact gates.
2. **Single evidence session:** use the existing Electron app for five matched visual states; native keyboard/pointer/VoiceOver through Island, extension permissions/popup, close Cancel/Leave, Split focus/divider and Customize Theme. Record app versions, hashes, dimensions, accessibility names/focus and defects. If existing Electron cannot provide a valid comparison, record the blocker; do not build it.
3. **Candidate preparation:** after required approvals, freeze source, upstream revision, configuration, patch inventory and assets. Map selected historical tests to changed production paths; rerun only changed or missing coverage. Execute the bounded recovery/functionality list in the gate reconciliation once per candidate.
4. **Packaging/isolation/security:** build only under the guarded incremental policy and separately authorize any distribution operation. Validate signed/quarantined artifact, fresh profile coexistence, uninstall isolation and manual update/rollback policy.
5. **Closeout:** exact-head CI and security report, actual Google upgrade result, artifact-bound acceptance and explicit go/no-go. Do not expand stress coverage without an observed defect or unmet written acceptance criterion.

Latency deferral is not a pass or a waiver of Decision 2 requirements. If the owner wants a different preview decision gate, record that explicit change separately. The Electron diagnostic build remains pending approval.
