# Display-capture broker — Meet-share facade candidate `cb8e7956` — 2026-09-08

## Freeze

| Field | Value |
| --- | --- |
| Branch | `feat/display-capture-broker` |
| Candidate commit | `cb8e7956ced7f4a727382b8a2a7df120f4622a77` |
| Message | Expose displaySurface on relayed share tracks for Meet. |
| Parent | `83112e08689eb6a532d43fead24911618846510d` (Mac Meet FAIL; not release-ready) |
| Blanc version | 1.15.0 (candidate package; not a public release bump) |
| Electron | 44.1.1 |
| Merge / release | **Closed.** Validation packaging + conference retest only. |

Artifacts: `output/display-capture-candidate-cb8e7956/`

## What changed vs `83112e08`

- Pass W3C `displaySurface` (`monitor`/`window`) from picker `surfaceKind` into the page resolve payload
- Facade `getSettings` / `getConstraints` / `getCapabilities` on relayed video tracks
- Bounded publish wait (~2s) preferring unmute + non-zero width **and** height; live-only fallback
- Reject `AbortError` if any required track (video or computer-audio) ends mid-wait — no hang

Unit: **38/38** display-capture page-patch + broker tests.

## Authentication

### Windows (private validation)

| Check | Result |
| --- | --- |
| Actions run | https://github.com/bnfy/blanc/actions/runs/34255443283 |
| Head SHA | `cb8e7956ced7f4a727382b8a2a7df120f4622a77` |
| Installer SHA-256 | `c9bef2a1fa4ee060882f2cd92f9b7d095324aec31bb7bfe45dd9da1ab2176084` |
| Signature JSON bind | match |
| Publisher | `CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US` |
| Status / timestamp | Valid + Microsoft timestamp |
| Gate status | **AUTHENTICATED** |

### macOS (private notarized rebuild)

| Check | Result |
| --- | --- |
| DMG SHA-256 | `88a7e5c90cd7e2d0dc2e395292c6959e98704b372ce9ea0d94145de55703a828` |
| codesign deep/strict | valid |
| spctl | Notarized Developer ID — Anthony Loria (XYGUCY4498) |
| stapler | validate OK (Xcode-beta) |
| Side-by-side | `/Applications/BlancCaptureCandidateCb8e.app` |
| Gate status | **AUTHENTICATED** |

### Linux arm64 (guest AppImage)

| Check | Result |
| --- | --- |
| AppImage SHA-256 | `3bf811060a587ebbdba3a3dc8022e239d1047b28d9131febb51bfd0ef9be13e9` |
| Architecture | aarch64 ELF |
| SHA256SUMS | present (AppImage + latest-linux-arm64.yml) |
| Sigstore / cosign | **PENDING** — host `cosign sign-blob` awaiting OIDC (Safari) |
| Gate status | **BUILT; auth incomplete until Sigstore verifies** |

### Linux x86-64 (validation Actions)

Present under `linux-x64-validation/`; Meet guest remains arm64.

## Conference matrix

| Platform | Status |
| --- | --- |
| macOS Meet | **RETEST REQUIRED** on DMG `88a7e5c9…` / `BlancCaptureCandidateCb8e.app` |
| Windows Meet | **RETEST REQUIRED** on installer `c9bef2a1…` (install + Present) |
| Linux arm64 Present | **RETEST REQUIRED** after Sigstore completes on `3bf81106…` |

Prior `83112e08` Mac FAIL and historical Windows PASS on older installers do **not** clear this candidate. Merge/release remain closed.
