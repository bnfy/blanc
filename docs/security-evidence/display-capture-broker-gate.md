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
| Blanc version | NOT RUN |
| Candidate commit SHA | NOT RUN |
| Electron | NOT RUN |
| Chromium | NOT RUN |
| macOS artifact + SHA-256 | NOT RUN |
| Windows installer + SHA-256 | NOT RUN |
| Linux AppImage + SHA-256 | NOT RUN |

## Artifact authentication (prerequisite)

Record the command and a short output summary. A conference cell without this
row is invalid.

| Platform | Required verification | Command + summary | Status |
| --- | --- | --- | --- |
| macOS | Native signature + Gatekeeper assessment + stapled notarization ticket on `Blanc.app` (same class as `docs/release-verification.md`) | | NOT RUN |
| Windows | Timestamped Authenticode; subject equals `WINDOWS_EXPECTED_PUBLISHER`; bind `windows-signature.json` / installer SHA-256 | | NOT RUN |
| Linux | Authenticated checksum manifest (`SHA256SUMS` + Sigstore/`cosign verify-blob` against the pinned identity/issuer) | | NOT RUN |

## Conference matrix (after authentication)

Receiver-side proof: a second person or second machine sees moving screen
**and** hears system audio. Mute the sharer microphone. Play a known desktop
tone. Nonzero energy measured only inside Blanc is insufficient.

| Platform | OS/arch | Conference app | Linux display/audio stack | Receiver video | Receiver system audio | Cancel denies | Per-share Stop (incl. background tab) | Second share preserved | Mic+camera survive Stop | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | | | n/a | | | | | | | NOT RUN |
| Windows | | | n/a | | | | | | | NOT RUN |
| Linux | | | | | | | | | | NOT RUN |

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

**Next before merge/release:** freeze a reviewed candidate commit → build and
authenticate platform packages → one real Meet/Teams/Zoom pass per OS (remote
moving screen + audible system audio, Cancel/Stop, legacy denial, mic/camera
coexistence). No conference cell may be marked PASS without that artifact-bound
evidence.

The Linux flag affects microphone APM input-volume recommendations throughout
the process. Linux packaged proof must include simultaneous mic, camera, and
system audio, and independent sharing Stop. No additional speech probe is
required on the already-tested guest merely because envelope correlation varies.
