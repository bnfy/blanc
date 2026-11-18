# Per-platform differences in the fork

One line per difference between the desktop fork's platforms (fork plan §5).
The Mac is the reference; a line here is either a deliberate difference or a
gap with the milestone that closes it. Windows design:
`docs/superpowers/specs/2026-11-17-windows-fork-design.md`.

## Windows (x64, cross-compiled preview; W0 and W1, 2026-11-17 to 11-18)

| Area | Windows today | Closes in |
| --- | --- | --- |
| Build | Cross-compiled on x86-64 Linux; output `BlancWinPrototype` | — (by design, D4) |
| Crash reporting | Captured locally: Crashpad writes renderer and browser dumps into the profile's `Crashpad\\reports` (W1 Part B, run 44234145350), though Chromium's docs say a cross build cannot. Nothing is uploaded: there is no crash server | Uploading: later |
| Window frame | No title bar: the Island's strip sits at the top of the window, laid out as a tabbed window's tab strip is (patch 0095). The strip's drag areas move the window (patch 0097); the top edge resizes; the hidden strip's drag band is 10 px (6 on the Mac) | Done (W1 Part A) |
| Window buttons | Windows' own caption buttons, over the strip's top-right corner; the Island draws none there (owner decision, 2026-11-17). Shipping Blanc for Windows draws its own | Deliberate |
| Main menu | The Island's menu button opens Chromium's app menu at the button (patch 0096). The Mac has its menu bar and no button. The menu's items are Chromium's, renamed to Blanc | Deliberate; the items are reviewed in W2 |
| Quit after closing the last window | Once any tab has been closed in the session, closing the last window leaves the browser process running with no window (over 15 s; not yet timed to its end). With no closed tab it ends in about 5 s. Seen in the frame check, run 44177973332; the cause is not yet diagnosed (the page Recently closed holds is the suspect). On the Mac the app stays open after its last window, so this never showed | W2 |
| Data folder | `%LOCALAPPDATA%\Blanc Chromium Preview\User Data` (patch 0094), never Chromium's | Done |
| Installer | Chromium's `mini_installer`, per user, into `%LOCALAPPDATA%\Blanc Chromium Preview\Application`; uninstall from Settings → Apps keeps the data folder | Done (W1 Part B) |
| Default Programs | Registered as `Blanc Prototype` with its own ProgIDs, beside Electron Blanc; Chromium's installer also offers it for mailto, tel and other schemes, as Chrome does | Done (W1 Part B) |
| Identity | Its own names, app id, publisher and the Sunrise icon (patch 0098, `windows/identity.md`); still `chrome.exe`, Chromium's document icons and Chromium's elevation and tracing service ids | Names done (W1 Part B); executable name later |
| Sandbox access | An installed copy needs nothing; an unpacked one needs read access for app containers on its folder (the candidate workflow grants it) | Done (W1 Part B) |
| Signing | Bananify Creative (Azure Trusted Signing) on the installer, `setup.exe` and every executable inside, after the owner approves each run; signed builds stay on the draft release (W1 Part C, run 44316018075). The version resources still name The Chromium Authors | Done (W1 Part C); company name in the version resources later |
| Updater | None (Sparkle is the Mac's) | Later (R.2) |
| Dock menu, Dock icon, traffic lights | Mac only; stubbed | Later: the Windows counterparts (taskbar, jump list) are not planned yet |
| Ctrl+Tab by most recent use | Positional: the hook is the Mac's | W2 |
| Touch ID passkeys | Mac only | W2 decides (Windows Hello) |
| Electron profile import | Runs with the Windows platform name; Windows key formats are not handled | S2 on Windows |
| Protected video | No notice handoff to Electron Blanc | With the Mac's (D3) |
| Platform name | `win32` to the Island, the sync runner, sync and telemetry (`blanc/common/host_platform.h`) | Done |

## Linux

Nothing built.
