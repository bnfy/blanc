# Auto-hide the Island: the Linux VM checks

October 19, 2026. After the macOS and Windows checks of PR #964, the same
feature on Linux: the runnable acceptance suite on real ARM64 Linux, the
Island scenarios inside GNOME's own native Wayland session, and a hand check
with a real pointer. The real-pointer check found two bugs; both are fixed in
`24221443`, and everything below is at that commit unless it says otherwise.

| | |
| --- | --- |
| VM | Ubuntu 26.04 LTS on ARM64 (Parallels), GNOME Shell 50.1, native Wayland session |
| Build | the branch checkout run from source (`electron .`), official Electron 44.8.0 linux-arm64; the development `chrome-sandbox` set root-owned and setuid, as Chromium packages install it |
| Wayland | Blanc chooses `--ozone-platform=wayland` in a Wayland session (`applyLinuxCaptureOzone`); every Wayland run below confirmed that flag on the running processes |

## Results at `24221443`

| Run | Result |
| --- | --- |
| Full runnable suite under xvfb (X11, as CI runs it) | 399 of 401 pass. *Mahjong opens as a playable managed tab* fails the same way on `main` in this VM (its rail-size check sees only the largest tier). *Pin controls deliberately change the home* failed once in the full run and passes 7 of 7 on its own. |
| `@F1` (Island, hover-open, auto-hide) on native Wayland | 23 of 23 pass, including F1-24 and F1-25 |
| `@vertical-tabs` on native Wayland | 15 of 17 pass. The two that fail ask GNOME for a window of exactly 640 by 480 and get 660 by 500; both fail the same way on `main` here. |

## Re-run at `490067b1` (after the code-review fixes)

The review fixes (`751cd0e`: the vertical rail is never reveal territory, one
geometry read per tick, the hover-leave close detaches at once) touch the
Linux paths too, so the Island and vertical-tab sets ran again at the merged
head `490067b1`: 42 of 42 under xvfb, and on native Wayland 40 of 42, the two
failures the same exact-size resizes as above, which fail on `main` there too.

## The real-pointer check

Blanc from the branch, started in the GNOME session with a throwaway profile
(first run done, usage reporting off, auto-hide and hover-open on) on a
Wikipedia article, driven by the Mac's real pointer through the Parallels
window. Steps and results with both fixes:

| Step | Result |
| --- | --- |
| 1. Pointer well down the page | hidden |
| 2. Pointer just inside the window's top edge | shown at once |
| 3. Back down the page | hidden again |
| 4. Resting about 30 px below the top for a second | shown |
| 5. A 150 ms pass at the same height | stays hidden |
| 6. Drag the revealed strip beside the pill | the window moves (it was maximized, so GNOME restores it first) |
| 7. Rest on the address until the panel opens, move to the strip, drag | the panel opens, closes once the pointer has left it, and the window moves |
| 8. Overshoot just above a floating window's top edge | stays hidden; the same pointer just inside the edge shows it |

Step 8 is a Wayland limit, not a bug: no Blanc view sees a pointer outside
the window, so the band above a floating window cannot reveal the strip (on
macOS and Windows it does). D29 and the spec record it.

Captures (red divider):

- `linux-wayland-leaving-before-above-after.png`: the pointer well down the
  page, before the fix (the strip never hid) above after it.
- `linux-wayland-hidden-above-top-edge-reveal.png`: step 1 above step 2.
- `linux-wayland-quick-pass-above-rest-reveal.png`: step 5 above step 4.
- `linux-wayland-hover-panel-above-closed-on-leave.png`: step 7, the panel
  opened by hover above the window once the pointer had reached the strip.

## What it found

1. **The strip never hid on Wayland.** A small Electron probe in the same
   session logged `screen.getCursorScreenPoint()` as `0,0` throughout, while
   the probe's page saw every pointer move. Auto-hide's 450 ms hide check
   samples that cursor, and 0,0 counts as "at the top edge", so the strip was
   held up for good. Where the cursor cannot be read (Linux on the Wayland
   platform), auto-hide now uses the last move a Blanc view saw.
2. **With the strip hidden, the page's top band dragged the window, on every
   platform.** A temporary log (VM only, never committed) showed the page
   receiving no moves at all in the top band. The strip is the window's own
   page, and its drag region hit-tests above the page view, so it still
   claimed that band. On macOS, pressing at three points in the top band of a
   page with the strip hidden moved the window 40 px each time; with the fix,
   0 px. The strip now drops its drag region while hidden
   (`chrome:strip-hidden`).

Acceptance F1-24 (no global pointer position) and F1-25 (the hidden strip's
drag region) were each confirmed to fail without their fix.

## False starts

- `npm ci` in the VM replaced the checkout's `node_modules` symlink and left
  a `chrome-sandbox` that Ubuntu's user-namespace restriction refuses, and no
  `path.txt`; the first suite run could not launch Electron. The sandbox was
  set root-owned and setuid (that one file) and `path.txt` written.
- Synthetic pointer moves reach the guest only after one click into the VM.
  Before that, the probe saw no moves, which first looked like part of bug 1.
- Relaunching for the hand check left four Blanc instances running (Electron
  reorders its arguments, so the `pkill` pattern missed). Steps 1 to 7 were
  run again against a single fixed instance; the results above are from that
  run.
- Once the hand check ended, GNOME blanked the idle screen, and a Wayland
  rerun then failed every scenario that needs window focus, at `e465543` as
  much as at `24221443`. With the screen woken (and blanking paused for the
  run, then restored) every one passed.

The scripts and raw logs are in `~/blanc-vm-scripts/autohide/linux/` on the
Mac.
