# Glance PR 2: Windows and Linux VM evidence

October 15, 2026. These captures and checks come from the owner's two
Parallels VMs, not from the Mac with a simulated platform. The strip's
platform is the real one, and minimize, maximize and close are the controls
Blanc draws itself on Windows and Linux.

| VM | Platform | Display |
| --- | --- | --- |
| Windows 11 (ARM64) | Electron 44.5.1 win32-x64, emulated | 200% scale |
| Ubuntu 26.04 ARM64 | Electron 44.5.1 linux-arm64, GNOME Wayland (`--ozone-platform=wayland`) | 100% scale |

## How

Each run starts an unpackaged Blanc with `BLANC_TEST=1` and a driver loaded
through `electron -r`. The driver uses the acceptance test hook and serves
two local pages itself. It sets the window size and drags the divider. It
measures the live strip DOM, which covers the Island, its controls and
address, the Glance header's buttons and `#windowControls`, and it saves
`capturePage()` images. The full-window pictures put each pane's own capture
at its view bounds over the strip's capture. The driver and the VM scripts
are in `~/blanc-vm-scripts/glance/` on the Mac, outside the repository.

The Windows Electron zip was verified against Electron's `SHASUMS256.txt`
on the Mac and again inside the VM. It ran from a VM-local temp folder,
which was removed afterwards.

Four commits ran on each platform:

| Run | Commit |
| --- | --- |
| base | `d0aa45b7`, main before this PR |
| before-header | `09e1db13`, before the measured header minimum |
| before-uncentred | `855ef987`, before the stacked Island gives up its centre line |
| after | `04162d0a`, this PR's head after the VM fixes below |

"Before above after" images show base above after, with a red divider.

## Results

The same table holds for Windows and for Linux; every cell was checked on
both.

| Scene | base | before-header | before-uncentred | after |
| --- | --- | --- | --- | --- |
| A. Side by side, 1200 × 800 | pass | pass | pass | pass |
| G. Alt+Left in the reference goes back there; main page unchanged | fails: nothing happens | pass | pass | pass |
| B. Narrowest reference: header buttons clear of the window controls | fails: ✕ under minimize | fails: Change and ✕ under them | pass | pass |
| C. Narrowest main pane, 1000 × 800 | pass | pass | pass | pass |
| D. Smallest window, stacked: address readable | fails: address cut to 24 px (Windows), 45 px (Linux) | pass | pass | pass |
| E. Stacked, vertical tabs, 700 × 800: Island inside, clear of the controls, address readable | fails: Island under the controls | fails: address 0 px, Close outside the Island | fails: same | pass |
| F. Stacked, vertical tabs, 900 × 800 | pass | pass | pass | pass |

On Linux GNOME keeps the smallest window at 660 px wide rather than
Blanc's 640 px minimum, so scene D is 660 px there.

## Glance scenarios on Linux

The whole Glance feature (`--tags @glance`) ran in the Ubuntu VM at
`04162d0a`, in two places:

| Where | Result |
| --- | --- |
| GNOME session (XWayland, with a window manager) | 46 passed, 1 skipped, 3 failed |
| xvfb, as CI runs Linux | 46 passed, 1 skipped, 3 failed |
| The Mac, same commit | 50 passed |

The skipped scenario is the macOS traffic-light check. The three failures
are PR 1 scenarios that fail the same way on main (`d0aa45b7`) in this VM.
Their assertions assume macOS:

- "Choose, use, promote…" expects the GLANCE label beside the title. On
  Windows and Linux the header reserves the window controls' width, so the
  label hides at the default split, on main as on this branch.
- "Change and close…" and "A tab muted as a background tab…" expect the
  Change picker 24 px from the window's right edge. On Linux it sits 12 px
  from it, starting below the window controls without covering them, on
  main as on this branch.

The Windows VM has no Node, so the scenarios ran on Linux only.

## What the VM runs found, and fixed here

- **Linux: the focused-pane record missed a reference that was already
  focused.** On Linux, inactive tab views stay attached to the window
  (#798), so a background tab can hold keyboard focus. Opened in Glance,
  it arrived focused with no focus event, and Blanc kept recording the
  main page. Keys still reached the reference, because commands read live
  focus first. But the header's focus cue and the 1Password hint showed the
  main page. Six focus scenarios failed in the VM for this reason, both
  under xvfb and in GNOME. A timeout diagnostic showed the window and the
  reference both holding focus while the record named the main page. A
  new scenario failed in the VM before the fix and passes after
  (`be082fdb`, `04162d0a`). Glance now re-reads live focus after attaching
  the reference, and the window's activation and role changes do the same
  (`79d43b2d`).
- **Three tests assumed macOS.** The new-window minimum test treated the
  first window's 50% stop as the Island's measured minimum (`09986bca`).
  The "window controls" step nudged the window 1 px wider, which a
  1024 px GNOME display can't do (`2700341d`). An edge check missed by
  0.01 px (`e4e8231d`).

## A trade-off for the owner

`*-header-default-split-before-above-after.png`: at the default split of a
1200 px window, Windows and Linux reserve the controls' width in the
header. With Back and Reload added, the reference title there shrinks from
"Lisbon travel gui…" to "Lisb…". It is still in the tooltip. macOS has no
reservation and keeps more of the title.

## Images

All "after" images are from `04162d0a`.

- `windows-header-narrowest-reference-before-above-after.png`,
  `linux-header-narrowest-reference-before-above-after.png`: scene B, the
  reference header and the window controls. Before, ✕ sits under minimize.
  After, the divider stops where the compact header still fits.
- `windows-stacked-smallest-window-before-above-after.png`,
  `linux-stacked-smallest-window-before-above-after.png`: scene D, the
  strip. Before, the address is cut to a few characters. After, it is whole.
- `windows-stacked-vertical-tabs-700-before-above-after.png`,
  `linux-stacked-vertical-tabs-700-before-above-after.png`: scene E, the
  strip right of the rail. Before, the Island runs under minimize and
  maximize. After, it sits between the rail and the controls with its
  address whole.
- `windows-window-side-by-side-after.png`,
  `linux-window-side-by-side-after.png`: scene A, the whole window.
- `windows-window-stacked-vertical-tabs-700-after.png`,
  `linux-window-stacked-vertical-tabs-700-after.png`: scene E, the whole
  window.
- `windows-header-default-split-before-above-after.png`,
  `linux-header-default-split-before-above-after.png`: scene A, the
  reference header at the default split (see the trade-off above).

## Not covered

- A packaged, signed build. These were unpackaged runs of the same source,
  because the test hook exists only there.
- x64 Linux and a physical Windows PC. The Linux VM is ARM64, and Windows
  ran x64 Blanc under emulation.
- KDE and other compositors.
