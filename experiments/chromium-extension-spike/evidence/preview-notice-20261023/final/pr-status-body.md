<!-- BEGIN BLANC PREVIEW STATUS -->
## Preview security and withdrawal status

**Not publicly released — evaluation only.** No Blanc Chromium Preview version is approved for public distribution from this PR. The engineering checks below do not authorize a release or establish that an installed build remains secure indefinitely.

- **Chromium baseline:** 157.0.8103.15. Apple Silicon, macOS 27; tested on 27.2.
- **Latest evaluation artifact (not a public release):** source `9a1b4fa9b3ad6ebdb1ae7eebf10bea5d74533468`, SHA-256 `f177e0b5100db9a3fc83c7d5522cc343b86582add4d209d49696cef4f3729a55`; Apple notarization accepted (`dbe289ff-82fd-4ddf-87ea-d2a3023677f6`). L9 manual update/withdrawal acceptance is complete; other launch gates remain open.
- **Updates:** manual signed replacement only. Shipping Blanc does not install or update this preview. Check this section before using or updating a candidate; installed previews do not poll it automatically.
- **Update safely:** quit the preview, save a closed backup of its own profile, verify the replacement's published checksum and Developer ID, and replace only `Blanc Chromium Preview.app`. A macOS signature or security rejection is a stop condition, not a reason to bypass Gatekeeper.
- **If a version is marked withdrawn:** quit it and use shipping Blanc. Remove only the preview app; preserve its profile for recovery. Manual-only previews cannot be remotely disabled.
- **Rollback:** retain the newer profile separately. Use the older signed app with its matching closed pre-update profile backup, or start with a fresh preview profile. Do not open an upgraded profile with an older binary.
- **Preview data:** `~/Library/Application Support/Blanc Chromium Preview`. Shipping profiles must not be copied into this directory. Removing the app does not mean deleting this data.
- **Maintenance owner:** Anthony Loria. Distribution is suspended whenever the sole maintainer cannot review security updates.
- **Private security/support contact:** [support@blanc.day](mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview). Do not post passwords, private browsing data, or sensitive logs here.

This PR URL is the live status and withdrawal route, including after the PR closes. The maintainer keeps this section accessible while any preview references it. Public release, if separately approved, must identify the exact artifact, checksum, date, supported scope and current security status here. A withdrawal must name affected versions and give a replacement or retreat instruction. Updated October 23, 2026.
<!-- END BLANC PREVIEW STATUS -->

## Implementation and validation

This PR adds native WebSocket/WebTransport and prefetch enforcement, profile/owner teardown and encrypted session recovery fixes, and the self-contained signed Mac preview package. Shipping Blanc remains separate.

The Start Page now includes an offline **Version & security** notice with packaged version/source metadata, safe manual update/rollback/removal instructions and explicit live-status/support links. The Island provides the same live status route. Native builds stay incremental; the notice uses the existing native output with no Chromium recompile.

The primary implementation plan and hashed evidence cover request enforcement, signed security/recovery/isolation, the 157.0.8103.15 update, and the 43-check signed update/rollback sequence. Notice-specific signed verification and Apple receipts are recorded in this PR's evidence. Earlier fixture failures are retained and not counted as final passing checks.

Full security/functional/physical-input and remaining release gates are still open. The authentic Google extension-upgrade baseline remains separate. Latency is deferred and the Electron diagnostic build remains pending approval. Keep this PR draft against `codex/chromium157-rebase`; no merge or release is authorized by these engineering results.
