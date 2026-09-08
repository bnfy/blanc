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
| Candidate commit SHA | `83112e08689eb6a532d43fead24911618846510d` (fix over `a2343b91`) |
| Electron | 44.1.1 |
| Chromium | Electron 44.1.1 stock (not recompiled) |
| macOS artifact + SHA-256 | `Blanc-1.15.0-arm64.dmg` → `538f30ce5a46f00cca7b615b1da57bff8ed077c80800d489bb64886c88603593` (prior FAIL DMG `4770a4a7…` superseded) |
| Windows installer + SHA-256 | `Blanc-Setup-1.15.0.exe` → `c0efaa63763094830b73a29a1b0ef25dd42ea4327ff7afadc99d121adefe8dfb` @ `83112e08`, private run 34250513362 |
| Linux AppImage + SHA-256 | x86-64 still `21774662…` from `a2343b91`. **Meet candidate:** arm64 `Blanc-1.15.0-arm64.AppImage` → `b789d23d0a2944c0d4fcf92322c309872a874ca20272655b40a2f2dcf6d4aa02` @ `83112e08` (Sigstore verified) |

Companion freeze record: `docs/security-evidence/display-capture-broker-candidate-83112e08-2026-09-08.md`.

## Artifact authentication (prerequisite)

Record the command and a short output summary. A conference cell without this
row is invalid.

| Platform | Required verification | Command + summary | Status |
| --- | --- | --- | --- |
| macOS | Native signature + Gatekeeper assessment + stapled notarization ticket on `Blanc.app` (same class as `docs/release-verification.md`) | Private notarized rebuild @ `83112e08`; DMG `538f30ce…`; deep/strict codesign; `spctl` Notarized Developer ID; stapler OK | **AUTHENTICATED** |
| Windows | Timestamped Authenticode; exact publisher; installer hash binding | Private validation run 34250513362 @ `83112e08`; downloaded `c0efaa63…` matches signature JSON; Valid exact Bananify Creative publisher and Microsoft timestamp | **AUTHENTICATED** |
| Linux (x86-64 AppImage) | Authenticated checksum manifest (`SHA256SUMS` + Sigstore/`cosign verify-blob` against the pinned identity/issuer) | Private validation x86-64 AppImage @ `a2343b91`; `shasum` + `cosign verify-blob` → Verified OK | **AUTHENTICATED** (x86-64; Meet not proven on ARM guest) |
| Linux (arm64 AppImage) | Same class for arm64 Meet candidate | Native aarch64 AppImage from `83112e08` (`b789d23d…`); AppImage + metadata `shasum` OK; bundle written; independent `cosign verify-blob` **Verified OK**, identity `anthony@bnfy.me`, issuer `https://github.com/login/oauth` | **AUTHENTICATED** |

## Conference matrix (after authentication)

Receiver-side proof: a second person or second machine sees moving screen
**and** hears system audio. Mute the sharer microphone. Play a known desktop
tone. Nonzero energy measured only inside Blanc is insufficient.

| Platform | OS/arch | Conference app | Linux display/audio stack | Receiver video | Receiver system audio | Cancel denies | Per-share Stop (incl. background tab) | Second share preserved | Mic+camera survive Stop | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | macOS arm64 (host) | Google Meet `wza-fnfj-khj` | n/a | FAIL | NOT PROVEN | PASS | Failed-share cleanup only | NOT RUN | Controls remain on | **FAIL** on `538f30ce…` @ `83112e08` (window + entire-screen + audio; local 195-frame proof; conference integration — missing relayed `displaySurface` + early muted/0×0 resolve). **Candidate not release-ready.** See `display-capture-broker-gate-2026-09-08-macos-83112e08.md` |
| Windows | Windows 11 (Parallels) | Google Meet | n/a | RETEST | RETEST | RETEST | RETEST | RETEST | RETEST | **INSTALLED** authenticated `c0efaa63…` @ `83112e08` (`LOCALAPPDATA\Programs\Blanc`); Meet launched for owner Present — conference cell still **RETEST REQUIRED** |
| Linux | Ubuntu 24.04.3 ARM64 Wayland / PipeWire | Google Meet `wza-fnfj-khj` | Wayland + Pulse/PipeWire | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | — | **PRESENTATION NOT RUN** (`b789d23d…` arm64 @ `83112e08`; joined + ozone=wayland; Present pending native interaction) |

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
