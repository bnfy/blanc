> October24 repair update: source14706b0e passes72DeveloperID-signed checks for the corrected activation gate and regressions. [Repair evidence](evidence/f12-prerender-repair-20261024/README.md). The replacement is not yet notarized; this does not replace the earlier artifact acceptance or close L7.

> October24 supersession: L7 is reopened by [signed prerender activation after utility loss](evidence/f12-prerender-activation-20261024/README.md). Source/byte equivalence remains valid, but no longer establishes complete current security acceptance. Readiness8/12; prior mapping below is a dated record.

# Acceptance mapping for the certificate-patched Preview

October 23, 2026. This maps existing acceptance to source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, archive SHA-256 `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`. It is part of the L12 review packet, not a new test run, gate waiver or release approval.

## Verified change boundary

The [native source comparison](evidence/l11-native-replacement-20261023/source-delta.json) confirms that, after excluding `net/cert/cert_verify_proc_blocklist.inc`, the native patch exactly matches the previously accepted `6b9a05a0` patch. Added native source files, upstream revision, build environment and blocker/filter inputs match. The changed table adds eight reviewed compromised public-key hashes; it introduces no new bridge, profile or session implementation.

The [complete UI and identity comparison](evidence/l12-acceptance-map-20261023/asset-identity-map.json) checks all 62 bundled UI assets. Sixty are byte-identical. Only `overlay.html` and `pages/newtab.html` differ, and each becomes byte-identical after replacing its single signed version/source/date metadata tag. All ten bundle plists retain the compared identifier, executable, version and deployment-minimum fields. This does not treat the two HTML files as identical or normalize arbitrary executable content.

The replacement separately passes [46 frozen checks and signature/ticket verification](evidence/l11-native-replacement-20261023/README.md), plus [authenticated distribution and the owner walkthrough](evidence/l8-certificate-distribution-20261023/README.md). Earlier counts are not added to these as independent new passes.

## Accepted-row mapping

| Row | Evidence carried forward and current-candidate support | Limits retained |
| --- | --- | --- |
| L1 Scope | [Owner scope and platform amendment](mac-preview-scope-approval-20261022.md); current version/identity/platform metadata matches the approved separate Apple Silicon/macOS 27 preview. | No broader platform, automatic migration or public-release approval. |
| L2 Isolation | [Original signed isolation/owner check](evidence/l2-owner-acceptance-20261022/README.md); unchanged profile/keychain/identity implementation and ten bundle identities; current owner confirms Shipping tabs intact. | App removal was not repeated on the owner's installed copy. Historical removal evidence stays historical. |
| L3 Baseline/maintenance | [Baseline and sole-maintainer record](evidence/l3-closeout-20261023/README.md); same reviewed upstream/build environment, now with the separately verified certificate blocklist. | No fresh upstream-channel lookup or newly measured rebase cost. The original larger rebuild remains separately authorized history. |
| L5 Input/accessibility | [Owner physical/VoiceOver acceptance](evidence/l5-owner-acceptance-20261023/README.md); complete UI/identity comparison above; current owner verifies popup Tab focus and current notice tests cover changed metadata. | No new full VoiceOver or physical Split View test is claimed. |
| L6 Recovery | [Frozen recovery acceptance](evidence/l6-restore-scheduling-20261023/README.md); session implementation unchanged; current 7 startup and 6 encrypted recovery checks plus owner-controlled restart confirmations. | The initial missing-tabs observation remains unexplained with concurrent Sync testing disclosed. No fix, Sync causation, power-loss guarantee or independent automated count of owner restarts is claimed. |
| L7 Security/privacy | [Prior signed review and approval](evidence/l7-owner-acceptance-20261023/README.md); privileged/native UI code unchanged, current signing/entitlement audit, eight-key byte mapping and [native revocation tests](evidence/l11-repair-20261023/README.md). | No new full security review or live compromised-certificate handshake claim. The independent Electron sandbox defect remains a shared-repository merge obligation, not a demonstrated native candidate defect. |
| L8 Distribution | [Current six-file authenticated packet, actual Safari download, quarantine and owner acceptance](evidence/l8-certificate-distribution-20261023/README.md), bound to the source/archive above. | Unpublished validation draft and second physical Mac, not factory-clean OS, hermetic reproduction or public release. |
| L9 Maintenance/retreat | [Manual policy](preview-manual-maintenance-policy.md), prior signed update/rollback rehearsal, unchanged identity/session implementation, current notice checks and owner restart confirmation. | No new rollback run. A rollback version must still be approved by the security notice; matching an old backup alone does not make an old binary safe. Use Shipping if no approved rollback exists. |
| L10 Functionality | [Prior bounded smoke](evidence/l10-functional-smoke-20261023/README.md); unchanged native/UI implementation, current 17 core checks and owner Shelf/Bitwarden confirmation. | No broad extension catalog, account sync, native messaging, DRM or performance claim. |

## Rows that cannot be closed by this mapping

- **L4:** Google returned `noupdate` for the authentic installed Bitwarden baseline. A real old-to-new native update is still required; do not replace it with reinstall evidence.
- **L11:** [Native/shared-CI reconciliation](evidence/l11-native-reconciliation-20261024/README.md) verifies the accepted native artifact and unchanged implementation. Dependency repair and shared Electron CI remain unresolved under the original all-green requirement; no gate or check waiver. Electron work is paused.
- **L12:** the instructions, evidence packet and this mapping are prepared. Final artifact-specific go/no-go remains blocked by the required rows and Decision 2.
- **Decision 2:** deferred latency is neither a pass nor a waiver. Human-attention and provider-billing inputs in the cost sheet are still unmeasured. No owner budget or engine-selection approval is inferred.

**Readiness remains 9/12 (75%), delta 0.** No additional runtime tests, builds, profile changes, release or merge were performed for this mapping. The Google baseline remains separate; latency and the Electron diagnostic build remain pending.
