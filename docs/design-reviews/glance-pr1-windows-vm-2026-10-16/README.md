# Glance PR 1: the Windows VM hand check

October 16, 2026. PR #842 (Glance fixes, 1 of 3) merged on October 15 with
one item still open: a check in the owner's Windows VM, with a signed
validation build and real input, of the three fixes that only a real
Windows window can show. This is that check. All three pass on main and all
three fail on the public release, so each capture pairs the two.

| | Build | Where it ran |
| --- | --- | --- |
| before | public v1.34.0 (build 1340), the VM's installed Blanc | copied to a temp folder, its own temporary profile |
| after | main at `6aae9f5d` (PR #849 merged), validation run `38933993592`, artifact `Blanc-Windows-38933993592-validation` | the installer unpacked on the Mac (`bsdtar -xf`), copied to a temp folder, its own temporary profile |

The validation installer is `Blanc-Setup-1.34.0.exe`, SHA-256
`af5bf336ae60e4d89dd7da8d472f66adfd0fdea0f458f5ff96ba580a6d9a7b29`, which
matches the run's `windows-signature.json`; both `Blanc.exe` files carry a
valid Authenticode signature from `CN=Bananify Creative`. The validation
build was never installed, so the VM's normal install and profile are as
they were. The VM is Windows 11 on ARM64 (Parallels), Electron 44.5.1
win32-x64 emulated, at 200% scale, so one logical pixel is two in the
captures.

## How

A PowerShell script (`~/blanc-vm-scripts/glance/hand/win-hand-check.ps1` on
the Mac, outside the repository) starts the build it is given with
`--user-data-dir` pointing at a fresh temporary profile and two pages on the
command line, then drives it with real input: `keybd_event` and
`mouse_event` from user32, screenshots through `CopyFromScreen`. It serves
the two pages itself from `http://127.0.0.1:8787` (loopback is a secure
context, which `getDisplayMedia` requires). It uses only the window of the
process it launched, sends a key or click only while that window is in the
foreground, and at the end closes only that process tree; the VM's own
running Blanc was not touched.

The pages: a dark main page (`#15171b`, titled "Night notes"), so the strip
samples a dark tint, and a reference page whose whole body is a button that
calls `navigator.mediaDevices.getDisplayMedia({ video: true })` and writes
the outcome at the bottom left.

The sequence, the same for both builds:

1. Close the start tab (Ctrl+1, Ctrl+W), select the dark page (Ctrl+1),
   open the Glance picker (Ctrl+Shift+G), type `share`, Enter. Glance opens
   side by side with the share page as the reference.
2. Find the divider on a page row (the first light pixel after the dark
   page), press the mouse 8 logical px inside its 12 px grip, move the
   pointer 120 logical px (240 physical) left in 15 steps, release.
3. Measure the window-control corner of the header: the darkest pixel and
   the count of pixels darker than 128 in the top 5–30 logical px, from
   115 to 20 logical px in from the right edge (the window's own edge is
   left out).
4. Move the pointer onto Minimize and capture the hover.
5. Click the reference page, wait two seconds, capture; Escape, capture.

## Results

| Check (PR #842's open item) | public 1.34.0 | main `6aae9f5d` |
| --- | --- | --- |
| Window controls readable over the side-by-side header with a dark main page | fails: darkest pixel in the corner 248, no pixel under 128; the glyphs are white on the header's white | passes: darkest pixel 107, 172 dark pixels; the glyphs take the theme ink |
| Hover shows a fill | fails: the tooltip appears, nothing else changes | passes: a grey fill under the pointer with the dark glyph |
| The divider stays under the pointer when dragged by its grip (#139) | fails: moved 224 physical px for a 240 px drag; the divider jumps right by the 16 px grab offset on the first move | passes: moved 240 for 240 |
| Screen sharing from the reference offers the picker | fails: `NotAllowedError` at once, no picker | passes: the "Share your screen" picker opens for `http://127.0.0.1:8787`; Escape gives `NotAllowedError` |

Captures (before above after, red divider):

- `windows-controls-before-above-after.png`: the header's right end.
- `windows-controls-hover-before-above-after.png`: the same with the pointer
  on Minimize.
- `windows-divider-drag-before-above-after.png`: the divider band before the
  drag, then after it in each build; the red line is where a divider that
  followed the pointer ends up.
- `windows-share-request-before-above-after.png`: the whole window two
  seconds after the click on the reference page.
- `windows-window-glance-after.png`: the whole window with Glance open on
  main.

The raw captures and the per-run JSON and logs are in
`~/blanc-vm-scripts/glance/hand/out/` on the Mac.

## What this does not cover

The "after" build is main, which also carries PRs #844 and #849; this
check is of PR #842's three items, not a comparison of PR #842 alone. The
stacked (vertical) layout was not part of the open item and was not
exercised here; its Windows checks are in
`glance-pr2-vm-2026-10-15/README.md`. Nothing here is a release gate.

## A false start

The first control run against the installed 1.34.0 drove the wrong window.
The script waited half a second for the launched process's window, then
fell back to any Blanc window, and took the VM's already-running Blanc.
Its cleanup then stopped every Blanc under the install folder, including
that one. The instance was relaunched at once and restored its session
(two tabs, unchanged). The script now uses only the launched process's
window, refuses to send input unless that window is in the foreground, and
closes only the process tree it started. That run's captures were
discarded.
