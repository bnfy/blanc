# Press-build platform matrix

Last verified: July 27, 2026

This is the fail-closed distribution matrix. A target moves to
**release-eligible** only after the exact candidate package passes its native
gate. `scripts/release.sh` requires the release operator to name both the
selected platforms and selected Mac architectures explicitly.

| Target | Current P0 evidence | Candidate status |
|---|---|---|
| macOS Apple Silicon | Exact `v1.0.0-rc.2` app is Developer ID signed, notarized, stapled, Gatekeeper-accepted after copying from the mounted DMG, clean-launched from an empty profile, and same-profile migration tested from public Stable `v0.22.0` using both published DMGs; all five published assets fetch logged-out and match the published SHA-256 manifest | Release-eligible; distributed as the sole RC target |
| macOS Intel | Build target and public v0.22.0 artifact exist; no native Intel test of this working tree was available | Not release-eligible |
| Windows x64 | Workflow now refuses unsigned output and verifies both Authenticode validity and expected publisher. GitHub auth and Azure tenant/client/account/endpoint values are present, but the required certificate-profile/publisher values and a current Windows 11 install/SmartScreen test are absent | Not release-eligible |
| Linux x86_64 | Native CI job and AppImage artifact checks are defined; current workflow dispatch and x86_64 launch were not available to verify locally | Not release-eligible |

`v1.0.0-rc.2` is distributed only for macOS Apple Silicon. Other targets stay
outside the 1.0 press claim unless a later immutable candidate and native gate
explicitly add them.

## Nothing is carried forward from rc.1

The matrix states only what the **exact** candidate has passed. `rc.1`'s
results are not evidence for a different package, so the macOS row was held at
one-gate-outstanding until same-profile migration ran against `rc.2` itself.
That check ran on 2026-07-27 against both published DMGs and passed; the
method and the twenty-one equality checks are recorded in
`p0-evidence-2026-07-26-rc2.md`.
