# Per-platform differences in the fork

One line per difference between the desktop fork's platforms (fork plan §5).
The Mac is the reference; a line here is either a deliberate difference or a
gap with the milestone that closes it. Windows design:
`docs/superpowers/specs/2026-11-17-windows-fork-design.md`.

## Windows (x64, cross-compiled preview; W0, 2026-11-17)

| Area | Windows today | Closes in |
| --- | --- | --- |
| Build | Cross-compiled on x86-64 Linux; output `BlancWinPrototype` | — (by design, D4) |
| Crash reporting | None: a cross build stubs the assembly Crashpad needs | A later owner decision on a native build machine |
| Window frame | Windows' own title bar and caption buttons show above the Island's window controls, so there are two sets | W1 |
| Data folder | `%LOCALAPPDATA%\Blanc Chromium Preview\User Data` (patch 0094), never Chromium's | Done |
| Identity | Executable `chrome.exe`, Chromium's icon, app id and registry names other than the product path | W1 |
| Sandbox access | An unpacked build needs read access granted to app containers on its folder (the candidate workflow does it); an installer grants it | W1 |
| Installer, signing, default browser | None | W1 |
| Updater | None (Sparkle is the Mac's) | Later (R.2) |
| Dock menu, Dock icon, app menus, traffic lights | Mac only; stubbed | W1 decides the Windows counterparts (taskbar, jump list) |
| Ctrl+Tab by most recent use | Positional: the hook is the Mac's | W2 |
| Touch ID passkeys | Mac only | W2 decides (Windows Hello) |
| Electron profile import | Runs with the Windows platform name; Windows key formats are not handled | S2 on Windows |
| Protected video | No notice handoff to Electron Blanc | With the Mac's (D3) |
| Platform name | `win32` to the Island, the sync runner, sync and telemetry (`blanc/common/host_platform.h`) | Done |

## Linux

Nothing built.
