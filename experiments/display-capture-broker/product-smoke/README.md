# Unpackaged product picker smoke

Run `node experiments/display-capture-broker/product-smoke/run.cjs` against
stock Electron with screen-recording / portal access. Launches visible Blanc
with a temporary profile and a loopback-only fixture. Uses the real preload,
broker, helper, Island picker and Stop UI; `stubPicker` stays off. `BLANC_TEST=1`
only provides offline startup and test tab creation.

## Platforms

| Platform | Entry | Notes |
|---|---|---|
| macOS | `node …/run.cjs` | Island source grid |
| Windows | `run-windows.ps1` in the guest | Guest Electron + Node; shared Mac tree |
| Linux Wayland | `run-linux.sh` / guest launcher | Island **Continue** → portal Share via AT-SPI |

Optional env: `BLANC_PRODUCT_SMOKE_ELECTRON`, `BLANC_PRODUCT_SMOKE_PORTAL=1`,
`BLANC_PRODUCT_SMOKE_PORTAL_CLICK` (defaults to `audio-probe/click-share-portal.py`).

Checks: centered picker, no button underlines, Cancel → `NotAllowedError`,
video-only selection despite requested audio, a second tab's audio-approved
share, two independent indicator rows, background-tab Stop preserving the
other share, and final Stop ending its audio/video tracks. Uses real UI
clicks for consent, not a manufactured website activation.

The receiver stays muted. This smoke asserts live audio tracks, not audio
energy or audibility. It is **not** signed/packaged or conference evidence.

The script closes its app/server and removes its temporary profiles on exit.
`--screenshot` optionally retains one review image under `output/playwright/`;
delete it after review because source thumbnails may show desktop content.
