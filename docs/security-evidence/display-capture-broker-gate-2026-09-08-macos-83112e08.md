# macOS Meet retest — 83112e08 — 2026-09-08

Candidate: `83112e08689eb6a532d43fead24911618846510d`; notarized DMG SHA-256 `538f30ce5a46f00cca7b615b1da57bff8ed077c80800d489bb64886c88603593`. Executable: `/Applications/BlancCaptureCandidate83112.app/Contents/MacOS/Blanc`, isolated `output/display-capture-candidate-83112e08/macos/meet-userdata` profile. No package edits during this run.

Room: Google Meet `wza-fnfj-khj`, Safari host/receiver; participants Anthony J. Loria, Mac, Linux. Approximately 12:28–12:33 EDT. An initial guest admission rejection was resolved by the owner; it is not a capture failure.

| Check | Observed result |
| --- | --- |
| Mic + camera coexistence before sharing | PASS for in-call presence: Mac and Linux admitted, live camera tiles; Mac controls offered Turn off microphone / Turn off camera |
| Island Cancel | PASS: Meet displayed “Meet needs permission to screen share”; main recorded `NotAllowedError`, `reason: cancel`, `alreadyResolved: false` |
| Computer-audio presentation | **FAIL**: selected source “Blanc”, checked Share computer audio, clicked Share; Meet displayed “Can't share your screen” / “Something went wrong when screen sharing. Please try again.” |
| Helper acquisition | Live video + audio, both unmuted in helper (`live:false` diagnostic syntax); helper offer included video/audio |
| Receiver moving screen / audible system tone | NOT PROVEN: no successful presentation; no tone was played |
| Cleanup after failed presentation | Main recorded `stop-share`, `reason: stop`, `hadPending: false`, `computerAudio: true`; sharing chip disappeared; mic/camera controls remained on |
| Successful-share Stop / background Stop / second-share independence | NOT RUN; failed-share cleanup does not satisfy these receiver-side checks |
| Legacy negative matrix | NOT RUN on this candidate |
| Overall | **FAIL** — relaxing muted-track readiness did not clear the real Meet gate |

Main-process observations, share `share-4`, request `req-3`:

- `install-handler` / `handler-grant`: `computerAudio: true`, source `window:5327:0`.
- `helper-diag:getDisplayMedia-ok`: video `live:false`, audio `live:false`.
- `helper-offer`: video true, audio true, computerAudio true.
- The sharing indicator remained after Meet's error until trusted Stop was invoked. This record does not claim page-side error automatically tears down capture.
- Opus payload-type 111 BUNDLE collisions appeared earlier during ordinary Meet negotiation, before this share. They are a diagnostic clue, not established as the cause of this Present failure.

Computer-control AX IDs for Stop changed repeatedly; the owner was asked to click Stop. The subsequent main log and UI confirm cleanup, but do not establish an automated Stop pass.

No new product fix, commit, merge, public release, or gate waiver was made during this retest.

## Entire-screen comparison and local flow diagnostic

The existing notarized app also ran a temporary loopback-only page at `http://127.0.0.1:8765/`, source `output/display-capture-candidate-83112e08/diagnostics/index.html`. No candidate code or package changed. Video-only capture of Entire screen resolved at 3.17 seconds with a live muted remote track and no width/height in `getSettings()`. It unmuted at 3.37 seconds. By 4.17 seconds settings reported 3024×1964. A muted preview was deliberately attached five seconds after resolution; it played at 8.20 seconds and reached 195 decoded frames at 15.17 seconds. No microphone or audio was requested by this diagnostic. Its tracks were stopped afterward.

This proves packaged local video flow for that selection, not conference compatibility or system audio. Missing dimensions at initial resolution and absent display-capture-specific metadata on relayed tracks remain hypotheses to investigate; neither is established as Meet's failure cause.

Meet was then retried with **Entire screen + Share computer audio**. It again showed “Can't share your screen” / “Something went wrong when screen sharing. Try restarting your browser if the problem continues.” Safari showed the three participants but no presentation. Thus the failure is not limited to the earlier window selection. The requesting Meet document was reloaded to end this second failed capture; the sharing indicator disappeared. Reload cleanup does not count as a successful-share Stop check.

## Verdict (owner-confirmed)

**Mac Meet still FAILs on `83112e08` for both window and entire-screen sharing with computer audio.** Island Cancel PASSed. Local packaged capture delivered 195 decoded frames on the temporary loopback page, so the remaining failure is in **conference integration** (Meet accepting/using the broker stream)—not basic packaged video acquisition. Temporary diagnostics for this run were stopped; no new product fix, commit, merge, public release, or gate waiver.

## Diagnosis (post-FAIL; 2026-09-08)

Conference-integration root causes ranked from the local diagnostic + relay probe evidence:

1. **Missing `displaySurface` on relayed tracks (strong).** Helper native capture reports `displaySurface: "monitor"`; page-side WebRTC tracks report `null`. Meet inspects capture metadata after `getDisplayMedia`. Broker already knew `surfaceKind` (`screen`/`window`) but did not pass a W3C `displaySurface` enum into the page resolve payload, and `wrapTrack` did not facade `getSettings` / `getConstraints` / `getCapabilities`.
2. **Resolve-too-early for Meet (strong on Mac).** The same local run resolved while still muted with `width`/`height` absent; unmute ~200 ms later; dimensions ~1 s after that. Meet can reject before Retina decode completes. Unbounded unmute waits previously hung packaged Mac shares (`83112e08` fixed live-only readiness); the follow-up fix is a **bounded** prefer-unmute+dimensions wait (~2 s poll) with live-only fallback—not a return to unbounded unmute.

Opus BUNDLE PT111 collisions remain weak (seen before Present during ordinary mic/cam). Computer-audio/Catap alone is ruled out (video-only also failed on the parent freeze).

**`83112e08` is not release-ready.** Working-tree follow-up (not yet a new candidate SHA): pass `displaySurface` from picker `surfaceKind`, facade it on relayed video tracks, and bound the publish wait. Any such capture change requires a new notarized macOS artifact and renewed Meet evidence; Linux/Windows conference evidence renews when shared capture code ships in those packages.
