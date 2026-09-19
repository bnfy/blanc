# Display-capture broker — receiver playout candidate — 2026-09-09

Private packaged candidate of the muted receiver-audio sink. Not a public
release. Does **not** prove `cb8e7956`. Merge/release stay closed.
Mac/Windows product cells remain **FAIL** until this package’s conference
evidence is recorded. Product default stays `audio: true`;
`BLANC_HELPER_SYSTEM_AUDIO_PROCESSING=off` is opt-in only.

## Intent

Authenticate a side-by-side Mac app that includes `startAudioPlayout` /
`stopAudioPlayout`, then require muted-mic desktop-media listening, Cancel /
Stop / second share, and mic+camera coexistence. Windows and Linux need
pushed validation artifacts of the same sources.

## Authentication

macOS notarized candidate: **IN PROGRESS** (Terminal `op signin` +
electron-builder). Side-by-side target:
`/Applications/BlancCaptureCandidatePlayout.app`.
Does not overwrite `Blanc.app`, `BlancCaptureCandidateCb8e.app`,
`BlancCaptureCandidate138e.app`, or `BlancCaptureCandidateApm.app`.
