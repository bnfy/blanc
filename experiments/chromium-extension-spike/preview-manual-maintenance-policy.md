# Manual preview maintenance and withdrawal

October 23, 2026. Operational policy supporting L3/L9/L12. L9 is accepted for the signed notice candidate and the linked update/rollback evidence. The owner approved manual-only updates and requested this visible notice and withdrawal route. Public distribution and the other release gates remain separate approvals.

## User contract

Blanc Chromium Preview is a separate Apple Silicon/macOS 27.2 application using a fresh preview profile. Shipping Blanc and its updater never install or update this preview. No shipping profile import, migration or replacement is performed. Each published preview must identify its version, Chromium version, build commit, release date, SHA-256, supported OS, known limitations and security status.

Updates are manual: quit the preview, retain a closed backup of its own profile, obtain the replacement from the project's approved release location, verify its Developer ID and Gatekeeper acceptance, and replace only the preview app. Never copy a profile while the preview is running. Never point the preview at shipping Blanc or the Google upgrade fixture. A release must contain these instructions and a visible link to its security/withdrawal notice; the implemented notice links to the live status section at https://github.com/bnfy/blanc/pull/1028.

## Operator procedure

1. Freeze the candidate commit and record bundled assets/dependency inventory. Sign through the existing release-signing environment using Chromium-appropriate entitlements and distinct preview/helper identities. Notarize and staple; retain receipts and digests.
2. Run the frozen candidate acceptance on macOS 27.2, including signed-identity keychain behavior, isolation, recovery, extensions, accessibility and quarantine launch. Record exact artifact identity and reviewer.
3. Publish only after artifact-specific owner approval. Never retarget shipping updater feeds. Record the replacement version and any profile compatibility restriction in the notice.
4. Anthony Loria is the sole primary maintenance and withdrawal owner (owner decision October22: “Sole maintainer; suspend when unavailable”). Review upstream security advisories each working day while the preview is supported. Suspend preview distribution whenever Anthony cannot perform that review; do not imply an independent backup. Record affected versions, fix availability and the decision to replace or withdraw; do not promise an unstaffed repair deadline.
5. For a known exploitable security defect, reproducible enabled-feature data loss, signature compromise or unsupported baseline, mark the affected preview withdrawn in its release/security notice and remove its recommended download. Direct users to quit it and use shipping Blanc. Preserve evidence and provide replacement instructions only after verification. A manual-only preview cannot remotely force an installed app to stop; disclose that limitation.

## Retreat and rollback

Removing the preview app must leave shipping Blanc and both applications' data untouched. Preview data removal is a separate explicit user action. Do not silently downgrade an already-upgraded profile: rollback uses a closed pre-update preview backup with its matching verified artifact, or a fresh preview profile. Preserve the newer profile separately. Never claim arbitrary backwards profile compatibility.

## Acceptance records and remaining release requirements

- Maintenance owner resolved: Anthony Loria, with distribution suspended when unavailable. The published security/withdrawal route is https://github.com/bnfy/blanc/pull/1028; the private support link is `mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview` (link verified, no test email sent).
- **Passed October 23:** signed 157.0.8103.6 → 157.0.8103.15 replacement, three tabs/selection and Shelf preserved, matching-backup rollback, fresh-profile retreat and preview removal. [43-check evidence](evidence/signed-update-rollback-20261023/README.md). Installed Shipping code and disposable shipping tabs remained unchanged; no shipping profile was copied.
- **Retreat mechanics passed:** matching closed backup and fresh-profile paths; newer profile retained separately. The visible notice and live withdrawal route now pass [signed acceptance](evidence/preview-notice-20261023/README.md). The current live status is not publicly released. No shipping updater handoff was performed.
- **Quarantine launch passed on the existing macOS 27.2 host:** native browser download, Archive Utility extraction and macOS Open confirmation retained quarantine and launched the pinned B artifact. Fresh-machine/public-download and final artifact review remain open.

Evidence must name commit, app digest, OS, identity, steps, result and limitations. Existing ad-hoc packaging/recovery evidence informs these checks but is not a signed-update pass. Google real-upgrade gate remains independent. Latency is deferred and the Electron diagnostic build remains pending approval.

## User instructions

The following procedure is tested against the artifacts in the October 23 record. It is not a published update offer or withdrawal of either artifact.

1. Confirm the preview version in About/version information. Quit **Blanc Chromium Preview** completely; leave shipping Blanc alone.
2. Retain a closed backup of the preview's own `~/Library/Application Support/Blanc Chromium Preview` directory. Do not copy the shipping Blanc directory. Keep that backup paired with the exact old signed preview archive.
3. Download the replacement from the approved preview release notice, check its published SHA-256 and Developer ID, and replace only `Blanc Chromium Preview.app`. Accept the normal macOS Open confirmation only after these checks. A signature/security rejection is a stop condition, not a reason to bypass Gatekeeper.
4. Reopen and verify tabs and settings. Retain the old archive and closed backup until the replacement is accepted.
5. If retreat is needed, quit the preview and retain its newer profile separately. Either restore the old signed app together with its matching closed profile backup, or start with a fresh preview profile. Do not open the upgraded profile with an older app.
6. To withdraw the preview, quit and remove only its app. Preserve preview data for recovery unless separately asked to delete it. Continue using shipping Blanc.

Before any public release, the owner must approve the exact candidate and publish its version, source/Chromium revisions, date, digest, supported OS, current security/withdrawal status, known limitations and feedback/security contact on the chosen live route. The visible notice and published route close L9 with the signed acceptance evidence. Final artifact release approval and remaining L12 readiness work are still required.

## Live status route

The owner-requested route for this preview is **https://github.com/bnfy/blanc/pull/1028**, with the `Preview security and withdrawal status` section at the top of the PR description. The section is source-controlled in [preview/status-notice.md](preview/status-notice.md); publish updates to the description, not only to a code branch or comment. This numeric PR URL remains accessible after merge/closure and must not be deleted while referenced by a supported preview. The bundled link is an explicit user action; no background status requests occur.

The current status is **Not publicly released — evaluation only**. This avoids turning engineering acceptance into a distribution approval. On an actual withdrawal, Anthony updates the live section to **Withdrawn**, lists affected artifact versions/checksums and directs users to quit, use shipping Blanc, and retain their preview data. Replacement instructions must point only to separately verified signed artifacts. The existing `support@blanc.day` route handles private reports; users are told not to publish credentials or sensitive logs in the PR.

## L9 acceptance — October 23

[Signed notice evidence](evidence/preview-notice-20261023/README.md) records 16 notice checks, two footer layout checks, metadata/security tests and anonymous HTTP200 verification of the live status section. Source `9a1b4fa9`, artifact `f177e0b5100db9a3fc83c7d5522cc343b86582add4d209d49696cef4f3729a55`, Apple accepted `dbe289ff-82fd-4ddf-87ea-d2a3023677f6`. The notice contains a packaged status snapshot, exact version/source identity, update/rollback/removal steps and an explicit live link; it performs no automatic network request. The earlier 43-check signed update/rollback record supplies the operator rehearsal. L9 is accepted, without implying public release, automatic update delivery, email deliverability or closure of L8/L12.

Rollback safety: an older archive and matching backup may be used only while that version remains approved by the security/withdrawal notice. A valid signature or matching backup is not a security approval. If no approved rollback exists, use Shipping Blanc and preserve the Preview data.
