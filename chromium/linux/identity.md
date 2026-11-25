# Linux browser identity

These names belong to the Chromium desktop lane (159.0.8154.33 since 2026-11-25; first written at 158.0.8127.2). Patch 0113
selects the preview identity. The beta values are reserved for L3. Task 4
will install the launcher, desktop entry and icon and set the package metadata.
Blanc has never distributed a Linux build, and every L0 run used a throwaway `--user-data-dir`, so there are no existing L0 profiles to migrate.

| Name | Preview | Beta | Written by |
| --- | --- | --- | --- |
| Package | `blanc-prototype` | `blanc-beta` | Installer (planned), from `blanc_linux_package` |
| Install folder | `/opt/bnfy/blanc-prototype` | `/opt/bnfy/blanc-beta` | Installer (planned) |
| Launcher | `/usr/bin/blanc-prototype` | `/usr/bin/blanc-beta` | Installer (planned) |
| Desktop file | `blanc-prototype.desktop` | `blanc-beta.desktop` | Installer (planned), consumed by `chrome::GetDesktopName` |
| X11 WM_CLASS | `blanc-prototype` | `blanc-beta` | Browser, both fields for the default profile |
| Wayland app id | `blanc-prototype` | `blanc-beta` | Browser, ordinary default-profile toplevel |
| Menu name | `Blanc Prototype` | `Blanc Beta` | Installer (planned), from `blanc_linux_menu_name` |
| Data folder | `~/.config/blanc-prototype` | `~/.config/blanc-beta` | `chrome::GetDefaultUserDataDirectory` |
| Keyring application | `blanc-prototype` | `blanc-beta` | Secret Service item’s `application` attribute |
| Key name | `Blanc Prototype Safe Storage` | `Blanc Beta Safe Storage` | Secret Service item label and KWallet entry |
| KWallet folder | `Blanc Prototype Keys` | `Blanc Beta Keys` | KWallet provider |

The profile basename already includes the channel. Chromium first looks for
`CHROME_CONFIG_HOME`, then uses `XDG_CONFIG_HOME` or `~/.config`. Its explicit
user-data-dir overrides still take precedence. The installed desktop entry’s
`StartupWMClass` and `Icon` will both use the package name.

## From the desktop file to the window

At the pin, `chrome/common/channel_info_posix.cc` returns a nonempty
`CHROME_DESKTOP` override or the built-in desktop filename. In
`chrome/browser/shell_integration_linux.cc`, `SetDefaultWebClient` and
`GetIsDefaultWebClient` pass that filename to `xdg-settings`. Window creation
uses the same value through these calls.

1. `BrowserNativeWidgetAuraLinux::GetWindowClass` calls `GetProgramClassName`
   and `GetProgramClassClass`. Both pass `chrome::GetDesktopName` to their
   internal helpers. `GetDesktopBaseName` strips the final `.desktop`.
   The instance can include an explicit `--user-data-dir`. The class honors
   `--class` first. Upstream `X11Utils::GetWmWindowClass` capitalizes the first
   letter, while `WaylandUtils::GetWmWindowClass` returns the basename verbatim.
   Patch 0113 returns Blanc’s exact package basename before the X11 conversion.
2. For an ordinary browser window, the Wayland app id starts as the class.
   An installed per-profile desktop entry can replace the X11 instance and
   Wayland id. Private windows use their original profile here. Web apps have
   their own instance and app id. `GetWidgetParams` copies these values into
   the widget parameters. `DesktopWindowTreeHostLinux::AddAdditionalInitProperties`
   copies them to Ozone’s platform-window properties.
3. On X11, `ui/ozone/platform/x11/x11_window.cc`,
   `X11Window::Initialize` calls `ui::SetWindowClassHint`, which writes the
   instance and class as the two NUL-terminated strings of `WM_CLASS`.
   On Wayland, `WaylandToplevelWindow::OnInitialize` saves
   `properties.wayland_app_id`. `CreateXdgToplevel` calls
   `XdgToplevel::SetAppId`, which calls `xdg_toplevel_set_app_id`.
   Both Ozone backends also handle later profile-entry changes through
   `SetWindowClass`.

## From the credential store to Sync

`BrowserProcessImpl::PreMainMessageLoopRun` registers the Linux providers.
`FreedesktopSecretKeyProvider::GetKey` honors `--password-store`. Its default
uses KWallet on KDE and Secret Service elsewhere. In the default collection,
`SearchItems` matches **only** `application`. `CreateItem` writes both that
attribute and `xdg:schema=chrome_libsecret_os_crypt_password_v2`. KWallet
looks up the channel’s folder and entry, and uses the channel’s keyring label
as the requesting application name.

`OSCryptAsync::HandleKey` visits providers in ascending precedence. Only a
successful key from a provider that accepts new encryption changes the active
backend. At precedence 5 the POSIX fallback supplies `v10` (`basic_text`).
At 10 the freedesktop provider supplies `v11` for either transport. Its
successful KWallet route has a KWallet proxy (`kwallet`), while its Secret
Service route reports `gnome_libsecret`. A failed lookup leaves the previous
selection intact. The pin also registers the Secret portal at precedence 15
when enabled. By default it only decrypts. If explicitly enabled for new
encryption and successful, its `v12` key reports `xdg_secret_portal`.

After `DesktopSyncService` obtains its encryptor, `DesktopSyncPlatform::ConfigJson`
reads `GetLinuxStorageBackend()` on that browser-process OSCryptAsync instance
and sends the result in `storageBackend`. The runner exposes the config on
`__host`. The Electron shim reports the backend to shipping’s
`protectSyncKey`, which refuses `basic_text` before invoking encryption.
A Linux runner missing backend metadata takes the same refusal path.
