# Display-capture broker gate

Checklist template for the packaged conference matrix in
`docs/superpowers/specs/2026-09-07-display-capture-broker-design.md` §8.

Do not mark a cell PASS without a dated, artifact-bound run on that exact
candidate. Probe results and unpackaged stubs do not satisfy this gate.
Conference passes do not count until authentication on that candidate is
recorded.

Fill a dated companion file per platform after a real run, for example
`docs/security-evidence/display-capture-broker-gate-YYYY-MM-DD-<platform>.md`.
Renew the whole matrix if capture or packaging changes.

## Candidate identity (required before any conference cell)

| Field | Value |
| --- | --- |
| Blanc version | 1.15.0 (candidate package; not a public release bump) |
| Candidate commit SHA | **`cb8e7956ced7f4a727382b8a2a7df120f4622a77`** (Meet-share facade over `83112e08`). Prior FAIL freeze `83112e08` remains not release-ready. |
| Electron | 44.1.1 |
| Chromium | Electron 44.1.1 stock (not recompiled) |
| macOS artifact + SHA-256 | `Blanc-1.15.0-arm64.dmg` → `88a7e5c90cd7e2d0dc2e395292c6959e98704b372ce9ea0d94145de55703a828` (**AUTHENTICATED**; prior FAIL `538f30ce…` @ `83112e08` superseded for Meet) |
| Windows installer + SHA-256 | `Blanc-Setup-1.15.0.exe` → `c9bef2a1fa4ee060882f2cd92f9b7d095324aec31bb7bfe45dd9da1ab2176084` @ run **34255443283** (**AUTHENTICATED**) |
| Linux AppImage + SHA-256 | Meet candidate arm64 `Blanc-1.15.0-arm64.AppImage` → `3bf811060a587ebbdba3a3dc8022e239d1047b28d9131febb51bfd0ef9be13e9` (built; **Sigstore pending**). x86-64 from same validation run under `linux-x64-validation/`. |

Companion freeze record: `docs/security-evidence/display-capture-broker-candidate-cb8e7956-2026-09-08.md`. Historical FAIL: `display-capture-broker-candidate-83112e08-2026-09-08.md`.

## Artifact authentication (prerequisite)

Record the command and a short output summary. A conference cell without this
row is invalid.

| Platform | Required verification | Command + summary | Status |
| --- | --- | --- | --- |
| macOS | Native signature + Gatekeeper assessment + stapled notarization ticket on `Blanc.app` (same class as `docs/release-verification.md`) | Private notarized rebuild @ `cb8e7956`; DMG `88a7e5c9…`; deep/strict codesign; `spctl` Notarized Developer ID; stapler OK (Xcode-beta) | **AUTHENTICATED** |
| Windows | Timestamped Authenticode; exact publisher; installer hash binding | Private validation run 34255443283 @ `cb8e7956`; downloaded `c9bef2a1…` matches signature JSON; Valid exact Bananify Creative publisher and Microsoft timestamp | **AUTHENTICATED** |
| Linux (x86-64 AppImage) | Authenticated checksum manifest (`SHA256SUMS` + Sigstore/`cosign verify-blob` against the pinned identity/issuer) | Validation artifact from run 34255443283 @ `cb8e7956` (Meet guest is arm64) | **DOWNLOADED** (Meet path is arm64) |
| Linux (arm64 AppImage) | Same class for arm64 Meet candidate | Guest AppImage `3bf81106…` @ `cb8e7956`; SHA256SUMS present; **cosign sign-blob pending OIDC** | **BUILT — Sigstore PENDING** |

## Conference matrix (after authentication)

Receiver-side proof: a second person or second machine sees moving screen
**and** hears system audio. Mute the sharer microphone. Play a known desktop
tone. Nonzero energy measured only inside Blanc is insufficient.

| Platform | OS/arch | Conference app | Linux display/audio stack | Receiver video | Receiver system audio | Cancel denies | Per-share Stop (incl. background tab) | Second share preserved | Mic+camera survive Stop | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | macOS arm64 (host) | Google Meet `wza-fnfj-khj` | n/a | RETEST | RETEST | RETEST | RETEST | RETEST | RETEST | **RETEST REQUIRED** on authenticated `88a7e5c9…` @ `cb8e7956` (`/Applications/BlancCaptureCandidateCb8e.app`). Prior FAIL on `538f30ce…` @ `83112e08` does not clear this candidate. |
| Windows | Windows 11 (Parallels) | Google Meet | n/a | RETEST | RETEST | RETEST | RETEST | RETEST | RETEST | **RETEST REQUIRED** on authenticated `c9bef2a1…` @ `cb8e7956` (install + Present). Prior installers do not clear this SHA. |
| Linux | Ubuntu 24.04.3 ARM64 Wayland / PipeWire | Google Meet `wza-fnfj-khj` | Wayland + Pulse/PipeWire | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | — | **RETEST REQUIRED** on arm64 `3bf81106…` @ `cb8e7956` after Sigstore completes |

Windows/Linux guests in Parallels qualify only for those guest configurations.
One service per platform satisfies the conference minimum.

## Negative matrix (same verified artifacts)

Record graceful `NotAllowedError` / `InvalidStateError` / `AbortError` versus
renderer kill. Both count as no stream; say which occurred.

| Session | Wrapper-bypass / unscoped `getDisplayMedia` / legacy no-source-ID `chromeMediaSource` | Mixed desktop + device `getUserMedia` with remembered mic/camera | Forged/no-activation IPC | Off-machine ICE/SDP | Status |
| --- | --- | --- | --- | --- | --- |
| Personal | | | | | NOT RUN |
| Named profile | | | | | NOT RUN |
| Private | | | | | NOT RUN |

## Early helper audio (feasibility, not this gate)

On 2026-09-08 the owner approved the Linux-only disable of
`WebRtcAllowInputVolumeAdjustment` and broker/Island picker integration after
the recorded guest tone-follow and analog-input listening checks. Windows
also has receiver-energy feasibility evidence. Those records permit product
integration; they do not replace any packaged conference cell above.

Unpackaged Mac/Windows/Linux product smokes (Island picker / Linux portal,
Cancel, live A/V tracks, independent Stop) are recorded in
`experiments/display-capture-broker/product-smoke/result.md`. They do not
authenticate a candidate or satisfy any conference cell. Live tracks are not
audible system-audio proof.

**Next before merge/release:** All three `83112e08` artifacts are authenticated.
macOS Meet is **FAIL** after muted-track readiness fix: local packaged video
works (195 decoded frames); Meet still rejects window and entire-screen shares
with computer audio (conference integration). Linux Present is still not run.
Windows Meet on this candidate is blocked on guest install (Parallels).
Historical Windows PASS on `134f8ce1…` does not clear `c0efaa63…`. Temporary
diagnostics stopped; no product change or waiver. Complete Mac conference
diagnosis/fix, Linux Present, Windows install+retest, and the negative
matrix before merge/release (or record an explicit written waiver).

Prior `a2343b91` FAIL companions remain historical:
`display-capture-broker-gate-2026-09-08-macos-meet.md`,
`display-capture-broker-gate-2026-09-08-linux-meet.md`.

The Linux flag affects microphone APM input-volume recommendations throughout
the process. Linux packaged proof must include simultaneous mic, camera, and
system audio, and independent sharing Stop. No additional speech probe is
required on the already-tested guest merely because envelope correlation varies.
