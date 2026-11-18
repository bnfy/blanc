# Windows identity of the fork's channels

Every name a Windows build of the fork writes to the registry, the Start menu
or the disk, so that it installs beside Chromium and beside the Electron
Blanc without taking any of theirs. The values come from
`chrome/install_static/BUILD.gn` (config `blanc_product_path`, patches 0094
and 0098) and `chromium_install_modes.h`; `tools/windows-identity.test.mjs`
holds this table, the patch and the Electron app's names together.

Only the preview channel is built for Windows (W1); the build refuses the
others. The release channel takes over the Electron Blanc's names at cutover
(the fork plan's R.6), which is a separate, later decision.

| Name | Preview (`Blanc Prototype`) | Electron Blanc | Chromium |
| --- | --- | --- | --- |
| Data folder (`%LOCALAPPDATA%\…\User Data`) | `Blanc Chromium Preview` | `%APPDATA%\Blanc` (Electron) | `Chromium` |
| Install folder (per-user) | `%LOCALAPPDATA%\Blanc Chromium Preview\Application` | `%LOCALAPPDATA%\Programs\Blanc` | `%LOCALAPPDATA%\Chromium\Application` |
| Registry root, uninstall key | `Software\Blanc Chromium Preview` | `Software\…\Uninstall\<electron-builder GUID>` | `Software\Chromium` |
| Default Programs name, `StartMenuInternet` key, `RegisteredApplications` value | `Blanc Prototype` (+ per-user suffix) | `Blanc` | `Chromium` (+ suffix) |
| Shortcut and uninstall display name | `Blanc Prototype` | `Blanc` | `Chromium` |
| Publisher (uninstall entry) | `Bananify Creative` | `Bananify Creative` | `The Chromium Authors` |
| AppUserModelID (taskbar) | `BlancPrototype` (+ per-user suffix) | `me.bnfy.bowser` | `Chromium` (+ suffix) |
| HTML ProgID | `BlancPrvHTM` (+ suffix) | `BlancURL` | `ChromiumHTM` (+ suffix) |
| PDF ProgID | `BlancPrvPDF` (+ suffix) | — | `ChromiumPDF` (+ suffix) |
| Direct-launch URL scheme | `blanc-prototype` | `blanc-import` (tab handoff) | `chromium` |
| Toast activator CLSID | `{1BFC5BBC-FA48-49EE-BDC9-BA91E18C4B89}` | — | `{635EFA6F-08D6-4EC9-BD14-8A0FDE975159}` |
| Active Setup GUID (system-level only) | `{FF7CE8A2-9361-41F3-B827-83DC0CB91795}` | — | `{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}` |
| Icon | Sunrise (`blanc/branding/win/blanc.ico`, the Electron app's bytes) | Sunrise | Chromium |

Observed on a runner (W1 Part B, run 44235371094): the per-user suffix is
`.` and a base32 hash of the user's SID, as in `Blanc Prototype.XVTBKQQPX2VWUBYKQEX56KRVZI`,
and Chromium's installer offers the preview for mailto, tel, irc, webcal and
other schemes as well as http and https, as Chrome does.

Kept as Chromium's, on purpose (open after W1):

- The executable and library names, `chrome.exe` and `chrome.dll`.
- The elevation and tracing services' CLSIDs and IIDs: their IIDs are also in
  `elevation_service_idl.idl` and `tracing_service_idl.idl`, and a non-Google
  build installs neither service (`chrome.release`).
- The AppContainer sandbox SID prefix.
- The document, PDF, incognito and app-list icons, and the "Chromium Apps"
  Start menu folder for installed web apps.
