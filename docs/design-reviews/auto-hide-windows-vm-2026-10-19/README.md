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
