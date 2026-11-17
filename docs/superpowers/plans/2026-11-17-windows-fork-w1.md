# Windows fork W1: window frame, identity, installer, signing

> **For agentic workers:** execute inline (superpowers:executing-plans). Steps use checkbox syntax.

**Goal:** the Windows build looks and installs like its own app: the Island fills the window under
Windows' own caption buttons, the build has a Windows identity that collides with nothing, Chromium's
installer installs and removes it, and the installer and its binaries carry a valid Authenticode
signature. W1 is the fork plan's PW.2.

**Spec:** [`docs/superpowers/specs/2026-11-17-windows-fork-design.md`](../specs/2026-11-17-windows-fork-design.md).
**Before it:** [W0](2026-11-17-windows-fork-w0.md), whose candidate `windows-x64-bdcf3cca0b966646`
passes 534 of 667 cases; 56 of its 103 failures are the frame this plan fixes.

**Owner decisions, 2026-11-17:**
1. **Window buttons are Windows' own.** Chromium's caption buttons (minimize, maximize or restore,
   close) sit in the top-right corner over the Island strip; the Island's own drawn buttons are
   hidden there, as the Mac uses its traffic lights. Snap Layouts, keyboard and screen-reader
   behavior come from Windows. This differs from shipping Blanc for Windows, which draws its own.
2. **Preview builds are signed now** with the Bananify Creative certificate (Azure Trusted Signing),
   to prove the signing path early. A signed preview has test hooks compiled in, so it stays on the
   unpublished draft release and is never published or attached to a public artifact.

**Decided by the standing rule "Chromium's own feature first" (owner, 2026-11-16), for review:**
- The installer is Chromium's `mini_installer` and `setup.exe`, per-user by default, not NSIS.
  (The cutover's NSIS bridge in the fork plan's R.6 is a later, separate thing.)
- Default-browser registration is Chromium's (`ShellUtil`), with Blanc's own names.
- The Island's menu button opens Chromium's app menu.
- The executable stays `chrome.exe` in W1. Renaming it touches the installer, the helper lookup
  and the harness, and its name is best chosen with the release identity; it is listed as open.

## Facts this plan rests on (read 2026-11-17 at the 158.0.8127.2 pin)

- Hiding the tab strip and toolbar is cross-platform (`browser_view.cc`,
  `browser_view_tabbed_layout_impl.cc`) and already works on Windows. No Windows frame file is
  patched yet.
- Normal windows on Windows always get `BrowserFrameViewWin`. With no tab strip its `GetTopInset`
  returns `TitlebarHeight`, so it paints a title bar above the client view: the 39 extra pixels of
  height the failing cases measure. Window Controls Overlay is the in-tree precedent for a client
  view that starts at `WindowTopY()` with the caption buttons kept on top
  (`BrowserFrameViewWin::LayoutClientView`, `BrowserCaptionButtonContainer::NonClientHitTest`).
- `BrowserView::NonClientHitTest` already returns `HTCAPTION` for the Island's drag areas
  (`blanc_prototype::IsCaption`) and `HTCLIENT` for the rest of the strip, ahead of the frame's own
  handling of resize borders and caption buttons.
- CDP's window bounds include Windows' invisible resize borders (8 px left, right and bottom at
  100%), which accounts for the 16 pixels of width in the failing cases. That is not visible
  frame, so the harness has to compare against the window's visible bounds on Windows.
- The Island shows its own controls and menu button whenever `platform` is not `darwin`
  (`renderer.js`). The fork has no native code behind `minimizeWindow`, `maximizeWindow`,
  `closeWindow` or `openMainMenu`; the typed contract declares them (`browser_api.mojom`,
  interface `Window`).
- Identity today: `kProductPathName` is the channel's name (patch 0094); every other install-mode
  field is Chromium's (`base_app_name` and `base_app_id` "Chromium", ProgId prefix
  "ChromiumHTM", the COM class ids, the sandbox SID prefix). Installer strings ("Chromium",
  "The Chromium Authors") come from `chromium_strings.grd`, which the runtime renaming in patch
  0077 does not reach. The icon is Chromium's; the fork tree has no `.ico`.
- Names the installed Electron Blanc owns: ProgId `BlancURL`, `Software\Clients\StartMenuInternet\Blanc`,
  RegisteredApplications value `Blanc`, app id `me.bnfy.bowser`, data in `%APPDATA%\Blanc`,
  uninstall entry "Blanc <version>".
- Chromium's installer builds in a cross build (`docs/win_cross.md`; `create_installer_archive.py`
  has Linux-host paths for 7-Zip and makecab). It grants the sandbox read access to the install
  folder itself (`configure_app_container_sandbox.cc`), so an installed build needs no `icacls` step.
- Crash capture may work after all: the docs say `.asm` files are stubbed in a cross build, but in
  this tree they are assembled with `llvm-ml` and Crashpad's objects are built. W1 tests it.

## Global constraints

- Everything in the W0 plan's constraints still holds (guarded builds on the Linux server only, no
  competing builds, the Android checkout untouched, no secret on the server).
- Windows-only code sits behind `is_win` / `BUILDFLAG(IS_WIN)`. A change to a shared file must leave
  what the Mac compiles the same unless that is the point; shared C++ gets a syntax-only compile on
  the Mac Studio before it reaches `chromium/next`.
- Each push that changes a build file in a shared patch or in `chromium/blanc/` needs the Mac
  Studio's GN files regenerated with unchanged arguments before the next nightly, and never while
  `records/RELEASE-IN-PROGRESS` exists. Batch such changes: at most one regeneration per part.
- New patches are recorded with file and hunk totals; no patch-budget question is asked.
- Signed files exist in two places only: the hosted runner while it works, and the unpublished
  draft release. Never an Actions artifact (anyone signed in can download those), never the server.
- No public claim about a Windows build.

## Part A: the window frame and window controls

**Gate A (all must hold):**
1. On the hosted runner the Island's content fills the window's visible bounds: the 56 cases that
   failed with "does not fill its frame" pass, and no case that passed in W0 fails.
2. One set of window buttons: Windows' own, top-right, working (minimize, maximize, restore, close
   by real clicks); the Island draws none. Evidence: a desktop capture and a native-click check.
3. Dragging the strip moves the window; the top edge and corners resize; double-click on the strip
   maximizes. Checked with real pointer input (`SendInput`), since synthetic input cannot show it.
4. The Island's menu button opens Chromium's app menu.
5. The layout holds at 150% scale (`--force-device-scale-factor=1.5`) and when maximized.
6. Mac: fork unit suite, both lanes' patch checks, and the nightly after the push all pass.

**Hand check, not a gate:** Snap Layouts on hover over maximize, on a real Windows 11 desktop (the
owner's VM). A hosted runner cannot show the flyout.

### Task A1: the client view starts at the top of the window
- [ ] Patch `browser_frame_view_win.cc` (new patch 0095, Windows-only file): for an Island window
      (`blanc_prototype::IsIslandWindow`), `LayoutClientView` insets by `WindowTopY()` as it does for
      Window Controls Overlay; `GetTopInset` and the title-bar painting, title and icon are skipped;
      the caption button container stays visible and on top.
- [ ] Check the maximized and fullscreen paths (`FrameTopBorderThickness`, `GetClientAreaInsets` in
      `browser_desktop_window_tree_host_win.cc`): the Island strip must not slide under the screen
      edge when maximized.
- [ ] `blanc_prototype::IsCaption` uses a 10 px drag band on Windows while the strip is hidden or
      floating (shipping's `WINDOWS_DRAG_BAND_PX`; the top 5 rows are the resize border).

### Task A2: the Island leaves room for Windows' buttons and hides its own
- [ ] Native: report the caption buttons' width and height to the host (a `windowControls` field
      in the layout the host already receives), measured from `BrowserCaptionButtonContainer`, in
      DIPs, updated on maximize and scale change. New file `blanc/browser/ui/window_buttons_win.{h,cc}`
      beside `window_buttons_mac`, added under `is_win` in `ui.gni`.
- [ ] `host.js`: expose `nativeWindowControls` and set `--window-controls-w` from the reported
      width, so the pill and the strip's drag area stop short of the buttons.
- [ ] `tools/island-renderer.mjs`: one anchored edit so the renderer appends its own three buttons
      only when the host reports no native ones. The menu button stays.
- [ ] `interactive_bounds` excludes the button area, so `IsCaption` never claims it.
- [ ] Unit tests: the renderer edit (as the existing anchored edits are tested), and the host's
      width handling.

### Task A3: the menu button and the window commands
- [ ] Native handlers for the typed `Window` interface: `OpenMainMenu(point)` shows Chromium's app
      menu anchored at the point; `MinimizeWindow`, `MaximizeWindow` (toggles) and `CloseWindow`
      act on the widget. The last three stay reachable for the strip's double-click and for tests,
      though no button calls them on Windows.
- [ ] `host.js` `implemented` gains the four methods; the "Use Chromium's native controls" notice no
      longer fires for them.
- [ ] The Mac keeps its behavior: its menu button is hidden and its traffic lights are native.

### Task A4: the harness measures the visible window on Windows
- [ ] Test hook `windowVisibleBounds` (Windows: `DWMWA_EXTENDED_FRAME_BOUNDS` in DIPs; elsewhere the
      widget's bounds), and `chromium/tests/adapters/island.mjs` uses it in `windowContentBounds`
      and `setWindowContentSize` in place of CDP's outer bounds. Mac results unchanged.
- [ ] `chromium/tests/lib/native-input-win.mjs`: real clicks, drags and double-clicks through
      `SendInput` (PowerShell), used by a new `chromium/tests/windows-frame.mjs` for gate items 2, 3
      and 5. It runs in the candidate workflow after the launch check.
- [ ] `chromeButtonRects` and `mainMenuRequests` adapters (today `undef`) get Windows definitions
      where the shipping steps need them.

### Task A5: build, run, record
- [ ] Guarded incremental build; package; ship; launch check; `windows-frame.mjs`; full suite.
- [ ] Record the new baseline and reports; update `PLATFORMS.md` and the STATUS gate table.
- [ ] Mac Studio: syntax-only compile of shared C++, then apply and GN regeneration once for the part.

## Part B: identity and installer

**Gate B (all must hold):**
1. A table in `chromium/windows/identity.md` gives every Windows name the preview channel writes,
   and a unit test proves none equals a name Electron Blanc or Chromium writes.
2. `mini_installer.exe` builds on the server through the guard.
3. On the hosted runner, with shipping Blanc v1.49.1 installed first: the installer installs
   per-user without a prompt; the app launches from the install folder with no `icacls` step; the
   launch check passes on the installed app.
4. Registration: `HKCU\Software\RegisteredApplications` and `Software\Clients\StartMenuInternet`
   hold the preview's own entry with http and https associations to its own ProgId, checked by a
   script like `scripts/verify-windows-browser-registration.ps1`; Electron Blanc's entries, data
   folder and `UserChoice` are unchanged.
5. Uninstall removes the preview's files, shortcuts and registry entries, keeps its data folder
   unless asked, and leaves Electron Blanc working.
6. A forced crash either leaves a dump in the data folder's `Crashpad` folder or does not; the
   result is recorded and every statement about crash reporting in a cross build is corrected.

**Hand check, not a gate:** Settings → Default apps lists the preview and can make it the default.

### Task B1: install mode and names
- [ ] Patch `chrome/install_static/chromium_install_modes.h` (extends 0094's approach: values from
      `//blanc/config.gni` per channel). Preview channel: `base_app_name` "Blanc Prototype",
      `base_app_id` "BlancPrototype", ProgId prefixes "BlancPrvHTM" and "BlancPrvPDF" (11
      characters is the limit), descriptions "Blanc Prototype HTML Document" and "PDF Document",
      direct-launch scheme `blanc-prototype`, and freshly generated class ids for the toast
      activator, elevation service, tracing service and Active Setup, and its own sandbox SID
      prefix. Release and beta values are named in the table but not built in W1.
- [ ] Installer strings: the shortcut and uninstall display name and the publisher come from the
      channel (`chromium_strings.grd` and the installer's string resources), so nothing the
      installer writes says "Chromium".
- [ ] `chromium/windows/identity.md` and `chromium/tools/windows-identity.test.mjs`.

### Task B2: the icon
- [ ] `chromium/blanc/branding/win/blanc.ico`: the Sunrise icon, byte-identical to
      `build/windows-icons/icon-sunrise.ico` (a test holds them equal), used for `IDR_MAINFRAME`
      through a patch to `chrome/app/chrome_exe.rc`. Document icons stay Chromium's in W1 (open item).

### Task B3: the installer
- [ ] `build.mjs`: the Windows output may build `mini_installer` as well as `chrome` (a named,
      tested target list; nothing arbitrary).
- [ ] `package-candidate.mjs` adds `mini_installer.exe` and the signing staging folder (Task C1) to
      the candidate zip.
- [ ] `chromium/tests/windows-install.mjs` (runner): install shipping Blanc silently, install the
      preview, run the launch check against the installed `chrome.exe`, verify registration,
      uninstall, verify removal and that shipping Blanc still launches. Gate items 3 to 5.
- [ ] The candidate workflow runs it; the `icacls` step stays only for the unpacked-folder checks.

### Task B4: crash capture
- [ ] `chromium/tests/windows-crash.mjs`: force a browser-process crash (`chrome://inducebrowsercrashforrealz`
      under the test flag) and a renderer crash, then look for dumps. Record the result; correct
      the spec, `PLATFORMS.md`, the server README and `CLAUDE.md` to what was observed.

## Part C: signing

**Gate C (all must hold):**
1. The owner has created a GitHub environment, `fork-windows-signing`, with themselves as required
   reviewer; every signing run waits for their approval.
2. The installer, `setup.exe`, `chrome.exe`, `chrome.dll` and every other executable the installer
   carries have a valid, timestamped Authenticode signature whose subject equals
   `WINDOWS_EXPECTED_PUBLISHER`, checked with `Get-AuthenticodeSignature` as the Electron release
   does, and recorded in a `windows-signature.json` bound to each file's SHA-256.
3. The signed installer passes Part B's install check.
4. The signed files are on the unpublished draft release only; the run uploads no artifact holding
   a signed binary, and the server never receives a credential.

### Task C1: how a signed installer is assembled (a short spike, recorded before code)
The inner binaries must be signed before the installer packs them, and the server must not hold
credentials, so the packing has to happen again on the runner. Chromium stages what that needs in
`out/<name>/signing/mini_installer/` (`copy_signing`). Establish, on the runner, with an unsigned
dry run first:
- [ ] `create_installer_archive.py` runs there from the staged files (Windows `7za.exe` from
      `third_party/lzma_sdk/bin/win64`, the system `makecab`).
- [ ] `mini_installer.exe` relinks from its staged objects and the new `packed_files.rc` with the
      runner's Visual Studio (`rc.exe`, `link.exe`).
- [ ] The repacked, unsigned installer is byte-for-byte or behaviorally equal to the server's
      (Part B's install check passes on it).
Write the result into `chromium/windows/signing.md`. If relinking on the runner does not work, stop
and bring the owner the alternatives; do not move credentials to the server.

### Task C2: the signing job
- [ ] A `sign` job in `chromium-windows-candidate.yml` (the file is already on `main`, so the
      branch's copy can be dispatched), in the `fork-windows-signing` environment, using the
      existing `AZURE_*` secrets and variables exactly as `release-windows-linux.yml` does, and
      failing closed when any is missing.
- [ ] Order: verify the candidate's SHA-256, sign the inner files, repack, relink, sign the
      installer, verify every signature against `WINDOWS_EXPECTED_PUBLISHER`, run the install
      check, upload the signed installer and `windows-signature.json` to the draft release.
- [ ] The preview's version resources name the publisher that signs it (the channel's company name
      in the Windows resources), so the signature and the file properties agree.

### Task C3: record
- [ ] `chromium/reports/w1-windows.json`, the STATUS gate tables, `PLATFORMS.md`, and a docs PR to
      `main` for `CLAUDE.md` and `AGENTS.md`.

## Open after W1

The executable's name; document and PDF icons; the release and beta channels' Windows identity
(the release takes over Electron Blanc's names at cutover, the fork plan's R.6); the updater (R.2);
a Windows beta without test hooks; outbound isolation for the Windows suite; the Mac's 22 suite
exclusions reviewed for Windows; the remaining 47 failures by cause (W2).

## What needs the owner

- Create the `fork-windows-signing` environment with a required reviewer (repository settings), and
  approve each signing run.
- Optional hand checks on a real Windows desktop: Snap Layouts, and Settings → Default apps.
