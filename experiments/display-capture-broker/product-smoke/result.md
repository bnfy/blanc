# Product integration smoke — 2026-09-08

## Authorization and scope

The owner explicitly approved the Linux-only disabled feature
`WebRtcAllowInputVolumeAdjustment`, preserving existing platform flags, and
broker/Island picker integration. This supersedes the earlier unapproved
flag/picker status. It does not authorize merge or release and waives no
packaged conference gate. Mic-quality testing on the previously tested Linux
guest remains closed; no further speech reruns were performed.

## Mac product run

- macOS 27.0 (26A5425a), arm64; stock Electron 44.1.1 / Chromium 152.0.7977.65.
- Working tree on `feat/display-capture-broker`, based on reviewed fix
  `5e31cc5a`; integration changes uncommitted. This is not an immutable candidate.
- Harness: `node experiments/display-capture-broker/product-smoke/run.cjs`.
- Real browsing preload → broker → Island picker → helper → local page relay.
  Product startup has `stubPicker: false`; no automatic consent or fabricated
  website activation. The fixture uses real UI clicks.
- Picker center relative to full window content: dx=0, dy=0 CSS pixels.
  Computed button underline: false. Source list scrolls independently; audio,
  Share and Cancel remain visible. Keyboard focus-visible styling retained.
- Cancel: page rejected with `NotAllowedError`.
- Requested audio but left computer-audio unchecked: returned video only.
  Selected Blanc window decoded at 2560×1600 (initial observed frame count 1).
- Second tab, computer-audio checked: live, unmuted video and audio tracks.
- Two independent sharing rows visible. Stop on background tab ended that
  tab's track; the second tab's audio/video remained live.
- Final Stop ended both second-tab tracks. No main-process exception recorded.

One earlier smoke attempt timed out after trying the second Stop before the
remaining row was confirmed. The harness now waits for the one-row projection;
picker audio styles were also scoped so they cannot change sharing-row layout.
The subsequent two runs, including the retained harness on final code, passed.

This run did **not** play a tone, measure system-audio energy, prove sustained
moving content, exercise microphone/camera, or connect a remote conference
participant. A live audio track is not audible-system-audio proof.

## Windows product run

- Parallels Windows 11 guest, arm64; stock Electron 44.1.1 /
  `~\electron-44.1.1-win32-arm64\electron.exe`.
- Same uncommitted `feat/display-capture-broker` tree via `\\Mac\Home\...`.
- Harness: `product-smoke/run-windows.ps1` → shared `run.cjs` with
  `BLANC_PRODUCT_SMOKE_ELECTRON` and `PORTAL=0` (Island source grid).
- Picker centered (dx=0, dy=0); underline false; allow label **Share**.
- Cancel → `NotAllowedError`.
- First share (audio unchecked): live video only, Entire screen decoded
  3024×1700 (1 observed frame).
- Second tab with computer audio checked: live unmuted audio + video.
- Two Stop rows; background Stop preserved the other share; final Stop ended
  remaining tracks. `PRODUCT_SMOKE_OK win32`.

Not conference evidence. Live audio track ≠ audible system-audio energy.

## Linux product run

- Parallels Ubuntu 24.04.3 ARM64, GNOME Wayland; stock Electron 44.1.1 at
  `/home/parallels/electron-44.1.1-linux-arm64` with `--no-sandbox
  --ozone-platform=wayland`. Product tree synced to `/home/parallels/blanc-tree`
  including Linux-only `WebRtcAllowInputVolumeAdjustment`.
- Harness: `run.cjs` with `BLANC_PRODUCT_SMOKE_PORTAL=1`; Island **Continue**
  then AT-SPI portal **Share** (`click-share-portal.py` with retries).
- Portal Island UI centered (dx=0, dy=0); underline false; allow label
  **Continue**. Cancel → `NotAllowedError` before portal consent.
- First share (audio unchecked): live video only, Screen 1024×768.
- Second tab with computer audio checked: live unmuted audio + video after
  portal Share.
- Two Stop rows; background Stop preserved the other share; final Stop ended
  remaining tracks. `PRODUCT_SMOKE_OK linux`.

Validates the integrated portal/capture path and independent Stop on this
guest. Does **not** replace packaged conference proof (tone, mic+camera
coexistence under the process-wide flag, remote receiver).

## Automated checks

- Full unit suite during integration: 1,635 passed, 0 failed, 0 skipped.
- Final targeted capture/broker/picker/chrome-protocol/native-packaging suite:
  99 passed after the final constraint, portal-selection and active-Stop checks.
- `npm run substrate:check`: passed (tokens, settings, copy, ad-block and compliance).
- `git diff --check`: passed.
- Picker tests cover sender/window binding, missing sources, audio consent,
  late enumeration after Cancel, native portal completion and cancellation,
  and explicit selection on non-portal Linux even for a single source.

## Remaining gates

Unpackaged Mac/Windows/Linux product smokes for picker, audio-track relay, and
independent Stop are recorded above. Live-track checks do **not** prove audible
system audio.

**Next (merge and release remain closed until this evidence passes):**

1. Freeze a reviewed candidate commit.
2. Build and authenticate its platform packages (macOS / Windows / Linux).
3. Complete one real Meet/Teams/Zoom pass per OS: remote moving screen **and**
   audible system audio, Cancel/Stop, legacy denial, and mic/camera coexistence.

All three signed/authenticated exact-candidate conference cells remain NOT RUN
in `docs/security-evidence/display-capture-broker-gate.md`. No gates are waived.

No custom Electron build, packaging build, commit, push, merge, or release was
performed for this smoke record. Test profiles, temporary logs, and guest
screenshots were deleted. The harness and this record are retained.
