# L12: Mac preview release decision packet

Prepared October 23, 2026. **Decision: NO-GO. L12 is prepared for review, not accepted. No publication, merge, release tag or updater change is authorized.**

The [primary implementation plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md) governs this packet. The [supporting checklist](mac-preview-release-checklist.md) currently records **9/12 gates (75%), delta 0**. The count tracks dated acceptance records; it does not transfer every earlier approval to new artifact bytes.

## Artifact and source boundary

| Item | Recorded identity or disposition |
| --- | --- |
| Current PR | [#1028](https://github.com/bnfy/blanc/pull/1028), draft against `codex/chromium157-rebase` |
| Published L11 findings checkpoint | `893f1e5a7b430cef5e685a402ad044cb2ff11a0b` |
| Last artifact accepted under L8 | Chromium `157.0.8103.15`, source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6` |
| Accepted evaluation archive | `Blanc-Chromium-Preview-157.0.8103.15-7c427328-arm64.zip` |
| Archive SHA-256 | `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed` |
| Apple acceptance for that archive's app | `e46dbe18-f1f1-424e-abe9-ab44b79ef29c` |
| Packaging/provenance | [Authenticated L8 packet and second-Mac acceptance](evidence/l8-certificate-distribution-20261023/README.md); local incremental materials, not independent hermetic reproduction |
| Supported preview scope | Apple Silicon/macOS 27, accepted on 27.2; separate app and fresh profile, manual signed updates |
| Staged replacement (not release-approved) | Source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, archive `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`, Apple `e46dbe18-f1f1-424e-abe9-ab44b79ef29c`; [bounded replacement evidence](evidence/l11-native-replacement-20261023/README.md) |
| Public release candidate | **None approved.** The certificate-patched replacement has bounded L8 acceptance, but L4/L11 and Decision2 prevent a release decision. |

The source checkpoint is not an artifact digest. This L8 record binds the exact replacement above; it is not acceptance of later source changes or other launch gates. Final approval still requires explicit security/recovery acceptance mappings and all remaining prerequisites for these bytes.

## Concrete launch blockers

| Requirement | Current disposition | Evidence needed to change it |
| --- | --- | --- |
| L4 authentic Google extension upgrade | Open; separate baseline remains untouched | Actual old-to-new installed version increase from Google, native updater network evidence, enabled state, restart and popup focus. A fresh install or no-change callback is insufficient. |
| L11 native evidence / repository CI | Native artifact verified; shared CI remains open; Electron paused | [Applicability matrix](evidence/l11-native-reconciliation-20261024/README.md). Publish scoped undici repair and verify exact-head checks. Electron failures remain merge obligations, not native defect evidence; no waiver or all-green claim. |
| Replacement artifact | [Notarized;46checks and bounded replacement L8 acceptance pass](evidence/l8-certificate-distribution-20261023/README.md) | Reconcile any remaining affected gate mappings against these exact bytes. Signing, authentication and native download checks are complete; do not repeat them absent a changed artifact or new finding. |
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
