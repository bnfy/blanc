# Manual preview maintenance and withdrawal

October 22, 2026. Operational draft supporting L3/L9/L12. The owner approved manual-only signed preview updates and use of the existing release-signing environment. This document does not approve distribution or close a gate.

## User contract

Blanc Chromium Preview is a separate Apple Silicon/macOS 27.2 application using a fresh preview profile. Shipping Blanc and its updater never install or update this preview. No shipping profile import, migration or replacement is performed. Each published preview must identify its version, Chromium version, build commit, release date, SHA-256, supported OS, known limitations and security status.

Updates are manual: quit the preview, retain a closed backup of its own profile, obtain the replacement from the project's approved release location, verify its Developer ID and Gatekeeper acceptance, and replace only the preview app. Never copy a profile while the preview is running. Never point the preview at shipping Blanc or the Google upgrade fixture. A release must contain these instructions and a visible link to its security/withdrawal notice; the final link and notice surface remain implementation requirements.

## Operator procedure

1. Freeze the candidate commit and record bundled assets/dependency inventory. Sign through the existing release-signing environment using Chromium-appropriate entitlements and distinct preview/helper identities. Notarize and staple; retain receipts and digests.
2. Run the frozen candidate acceptance on macOS 27.2, including signed-identity keychain behavior, isolation, recovery, extensions, accessibility and quarantine launch. Record exact artifact identity and reviewer.
3. Publish only after artifact-specific owner approval. Never retarget shipping updater feeds. Record the replacement version and any profile compatibility restriction in the notice.
4. Review upstream security advisories each working day while a preview is supported. A named primary and backup maintainer must accept this duty before launch. Record affected versions, fix availability and the decision to replace or withdraw; do not promise an unstaffed repair deadline.
5. For a known exploitable security defect, reproducible enabled-feature data loss, signature compromise or unsupported baseline, mark the affected preview withdrawn in its release/security notice and remove its recommended download. Direct users to quit it and use shipping Blanc. Preserve evidence and provide replacement instructions only after verification. A manual-only preview cannot remotely force an installed app to stop; disclose that limitation.

## Retreat and rollback

Removing the preview app must leave shipping Blanc and both applications' data untouched. Preview data removal is a separate explicit user action. Do not silently downgrade an already-upgraded profile: rollback uses a closed pre-update preview backup with its matching verified artifact, or a fresh preview profile. Preserve the newer profile separately. Never claim arbitrary backwards profile compatibility.

## Required acceptance records (still open)

- Named maintenance primary/backup, approved release/security notice location and working feedback/security route.
- Signed preview A → preview B replacement using a disposable preview profile, with tabs preserved and shipping app/profile unchanged.
- Withdrawal notice and fresh-profile or matching-backup retreat rehearsal; confirm no shipping updater ownership.
- Clean supported macOS 27.2 quarantine launch and final artifact review. The owner amended the acceptance target to macOS 27.2; final artifact observations must identify that OS.

Evidence must name commit, app digest, OS, identity, steps, result and limitations. Existing ad-hoc packaging/recovery evidence informs these checks but is not a signed-update pass. Google real-upgrade gate remains independent. Latency is deferred and the Electron diagnostic build remains pending approval.
