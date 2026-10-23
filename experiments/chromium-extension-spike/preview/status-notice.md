## Preview security and withdrawal status

**Not publicly released — evaluation only.** No Blanc Chromium Preview version is approved for public distribution from this PR. The engineering checks below do not authorize a release or establish that an installed build remains secure indefinitely.

- **Chromium baseline:** 157.0.8103.15. Apple Silicon, macOS 27; tested on 27.2.
- **Latest evaluation artifact (not a public release):** source `09985c160803f3432f0d2b40a21caa13e249e53c`, SHA-256 `4c86c89e7ec81791ef8bedf525187b302c313f913a5e5b07a26d4d2a45b9ef00`; Apple notarization accepted (`1818186c-4b95-4571-b822-397bf8705161`). The two L7 diagnostic findings are repaired and signed security checks pass; owner security/privacy acceptance remains pending. L9 manual update/withdrawal acceptance is complete; other launch gates remain open.
- **Updates:** manual signed replacement only. Shipping Blanc does not install or update this preview. Check this section before using or updating a candidate; installed previews do not poll it automatically.
- **Update safely:** quit the preview, save a closed backup of its own profile, verify the replacement's published checksum and Developer ID, and replace only `Blanc Chromium Preview.app`. A macOS signature or security rejection is a stop condition, not a reason to bypass Gatekeeper.
- **If a version is marked withdrawn:** quit it and use shipping Blanc. Remove only the preview app; preserve its profile for recovery. Manual-only previews cannot be remotely disabled.
- **Rollback:** retain the newer profile separately. Use the older signed app with its matching closed pre-update profile backup, or start with a fresh preview profile. Do not open an upgraded profile with an older binary.
- **Preview data:** `~/Library/Application Support/Blanc Chromium Preview`. Shipping profiles must not be copied into this directory. Removing the app does not mean deleting this data.
- **Maintenance owner:** Anthony Loria. Distribution is suspended whenever the sole maintainer cannot review security updates.
- **Private security/support contact:** [support@blanc.day](mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview). Do not post passwords, private browsing data, or sensitive logs here.

This PR URL is the live status and withdrawal route, including after the PR closes. The maintainer keeps this section accessible while any preview references it. Public release, if separately approved, must identify the exact artifact, checksum, date, supported scope and current security status here. A withdrawal must name affected versions and give a replacement or retreat instruction. Updated October 23, 2026.
