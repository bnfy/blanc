# Windows identity of the fork's channels

Every name a Windows build of the fork writes to the registry, the Start menu
or the disk, so that it installs beside Chromium and beside the Electron
Blanc without taking any of theirs. The values come from
`chrome/install_static/BUILD.gn` (config `blanc_product_path`, patches 0094
and 0098) and `chromium_install_modes.h`; `tools/windows-identity.test.mjs`
holds this table, the patch and the Electron app's names together.

The preview channel (W1) and the beta channel (W3) are built for Windows; the
build refuses the others. The beta has its own names throughout, so the beta
and the preview install side by side. The release channel takes over the
Electron Blanc's names at cutover (the fork plan's R.6), which is a separate,
later decision.

| Name | Preview (`Blanc Prototype`) | Beta (`Blanc Beta`) | Electron Blanc | Chromium |
| --- | --- | --- | --- | --- |
| Data folder (`%LOCALAPPDATA%\…\User Data`) | `Blanc Chromium Preview` | `Blanc Beta` | `%APPDATA%\Blanc` (Electron) | `Chromium` |
| Install folder (per-user) | `%LOCALAPPDATA%\Blanc Chromium Preview\Application` | `%LOCALAPPDATA%\Blanc Beta\Application` | `%LOCALAPPDATA%\Programs\Blanc` | `%LOCALAPPDATA%\Chromium\Application` |
| Registry root, uninstall key | `Software\Blanc Chromium Preview` | `Software\Blanc Beta` | `Software\…\Uninstall\<electron-builder GUID>` | `Software\Chromium` |
| Default Programs name, `StartMenuInternet` key, `RegisteredApplications` value | `Blanc Prototype` (+ per-user suffix) | `Blanc Beta` (+ suffix) | `Blanc` | `Chromium` (+ suffix) |
| Shortcut and uninstall display name | `Blanc Prototype` | `Blanc Beta` | `Blanc` | `Chromium` |
| Publisher (uninstall entry) | `Bananify Creative` | `Bananify Creative` | `Bananify Creative` | `The Chromium Authors` |
| Version resources: CompanyName, ProductName (`chrome.exe`, `chrome.dll`; `setup.exe` and the installer say `… Installer`) | `Bananify Creative`, `Blanc Prototype` (`blanc/branding/win/BRANDING`, W2 A1) | `Bananify Creative`, `Blanc Beta` (`blanc/branding/beta/BRANDING`, shared with the Mac beta) | `Bananify Creative`, `Blanc` | `The Chromium Authors`, `Chromium` |
| AppUserModelID (taskbar) | `BlancPrototype` (+ per-user suffix) | `BlancBeta` (+ suffix) | `me.bnfy.bowser` | `Chromium` (+ suffix) |
| HTML ProgID | `BlancPrvHTM` (+ suffix) | `BlancBetHTM` (+ suffix) | `BlancURL` | `ChromiumHTM` (+ suffix) |
| PDF ProgID | `BlancPrvPDF` (+ suffix) | `BlancBetPDF` (+ suffix) | — | `ChromiumPDF` (+ suffix) |
| Direct-launch URL scheme | `blanc-prototype` | `blanc-beta` | `blanc-import` (tab handoff) | `chromium` |
| Toast activator CLSID | `{1BFC5BBC-FA48-49EE-BDC9-BA91E18C4B89}` | `{FE4C251B-AD54-4F2F-B2A1-16EB186147E7}` | — | `{635EFA6F-08D6-4EC9-BD14-8A0FDE975159}` |
| Active Setup GUID (system-level only) | `{FF7CE8A2-9361-41F3-B827-83DC0CB91795}` | `{0101E396-5BD3-487F-9265-8DE26B34795A}` | — | `{7D2B3E1D-D096-4594-9D8F-A6667F12E0AC}` |
| Icon | Sunrise (`blanc/branding/win/blanc.ico`, the Electron app's bytes) | Sunrise (the same file) | Sunrise | Chromium |
| Shortcut tooltip; registered description (`Capabilities\ApplicationDescription`) | "Browse the web"; "A minimal web browser with ad and tracker blocking built in" (`install_util.cc`, owner 2026-11-21) | the same | — | "Access the Internet"; Chromium's product description |
| Test hooks | compiled in (`--blanc-test`) | compiled out (`hooks-evidence.mjs` `windowsStaticScan`) | — | — |

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
