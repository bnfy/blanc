# Preview signing access — October 22

Shipping `/Applications/Blanc.app` reports Developer ID Application: Anthony Loria (XYGUCY4498), Team XYGUCY4498, hardened runtime and a stapled notarization ticket. This identifies the publisher, not the location or availability of the private key.

Explicit login and System keychain signing-identity queries each return zero valid identities. A direct codesign attempt against a disposable copy of the preview launcher using the exact shipping identity returns `no identity found`. The configured 1Password release environment authenticates and supplies notarization credentials, but no CSC_LINK/CSC_KEY_PASSWORD. No secret values were printed or archived.

The current normal incremental output was staged at `/private/tmp/blanc-signed-preview-20261022/Blanc Chromium Preview.app`. It is self-contained and remains ad-hoc signed, not Developer ID signed/notarized. `staging-report.json` records ten bundle metadata entries, role-specific upstream entitlement source hashes and the staging manifest digest. Launcher test passes; strict deep ad-hoc verification passed during packaging. This is preparation, not signed isolation or recovery acceptance.

Google baseline and dev snapshots before/after both retain respectively one NewTab/selected0 and two NewTabs/selected1. Neither was restarted. No Chromium or Electron build occurred; only the packager's small launcher compilation. Latency remains deferred.

A broad filesystem certificate-container lookup was rejected by automatic approval review due to the risk of probing unrelated credentials; it did not run. Continue through the configured signing environment or an owner-identified certificate location. Do not search unrelated credential stores or substitute ad-hoc signatures for release acceptance. Signed artifact isolation/recovery checks remain pending, as does notarization. Gate count remains 1/12.

## Configured-vault follow-up

The vault explicitly referenced by `.env.1password` contains an item titled “Blanc Developer ID Application (.p12 backup)”. Its sole attachment is `development.cer` (1484 bytes). Public X.509 inspection identifies **Apple Development: Anthony Loria (SFUFRK6RPG)**, team XYGUCY4498, valid July 17 2026–July 17 2027. It is a public development certificate, not the shipping Developer ID Application identity or a private-key container. No import was attempted, no private key was exported, and no keychain was modified. The temporary public certificate copy was removed after inspection.

The shipping identity is conclusively `Developer ID Application: Anthony Loria (XYGUCY4498)`. Its private key is not available through the checked login/System keychains or this configured backup. Owner action requested: make the release keychain accessible or correct the designated backup with the actual exported identity, keeping its password out of chat. Do not run signed-artifact recovery/isolation claims against the ad-hoc staged app. Notarization and signed acceptance remain blocked; no release gate closed.
