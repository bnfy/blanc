# Per-platform differences in the fork

One line per difference between the desktop fork's platforms (fork plan §5).
The Mac is the reference; a line here is either a deliberate difference or a
gap with the milestone that closes it. Windows design:
`docs/superpowers/specs/2026-11-17-windows-fork-design.md`.

## Windows (x64, cross-compiled preview; W0 to W2, 2026-11-17 to 11-18)

| Area | Windows today | Closes in |
| --- | --- | --- |
| Build | Cross-compiled on x86-64 Linux; output `BlancWinPrototype` | — (by design, D4) |
| Crash reporting | Captured locally: Crashpad writes renderer and browser dumps into the profile's `Crashpad\\reports` (W1 Part B, run 44234145350), though Chromium's docs say a cross build cannot. Nothing is uploaded: there is no crash server | Uploading: later |
| Window frame | No title bar: the Island's strip sits at the top of the window, laid out as a tabbed window's tab strip is (patch 0095). The strip's drag areas move the window (patch 0097); the top edge resizes; the hidden strip's drag band is 10 px (6 on the Mac) | Done (W1 Part A) |
| Window buttons | Windows' own caption buttons, over the strip's top-right corner; the Island draws none there (owner decision, 2026-11-17). Shipping Blanc for Windows draws its own | Deliberate |
| Main menu | The Island's menu button opens Chromium's app menu at the button (patch 0096). The Mac has its menu bar and no button. The menu's items are Chromium's, renamed to Blanc | Deliberate; the items are reviewed in W2 |
| Quit after closing the last window | Closing the last ordinary window quits, whatever the session held: the hidden window holding Space pages and Recently closed, and any mini windows, close with it (W2 A2, `tests/windows-quit.mjs` 4 of 4). Held pages end as on Cmd+Q on the Mac; on the Mac the app stays open after its last window | Done (W2) |
| Data folder | `%LOCALAPPDATA%\Blanc Chromium Preview\User Data` (patch 0094), never Chromium's | Done |
| Installer | Chromium's `mini_installer`, per user, into `%LOCALAPPDATA%\Blanc Chromium Preview\Application`; uninstall from Settings → Apps keeps the data folder | Done (W1 Part B) |
| Default Programs | Registered as `Blanc Prototype` with its own ProgIDs, beside Electron Blanc; Chromium's installer also offers it for mailto, tel and other schemes, as Chrome does | Done (W1 Part B) |
| Identity | Its own names, app id, publisher and the Sunrise icon (patch 0098, `windows/identity.md`); still `chrome.exe`, Chromium's document icons and Chromium's elevation and tracing service ids | Names done (W1 Part B); executable name later |
| Sandbox access | An installed copy needs nothing; an unpacked one needs read access for app containers on its folder (the candidate workflow grants it) | Done (W1 Part B) |
| Signing | Bananify Creative (Azure Trusted Signing) on the installer, `setup.exe` and every executable inside, after the owner approves each run; signed builds stay on the draft release (W1 Part C, run 44316018075). The version resources name Bananify Creative and Blanc Prototype (W2 A1, `blanc/branding/win/BRANDING`) | Done |
| Updater | None (Sparkle is the Mac's) | Later (R.2) |
| Dock menu, Dock icon, traffic lights | Mac only; stubbed | Later: the Windows counterparts (taskbar, jump list) are not planned yet |
| Ctrl+Tab by most recent use | As on the Mac, through `tab_switch_keys_win.cc` (W2 C1; `native-tab-switch.mjs` 8 of 8 with keys posted to the app). Real Ctrl+Esc goes to the Start menu, so the window losing activation cancels a switch (shipping's rule) | Done (W2); a real-key check later |
| Touch ID passkeys | Mac only. Windows uses Chromium's own Windows Hello path (owner, W2 plan decision 2); not yet checked by hand | W2 hand check |
| Electron profile import | Runs with the Windows platform name; Windows key formats are not handled. Importing open tabs and Favorites from Chrome, Edge, Brave, Chromium and Vivaldi reads their Windows folders, and a running Chrome is recognized by its `lockfile` (W2 B3) | S2 on Windows (Electron profile) |
| Protected video | No notice handoff to Electron Blanc | With the Mac's (D3) |
| Platform name | `win32` to the Island, the sync runner, sync and telemetry (`blanc/common/host_platform.h`) | Done |

## Linux

| Area | Linux x64 at L0 (2026-11-21) | Milestone |
| --- | --- | --- |
| Build | Native x64 on `blanc-android-build`, in the shared desktop checkout at `~/chromium-desktop/src/out/BlancLinuxPrototype` | L0 |
| Sandbox | The unpacked candidate uses the root-owned, mode-4755 `chrome-sandbox` helper. With Ubuntu's unprivileged user namespace restriction set to 1, all six renderers on each display had seccomp mode 2 and a PID namespace distinct from the browser's. [X11 and Wayland launch checks](https://github.com/bnfy/blanc/actions/runs/44942354424) | L0 unpacked launch. Installed-package sandbox checks belong to L1 |
| Window frame and buttons | The first build retained Chromium's Linux frame above the Island strip, and the Island drew its own window controls | L1 places Chromium's caption buttons over the strip in the desktop's button order |
| Data folder | The smoke and suite supplied a temporary `--user-data-dir`. The L0 source still used Chromium's default (`~/.config/chromium` in a default environment). A bare launch was untested | L1 gives the preview its own folder, `~/.config/blanc-prototype` |
| Platform name | `linux` to the Island, the Sync runner, Sync and telemetry (`blanc/island/host.js`, `blanc/common/host_platform.h`) | L0 |
| Packaging and updates | L0 used an unpacked preview from the draft candidate tarball | L1 builds `.deb` and `.rpm` packages. L3 proves updates through apt and dnf |

### Caption buttons

At Chromium 158.0.8127.2 an Island is a normal browser window. X11 and
Wayland both use CreateBrowserFrameViewLinux. With the system theme and a
toolkit NavButtonProvider it constructs BrowserFrameViewLinuxNative and
BrowserFrameViewLayoutLinuxNative. Otherwise it constructs BrowserFrameViewLinux
and BrowserFrameViewLayoutLinux. Both use OpaqueBrowserFrameView's buttons.
SettingsProviderGtk reads GtkSettings' gtk-decoration-layout on startup and
on notify (including outside GNOME). GtkUi sets WindowButtonOrderProvider's
leading/trailing vectors and notifies the LinuxUi observers. The frame's
OnWindowButtonOrderingChange copies the order into the layout and relays out
the root. OpaqueBrowserFrameViewLayout::LayoutWindowControls places the
visible buttons, substituting Restore when maximized. The native variant
uses toolkit button images, margins and spacing. CalculateClientAreaBounds
uses NonClientTopHeight, which includes title/icon height when a title is
shown and otherwise retains the frame's top border and extra top thickness.
InitWindowCaptionButton gives each button its own transparent layer, and
FrameView::GetChildrenInZOrder places the client behind the frame children.
The Island supplies the hidden tab strip's preferred height for button sizing
and keeps the resize inset above the client.

BrowserNativeWidgetAuraLinux::UseCustomFrame forces client decorations when
Ozone has no server decoration support. Otherwise it honors the normal
window's custom-frame preference. WaylandToplevelWindow requests kClientSide
for a custom frame and kServerSide for a native frame, and ShouldUseNativeFrame
requires the xdg decoration manager. Wayland therefore permits the overlay.
On X11 the upstream default depends on the window manager. The Island defaults
to a custom frame. Selecting "Use system title bar and borders" on a supporting
desktop places the system title bar above the strip, and GetShowWindowTitleBar
suppresses Chromium's controls.

The later candidate `linux-x64-64f8e6871c8fb16f` passed all eight
hosted checks under X11 (input) and all eight
under Wayland (layout). [Window-button run 44950261755](https://github.com/bnfy/blanc/actions/runs/44950261755)

### Crash reporting

Linux local dump capture awaits a hosted install check. The `crashpad` field in
`install-<system>-<arch>.json` records two forced browser crashes, one with
the default reporter configuration and one with test crash reporting enabled.
Each records the exit and the paths and sizes of minidumps in a fresh data folder.
