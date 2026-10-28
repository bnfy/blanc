> Current owner review: [measured prerequisite closeout](evidence/l12-measured-closeout-20261028/README.md) binds source4a77b414/archive270c0848539f. Missing named fixtures are complete; loaded-host, reference differences and operating limits remain explicit for owner disposition. **11/12; L12 NO-GO pending approval**, no publication/merge. Older pending-work/candidate statements below are historical.

> October28 owner decision: **L12 remains NO-GO pending full prerequisites**. Bounded deferral proposal was declined;11/12accepted. [Completion plan](full-prerequisites-run-plan-20261028.md). No publication or merge.

> Current October28 final review: [exact bounded Mac-preview packet and proposed Decision2 disposition](evidence/l12-final-packet-20261028/README.md). Publisher authentication/readback pass. L4 and explicitly scoped L11 accepted;11/12, only L12 owner decision remains. Older NO-GO identities below are historical; no public release/merge approval.

> October28 reconciliation: L4 now passes using authentic 1Password8.12.41.1→8.12.42.36 in its separate owner-authorized durable fixture. Readiness10/12,delta+1. Current signed candidate source260f98ff/archivea323f660c99beecb2d085acb22f778081a8326474cb44e90b3df1a44e203d31a; Apple76944658-9890-4866-9ef5-f7c076febc65. L11 and L12/Decision2 remain open; older packet identities below are historical. No release/merge authorization.

# L12: Mac preview release decision packet

Prepared October 23, 2026. **Decision: NO-GO. L12 is prepared for review, not accepted. No publication, merge, release tag or updater change is authorized.**

The [primary implementation plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md) governs this packet. The [supporting checklist](mac-preview-release-checklist.md) currently records **9/12 gates (75%), delta 0 after replacement L8 reacceptance**. The count tracks dated acceptance records; it does not transfer every earlier approval to new artifact bytes.

## Artifact and source boundary

| Item | Recorded identity or disposition |
| --- | --- |
| Current PR | [#1028](https://github.com/bnfy/blanc/pull/1028), draft against `codex/chromium157-rebase` |
| Published L11 findings checkpoint | `893f1e5a7b430cef5e685a402ad044cb2ff11a0b` |
| Last artifact accepted under L8 | Chromium `157.0.8103.15`, source `14706b0e8d4753d2a7ef35ea32a875b516366b0d` |
| Accepted evaluation archive | `Blanc-Chromium-Preview-157.0.8103.15-14706b0e-arm64.zip` |
| Archive SHA-256 | `18a0c2ca240f2200fee3e8b250fbade27b7b86ec1c1dd77c21a538a6776aa8cc` |
| Apple acceptance for that archive's app | `122ace9e-196b-4f10-8986-c57854a5ee4f` |
| Packaging/provenance | [Authenticated L8 packet and second-Mac acceptance](evidence/l8-prerender-distribution-20261024/README.md); local incremental materials, not independent hermetic reproduction |
| Supported preview scope | Apple Silicon/macOS 27, accepted on 27.2; separate app and fresh profile, manual signed updates |
| Current replacement (L8 accepted; not release-approved) | Source `14706b0e8d4753d2a7ef35ea32a875b516366b0d`; archive `18a0c2ca240f2200fee3e8b250fbade27b7b86ec1c1dd77c21a538a6776aa8cc`; Apple `122ace9e-196b-4f10-8986-c57854a5ee4f`; [72post-staple checks](evidence/f12-prerender-notarized-20261024/README.md). |
| Public release candidate | **None approved.** The prerender replacement has bounded L8 acceptance, but L4/L11 and Decision2 prevent a release decision. |

The source checkpoint is not an artifact digest. This L8 record binds the exact replacement above; it is not acceptance of later source changes or other launch gates. Final approval still requires explicit security/recovery acceptance mappings and all remaining prerequisites for these bytes.

## Concrete launch blockers

| Requirement | Current disposition | Evidence needed to change it |
| --- | --- | --- |
| L7 native prerender activation | Accepted for the exact repaired notarized candidate;72post-staple checks and owner approval | [Exact replacement acceptance](evidence/f12-prerender-notarized-20261024/README.md), source14706b0e/archive18a0c2ca. |
| L4 authentic Google extension upgrade | Open; separate baseline remains untouched | Actual old-to-new installed version increase from Google, native updater network evidence, enabled state, restart and popup focus. A fresh install or no-change callback is insufficient. |
| L11 native evidence / repository CI | Native artifact verified; shared CI remains open; Electron paused | [Applicability matrix](evidence/l11-native-reconciliation-20261024/README.md). [Reviewed head3bcb4402](evidence/l11-current-head-20261024/README.md): all four dependency policies and CodeQL pass; only two known Electron modified-link failures remain merge obligations. No waiver or all-green claim. |
| Replacement artifact | [Notarized;72post-staple checks and exact replacement L8 acceptance pass](evidence/l8-prerender-distribution-20261024/README.md) | Reconcile any remaining affected gate mappings against these exact bytes. Signing, authentication and native download checks are complete; do not repeat them absent a changed artifact or new finding. |
| Decision 2 | Not approved | Finish the primary plan's remaining decision items, including unresolved cost/capacity and evidence disposition. Latency deferral is not a pass or a waiver. |
| L12 owner go/no-go | Not requested while prerequisites fail | Owner approval naming the exact source, archive digest, supported scope, residual limitations and all required accepted evidence. |

The separate [L11 findings](evidence/l11-sandbox-duplication-20261023/README.md) retain both failed trials and the earlier build decision. The focused sandbox runtime experiment was subsequently authorized, then stopped after the owner clarified the Chromium-fork priority. No repaired-runtime pass or CI waiver is claimed. [Earlier L11 repair evidence](evidence/l11-repair-20261023/README.md) records cleared dependency/CodeQL findings at its own head and native certificate coverage. It does not establish all-green CI for a later head.

## Readiness materials now prepared

- [Tester guide](preview-user-guide.md): installation and first launch, no automatic migration, supported features/exclusions, manual update, matching-backup rollback, app-only removal, data/keychain boundaries, voluntary feedback and redaction.
- [Maintenance and withdrawal policy](preview-manual-maintenance-policy.md): Anthony Loria is the sole maintainer; suspend distribution when unavailable. Withdraw for known exploitable defects, enabled-feature data loss, signature compromise or unsupported baseline.
- [Live status route](https://github.com/bnfy/blanc/pull/1028): no public release is approved. Final publication must identify the approved artifact and withdrawal state. Packaged status is an offline snapshot, not a continuing safety guarantee.
- [Scope approval and platform amendment](mac-preview-scope-approval-20261022.md), [L5 owner input/VoiceOver record](evidence/l5-owner-acceptance-20261023/README.md), [L6 frozen recovery record](evidence/l6-restore-scheduling-20261023/README.md), [L7 security approval](evidence/l7-owner-acceptance-20261023/README.md), and [L10 bounded smoke](evidence/l10-functional-smoke-20261023/README.md) remain dated, scoped evidence. Map them explicitly to the replacement candidate rather than editing their historic identities.

[Current artifact acceptance mapping](preview-candidate-acceptance-map-20261023.md) completes the source/asset/identity reconciliation without rerunning unchanged suites or waiving remaining gates.

## Final operator review, after blockers clear

1. Freeze the source, native upstream revision, patch inventory, dependency audit, packaged assets and build configuration. Record the replacement's exact version and supported OS; do not promote the binary deployment minimum into tested support.
2. Produce the signed/notarized/stapled archive, complete notices/SBOM/provenance and authenticated manifest. Use the [existing verifier](preview/README.md); retain real rejection controls and the second-Mac quarantined-download result for these exact bytes.
3. Attach applicable exact-head checks with explicit skips, CodeQL alert disposition and native certificate checks. Requalify changed security/recovery/isolation surfaces; map unchanged owner input/accessibility evidence with a source and artifact comparison.
4. Reconcile L1–L11 and Decision 2. Any unresolved required row keeps NO-GO. Record the exact current live status, download identity, maintenance owner, known issues and feedback/privacy instructions.
5. Present this completed packet for the owner's artifact-specific go/no-go. Approval must name source and archive SHA-256. Only then perform separately authorized publication; never retarget the shipping updater or publish a validation draft merely because its checks passed.

No new runtime, build, signing, profile mutation, support email, public issue or GitHub comment was performed to prepare this packet. The Google baseline stays separate. Latency remains deferred and the Electron diagnostic build remains pending.
