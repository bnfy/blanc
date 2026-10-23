# Manual preview maintenance and withdrawal

October 22, 2026. Operational draft supporting L3/L9/L12. The owner approved manual-only signed preview updates and use of the existing release-signing environment. This document does not approve distribution or close a gate.

## User contract

Blanc Chromium Preview is a separate Apple Silicon/macOS 27.2 application using a fresh preview profile. Shipping Blanc and its updater never install or update this preview. No shipping profile import, migration or replacement is performed. Each published preview must identify its version, Chromium version, build commit, release date, SHA-256, supported OS, known limitations and security status.

Updates are manual: quit the preview, retain a closed backup of its own profile, obtain the replacement from the project's approved release location, verify its Developer ID and Gatekeeper acceptance, and replace only the preview app. Never copy a profile while the preview is running. Never point the preview at shipping Blanc or the Google upgrade fixture. A release must contain these instructions and a visible link to its security/withdrawal notice; the final link and notice surface remain implementation requirements.

## Operator procedure

1. Freeze the candidate commit and record bundled assets/dependency inventory. Sign through the existing release-signing environment using Chromium-appropriate entitlements and distinct preview/helper identities. Notarize and staple; retain receipts and digests.
2. Run the frozen candidate acceptance on macOS 27.2, including signed-identity keychain behavior, isolation, recovery, extensions, accessibility and quarantine launch. Record exact artifact identity and reviewer.
3. Publish only after artifact-specific owner approval. Never retarget shipping updater feeds. Record the replacement version and any profile compatibility restriction in the notice.
4. Anthony Loria is the sole primary maintenance and withdrawal owner (owner decision October22: “Sole maintainer; suspend when unavailable”). Review upstream security advisories each working day while the preview is supported. Suspend preview distribution whenever Anthony cannot perform that review; do not imply an independent backup. Record affected versions, fix availability and the decision to replace or withdraw; do not promise an unstaffed repair deadline.
5. For a known exploitable security defect, reproducible enabled-feature data loss, signature compromise or unsupported baseline, mark the affected preview withdrawn in its release/security notice and remove its recommended download. Direct users to quit it and use shipping Blanc. Preserve evidence and provide replacement instructions only after verification. A manual-only preview cannot remotely force an installed app to stop; disclose that limitation.

## Retreat and rollback

Removing the preview app must leave shipping Blanc and both applications' data untouched. Preview data removal is a separate explicit user action. Do not silently downgrade an already-upgraded profile: rollback uses a closed pre-update preview backup with its matching verified artifact, or a fresh preview profile. Preserve the newer profile separately. Never claim arbitrary backwards profile compatibility.

## Acceptance records and remaining release requirements

- Maintenance owner resolved: Anthony Loria, with distribution suspended when unavailable. Approved release/security notice location and working feedback/security route remain open.
- **Passed October 23:** signed 157.0.8103.6 → 157.0.8103.15 replacement, three tabs/selection and Shelf preserved, matching-backup rollback, fresh-profile retreat and preview removal. [43-check evidence](evidence/signed-update-rollback-20261023/README.md). Installed Shipping code and disposable shipping tabs remained unchanged; no shipping profile was copied.
- **Retreat mechanics passed:** matching closed backup and fresh-profile paths; newer profile retained separately. Final public withdrawal notice/location and visible version/security notice remain open. No shipping updater handoff was performed.
- **Quarantine launch passed on the existing macOS 27.2 host:** native browser download, Archive Utility extraction and macOS Open confirmation retained quarantine and launched the pinned B artifact. Fresh-machine/public-download and final artifact review remain open.

Evidence must name commit, app digest, OS, identity, steps, result and limitations. Existing ad-hoc packaging/recovery evidence informs these checks but is not a signed-update pass. Google real-upgrade gate remains independent. Latency is deferred and the Electron diagnostic build remains pending approval.

## Prepared user instructions — publication pending

The following procedure is tested against the artifacts in the October 23 record. It is not a published update offer or withdrawal of either artifact.

1. Confirm the preview version in About/version information. Quit **Blanc Chromium Preview** completely; leave shipping Blanc alone.
2. Retain a closed backup of the preview's own `~/Library/Application Support/Blanc Chromium Preview` directory. Do not copy the shipping Blanc directory. Keep that backup paired with the exact old signed preview archive.
3. Download the replacement from the approved preview release notice, check its published SHA-256 and Developer ID, and replace only `Blanc Chromium Preview.app`. Accept the normal macOS Open confirmation only after these checks. A signature/security rejection is a stop condition, not a reason to bypass Gatekeeper.
4. Reopen and verify tabs and settings. Retain the old archive and closed backup until the replacement is accepted.
5. If retreat is needed, quit the preview and retain its newer profile separately. Either restore the old signed app together with its matching closed profile backup, or start with a fresh preview profile. Do not open the upgraded profile with an older app.
6. To withdraw the preview, quit and remove only its app. Preserve preview data for recovery unless separately asked to delete it. Continue using shipping Blanc.

Before release, the owner must approve the notice location and publish the exact candidate version, source/Chromium revisions, date, digest, supported OS, current security/withdrawal status, known limitations and feedback/security contact. The visible notice surface and approved route remain the specific L9/L12 work; these tests do not close those requirements.
