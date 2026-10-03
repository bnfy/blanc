# Blanc v1.27.0 installed-candidate checks

Full uBO 1.75.0, official Electron 44.5.1, macOS build 1270. These are internal
validation candidates; public platform flags remain disabled.

- **Apple Silicon:** `Blanc-1.27.0-arm64.dmg`, local signed/notarized candidate.
- **Windows x64:** [run 37153103797](https://github.com/bnfy/blanc/actions/runs/37153103797), artifact `Blanc-Windows-37153103797-validation`.
- **Linux x64:** [run 37152590931](https://github.com/bnfy/blanc/actions/runs/37152590931), artifact `Blanc-Linux-37152590931-validation`. The Windows job in this first run failed; use the Windows retry above.

Use the real DMG/NSIS/AppImage on the affected machine. Keep a copy of public
v1.26.0 for the separate updater test. Record OS/version, architecture and the
candidate checksum from [the manifest](candidate-manifest.json). Do not include
private testing URLs in the result.

1. Click the Island shield, choose uBlock Origin, and use its Restart action.
   After relaunch, confirm the shield identifies uBO and browsing works.
2. Open controls and Dashboard; confirm the Sunrise renders. Add a disposable
   filter, close/quit normally and relaunch, then confirm the filter persists.
   Try picker/zapper and Logger on a non-personal test page.
3. Try a named profile, a private tab and a quiet tab. Named profiles keep their
   own uBO configuration. Private tabs show Blanc Blocker and stay out of uBO's
   Logger. Wake the quiet tab and confirm its controls work.
4. Switch to Blanc Blocker and restart. Switch back and restart; confirm uBO
   configuration remains. Global blocking-off should allow the test control.
5. Windows/Linux: close the last window, confirm no Blanc process remains, then
   relaunch from the normal shortcut/menu. Mac: quit/relaunch and check window
   closing behaves normally. Repeat after the updater handoff.
6. Linux: test direct AppImage and integrated desktop-menu launches with the
   renderer sandbox enabled. Record distro/version. Do not use --no-sandbox.

**Updater handoff is separate.** Begin in previous packaged Blanc, discover
these exact staged metadata/assets, download, and click the ordinary Restart
Now prompt. Direct installation over a running app does not prove it. Isolated
feeds have been prepared; coordinate that test before replacing your only
v1.26.0 copy. [Staging instructions](../../staging-update-feed.md) describe the
loopback seam; no production updater feed is changed.

Return pass/fail for each platform, OS/architecture and any failing step.
Only an explicit affected-machine result (or specifically recorded waiver)
closes installed acceptance. Rosetta currently fails uBO startup; Intel stays
off pending its own investigation/acceptance.
