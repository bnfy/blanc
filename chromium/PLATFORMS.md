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

| Area | Linux preview and beta (to L3, 2026-11-23) | Milestone |
| --- | --- | --- |
| Build | Native x64 on `blanc-android-build`, in the shared desktop checkout at `~/chromium-desktop/src/out/BlancLinuxPrototype`. The L0 cold build took 57,829 steps. | L0 |
| arm64 | The same x86-64 server cross-compiles `out/BlancLinuxArm64Prototype` with Chromium's Debian arm64 sysroot. The cold build took 95,221 steps in 2 h 02 min. Candidate 5 passed installed checks on arm64 Ubuntu, Debian and Fedora. | L1 |
| Sandbox | The unpacked candidate uses the root-owned, mode-4755 `chrome-sandbox` helper. At L0 all six renderers per display had seccomp mode 2 and a PID namespace distinct from the browser's. Both installed architectures passed on Ubuntu 24.04 with `kernel.apparmor_restrict_unprivileged_userns=1`. [L0 launch checks](https://github.com/bnfy/blanc/actions/runs/44942354424), [L1 install checks](reports/l1-linux.json) | L0 and L1 |
| Window frame | The Island strip sits at the top of the custom frame. Its drag area moves the window, double-click maximizes and restores, and the corners resize. On a desktop with server-side decorations the user can choose a system title bar above the strip. | L1. [Caption buttons](#caption-buttons) |
| Window buttons | Chromium draws the controls over the strip in GTK's configured order. The Island leaves room on each side and anchors its menu at the menu button. Hosted X11 input and Wayland layout checks passed with left, right, split and Close-only layouts at 1× and 2×. | L1. [Frame run](https://github.com/bnfy/blanc/actions/runs/44950261755), [VM input coverage](linux/hand-checks-l1.md#results) |
| Identity | The menu and dock show **Blanc Prototype** with the Sunrise icon. The default-profile X11 `WM_CLASS` and Wayland app ID are `blanc-prototype`. Secret Service uses that application name and the label `Blanc Prototype Safe Storage`. KWallet uses the folder `Blanc Prototype Keys`. [Linux identity](linux/identity.md) | L1 preview |
| Installer | Chromium's `.deb` and owner-signed `.rpm` install under `/opt/bnfy/blanc-prototype`, with launcher `/usr/bin/blanc-prototype` and the blocker beside the browser. The daily cron enrolls only `pkg-staging.blanc.day` and Blanc's key. On apt, remove keeps the managed source and keyring until purge. [Package repository](linux/repository.md) | L1 packages. The beta's repository updates: see Updates |
| Default browser | The preview registers `blanc-prototype.desktop` and preserves the existing choice. Explicitly choosing it through the browser made `xdg-settings` return that entry. GNOME's Web list showed Blanc twice because Chromium also installs a hidden app-ID desktop entry for portals. [Install checks](reports/l1-linux.json), [VM Default Apps check](linux/hand-checks-l1.md#results) | L1 |
| Data folder | A normal preview launch uses `~/.config/blanc-prototype` by default. Uninstall keeps it. The install checks preserved shipping Blanc's `~/.config/Blanc` and Chromium's `~/.config/chromium`. The x64 check launched the shipping AppImage before and after. Arm64 used a representative profile. | L1 |
| Crash capture | The install runs exercised forced browser crashes on both architectures. Each job records any local minidumps in its artifact. The dump outcomes remain unconfirmed here. [Crash reporting](#crash-reporting) | L1 probe |
| Platform name | `linux` to the Island, the Sync runner, Sync and telemetry (`blanc/island/host.js`, `blanc/common/host_platform.h`) | L0 |
| Quit | Closing the last window quits Blanc. With a download running, Chromium asks "Download is in progress / Exit Blanc anyway?" (Continue downloading is the default); Exit quits within 2 seconds and removes the partial file. Closing a window that isn't the last asks nothing. [VM check](linux/hand-checks-l2.md) | L2 |
| Ctrl+Tab | Most recent use by default, by real keys on X11 and Wayland; the card shows under the Island while Ctrl is held. [Ctrl+Tab](#ctrltab) | L2 |
| Arc import | The importer's file choice uses GTK's native chooser; the suite drives it on X11. | L2 |
| Screen sharing | X11: Chromium's own picker shares a tab or the whole screen. Wayland: the picker's Window choice hands over to the desktop portal (GNOME's Share Screen); the Island shows its sharing chip and Stop ends the stream. Chromium's "is sharing" bar floats over the page's content near the top. [VM check](linux/hand-checks-l2.md) | L2 |
| Beta packages | **Blanc Beta** (`blanc-beta`), public since 158.0.8127.906 (November 23, 2026): `.deb` and `.rpm` for x64 and arm64 under `/opt/bnfy/blanc-beta`, launcher `/usr/bin/blanc-beta`, data folder `~/.config/blanc-beta`, beside the preview and shipping Blanc. Installing adds `pkg.blanc.day` (production) with Blanc's key; the daily cron keeps that source and key in place. [L3 report](reports/l3-linux.json) | L3 |
| Repository | Signed apt (`InRelease`, `Release.gpg`) and dnf (`repomd.xml.asc`, signed RPMs) metadata on Cloudflare R2, served by Workers at `pkg.blanc.day` and `pkg-staging.blanc.day`. The owner's Mac signs; a runner builds the metadata from the approved packages and never holds the key. Each release goes to staging first, is proven there, and the same tree is published. No DEP-11 (AppStream) metadata yet. [Package repository](linux/repository.md) | L3 |
| Updates | apt and dnf offer each new beta with the system's other updates; unattended upgrades skip third-party repositories unless the person allows them. Chromium checks the installed version every 2 hours and the Island then shows **Restart to update**, which relaunches into the new version with tabs restored. Ubuntu 26.04 has no Software Updater, and its App Center lists the update only once the repository publishes DEP-11 metadata (planned before the .37 update). [VM check](linux/hand-checks-l3.md) | L3 |
| Uninstall | `apt purge` or `dnf remove` removes the program, the repository source, its key and the cron job, and keeps `~/.config/blanc-beta`, as Chrome's packages do. Shipping Blanc's and other browsers' profiles and repositories are untouched (checked on all six legs). | L3 |
| Spell check | Hunspell, as in Chromium; the dictionary for the interface language downloads from `redirector.gvt1.com/edgedl/chrome/dict/`, as shipping Electron Blanc does on Linux. On a Mac the system spell checker is used instead. | L3 |

### Ctrl+Tab

At the 158.0.8127.2 pin, X11Window::DispatchUiEvent forwards the translated
key to the platform window delegate. WaylandEventSource::OnKeyboardKeyEvent
decodes the compositor's key with the current XKB modifiers and dispatches to
the keyboard-focused WaylandWindow. Both reach aura's WindowEventDispatcher.
If the input method handles the event first, WindowTreeHost::DispatchKeyEventPostIME
redispatches an unconsumed key to the event sink. DesktopEventClient makes
aura::Env the root window's parent event target. Its system-priority pre-target
handler sees the key before the focused view and the browser accelerator. The
first Island installs the handler before any shortcut can reach its window.

The accelerator table binds Ctrl+Tab and Ctrl+Shift+Tab to
IDC_CYCLE_TO_NEXT_TAB and IDC_CYCLE_TO_PREV_TAB. In fullscreen,
BrowserCommandController lets the page handle the key first. An unconsumed
press returns to the window's FocusManager after the renderer responds.
The Island registers both accelerators at normal priority after BrowserView.
It forwards the actual accelerator to BrowserView and identifies Ctrl+Tab for
the duration of that command. With Chromium's `browser.ctrl_tab_mru` at its
default false, the command calls SelectNextTab or SelectPreviousTab, where
patch 0088 calls Blanc. X11's
KeyboardCodeFromXKeysym maps XK_ISO_Left_Tab to VKEY_TAB. On Wayland the
XKB mapping yields DomKey::TAB and VKEY_TAB. In both cases EF_SHIFT_DOWN
selects the reverse accelerator. EF_ALTGR_DOWN is a distinct modifier.

X11Window handles FocusOut as a focus change. WaylandKeyboard::OnLeave
clears keyboard focus, modifiers and repeat. Neither path synthesizes the
missing key releases for the old window. Both platforms report top-level
activation changes to the widget, where Blanc cancels the gesture. Real keys
were confirmed on X11 under Xvfb on both architectures and on Wayland in the owner's
VM on November 22, 2026.

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
suppresses Chromium's controls. Wayland offers "Use system title bar and borders"
only where the compositor supports server-side decorations through `xdg-decoration`.
GNOME on Wayland lacks that support. The option was absent from both the strip
menu and Settings in the owner's Ubuntu VM on 2026-11-22. [VM check 11](linux/hand-checks-l1.md#results)

The later candidate `linux-x64-64f8e6871c8fb16f` passed all eight
hosted checks under X11 (input) and all eight
under Wayland (layout). [Window-button run 44950261755](https://github.com/bnfy/blanc/actions/runs/44950261755)

### Crash reporting

Each install leg forced two browser crashes in fresh data folders. The test
requires an abnormal exit and records whether a dump appeared. To determine
which systems captured a dump, read `crashpad.default` and `crashpad.testReporter`
in each job's `install-<system>-<arch>.json`. Their `captured` values and
dump paths and sizes are absent from the committed evidence. Linux has no
crash server. [x64 install run](https://github.com/bnfy/blanc/actions/runs/45036361406),
[arm64 install run](https://github.com/bnfy/blanc/actions/runs/45036363620)
