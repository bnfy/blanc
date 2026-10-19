# Auto-hide the Island: the Windows VM hand check

October 19, 2026. PR #964 (Auto-hide the Island, opt-in) had one item left
open after the macOS hand testing: a check on Windows, with a signed
validation build and real input. This is that check. Every item passes.

| | |
| --- | --- |
| Build | `claude/new-session-a8nep0` at `3cc1a3cf`, validation run `39296451338`, artifact `Blanc-Windows-39296451338-validation` |
| Installer | `Blanc-Setup-1.38.0.exe`, SHA-256 `8fb0833b076c2df4ad65c6a4126b76e081656803e799610131f7d1239d7f1ac8`, matching the run's `windows-signature.json` |
| Signature | `Blanc.exe` Authenticode `Valid`, `CN=Bananify Creative` |
| Where it ran | the installer unpacked on the Mac (`bsdtar -xf`), copied to a temp folder in the VM, its own temporary profile; never installed |
| VM | Windows 11 on ARM64 (Parallels), Electron 44.8.0 win32-x64 emulated, at 200% scale, so one logical pixel is two in the captures |

The VM's normal Blanc install and profile were not touched; no other Blanc
was running.

## How

A PowerShell script (`~/blanc-vm-scripts/autohide/win-autohide-check.ps1` on
the Mac, outside the repository, following the Glance check's script) seeds
the temporary profile's `settings.json` with a finished first run, usage
reporting off, **Auto-hide the Island** on and **Open the Island on hover**
on. It starts the build with that profile and one page, closes the start
tab, then drives the window with real input: `mouse_event`, `SetCursorPos`
and `keybd_event` from user32, screenshots through `CopyFromScreen`. It uses
only the window of the process it launched, sends input only while that
window is in the foreground, and at the end closes only the process tree it
started.

The page, served from `http://127.0.0.1:8787` by the script, has a 40 px
magenta bar at the top and a `#cfd8e3` body. The strip takes the page's top
colour, so it is magenta too; where the page starts is the first row of the
grey body, a quarter of the way across, less the bar's 40 px.

Each step moves the pointer and waits, then measures:

1. The pointer rests 420 px down: the Island hides.
2. The pointer at the window's top edge (2 px down), 0.7 s.
3. The pointer back down, 1.5 s.
4. The pointer at 30 px down, left still for 0.9 s (the dwell is 300 ms).
5. The pointer at 30 px down for 150 ms only, then back down, 0.7 s.
6. Reveal from the top edge, press in the strip beside the Island
   (150 px in, 34 px down) and drag 80 px down in 15 moves.
7. Reveal from the top edge above the Island's address, rest on the address
   0.7 s (the hover-open dwell is 300 ms), move to the strip beside the
   Island and wait 450 ms (the panel's leave grace is 200 ms), then drag the
   window 80 px back up from there.
8. Reveal from the top right: the window controls are drawn.

## Results

| Check | Result |
| --- | --- |
| Hidden at rest: the page starts at the window's top | 0 px |
| The top edge reveals the Island; the page moves down for the strip | 68 px |
| Leaving hides it again | 0 px |
| Resting 30 px down for a moment reveals it | 68 px |
| A 150 ms pass 30 px down does not | 0 px |
| The revealed strip drags the window (80 px drag) | moved 74.5 px |
| Resting on the address opens the panel; moving to the strip closes it | opened, then closed |
| The strip drags the window right after that (80 px drag) | moved 74.5 px |
| The window controls come back with the strip | drawn (darkest pixel 105, 9,238 dark pixels in the corner) |

The drags fall 5.5 px short of the pointer's 80 because Windows starts a
window drag only once the pointer has passed its drag threshold.

Captures (cropped to the window's top 320 px, half size; red divider):

- `windows-hidden-above-top-edge-reveal.png`: step 1 above step 2.
- `windows-quick-pass-above-rest-reveal.png`: step 5 above step 4.
- `windows-hover-panel-above-closed-on-leave.png`: step 7, the panel opened
  by hover above the same window once the pointer had moved to the strip.

The raw captures and the per-run JSON and logs are in
`~/blanc-vm-scripts/autohide/out/` on the Mac (`run2-*`).

## Re-run at `761a08df` (after the hidden-strip fix)

`24221443` changed what the hidden strip does on every platform (it drops its
window-drag region), so the check ran again on a signed validation build of
`761a08df` (run `39307808709`, attempt 2; attempt 1 failed an unrelated
packaged quit/restart smoke and passed on rerun). `Blanc-Setup-1.38.0.exe`
SHA-256 `e02aa7918dae38ccaec4ea707480ac8c6e11fddb40283056fd4866c3fa619720`
matches its `windows-signature.json`; the staged `app.asar` was confirmed
byte-identical to the download (SHA-256 `597789cf…`) before the runs. Two
steps were added after step 5, with the strip hidden:

- 5b. Press 34 px down beside where the pill would be and drag 80 px at once.
- 5c. Click the page's own top bar 20 px down; the page turns a square blue
  when the click reaches it.

| Check | Result (6 runs) |
| --- | --- |
| Steps 1 to 5 (hidden, top edge, leaving, 300 ms rest, quick pass) | as before in every run |
| 5b. The hidden strip's band drags the window | no: moved 0 px in every run (74.5 px before the fix) |
| 5c. A click on the page's top band reaches the page | yes in every run |
| Steps 6 and 7's drags, step 8's window controls | as before in every run |
| Step 7's hover-open | opened in 3 of the 6 runs |

`windows-hidden-top-band-click-reaches-page.png`: step 5c, before the click
(the page shows the text 5b selected: the press went to the page) above after
it (the square is blue).

**Open: hover-open after 5b and 5c.** In every other run on this build
hover-open opened (7 of 7: three with 5b and 5c skipped, two with only 5b,
two with only 5c), and on macOS the same press and click sequence leaves
hover-open working with its state machine armed and correct. The packaged
build has no test hook to read that state on Windows, so the cause is not
yet known; a click on the pill still opens the panel.

## What this does not cover

The vertical tab layout, Glance and a second display were not exercised on
Windows. The window sat against the top of the work area, so the
reach-above band ran to the top of the screen; a floating window's 16 px
overshoot band was not checked here (it was on macOS). Nothing here is a
release gate.

## A false start

The first run (`run1`) reported the page at the top in every step. The
script measured the first magenta row, and the strip draws in the page's top
colour, so that row is always the window's first; its captures show the
Island revealed after the top edge. The hover step also missed: the pointer
landed just past the end of the address, so hover-open never armed. The
script now measures the first row of the page's grey body and aims at the
address. Its two drags already agreed with `run2` (74.5 px each).

The first re-run (`run3`) tested the previous build by mistake: every file
the installer unpacks carries the same timestamp, so the staging step's
`robocopy /MIR` kept the older `app.asar` of the same version. Its hidden-strip
results (the window moved 74.5 px; the click did not reach the page) describe
`3cc1a3cf`. Staging now deletes the old copy first and logs the `app.asar`
hash, and `run4` onward ran the build above.
