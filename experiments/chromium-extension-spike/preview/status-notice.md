## Preview security and withdrawal status

**Not publicly released — evaluation only.** No Blanc Chromium Preview version is approved for public distribution from this PR. The engineering checks below do not authorize a release or establish that an installed build remains secure indefinitely.

- **Chromium baseline:** 157.0.8103.15. Apple Silicon, macOS 27; tested on 27.2.
- **Latest evaluation artifact (not a public release):** source `7c427328100d1ba76cb7e8b651a1f36d74ec86c6`, SHA-256 `ffcfefdfbb5421619f3ba359bb4c5d92134b468ac8475c18eda12153a7f5e4ed`; Apple notarization accepted (`e46dbe18-f1f1-424e-abe9-ab44b79ef29c`). The native certificate-blocklist replacement passes 46 frozen checks and bounded L8 distribution/owner acceptance. Readiness **9/12 (75%)**. The initial missing-tabs observation remains documented with unresolved concurrency attribution. Google upgrade (L4), the separate Electron sandbox/CI blocker (L11), final readiness (L12) and Decision 2 remain open; no release or merge is approved.
- **Updates:** manual signed replacement only. Shipping Blanc does not install or update this preview. Check this section before using or updating a candidate; installed previews do not poll it automatically.
- **Update safely:** quit the preview, save a closed backup of its own profile, verify the replacement's published checksum and Developer ID, and replace only `Blanc Chromium Preview.app`. A macOS signature or security rejection is a stop condition, not a reason to bypass Gatekeeper.
- **If a version is marked withdrawn:** quit it and use shipping Blanc. Remove only the preview app; preserve its profile for recovery. Manual-only previews cannot be remotely disabled.
- **Rollback:** retain the newer profile separately. Use an older signed app only if it is still approved by this security notice, with its matching closed pre-update profile backup or a fresh preview profile. Do not open an upgraded profile with an older binary. If no approved rollback exists, use Shipping Blanc.
- **Preview data:** `~/Library/Application Support/Blanc Chromium Preview`. Shipping profiles must not be copied into this directory. Removing the app does not mean deleting this data.
- **Maintenance owner:** Anthony Loria. Distribution is suspended whenever the sole maintainer cannot review security updates.
- **Private security/support contact:** [support@blanc.day](mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview). Do not post passwords, private browsing data, or sensitive logs here.

This PR URL is the live status and withdrawal route, including after the PR closes. The maintainer keeps this section accessible while any preview references it. Public release, if separately approved, must identify the exact artifact, checksum, date, supported scope and current security status here. A withdrawal must name affected versions and give a replacement or retreat instruction. Updated October 23, 2026.
