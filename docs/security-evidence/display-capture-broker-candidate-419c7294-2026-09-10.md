# Private Mac display-capture candidate `419c7294` — 2026-09-10

This record binds the accepted Mac conference behavior to the private package
built from `419c7294efe8076948c4f883647c508106e94d0e`. It does not publish a
release or convert unperformed checks into PASS results.

## Source and package

- Parent: `c26127ebcc86f97914f443072d98b0977a516383`.
- Stock Electron 44.1.1 / Chromium 152.0.7977.65; no custom Electron build.
- macOS selects the exact `fda425eb` Playout preload, broker, and helper through
  the main-process platform selector. The Mac canvas-adapter clock is not used.
- The build used a clean independent `npm ci`, not a linked dependency tree.
- Side-by-side app: `/Applications/BlancCaptureCandidate419c.app`.

| Payload | SHA-256 |
| --- | --- |
| `Blanc-1.15.0-arm64.dmg` | `80979771102d758a7a0f0f0be49376b70b4e754b1a42539710e3533e4a63fc53` |
| `Blanc-1.15.0-arm64-mac.zip` | `9503878373aff2a31919147dad0680a5e1f46b44f7412a1fa04e31c032d764f1` |
| Installed `app.asar` | `2fb8cae84ca7c22b4fdb65fa4523d435e1f9c1812cf43973f9176358adf6c487` |

## Package verification

The normal Mac signing preflight and after-sign checks passed. The app is
signed by `Developer ID Application: Anthony Loria (XYGUCY4498)` using the
pinned certificate fingerprint
`55283A84D3706D5A22386D5F002A0CD4845ECFD4`. Strict deep codesign,
provisioning-profile/WebAuthn checks, notarization, Gatekeeper, and stapler all
passed. The mounted DMG contained the same executable, framework, and ASAR as
the installed app. The packaged runtime lock, Ghostery/tldts payload,
adblock/compliance inputs, and all eight hardened fuses passed.

The first follow-up fuse command pointed at the framework path instead of the
app executable and returned ENOENT after the package had completed. The
corrected verification passed without rebuilding. This was an orchestration
mistake, not a package failure.

Cold launch passed on macOS 27.0 (26A5425a), arm64, with normal chrome and a
visible new tab. The clean dependency installation and duplicate `dist/`
contents were then removed, reclaiming about 1.12 GiB; the source, app, DMG,
ZIP, and evidence were retained.

## Owner conference acceptance

Meet room `oor-shqv-uvr` used Safari as host and a phone as the listening
receiver. The Safari receive tab was muted to avoid feeding conference output
back into system capture. The candidate shared a non-Meet window with Meet's
microphone muted while a six-second synthetic desktop clip played once.

The owner confirmed:

- “I hear it.”
- “Moving video; clean audio; no loop.”
- “Presentation ended; Mac voice and camera still work.”
- “everything passes on Mac from my perspective.”

Read-only observations bound those statements to a connected share carrying a
live `System audio` loopback track and moving window video. No analyser, capture,
or playout intervention was injected.

With Meet in the background, trusted Island Stop ended the Meet share's video
and system-audio tracks and closed its relay. A separately approved video-only
fixture share continued for 872 additional frames. Final trusted Stop ended
that share. The same 1280×720 camera track remained live and advanced after
both Stop actions; the owner confirmed voice and camera continuity without
changing settings.

Cancel and the Personal/named/private negative matrix were not rerun on this
exact package. They remain unperformed, not silently passed or waived. Testing
stopped at the owner's direction after overall Mac acceptance.
