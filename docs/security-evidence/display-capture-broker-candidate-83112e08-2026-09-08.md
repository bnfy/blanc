# Display-capture broker — fix candidate `83112e08` — 2026-09-08

## Freeze

| Field | Value |
| --- | --- |
| Branch | `feat/display-capture-broker` |
| Candidate commit | `83112e08689eb6a532d43fead24911618846510d` |
| Message | Fix packaged display-share readiness on macOS and Wayland ozone. |
| Parent | `a2343b918d79ac71d221a8df7b0c7d5c3ff12824` |
| Blanc version | 1.15.0 (candidate; not a public release bump) |
| Electron | 44.1.1 |
| Merge / release | **Gated.** No public tag, draft, or updater publish. |

Artifacts: `output/display-capture-candidate-83112e08/`

## Fixes in this candidate

1. **macOS packaged Meet hang** — page patch required WebRTC remote tracks to be both `live` and unmuted before resolving `getDisplayMedia`. Packaged helper streams arrived `live` but still `muted` until the first decoded frame, so Meet never received a stream (startup timeout → “Can't share”). Unpackaged smoke returned the same muted-but-live tracks once the gate was relaxed (`PRODUCT_SMOKE_OK darwin`). Packaged CDP smoke on notarized `BlancCaptureCandidate83112.app` returned `{ok:true, tracks:[{kind:video,readyState:live,muted:true}]}` → **PACKAGED_SMOKE_OK**.
2. **Linux Wayland X11 capturer** — packaged AppImages on Wayland+XWayland fell through to X11 ozone (`Unable to open display`). `applyLinuxCaptureOzone` now forces `--ozone-platform=wayland` when `WAYLAND_DISPLAY` / `XDG_SESSION_TYPE=wayland` is set. Guest process list shows GPU/renderer with `--ozone-platform=wayland`; no X11 display errors in the Meet launch log.

## Authentication

### macOS (private notarized rebuild)

| Check | Result |
| --- | --- |
| Worktree | `Blanc Browser-display-capture-candidate` @ `83112e08` |
| DMG SHA-256 | `538f30ce5a46f00cca7b615b1da57bff8ed077c80800d489bb64886c88603593` |
| ZIP SHA-256 | `18ea9b35e82310b8e3f4541039d7040bc6ef584b519317d078aa2794a065644a` |
| codesign / Gatekeeper / stapler | deep/strict valid; `spctl` Notarized Developer ID; stapler OK |
| Gate status | **AUTHENTICATED** (private candidate) |
| Side-by-side install used for smoke/Meet | `/Applications/BlancCaptureCandidate83112.app` |

### Linux arm64 (private AppImage)

| Check | Result |
| --- | --- |
| Host | Ubuntu 24.04.3 ARM64 (Parallels), native aarch64 |
| Artifact | `Blanc-1.15.0-arm64.AppImage` |
| SHA-256 | `b789d23d0a2944c0d4fcf92322c309872a874ca20272655b40a2f2dcf6d4aa02` |
| `latest-linux-arm64.yml` SHA-256 | `71190e942cba598aed1a2058fb17bb881aa5c562d5df103699fc5b84674d2a04` |
| `file` | ELF aarch64 |
| Sigstore | **AUTHENTICATED** — `shasum -a 256 -c SHA256SUMS` passed for AppImage + metadata; fresh Safari OIDC completed; bundle written; separate `cosign verify-blob --bundle SHA256SUMS.sigstore.json --certificate-identity anthony@bnfy.me --certificate-oidc-issuer https://github.com/login/oauth SHA256SUMS` returned **Verified OK** |
| Ozone observed | `--ozone-platform=wayland` on GPU + renderers |

### Windows

The prior `a2343b91` installer `134f8ce1…719fa1` retains its historical Meet **PASS**. It is not a Windows build of `83112e08`: this commit changes shared capture-preload readiness and broker/helper code. New Windows private validation run **34250513362** completed successfully on `83112e08689eb6a532d43fead24911618846510d`. Downloaded installer SHA-256 **`c0efaa63763094830b73a29a1b0ef25dd42ea4327ff7afadc99d121adefe8dfb`** matches `windows-signature.json`; Valid Authenticode, exact `CN=Bananify Creative, O=Bananify Creative, L=North Chili, S=New York, C=US` publisher and Microsoft timestamp. This artifact is **AUTHENTICATED**. Guest installation remains pending: script-file execution was disabled, then direct command attempts failed before entering the guest with Parallels session error 255. No execution policy was changed. The prior pass does not clear the current-candidate gate.

## Local packaged proof (not conference)

| Check | Result |
| --- | --- |
| Unpackaged product-smoke | `PRODUCT_SMOKE_OK darwin` (muted live A/V tracks) |
| Packaged CDP smoke (`BlancCaptureCandidate83112.app`) | **PACKAGED_SMOKE_OK** — live muted video after Island Continue |

## Conference matrix status

| Platform | Status |
| --- | --- |
| Windows | **INSTALLED** authenticated `c0efaa63…` (`83112e08`) at `C:\Users\anthonyjloria\AppData\Local\Programs\Blanc\Blanc.exe` via `prlctl --current-user` silent install (hash + Authenticode OK). Meet launched to `wza-fnfj-khj` for **owner Present retest** — conference cell still **RETEST REQUIRED** until receiver evidence is recorded. Historical `134f8ce1…` PASS retained only for that prior installer |
| macOS Meet | **FAIL** on `wza-fnfj-khj` — window **and** entire-screen + computer audio both fail after Island Share; Cancel **PASS**; local packaged diagnostic **195 decoded frames** (basic acquisition OK → conference-integration FAIL). Diagnosis: missing relayed `displaySurface` + resolve-before-unmute/dimensions (see macOS companion). **`83112e08` is not release-ready.** |
| Linux arm64 Meet | **PRESENTATION NOT RUN** — authenticated; joined `wza-fnfj-khj` with mic/camera; ozone=wayland observed; Present → portal Share still needs native owner interaction. See `display-capture-broker-gate-2026-09-08-linux-83112e08.md` |

No new conference passes, product changes, or gate waivers. **Merge/release remain blocked** until all three platforms pass on this candidate and the negative matrix is complete (or an explicit written waiver).

## Live setup reconciliation

During the follow-up on 2026-09-08, the old cosign process had waited over three hours with no signature bundle. It was stopped and the existing manifest script restarted in an approved interactive session. The fresh URL was opened in Safari; signing and independent verification completed. No build was rerun.

No new conference result was established: Safari was at Meet home, the specific Mac candidate was absent from process-name inspection, and computer control timed out twice opening `/Applications/BlancCaptureCandidate83112.app`. The Ubuntu window showed the Google Meet marketing page, not an active call. These observations are setup blockers, not conference PASSes or new capture FAILs.
