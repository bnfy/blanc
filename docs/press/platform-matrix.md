# Press-build platform matrix

Last verified: July 27, 2026

This is the fail-closed distribution matrix. A target moves to
**release-eligible** only after the exact candidate package passes its native
gate. `scripts/release.sh` requires the release operator to name both the
selected platforms and selected Mac architectures explicitly.

| Target | Current P0 evidence | Candidate status |
|---|---|---|
| macOS Apple Silicon | Exact `v1.0.0-rc.2` app is Developer ID signed, notarized, stapled, Gatekeeper-accepted after copying from the mounted DMG, and clean-launched from an empty profile; all five published assets fetch logged-out and match the published SHA-256 manifest. **Same-profile migration from `v0.22.0` has not been re-run for `rc.2`** | Distributed as the sole RC target; one gate outstanding before Stable |
| macOS Intel | Build target and public v0.22.0 artifact exist; no native Intel test of this working tree was available | Not release-eligible |
| Windows x64 | Workflow now refuses unsigned output and verifies both Authenticode validity and expected publisher. GitHub auth and Azure tenant/client/account/endpoint values are present, but the required certificate-profile/publisher values and a current Windows 11 install/SmartScreen test are absent | Not release-eligible |
| Linux x86_64 | Native CI job and AppImage artifact checks are defined; current workflow dispatch and x86_64 launch were not available to verify locally | Not release-eligible |

`v1.0.0-rc.2` is distributed only for macOS Apple Silicon. Other targets stay
outside the 1.0 press claim unless a later immutable candidate and native gate
explicitly add them.

## Carried forward from rc.1, not re-verified

The matrix states only what the **exact** candidate has passed. `rc.1` cleared
same-profile migration from public Stable `v0.22.0`; `rc.2` has not been put
through that check, and the rc.1 result is not evidence for a different
package.

The risk is low and bounded: `git diff v1.0.0-rc.1..v1.0.0-rc.2 -- src/`
touches eleven files, none of which is store, settings, session, sync, or
migration code. The diff is the address-bar context menu, View Page Source,
their main-process wiring, and chrome markup/CSS. So the check is expected to
pass — but "expected to pass" is not a gate. It must run against `rc.2` before
Stable, and the result belongs in the rc.2 evidence report.
