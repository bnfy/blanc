# L2 hand checks: Blanc Prototype under Wayland in the owner's Ubuntu VM

L2 Task 4 Step 3 (docs/superpowers/plans/2026-11-21-linux-fork-l2.md) and gate items 3 and 4. Run on
November 22, 2026 in the owner's Parallels VM **Ubuntu 26.04 ARM64** (GNOME on Wayland) by Claude,
at the owner's request, the same way as `hand-checks-l1.md`: commands through `prlctl exec`, real
kernel input through a uinput pointer and keyboard, screens read from `prlctl capture`.

**Build.** Candidate 6, `linux-arm64-38d1e4faa1e2945e` (source `3902e2323`), package
`blanc-prototype_158.0.8127.2-1_arm64.deb`, SHA-256
`21ab04fb85036827bdc3ab402d34ff8417640dc2fef04f7cded8f8379ef3031d`, the hash in the owner-signed
`signed-candidate-arm64.json` (signature verified against `chromium/linux/keys/blanc-repository.asc`).

## Results

| Check | Result |
| --- | --- |
| Ctrl+Tab by most recent use, real keys under Wayland (decision 3) | Pass. Three local pages Alpha, Bravo and Charlie: Ctrl+PageDown twice (Bravo, then Charlie, by position) made the recent order Charlie, Bravo, Alpha. One Ctrl+Tab went to Bravo; holding Ctrl and pressing Tab twice, then releasing, went to Alpha. While Ctrl was held the switcher card showed under the Island with one tile per tab and the pick's title and host beneath. |
| Screen sharing a window through the portal | Pass. A page called `getDisplayMedia` on a click. Blanc's picker offered Blanc Tab, Window and Entire Screen; Window handed over to GNOME's own Share Screen portal, which listed "Share check - Blanc" with the Sunrise icon. After choosing it the picker showed a live preview, and Share gave the page a live track (`displaySurface` "window") mirroring the window; the Island showed its red screen-sharing chip and GNOME's top bar its sharing indicator. Stop sharing ended the track (`readyState` "ended") and both indicators cleared. |
| Quit with a download in progress (the case the hosted runner can't operate; see `triage-l2.md`) | Pass. Closing a non-last window during a slow download asked nothing; closing the last window showed "Download is in progress / Exit Blanc anyway?" with Continue downloading as default; Exit quit every Blanc process within 2 seconds and removed the partial file. |
| A day of ordinary use | Not done: this needs the owner's own use over a day. |

Seen in passing: Chromium's "is sharing a window" bar floats over the page's content near its top
rather than at an edge of the window. It works (Stop sharing, Hide) but covers content; worth a look
before the beta's screenshots.

The package was purged afterwards and the VM left as it was.
