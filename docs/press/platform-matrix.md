# Press-build platform matrix

Last verified: July 24, 2026

This is the fail-closed distribution matrix. A target moves to
**release-eligible** only after the exact candidate package passes its native
gate. `scripts/release.sh` requires the release operator to name both the
selected platforms and selected Mac architectures explicitly.

| Target | Current P0 evidence | Candidate status |
|---|---|---|
| macOS Apple Silicon | Exact `v1.0.0-rc.1` app is Developer ID signed, notarized, stapled, Gatekeeper-accepted after copying from the mounted DMG, clean-launched, and same-profile migration tested from `v0.22.0`; the published manifest and SHA-256 hashes pass | Release-eligible; distributed as the sole RC target |
| macOS Intel | Build target and public v0.22.0 artifact exist; no native Intel test of this working tree was available | Not release-eligible |
| Windows x64 | Workflow now refuses unsigned output and verifies both Authenticode validity and expected publisher. GitHub auth and Azure tenant/client/account/endpoint values are present, but the required certificate-profile/publisher values and a current Windows 11 install/SmartScreen test are absent | Not release-eligible |
| Linux x86_64 | Native CI job and AppImage artifact checks are defined; current workflow dispatch and x86_64 launch were not available to verify locally | Not release-eligible |

`v1.0.0-rc.1` is distributed only for macOS Apple Silicon. Other targets stay
outside the 1.0 press claim unless a later immutable candidate and native gate
explicitly add them.
