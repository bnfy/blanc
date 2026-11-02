# Link routing (F60): real-app checks on the published 1.45.0 (2026-10-29)

**Status: routing PASSES on all three platforms, cold and warm. One bug (B1) and three gaps remain.**

- **Routing passes.** A link handed to Blanc by the OS opens in the rule's profile or Space, and an unmatched link opens where it always did. This holds on macOS through `open -a`, on Linux through `xdg-open` with the test copy as the default browser and through the OpenURI portal, and on Windows through the registered protocol command.
- **The opt-in switch passes.** **Also for links I open in a new tab** keeps a middle-clicked link in its own profile when off and routes it when on (macOS and Linux).
- **B1 (bug).** With that switch on, a background (middle-click) link that has to open a new window takes focus. The spec says such a window is shown without focus. Seen on macOS; Blanc's own focus record shows the same on Linux.
- **Gaps:**
  - Windows' real default-browser handoff (`start`, or a click in another app) couldn't be proven, because this VM can't hand a link to any default browser but Edge (details below).
  - On macOS, a click in Mail or Slack wasn't tried, because the owner's default browser wasn't changed.
  - No link was clicked inside another app on any platform.

All times are EDT on October 29, 2026, between 10:50 and 11:40. Rules for the run: the owner's Mac profile, `/Applications/Blanc.app` and its data, the owner's macOS default browser and the main checkout were never touched. Only processes this run started were stopped.

## Artifacts

Release `v1.45.0`, tag commit `6f1bc523d2f0d432d5c4119b9f7ec22a324dbd2d`.

- **Download.** The assets came from `gh release download v1.45.0 --repo bnfy/blanc` into a temporary folder.
- **Checksums.** `shasum -a 256 -c SHA256SUMS --ignore-missing` reported OK for every downloaded asset.
- **Signature.** `cosign verify-blob --bundle SHA256SUMS.sigstore.json --certificate-identity anthony@bnfy.me --certificate-oidc-issuer https://github.com/login/oauth SHA256SUMS` reported `Verified OK`.

| Platform | What ran | Identity |
|---|---|---|
| macOS (Apple Silicon) | `Blanc.app` from `Blanc-1.45.0-arm64-mac.zip`, extracted with `ditto` to `/private/tmp/blanc-lr-mac/Blanc.app`. Version 1.45.0, build 1450 | Zip SHA-256 `38cf670180a3976f96e4b9c34dd6afe94c21433a38627d0b5d973f212885f3d0`. `codesign --verify --deep --strict` passes; `spctl -a` reports accepted, Notarized Developer ID (`XYGUCY4498`). `app.asar` SHA-256 `d4b16232fbf2a1f00e7b2a9a864a030dfc6692bbaa2bd0dfe394475b37b35d89` |
| Windows 11 25H2 ARM64 VM (build 26220; x64 Blanc, emulated) | `Blanc-Setup-1.45.0.exe` unpacked with `bsdtar`, run from a VM-local copy in `%TEMP%\blanc-lr\app` | Installer SHA-256 `3615201347b613eb6fea9b9a3872209ea92b16d894fd5167e363300b9456eb67`. `Blanc.exe` 1.45.0.0, SHA-256 `37c461e6fbef2de02f214ae678fc537da256470615b2505c74b426e193898499`; Authenticode **Valid**, `CN=Bananify Creative`. `app.asar` SHA-256 `90003b92041f34d0b424d20d581838d4dd06ea24d33808822dca442982a05a7c` |
| Ubuntu 26.04 ARM64 VM (GNOME, Wayland session) | **Not the published file.** The release ships an x64 AppImage only (`Blanc-1.45.0.AppImage`, SHA-256 `43389dd71976c7a4ce8b22deef8e2e0f4b15920455357882545c3d379a5758e2`, downloaded and verified but not run: this VM can't run x64). The VM ran an ARM64 AppImage built in the VM from a fresh clone at tag `v1.45.0` (HEAD `6f1bc523…`, clean): `npm ci`, then `npx electron-builder --linux AppImage --arm64 --publish never` | `Blanc-1.45.0-arm64.AppImage` SHA-256 `bbddf441c3d022cb7f9144f60e713586398e09301214fc0e4df0ea5e3cb702c8`. This build uses the official Electron 44.9.3 from npm, **not** the castLabs ECS 44.9.3 runtime of the published builds. Routing is app code, so the runtime difference shouldn't matter, but this isn't the published Linux binary. The packaged adblock, uBO and compliance checks passed during the build. It ran from its `--appimage-extract` payload, with that payload's own `chrome-sandbox` made setuid root. The VM's `kernel.apparmor_restrict_unprivileged_userns=1` was left unchanged |

## Setup (each platform)

- **A fresh test profile** (`--user-data-dir`) with a seeded `settings.json`: onboarding done, usage ping off, What's New seen. The copy also got `--remote-debugging-port` (bound to 127.0.0.1), used only for setup and to read state.
- **Profiles, Space and rules.** A **Work** profile, created through Settings' own bridge (`bowserPages.profiles.create`). A Space, **Research**, in Personal, created closed (`browserAPI.createBlankWorkspace(…, { newWindow: true })`, then that window was closed). Two rules, written through `bowserPages.settings.setLinkRoutes` (the call the Settings editor makes):
  1. domain `example.com` → Work;
  2. contains `iana` → Personal / Research.
- **Starting state.** Before each check, the test copy was brought back to one Personal window with no Space: every other window was closed through its own strip.
- **Test links:**
  - `https://example.com/?lr=…` should open in Work;
  - `https://www.iana.org/help/example-domains?lr=…` should open in the Research Space;
  - `https://example.org/?lr=…` matches no rule.
- **Reading the result.** After each link, the window layout was read from the test profile's `session.json`: each window's profile, Space and tab addresses, plus `activeWindowId`, the window Blanc last saw take focus. The layout after every check is in [`states.json`](evidence/2026-10-29-link-routing/states.json).
- **Cold and warm.** Cold means the test copy wasn't running when the link was handed over. Warm means it was running with its windows open (one macOS exception is noted below).

### How links were handed over

- **macOS.**
  - **Cold:** `open -n -a /private/tmp/blanc-lr-mac/Blanc.app <url> --args --user-data-dir=… --remote-debugging-port=9333`. LaunchServices launches the copy and delivers the URL as an Apple event, which is Blanc's `open-url` path. The `-n` makes LaunchServices launch this copy, so the URL could never be handed to the owner's running `/Applications/Blanc.app`, which has the same bundle id.
  - **Warm:** `open -a /private/tmp/blanc-lr-mac/Blanc.app <url>`. Before using it, `open -a <copy>` without a URL was run once to confirm that LaunchServices brings forward the copy at that path (`lsappinfo front` reported `/private/tmp/blanc-lr-mac/Blanc.app`) while the owner's Blanc is running.
  - The default browser wasn't changed. A link clicked in Mail or Slack goes through the same Apple event, but only reaches Blanc when Blanc is the default browser, so that path is **not covered** here.
- **Linux.**
  - A desktop entry, `~/.local/share/applications/blanc-lr-test.desktop` (`Exec=<payload>/blanc --user-data-dir=… --remote-debugging-port=9333 %U`), was made the default with `xdg-settings set default-web-browser blanc-lr-test.desktop`. `xdg-settings` and `xdg-mime` then reported it for http and https.
  - Links were opened with `xdg-open <url>`.
  - They were also opened through the desktop portal's `org.freedesktop.portal.OpenURI.OpenURI`, sent with `gdbus`. GTK 4 apps (Ptyxis, GNOME Text Editor) and sandboxed snap or Flatpak apps open links through that call. It was made from a script, not by clicking a link in one of those apps.
- **Windows.** Two steps; the details follow:
  1. The test copy was registered (HKCU only) as its own browser, **Blanc LR Test**, with the ProgId `BlancLRTestURL`. Its command was `"…\Blanc.exe" --user-data-dir="…" --remote-debugging-port=9335 "%1"`, and it had the same `Capabilities`, `Application` and `RegisteredApplications` entries as the installer's `BlancURL`.
  2. It was made the default in **Settings → Default apps → Blanc LR Test → Set default**, pressed through UI Automation (screenshot below). Afterwards, `UserChoice` for http and https read `BlancLRTestURL`.

#### Why the Windows handoff fell back to the registered command

`cmd /c start "" https://example.com/…` did **not** reach the test copy. Windows started `OpenWith.exe -Embedding` and nothing opened. On the first attempt an untitled OpenWith window held the foreground for about 4½ minutes. The cause is in the VM's associations:

- `…\UrlAssociations\http(s)\UserChoiceLatest\ProgId` is `MSEdgeHTM`, last written on 2026-08-02. **Set default** in Settings updates only the older `UserChoice` key.
- `AssocQueryString(ASSOCF_IS_PROTOCOL, ASSOCSTR_COMMAND, "https")` fails with `0x80070483` (no association). It fails the same way after the VM's own default (`BlancURL`, the normal install) was restored, so this isn't specific to the test registration.

`UserChoiceLatest` wasn't touched. `start` wasn't run with `BlancURL` restored, because that would have sent a test link to the VM's normal install and its profile. Whether this VM's normal Blanc install currently receives links from other apps is therefore **unknown**. It's worth a look on a real Windows machine.

So on Windows, links were delivered by running the protocol command registered for `BlancLRTestURL`, with `%1` replaced by the URL. Windows runs exactly that command once it has resolved the default. Cold, it is a fresh process taking the URL from its command line. Warm, it is a second process that hands its command line to the running copy (`second-instance`).

An attempt through `ShellExecuteEx` with that ProgId named (`SEE_MASK_CLASSNAME`) was **discarded**: the shell downloaded the URL into `INetCache` and passed the cached file's path instead of the URL, and Blanc rightly ignored it.

## Results

`W`, `S` and `P` are the Work, Research-Space and Personal windows. "Focused" is `activeWindowId` in `session.json`; on Windows it was also confirmed by the OS foreground window title (`Work — Blanc` or `Blanc`).

| # | Check | macOS cold | macOS warm | Linux cold | Linux warm | Windows cold | Windows warm |
|---|---|---|---|---|---|---|---|
| 1 | `example.com`, no Work window open → a new Work window holding just the link | **PASS** (new W, focused) | **PASS** | **PASS** `xdg-open`; **PASS** portal | **PASS** `xdg-open`; **PASS** portal | **PASS** (foreground `Work — Blanc`) | **PASS** |
| 2 | `example.com`, Work window open → a new tab in it | not run | **PASS** (2nd tab in W, W focused) | not run | **PASS** | not run | **PASS** |
| 3 | `iana`, Space not open → the Space opens in a new window with the link | **PASS** (S has its saved tab plus the link) | **PASS** | **PASS** `xdg-open`; **PASS** portal | **PASS** `xdg-open`; **PASS** portal | **PASS** | **PASS** |
| 4 | `iana`, Space already open → a new tab in that window | not run | **PASS** | not run | **PASS** | not run | **PASS** |
| 5 | `example.org` (no rule) → the window used last, as before (D6) | **PASS** (restored P) | **PASS**: into P; and, with S focused last, into S | **PASS** (P) | **PASS** `xdg-open` (P, then S when S was used last); **PASS** portal | **PASS** (P) | **PASS** (P, then S when S was used last) |
| 6 | Switch **off**: middle-click a link to `example.com` in P → stays in Personal | — | **PASS** (background tab in P) | — | **PASS** | — | NOT RUN |
| 7 | Switch **on**: same middle-click → opens in Work | — | **PASS** (new W) | — | **PASS** (new W) | — | NOT RUN |
| 8 | Switch on, Work window open: background link → tab added, nothing raised | — | **PASS** (P stays focused; W's new tab not selected) | — | not run | — | NOT RUN |
| 9 | Switch on, no Work window: background link → a new window shown **without focus** (spec §3.7) | — | **FAIL (B1)** | — | **FAIL (B1)**, by Blanc's focus record | — | NOT RUN |
| 10 | A link clicked in another app (Mail or Slack; Notepad, Terminal or Outlook; Ptyxis) | NOT RUN | NOT RUN | NOT RUN (portal call instead) | NOT RUN (portal call instead) | NOT RUN | NOT RUN |

Notes on the rows:

- **macOS, cold.** For each cold check, the copy's windows were closed and it was quit with `SIGTERM`; the cold launch restored the Personal window from the session.
- **macOS, row 5 warm.** The first warm `example.org` link arrived while the copy was running with **no windows open**. A helper bug had closed them all, which is ordinary on macOS. Blanc reopened the Personal window and added the link there. The second warm `example.org` link went into the Research window, which was the last one used.
- **Linux, row 5 cold.** The first attempt ran without the reset (a `prlctl` call failed), so the copy restored both P and S, with S last used, and the link opened in S. That is also D6 behavior. It was repeated after a reset and opened in P. Both states are in `states.json` (`linux-cold-org-first`, `linux-cold-org`).
- **Rows 6–9.** These used a page on `http://127.0.0.1:8765/` with plain links to `https://example.com/?lr=inapp-…`.
  - **The click.** It was a middle button press and release sent with CDP `Input.dispatchMouseEvent` to the page. The page received trusted `mousedown`, `mouseup` and `auxclick` events. No physical mouse was used.
  - **The switch.** It was turned on and off by clicking the real `#linkRoutesInApp` checkbox in Settings. `settings.json` then read `linkRoutesInApp: false` or `true`.
  - **A harness problem on macOS.** The first two "on" attempts hit a background tab, and then a window behind other apps on the Mac. That page was `hidden`, and the click never reached it (no events). The check was repeated with the test window in front. The failed attempts are `mac-inapp-on-probe` and `mac-inapp-on-later` in `states.json`, and are not results.
- **Row 10.** No link was clicked inside a real third-party app on any platform. On Linux, the OpenURI portal call is the call those apps make; on Windows, the shell handoff itself was blocked (above).
- **Benign log line.** On Linux and Windows, each warm handoff's short-lived second process logs `bind() failed … Cannot start http server for devtools`, because the test flag `--remote-debugging-port` sits in the handler's command line. It is benign and test-only.

### B1: a background-routed link that has to open a window takes focus

**Expected** (spec §3.7, and the `inactive` path of `createMainWindowForRuntime` with `showInactive()`): a background open "adds the tab without raising anything, and a window it has to open is shown without focus."

**Reproduction (macOS, published 1.45.0, twice):**

1. Set up two profiles, Personal and Work, with the rule `example.com` → Work.
2. Turn on Settings → Profiles → **Also for links I open in a new tab**.
3. Leave only a Personal window open, with Blanc frontmost.
4. In a Personal tab, middle-click a link to `https://example.com/…`.

**Actual:**

- A new Work window opens holding the link (correct), but it becomes the key and main window.
- Accessibility reports `AXFocusedWindow` and `AXMainWindow` as `Work — Blanc`, and Work is first in the app's window order. Before the click, both were the Personal window `Blanc`.
- `session.json`'s `activeWindowId` moves to the Work window. That value changes only through a window's `focus` event, so Electron reported the new window as focused.

**Linux** (Ubuntu VM, Blanc on XWayland): the same middle-click also moved `activeWindowId` to the new Work window. The compositor's own focus wasn't checked.

**Not affected:** when the Work window already exists, the same middle-click adds a background tab to it and the Personal window keeps focus (row 8).

**Coverage:** CI's F60-6 clicks a `target=_blank` link (a foreground open), so it doesn't cover this. Windows wasn't checked.

No product code was changed. This record is the reproduction; no issue was filed.

## Screenshots

All are of the test copies and show only test pages and Blanc's chrome. On Windows, only the Settings content pane was captured, because its sidebar shows the account.

- [macOS, cold `example.com`: the new Work window](evidence/2026-10-29-link-routing/macos-cold-example-com-work-window.png)
- [macOS, cold `iana`: the Research Space window](evidence/2026-10-29-link-routing/macos-cold-iana-research-space-window.png)
- B1 on macOS:
  - [the Work window that took focus](evidence/2026-10-29-link-routing/macos-in-app-middle-click-work-window.png);
  - [the Personal window with the test page](evidence/2026-10-29-link-routing/macos-in-app-middle-click-personal-window.png).
- Linux, switch on:
  - [Work window strip](evidence/2026-10-29-link-routing/linux-in-app-on-work-strip.png);
  - [Personal window strip](evidence/2026-10-29-link-routing/linux-in-app-on-personal-strip.png).
- Windows:
  - [Settings, Blanc LR Test made the default](evidence/2026-10-29-link-routing/windows-settings-blanc-lr-test-set-default.png);
  - [Settings, Blanc restored as the default](evidence/2026-10-29-link-routing/windows-settings-blanc-restored-default.png);
  - [warm run, the three window strips (Research, Work, Personal)](evidence/2026-10-29-link-routing/windows-warm-three-windows-strips.png).

## Clean-up

- **macOS.** The test copy was quit. `/private/tmp/blanc-lr-mac`, the downloads and the local test page server were removed. The owner's Blanc was never quit or sent a link.
- **Linux.**
  - The test copy and page server were stopped.
  - `~/.config/mimeapps.list` (absent before) and the test desktop entry were removed. `xdg-settings get default-web-browser` reads `firefox_firefox.desktop` again, as before.
  - The build clone and the extracted payload were deleted, and the VM was suspended as found.
- **Windows.**
  - The test copy was quit, and its registration (`BlancLRTestURL`, `StartMenuInternet\BlancLRTest`, the `RegisteredApplications` value) and its temp folder were removed.
  - The default was set back to **Blanc** through Settings: `UserChoice` reads `BlancURL` for http and https, as before. `UserChoiceLatest` (`MSEdgeHTM`, August 2) was never touched.
  - The Settings windows this run opened were closed; one `SystemSettings` process that was already running before the run was also stopped along the way.
  - The VM's normal Blanc install kept running throughout. Its `session.json` and `history.json` contain no test addresses.
  - The VM was suspended as found.
