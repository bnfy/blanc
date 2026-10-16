# Platform matrix

Last verified: October 16, 2026 (public Blanc 1.35.0)

This is the fail-closed distribution matrix. A target is **released** only
after the exact published package passes its native gate. `scripts/release.sh`
requires the release operator to name the selected platforms and Mac
architectures explicitly; every release ships both Apple Silicon and Intel Mac
builds unless `BLANC_MAC_ARCH_WAIVER` records why one is missing.

| Target | Evidence for the exact public 1.35.0 package | Status |
|---|---|---|
| macOS Apple Silicon | `Blanc-1.35.0-arm64.dmg`: the contained `Blanc.app` is accepted by Gatekeeper as a notarized Developer ID app, passes strict deep `codesign` verification (team XYGUCY4498), validates its stapled ticket, and reports 1.35.0 (1350). The exact-tag public run verified the published DMG on its native runner. The owner confirmed the in-app update from public 1.34.0 | Released |
| macOS Intel | `Blanc-1.35.0.dmg` (x86_64): the same Gatekeeper, `codesign`, stapled-ticket, and version checks pass. The exact-tag public run verified the published DMG on its native Intel runner. Under Rosetta, Blanc uses Blanc Blocker; optional uBlock Origin needs a native Intel Mac | Released |
| Windows x64 | `Blanc-Setup-1.35.0.exe`: `windows-signature.json` records a valid, timestamped signature for `CN=Bananify Creative` whose SHA-256 matches the downloaded installer. The native release run and the exact-tag DNS and window checks passed. The owner confirmed the in-app update from public 1.34.0 | Released |
| Linux x64 | `Blanc-1.35.0.AppImage`: AppImages carry no OS-level publisher signature, so the authenticated release manifest is the publisher check. The exact-tag public run passed the AppImage launch and the DNS and window checks | Released |

Every one of the 18 public assets, freshly downloaded, matched its
`SHA256SUMS` entry; the complete manifest (17 artifacts, Mac arm64 and x64)
validated; and `cosign verify-blob` passed against the pinned identity and
issuer. Runs: [native release 38950910662](https://github.com/bnfy/blanc/actions/runs/38950910662)
and [exact-tag public 38951898219](https://github.com/bnfy/blanc/actions/runs/38951898219).
The full record is
[`docs/release-incidents/2026-10-16-v1.35.0.md`](../release-incidents/2026-10-16-v1.35.0.md).

## History

The 1.0 release candidate, `v1.0.0-rc.2` (July 2026), shipped for macOS Apple
Silicon only; Intel, Windows, and Linux were not yet release-eligible. Its
evidence, including the same-profile migration check, is in
[`p0-evidence-2026-07-26-rc2.md`](./p0-evidence-2026-07-26-rc2.md).
