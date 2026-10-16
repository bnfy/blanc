# Chromium extension spike results

**Draft PR status (October 16, 2026):** The new-tab full build succeeded in
2h37m36s (45,219 steps). Native integration testing found and fixed a missing
close icon and a bridge URL check that failed after virtual-URL rewriting.
Those fixes rebuilt incrementally in 35.00s and 33.57s (7 steps each); the final
guarded dry run reports zero actions. Real profile data, four layouts, reload,
DOM bookmark navigation, cross-tab preferences, active-tab authorization and
full-restart persistence pass. After the Mac was unlocked, native keyboard,
mouse, Bitwarden popup, visible wallpaper and 500/600/1200px layout checks
also passed. The prototype is open with the original current tab and preferences
restored. Earlier extension acceptance rows below retain their stated scope.

Status (October 16, 2026): branded Island-only build complete. Native Chromium
tab strip, address toolbar and bookmarks bar are hidden in normal prototype
windows; real extension controls are embedded in the Island. Native macOS
traffic lights are inset 20 logical pixels from the top and left. The Island's supported tab
and navigation controls pass runtime interaction checks. Six real extensions are
enabled; all six inject content scripts into the local fixture. Five installed
through the normal live Web Store button with native user consent; Bitwarden
used the earlier diagnostic install flow. Concrete popup, messaging, storage,
userscript and provider paths work. Bitwarden also passed a signed-package
version upgrade and full restart. Native toolbar clicks now open all six extensions' logged-out interfaces.
The four Island gaps found during native testing are now fixed and pass native
retests: address selection, shortcut routing, small-window layout and unsupported
control visibility.
Account-dependent features remain unverified; this is prototype evidence, not production
migration approval.

| Gate | Result | Evidence |
| --- | --- | --- |
| Pinned Chromium build | Pass | Chromium 156.0.8078.36, commit `5a93aa59e3043e747eff68659dcf7d20193d160e`; `chrome` target built as Blanc Prototype.app. |
| Blanc Island renders | Pass (tested sizes) | Native screenshots and pointer hit-testing verified. The repaired 19-tab panel fits 600×420: host 420px, panel bottom 408px, footer bottom 376.5px. The list scrolls within the panel; Downloads remains clickable. Restoring 1200×900 restores the 640px expanded host. |
| Island controls real tabs | Pass (supported controls) | Actual Island DOM buttons and input events drove native create, switch, close, address navigation, back, forward, reload, stop, picker search/Enter, Escape and /new. Closing the final tab creates a fresh New Tab in the same window. Native Cmd+A selects the address; Cmd+L and Cmd+T focus the Island, including repeated Cmd+T. |
| Live Web Store install action | Pass (React Developer Tools) | Unmodified live listing had an enabled Add to Chrome button. Activated that DOM button via DevTools; owner approved native Add extension. Store handler completed installation without direct diagnostic install API calls. React Developer Tools 8.0.0 is enabled with installType normal; listing shows enabled Remove from Chrome. Switch to Chrome banner remains, so the banner alone is not an installation blocker. |
| Native permission prompt | Pass | Owner clicked Add extension; `beginInstallWithManifest3` callback returned success, then `completeInstall` completed without runtime error. |
| Extension action popup | Pass (logged-out entry points) | Physical native toolbar clicks open Bitwarden, React Developer Tools, Tampermonkey and Grammarly popups. 1Password opens account setup; MetaMask transitions to wallet onboarding. Native Extensions menu lists all six; Manage Extensions opens chrome://extensions/. Authenticated features remain untested. |
| MV3 service worker and messaging | Pass (scoped paths) | All six workers observed. Bitwarden content messaging responds; React content detection updates its worker-selected popup; MetaMask eth_accounts returns successfully. React extension storage round trip and Tampermonkey GM storage across reload pass. |
| Content scripts | Pass (scoped fixture) | All six have isolated execution contexts and loaded extension scripts on the localhost fixture. React detects a real renderer/root; Grammarly inserts page integration; MetaMask injects its provider; Tampermonkey executes the reviewed local script. |
| Persistence after relaunch | Pass | Graceful `Browser.close`, process-exit confirmation, same-profile relaunch; management.getSelf reports Bitwarden 2026.10.0 enabled, installType normal, and popup opens again. |
| Extension update | Pass (requested native check) | In a separate profile, observed signed Bitwarden 2026.9.3 enabled, requested `chrome.developerPrivate.autoUpdate()`, then observed 2026.10.0 enabled about 11 seconds later. Google update and CRX endpoints returned HTTP 200. Updated version and popup survived a full browser restart. Scheduled background-check timing remains untested. |

## Reproduction and observations

- Profile: `/private/tmp/blanc-chromium-profile-webstore` (isolated test profile).
- Executable: `/Users/anthonyjloria/Projects/BlancChromium/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype`.
- Extension: Bitwarden Password Manager, `nngceckbapebfimnlniiiahkandclblb`.
- Installed version read from `chrome.management.getSelf()`: **2026.10.0**.
  The manifest fetched for the initial approval diagnostic was 2026.9.3;
  the completed store download installed 2026.10.0. This is not an update test.
- Store listing: <https://chromewebstore.google.com/detail/bitwarden-password-manage/nngceckbapebfimnlniiiahkandclblb>.
- Diagnostic sequence: invoke `beginInstallWithManifest3` from the genuine
  listing using the manifest fetched from Google's CRX endpoint; owner approves
  the native dialog; invoke `completeInstall`; verify successful callback,
  normal enabled installation and service-worker target. No unpacked extension
  was used for this result.
- Popup target: `chrome-extension://nngceckbapebfimnlniiiahkandclblb/popup/index.html#/default-password-manager-prompt`.
  Its complete document contains Continue and Skip. The diagnostic did not
  approve changing the browser's default password manager or sign into a vault.
- Restart procedure: send DevTools `Browser.close`, confirm no prototype main
  process remains, relaunch the same executable/profile and assets with the
  store listing URL, then repeat management and popup checks. The Island again
  returned the real, fully loaded store tab after restart.
- Runtime flags include `--no-first-run`, `--use-mock-keychain`, and a local
  DevTools port 9223 for inspection. Mock keychain resolved a persistent-cookie
  key-loading stall in this isolated profile; this is not production keychain
  validation. Browser sandbox and TLS certificate checks remained enabled.
- Prototype WebUI currently disables Trusted Types enforcement locally to
  support the copied Island's SVG innerHTML. This concession requires follow-up
  before any production migration.

## Build evidence

The focused UI cold build completed 40,298 actions in 2h20m13s. The subsequent
`chrome` target completed 2,721 actions in 8m6s. The WebUI runtime fix rebuild
completed 533 actions in 1m49s. Those earlier builds are finished. The running prototype now uses the corrected
new-tab binary described above.

Do not turn pending or partial rows into passes from source inspection.
Remaining work includes account-dependent extension features, advanced Island
parity, scheduled update timing and the separate simple MV3 fixture from the
original acceptance matrix. The four native Island gaps are resolved below. Native toolbar
clicks and normal-window compositing were tested in the later pass below.

## Normal Web Store installation (October 16)

- Listing: <https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi>.
- Same independently branded executable, standard user agent/client hints,
  main test profile `/private/tmp/blanc-chromium-profile-webstore`. No browser
  detection overrides or installation API wrappers were added for this test.
- Loaded listing in a new tab and checked `Add to Chrome.disabled === false`.
  Invoked the existing DOM button's click handler with a DevTools user gesture.
  Owner clicked the native Add extension button. The store performed the rest.
- `chrome.management.getAll()` reported React Developer Tools 8.0.0 enabled,
  installType normal, and Google's update URL. The page changed to Remove from
  Chrome. See `evidence/normal-web-store-install.json` for the captured result.
- Earlier disabled-button observations are retained above as history. This
  successful test establishes a working path; it does not establish why the
  earlier page remained disabled. The promotional Switch to Chrome banner
  persists even when installation succeeds.

## Version-upgrade test setup

- Separate profile: `/private/tmp/blanc-chromium-profile-update-20261016`,
  DevTools port 9224, normal browser sandbox and TLS validation.
- Older package: `/private/tmp/bitwarden.crx`, downloaded from Google's update
  endpoint on October 15; manifest version 2026.9.3, unchanged signed CRX.
- SHA-256: `9964f660a11023cb19a730b7f908353ec1dae77a027c8192315d0a7f3d8ef921`.
- Developer mode enabled only in this separate profile for native CRX drop.
  DevTools simulated drops did not supply the native dragged-file path
  (`No dragged path`). The owner then dragged the package from Finder and
  approved the native permission dialog. No unpacked loading, repacking or
  edited version metadata was used.

## Verified version upgrade (October 16)

1. At 09:02:38 EDT, native `developerPrivate.getExtensionsInfo()` reported
   Bitwarden 2026.9.3 in state ENABLED in the separate profile.
2. The monitor invoked `chrome.developerPrivate.autoUpdate()` (the same native
   update action used by the extensions manager's Update control).
3. The captured network log records HTTP 200 from
   `https://update.googleapis.com/service/update2/json`, followed by HTTP 200
   for the Bitwarden `NNGCECKBAPEBFIMNLNIIIAHKANDCLBLB_2026_10_0_0.crx`
   package on `clients2.googleusercontent.com`.
4. At 09:02:49 EDT, native extension information reported 2026.10.0 ENABLED.
   The update promise completed, and the updated native action popup opened.
5. Closed the separate browser with `Browser.close`, confirmed main process
   30292 had exited, and relaunched the same executable/profile. At 09:03:45
   EDT, `chrome.management.getSelf()` again reported 2026.10.0 enabled with
   installType normal; its native action popup opened again.

Evidence: `evidence/bitwarden-update-observations.json`,
`evidence/bitwarden-update-network.json` (minimal endpoint/status extraction,
without request headers or query parameters), and
`evidence/bitwarden-update-after-restart.json`. Full diagnostic netlog remains
local at `/private/tmp/blanc-update-netlog.json` and is not committed.

This proves the real signed-package download and replacement path using a
manually requested native check. It does not prove the periodic scheduler's
interval, every extension's compatibility, or an update that adds permissions.
The previously installed latest version separately returned `no_update` from
`chrome.runtime.requestUpdateCheck()`.

## Island interaction verification (October 16)

Tests ran in a dedicated prototype window against localhost fixtures. They used
Island iframe DOM controls and real input/keydown events, then checked Chromium's
native tab snapshots; reload was independently verified by the HTTP request count.
Stop was checked while a deliberately slow image was loading. These are automated
DOM interactions, not verification of native mouse hit-testing or global shortcuts.

- Passed: new tab, URL + Enter, back, forward, reload, stop, tab dot switching,
  tab close, picker search + Enter, Escape, `/new`, and final-tab replacement.
- Fixed `prototype/host.js`: shared panel cleanup calls `cancelWorkspaceAction`
  even when no workspace action exists. The prototype now provides a no-op,
  preventing a spurious unsupported-method banner. The full supported smoke run
  and edge checks passed afterward, with no host error notice. Asset reload was
  sufficient; no Chromium compilation was needed.
- Resting pill and expanded picker screenshots were inspected. They establish
  WebUI rendering; they do not establish full native-window compositing.
- Unsupported bookmark and secondary footer controls are still visible. Their
  actions are outside this bridge's scope and can report unsupported operations.
  Global Cmd+L/Cmd+T routing, Spaces, history, private tabs and other advanced
  Island behavior remain pending.

Evidence: [control results](evidence/island-results.json),
[edge results](evidence/island-edge-results.json),
[original banner](evidence/island-results-before-fix.json),
[resting Island](evidence/island-strip.png), and
[expanded Island](evidence/island-expanded.png).

## Extension compatibility matrix (October 16)

All six are enabled in the isolated profile. React Developer Tools, 1Password,
Tampermonkey, Grammarly and MetaMask installed using the listing's normal Add to
Chrome button and owner approval of each native Add extension dialog. Bitwarden's
initial installation used the separately documented diagnostic flow.

| Extension | Version | Verified behavior | Still unverified |
| --- | --- | --- | --- |
| Bitwarden | 2026.10.0 | Worker, content-script response, native action popup, full restart, signed version upgrade | Signed-in vault and autofill |
| React Developer Tools | 8.0.0 | Detects React DOM 18.3.1 renderer and fiber root; native popup reports development build for active fixture; extension storage set/read/remove | Components and Profiler DevTools panels |
| 1Password | 8.12.41.1 | Worker, inline scripts, welcome Continue reaches account setup UI | Account sign-in, autofill, desktop pairing/native messaging; logged-out toolbar opens setup rather than popup |
| Tampermonkey | 5.5.1 | Worker, native popup, normal userscript installer, localhost-only script execution and GM storage survives reload | Wider third-party script compatibility |
| Grammarly | 14.1338.0 | Worker, content scripts and page integration element, native popup renders logged-out interface | Account features and actual writing suggestions |
| MetaMask | 13.52.0.0 | Worker, content/inpage scripts, window.ethereum.isMetaMask, eth_accounts RPC succeeds with zero accounts | Wallet creation/import, connection, signing and transactions; logged-out toolbar opens onboarding |

MetaMask's manifest/management version is 13.52.0.0; the extension manager displays
13.52.0. A direct worker inspection of chrome.action was blocked by MetaMask's
LavaMoat global hardening. That is a test-harness limitation, not a demonstrated
extension failure; no hardening was disabled.

The fixture's React button updates Count 0 to Count 1. React Developer Tools sees
one renderer/root, and Bitwarden responds to its page installation-check message.
The ordinary page has neither browserAPI nor chrome.send. This last check is a
scoped observation, not a comprehensive security audit.

Tampermonkey initially requested Chromium's Allow User Scripts permission. Enabled
that setting only for the test, installed the reviewed script through its normal
installer, and observed the script counter advance from 1 to 2 across a reload.
The script matches only http://127.0.0.1:18763/* and stores a synthetic counter.
Afterward, deleted it through Tampermonkey's dashboard, restored Allow User Scripts
to off (userScriptsAccess.isActive=false), and reloaded the fixture: neither marker
nor dataset remained. The temporary React storage key was also removed.
No extension account credentials, vault data or wallet secrets were used.

Evidence: [final enabled versions](evidence/extension-final-status.json),
[content contexts and functional results](evidence/extension-content-results.json),
[React popup and storage](evidence/react-popup-result.json),
[React popup text](evidence/react-popup-dom.json),
[1Password onboarding](evidence/1password-onboarding-result.json),
[Grammarly popup](evidence/grammarly-popup-dom.json),
[Tampermonkey initial popup](evidence/tampermonkey-popup-dom.json),
[MetaMask provider](evidence/provider-result.json),
[userscript first run](evidence/userscript-first.json),
[userscript after reload](evidence/userscript-second.json),
[reviewed probe source](evidence/local-userscript-probe.user.js), and
[probe cleanup](evidence/probe-cleanup.json).

## Native toolbar and remaining Island controls (October 16, follow-up)

macOS now reports Accessibility and screen capture access available. Tests used
real CGEvent mouse down/up events at Accessibility-located toolbar coordinates,
not DOM clicks or chrome.action.openPopup. Native keyboard events were delivered
through macOS; DevTools supplied geometry and state readback. Work ran in a
separate window (60438575) in the isolated profile, with no account sign-ins.

### Native extension controls

- Bitwarden's actual toolbar button opens its default-password-manager prompt.
  React Developer Tools opens the development-build popup for the active React
  fixture. Grammarly and Tampermonkey open their logged-out/configuration popups.
- 1Password's toolbar button opens its account setup tab. MetaMask's button
  initially creates a side-panel target, then opens the wallet onboarding tab.
  These are working logged-out entry points, not proof of authenticated popups.
- The native Extensions menu lists all six packages with site access and pinned
  status. Its Manage Extensions button opens Chromium's extensions manager.
- No password-manager settings were accepted and no vault or wallet was created.

Evidence: [native toolbar results](evidence/native-toolbar-results.json),
[extension menu](evidence/native-extension-menu.txt),
[React popup in the native window](evidence/native-react-popup.png), and
[Bitwarden popup](evidence/native-bitwarden-popup.png).

### Island results with actual mouse and keyboard input

Passed: pill opens and focuses the address input; collapse button; Escape;
outside-panel dismissal; footer New tab and Downloads; typed HTTP navigation;
expanded back/forward/reload/stop; `/close` and `/downloads`; row close and row
switch; native Cmd+W reflected in Island state; picker ArrowDown/ArrowUp/Enter
switches to the exact expected tab; and +N opens all 18 tab rows.

An early native text helper exited before its Unicode event finished dispatching;
that was corrected before the successful typing checks. A footer click during
panel settling missed once; a settled retry created exactly one tab. The raw run
retains that timeout, with the successful retry in the final-controls evidence.
Selection for typed checks used Cmd+Shift+Left because Cmd+A has the gap below.

Gaps confirmed in that test pass (all four resolved by the later fix/retest section):

1. **Cmd+A does not select the Island address input.** With its caret at the end,
   selectionStart/End remain unchanged after a trusted native Cmd+A event.
   Cmd+Shift+Left selects the text successfully.
2. **Cmd+L and Cmd+T do not open the Island.** Accessibility confirms Cmd+L
   focuses Chromium's Address and search bar. Cmd+T creates a standard Chromium
   New Tab. The copied Island's shortcut hints therefore overstate this prototype's
   integration. Cmd+W does close the tab and the Island reflects that change.
3. **A short window clips a long expanded panel.** At 600×420 with 18 tabs, the
   host viewport is still 640px tall; the footer ends at y=596.5 while only 334px
   of content space is visible. The same list fits at 1200×900; a five-tab list
   fits at 600×420. Native screenshots confirm the clipping. LayoutIsland currently
   uses the requested height without clamping it to available window height.
4. **Unsupported controls remain visible.** Physical bookmark, pin and History
   clicks report unsupported operations. Spaces/private tabs/Glance and other
   advanced controls remain outside this bridge. Do not treat those as working
   because the copied UI renders them. Drag/reorder, native clipboard editing,
   and full advanced-control parity remain unverified.

No implementation code changed in this follow-up; these findings identify the
next prototype fixes. No Chromium rebuild was started.

Evidence: [native Island run](evidence/native-island-results.json),
[settled footer and Stop checks](evidence/native-final-controls-results.json),
[exact picker selection](evidence/native-picker-result.json),
[shortcut and window-size results](evidence/native-shortcuts-resize-results.json),
[overflow results](evidence/native-overflow-results.json),
[small window, short list](evidence/native-island-small-short-list.png),
[normal window, long list](evidence/native-island-overflow-normal.png), and
[clipped long list](evidence/native-island-overflow-clipped.png).

## Four Island fixes and native retest (October 16)

All four gaps above are repaired in the isolated prototype. The final native run
passed **12 checks** using CGEvent mouse/keyboard input and DevTools state
readback. Screenshots were captured from the actual native window and inspected.

| Fix | Implementation | Native retest |
| --- | --- | --- |
| Select All | Trusted Island adapter handles Cmd/Ctrl+A on text inputs; shipping Electron renderers are unchanged. | Caret at 28 → selection 0–28; typing replaces the address and Enter navigates. |
| Cmd+L / Cmd+T | Shared Chromium command functions open/focus the owned Island WebView. The current ActionItem dispatch path bypasses the older controller switch, so hooks live in browser_commands.cc. A new tab receives an empty Island input. | Cmd+L from page and omnibox selects/focuses the Island address. Cmd+T creates exactly one tab, focuses blank input, and works again while open. |
| Short windows | LayoutIsland clamps native view height to the space below the toolbar; existing panel CSS keeps the list scrollable. | 19 rows in 600×420: native/DOM height 334, panel bottom 322, footer bottom 290.5, list 183px with 608px content. Downloads opens from a physical footer click. Resizing to 1200×900 restores expanded height 640. |
| Unsupported controls | Prototype CSS hides bookmarks, pin/mute/Glance and unsupported footer controls. Preparation gives the copied heart a stable selector and filters slash commands to /downloads, /new and /close. | All ten inspected unsupported controls have zero rendered bounds; New tab and Downloads remain visible. Slash menu contains exactly the three implemented commands. |

The supported interaction run ended with no host error banner. A physical
Bitwarden toolbar click still opened and rendered its native popup after the
changes. No vault/settings prompt was accepted.

The native fixes required compilation: the first incremental build completed
534 steps in 2m10s; the final command-dispatch adjustment completed 7 steps in
42.97s. Preparation now avoids rewriting unchanged native/build inputs. Two
successive preparations preserved their timestamps, and the following build
reported **no work to do (0 steps)**.

Validation: JavaScript syntax checks, diff whitespace checks, and ESLint's
repository rules plus prototype checks passed for 277 files with zero errors or
warnings. This checkout had no installed ESLint, so the repository-pinned
ESLint 10.12.0, @eslint/js 10.0.1 and globals 17.13.0 ran from a temporary
directory without installing Electron or changing the repository dependencies.

The native harness enabled the host's DevTools Accessibility domain after
restart. When macOS omitted the auxiliary WebView's AX node, it used the measured
native toolbar bottom (the native layout anchor) plus DOM coordinates for the
physical click; assertions still read actual native tab and viewport state.
Earlier diagnostic harness failures are not treated as product passes.

All three original tabs survived restart. The dedicated test window was closed
and the temporary localhost fixture server was stopped. The rebuilt prototype
remains open with the existing test profile and extensions.

Evidence: [12-check native retest](evidence/island-fixes-retest.json),
[fixed short window](evidence/island-fixes-short-window.png),
[restored normal window](evidence/island-fixes-normal-window.png),
[lint result](evidence/island-fixes-lint.json),
[preparation repeatability](evidence/island-fixes-preparation.json), and
[build/cleanup summary](evidence/island-fixes-build-and-cleanup.json).


## Island-only window and inset native controls (October 16)

The owner authorized replacing the prototype's visible Chromium toolbar and tab
strip with the Island, then requested roomier macOS traffic-light placement.
The final native close button begins 20 logical pixels from the window's left
and top edges. These are real AppKit close/minimize/fullscreen buttons. The
56px native titlebar geometry and horizontal inset are independent of the
68px Island header; no HTML window buttons were substituted.

Normal prototype windows hide the tab strip, toolbar and bookmarks bar while
retaining Chromium's tab model. The existing native extension view is reparented
into the Island's measured slot and restored to its owner during destruction.
Native popup anchors, overflow menu and permission sheets remain Chromium's.
The trusted host reports both its extension slot and interactive bounds, so
header whitespace drags the window without intercepting Island controls. At
widths of 800px and below, the expanded panel starts at 48px to clear the
native button cluster; its height cap preserves the bottom inset and scrolling.

The Island counts as the effective address control for command routing in
browser fullscreen. Page-requested fullscreen hides the Island and returns the
whole viewport; browser fullscreen retains the Island. Narrow windows reduce
the extension slot and keep the native Extensions menu available.

Runtime evidence covers native keyboard/mouse input, actual extension pages,
Accessibility bounds and inspected native-window screenshots:

- Address selection and native typing/Enter, Cmd+L, repeated Cmd+T, supported
  slash commands and hiding unsupported controls.
- No visible native tab strip, address field or toolbar. A 19-row panel fits
  600×420, with scrolling and a physically clickable Downloads footer. The
  expanded host returns to 640px at 1200×900.
- All six installed extensions remain available through the embedded native
  controls. Bitwarden, React Developer Tools, Grammarly and Tampermonkey show
  their popup interfaces; 1Password and MetaMask show their account/wallet setup
  interfaces. No account sign-in or wallet creation was performed.
- Native window dragging, minimize/restore, and browser fullscreen with Island
  address focus and a Bitwarden popup. The fullscreen test clicks the page
  before Cmd+L: an earlier sequence sent the shortcut while a temporary native
  fullscreen hint window was present and timed out. A separate 1Password
  harness attempt read document.body before creation; the readiness-aware
  retry rendered its normal account setup interface.
- A 500×420 window keeps the pill within the available width and the Extensions
  menu usable. HTML fullscreen provides the complete 1920×1080 viewport and
  restores the Island on exit.
- Physically clicking the live Dark Reader listing's normal Add to Chrome
  button opens its native permission sheet with the requested permissions.
  Cancel was clicked; Dark Reader was not installed. Earlier approved actual
  installations and the signed Bitwarden upgrade remain documented above.

The final incremental build completed 9 actions in 46.95 seconds. Reapplying
preparation then building reported **no work to do (0 actions)**. JavaScript
syntax and diff whitespace checks passed; repository/prototype ESLint checks
passed across 277 files with no errors or warnings.

This remains an isolated prototype. Authenticated extension features, advanced
Island parity, production keychain behavior and scheduled extension-update
timing are not established by these layout checks.

Evidence: [20-check native run](evidence/island-only-retest.json),
[final narrow-window layout retest](evidence/island-only-layout-final.json),
[minimum width, minimize, page fullscreen and permission sheet](evidence/island-only-extra.json),
[extension sequence and fullscreen](evidence/island-only-extension-sequence.json),
[final window](evidence/island-only-final-window.png),
[expanded short window](evidence/island-only-short-window.png),
[minimum width](evidence/island-only-minimum-width.png),
[native permission sheet](evidence/island-only-webstore-permission.png),
[build](evidence/island-only-build.log),
[no-op rebuild](evidence/island-only-noop-build.log), and
[lint](evidence/island-only-lint-final.json).

The complete native run passed 20/20 checks. After the final narrow-window CSS
adjustment, its 10 layout/keyboard checks passed again, followed by all four
minimum-width/minimize/page-fullscreen/permission checks. Final native bounds
confirm the close button at (475,93) inside a window at (455,73): exactly 20px
left/top inset, with native 16px buttons and 23px horizontal spacing.
The original three tabs remain, New Tab is active, all dedicated test windows
are closed, and the temporary fixture server is stopped. The final prototype
remains running. See [final measurements and cleanup](evidence/island-only-summary.json).


## Remove header/content divider (October 16)

Disabled Chromium's top-container and multi-content separators when the Island
is present. The native header/content dividing line is gone in the rebuilt
running window, verified by inspecting its [screenshot](evidence/island-no-divider.png).
Native traffic lights retain their 20px inset; Cmd+L opens and focuses the
Island. The focused incremental build passed in 32.06 seconds (6 actions),
and the repository/prototype lint check passed with zero errors or warnings.


## Build cache safeguards — October 16, 2026

Owner requested prevention of avoidable cold builds after the Xcode build changed
from 27A266a to 27A9275. Added `build.mjs`: recorded Xcode/SDK/Clang/args identity,
Siso dry-run plan, 1,000-action stop threshold, fail-closed unknown plans and
pending GN regeneration, and active-builder/directory-lock protection. Records
are kept in the existing output directory. No cleaning or build-mode change.
The configured environment was recorded for the current Xcode; that record is
not a successful-build claim. The current compile was left running.

`prepare.mjs --assets-only` skips all native edits. Preparation now writes only
changed assets, and the ESLint BUILD.gn transformation no longer removes and
re-adds its definitions in separate writes. Two instrumented preparations found
zero writes against the current source/assets. Guard tests: 7 passed; lint:
280 files, zero errors/warnings. Actual guard invocations rejected a competing
build and a changed fixture build configuration. A separate Siso dry-run fixture
verified the action-count format without compiling anything. After the full build finished, the real Chromium wrapper dry run passed with
zero actions; both seven-step runtime fixes also passed through the wrapper.
Evidence: `evidence/build-cache-guards.json`.


## Blanc start-page native integration — October 16, 2026 (completed)

The actual `chrome://newtab/` rewrite now serves the bundled Blanc page. Direct
page loading initially worked, but reloading the rewritten URL exposed that
WebContents::GetLastCommittedURL returns the virtual URL. The bridge now checks
the primary main frame's actual committed URL, retaining the exact page check.
Added the missing `close.svg` to copied resources and the native allowlist.

Automated checks on the corrected binary passed: native bookmarks and TopSites,
a temporary bookmark rendered in Ledger/Shelf/Tally and navigated to its URL,
all four layout selections, hidden unavailable statistics, Customize popover,
preferences propagated to a second page and survived reload and full process
exit/relaunch. The active start page can request Island typing; an inactive page
is rejected. No resource/console errors or broken images were observed on reload.
Six installed extensions were enabled on the corrected binary. This checks their
installed state; a subsequent physical Bitwarden toolbar click opened its real
popup on the corrected binary, with its default-password-manager prompt rendered.
No account login or default-password-manager setting was changed.

After unlocking, native CGEvent keyboard and mouse checks passed:

- Cmd+T and the Island + each added exactly one Blanc new tab and focused an empty address field.
- Clicking the page and typing `e` focused the Island with exactly `e`; adding `xample.com` and pressing Return navigated to `https://example.com/`.
- Physical Customize clicks selected Ledger, Shelf, Tally and Billboard. Dynamic wallpaper rendered the day scene while visible; it had correctly paused while the Mac was locked.
- Actual window/content widths matched 500, 600 and 1200 pixels. All four layouts were exercised at 500 and 600; document width did not overflow and Customize remained within the viewport. A physical corner drag changed the window from 600×700 to 695×747.
- Native traffic lights remained 20 logical pixels from the top/left. Screenshots show no native header divider. The Island is dense at 500px: its label truncates and the close control sits at the pill edge, within the window.
- Bitwarden's native toolbar popup rendered after a physical click. This smoke regression complements, rather than repeats, the earlier six-extension compatibility checks.

The earlier locked resize attempt in `newtab-automated-controls-results.json` is
historical; the actual visible sizes are in `newtab-physical-results.json`.
Screenshots include `newtab-final.png`, `newtab-native-1200.png`,
`newtab-native-500-resize.png`, the three other layouts at 500px, and
`newtab-bitwarden-popup.png`. Native screenshots were captured directly from
the running window; the popup image is its live DevTools capture.

Remaining prototype limitations: native bookmarks are read-only through this
bridge and managed via the Favorites heading/bookmark manager; the copied empty
state still mentions the Electron heart control. Electron-only services remain
hidden, and authenticated extension workflows and production migration remain
outside this proof.

The pre-restart live profile contained one New Tab, so that current session was
preserved. All temporary test windows/tabs and only the probe bookmark were
removed. Original start-page preferences were restored, and the prototype was
left open on the Blanc page. The temporary preview server was stopped. Evidence
is in `evidence/newtab-*.json` and the native screenshots listed above.


## Expanded Island extensions view — October 16, 2026

Implemented selected option 2 in the actual Chromium prototype. The native
Extensions button opens a searchable six-action list within the expanded Island.
Resting windows show one button regardless of pin preferences. Genuine native
actions, popups, permission handling and active-tab grants remain Chromium-owned.
No shipping Electron source changed.

Validation used the permanent isolated profile at
`~/Library/Application Support/Blanc Chromium Prototype`. All six extensions
were installed through the live Web Store before this UI change and had survived
a browser restart. This round checked their logged-out action/startup surfaces:

| Extension | Native action result |
|---|---|
| Bitwarden | Genuine popup, default-password-manager prompt; no setting changed |
| 1Password | Existing native welcome tab activated |
| React Developer Tools | Genuine restricted-browser-page popup on New Tab |
| Tampermonkey | Genuine action popup, restricted-page and Allow User Scripts notices |
| Grammarly | Genuine logged-out popup |
| MetaMask | Genuine wallet onboarding interface; no account or wallet created |

Physical CGEvent mouse/keyboard checks passed: native Extensions button, typing,
case-insensitive search, no matches, Cmd+A replacement, reopening with an empty
query, arrows, Enter, Escape, back to the address/tab panel, and pointer selection
of Bitwarden. Cmd+L and Cmd+T still focused `addressInput`; Cmd+T added one tab.
Manage and Get opened the real extension manager and live Web Store.

The native action bridge rejected requests without transient user activation,
with a stale active-tab ID, and for an absent extension ID. All six native pin
preferences were temporarily enabled: the Island slot remained 36px. Original
pin preferences were restored. Temporarily disabling React removed its row on
the next refresh; restoring it returned the six-row list.

At 600×420 the panel fits within the window, its list scrolls, and its footer
remains visible. Final polish hides the underlying resting pill during expansion,
uses Instrument Sans for Blanc UI and Inter for key caps, and leaves the actual
page visible around the panel. See `design-qa.md` and `evidence/extensions-*.png`.

Builds were incremental: the main change completed 16 actions in 60.08s and the
transparency/icon refinement completed 7 in 36.36s. Subsequent UI polish used
assets-only preparation. The final guarded dry run reported zero actions; no
cold build or toolchain change was required. JavaScript syntax and targeted
ESLint checks passed. The existing seven build-guard tests passed. Full repository
`npm run lint` could not run because this checkout lacks its local ESLint
dependency; targeted checks used the existing Chromium devtools ESLint runtime.

Harness corrections: allow tab-switch layout to settle before clicking measured
native controls; clear inherited modifier flags on synthesized Unicode events;
wait for MetaMask's transient popup to become its onboarding tab. Failed harness
attempts were repeated using real input and settled targets. They are not counted
as passes. No authenticated password filling, wallet signing, or userscript
execution is claimed by this UI smoke test.

Evidence: `evidence/extensions-controls.json`, final/narrow/resting native
screenshots, and the design QA report. Temporary tabs/windows were removed,
original profile tabs and pin settings retained, and the prototype left open.


### Resting Extensions icon size correction

The owner noted the native Extensions glyph looked larger than its neighbors.
Chromium's standard glyph is 20 logical pixels; the Island navigation/action
SVG boxes render at approximately 16.09 (14px × 1.15 zoom). The prototype's
`ExtensionsToolbarButton::GetIconSize()` now returns 16 only in Island windows.
The 36px native slot, hit target, native state artwork and popup anchor remain
intact; other Chromium windows retain the upstream size.

The guarded incremental build succeeded in 33.32s with six steps. After relaunch,
the two existing tabs were restored. Physical clicks opened the six-row picker,
and selecting Bitwarden opened its genuine popup. Before/after native crops were
compared at the same size; the glyph now matches the adjacent control scale.
Evidence: `evidence/extensions-icon-{before,after}.png` and
`evidence/extensions-icon-verification.json`. The prototype was left open.


### Extensions placement refinement

Moved the native Extensions slot into `pillActions`, alongside Reload and Close,
in the generated prototype document. It now uses the action group's 1px CSS gap
instead of the outer Island's 6px gap: measured separation is 1.15 logical pixels
instead of 6.90 after Island zoom. The native 36px hit slot and 16px glyph remain
intact. Assets-only preparation and host reload applied this without compilation.
A physical click opened all six picker entries; Bitwarden's real popup opened
from the repositioned anchor, then closed normally. No bridge error was reported.
See `evidence/extensions-spacing-{before,after}.png` and
`evidence/extensions-spacing-verification.json`.


### Consistent action hover and spacing

The owner identified different hover sizes/colors and unequal icon spacing.
The native Extensions preferred size and measured slot are now 26×26 logical
pixels, matching Reload and Close. Both horizontal gaps measured 1.1484375
logical pixels after Island zoom; this supersedes the earlier 36px slot.
Native Extensions uses a 13px-radius circular highlight and the same foreground
and hover colors as Blanc's controls. The prototype overrides Close's solid
hover fill so all three match. Other Chromium windows retain upstream styling.

Light: normal ink #6b6b6b, hovered ink #111111, highlight rgba(17,17,17,.08).
Dark: normal ink #9c9c9c, hovered ink #f5f5f5, highlight rgba(245,245,245,.12).
These native constants mirror the prototype's existing Island theme tokens.

Live native mouse hover screenshots were compared for each control in both
themes. Dark mode used the temporary --force-dark-mode process flag; the final
process was relaunched without it. No system appearance setting was changed.
Physical clicks opened the six-row picker and Bitwarden popup in both themes.
On a disposable new tab, Reload replaced a page-context probe and Close removed
only that tab. Original tabs were preserved. Bridge status remained clear.

The first native compile exposed an obsolete theme API name; it was corrected
to the current preferred_color_scheme accessor. The hover build then completed
11 steps in 44.13s. The equal-footprint refinement completed 8 steps in 38.35s,
using the existing incremental cache. Evidence is in `evidence/controls-hover-*`.


### Dynamic page-matched header

Ported Electron's faux-header behavior into the isolated Chromium prototype.
The native owner samples the active visible page's top two rows, counts every
fourth pixel and sends only the dominant color to the trusted Island host.
Samples are converted from the captured display color space to sRGB before
being used as CSS colors. The same color drives the resting strip and a separate
68px backdrop, including when the strip hides for the Extensions panel.
The host below that band remains transparent. No website scripts or bridge
capabilities are injected, and captured bitmaps are neither persisted nor sent
to the renderer. As in Electron, complex top-edge imagery is represented by a
single dominant color, not a duplicated image or gradient.

The initial implementation excluded extension pages and used a slower fallback
for changes that did not trigger WebContents interaction notifications. The
owner identified the missing dynamic behavior during implementation. The final
version includes full extension tabs, observes native wheel/gesture input and
native tab selection, samples at 80ms during change/input bursts, and uses a
250ms idle check for DOM/CSS changes without page-script injection. Navigation,
visibility, renderer destruction, tab switches and window teardown invalidate
pending capture results. Only one capture is in flight per window; hidden,
minimized, loading and private pages are not sampled. Chrome utility pages
retain the theme fallback; private windows keep #0a0a0a.

Runtime verification on the final native build:

- Solid cream and navy pages matched their CSS colors despite conflicting red
  theme-color metadata. Native screenshot pixels above/below the seam match
  exactly after display color management, also on a scrolled page and MetaMask.
- Chromium mouse-wheel input moved the page to its navy section; the header
  settled in 165ms. An idle DOM background change settled in 169ms. A 1.2s
  background transition produced 14 distinct sampled header colors.
- A tab switch settled in 180ms; rapid alternating tabs ended on the correct
  final color in 83ms. Rapid navigation, an internal-page reset, and closing a
  page with a capture pending did not leave the previous page's tint behind.
- New-tab wallpaper enable/disable fades were followed continuously. Original
  preferences were restored byte-for-byte. The 720×600 window and the NTP
  type-to-open bridge passed; the original window dimensions were restored.
- Expanded Extensions retained all six entries, transparent surroundings and
  a 68px backdrop. Native button/search/Enter opened the real Bitwarden popup.
- Native Cmd-Shift-N opened a temporary private window. Both its resting strip
  and expanded Extensions backdrop stayed #0a0a0a; the window was then closed.

Scrolling/animation/typing checks used CDP input and page evaluation. The separate
CGEvent wheel helper did not scroll the fixture and is not counted as a physical
scroll pass. Native extension click/keyboard and private-window keyboard checks
were run with the existing working native-input helper. The early screenshot
helper selected a tooltip window; final evidence uses the largest actual app
window and was visually inspected.

All temporary test tabs were closed. Only exact localhost fixture visits were
removed through Chromium's history API; a native TopSites query confirmed they
were gone. The original New Tab and MetaMask welcome tabs remain open, with the
New Tab active. Evidence: `evidence/header-*.png` and `header-*.json`.

The final guarded incremental build completed 7 steps in 35.18s; follow-up
preflight reported zero pending actions. No output/cache/toolchain reset.
Targeted host/extensions ESLint, Node syntax checking and git diff checks passed.
Full repository ESLint remains unavailable in this checkout without node_modules.


## Sunrise Dark Dock icon — October 16, 2026

Passed on the running prototype: the actual macOS Dock tile displays the gold
Sunrise mark on its dark tile, captured in `evidence/dock-sunrise-dark.png`.
The resolved native artwork is saved alongside it. Both original tabs restored;
all six extension actions remain available, and native click/search/Enter opened
the real Bitwarden popup. The completed prototype remains open on New Tab.

`mac-icon.mjs` derives the Dark colorway from the shipping Icon Composer document
and `sunrise-dark` definition. It preserves the Sunrise layer and compiles the
adaptive catalog plus `.icns` fallback with the installed Xcode. A content/tool
fingerprint caches compilation; copying preserves unchanged timestamps. Normal
prepare/build includes the icon. Prototype startup refreshes the application
icon from its bundle, which was necessary to replace macOS's stale Chromium
Dock tile. Chromium's download badge drawing is unchanged.

The first resource build took 13 steps / 6.57s. During cache diagnosis, changing
the icon catalog name to a longer string changed Chromium's plist-size buildflag.
Siso's five-action dry run did not expose the generated dependents. That build
was stopped after 31 seconds / 229 completed steps; caches were preserved. The
final `BlancDK` name retains the original `AppIcon` byte length. The original
buildflag was regenerated alone, followed by a successful 401-step / 86.51s
incremental recovery. The final launch-refresh change took 7 steps / 33.48s.
No output cleanup, toolchain change or cold build occurred. A new regression
check stops pending buildflag generation before ordinary compilation; the CLI
also clarifies that a dry-run count is not a hard upper bound.

Repeated preparation reused the compiled icon, and final guarded preflight
reported zero actions. Bundle resources match the compiled cache byte-for-byte.
Eight build-guard tests, targeted ESLint, Node syntax and diff checks passed.
Evidence: `evidence/dock-sunrise-dark-verification.json`.


## Favorites, history and Island search — October 16, 2026 (built on the Mac at `06b3094`; automated bridge checks passed, native-input checklist pending)

Target flow: save a page from the Island → see it on Blanc's start page → find
it through Island search → verify persistence after restart. The bridge now
backs Blanc's existing Favorites and history UI with Chromium's `BookmarkModel`
and `HistoryService`; no shipping Electron source changed, and the start page,
pill and overlay are still the copied Electron documents.

What changed (`native/blanc_prototype_ui.cc`, `prototype/host.js`,
`prototype/newtab-adapter.js`, `prototype/prototype.css`, the slash allowlist
in `prepare.mjs`):

- Tab snapshots carry `bookmarked` (committed main-frame URL, loaded model,
  http(s) only) and `favicon` (the committed `NavigationEntry` favicon as a PNG
  data URL, re-encoded only when the image changes, never for private windows).
- `toggleBookmark` / `saveFavorite` validate the tab ID and re-read the
  committed URL natively. Off removes every user bookmark with that exact URL
  and leaves folders in place; `/save <folder>` finds or creates a folder
  directly under Other bookmarks (case-insensitive match, 1–100 characters
  after trimming, like Electron) and moves an existing entry into it.
- `listFavorites` walks the bookmark tree (bar, other, mobile; capped at
  1,000) into contract-shaped `FavoriteItem`s with Chromium's cached bookmark
  favicons; `listHistory` queries up to 300 deduplicated entries with
  `favicon: null` (letter fallback). Both reply empty in private windows, and
  the history service is never resolved through an off-the-record profile.
- `/favorites` and `/history` open `chrome://bookmarks/` and `chrome://history/`
  in a tab. `/clear` stays out of the allowlist.
- The start page's handler observes the bookmark model and tells an open page
  to re-list Favorites; the adapter coalesces bursts and re-renders the current
  layout. The pill heart, panel heart and the Favorites/History footer buttons
  are no longer hidden.

Checks run in the Linux session (no Chromium checkout or Mac here): Node syntax
checks for every prototype script, the eight build-guard tests, and ESLint
recommended rules over the prototype JavaScript (repository-pinned ESLint
10.12.0, @eslint/js 10.0.1, globals 17.13.0 in a temporary directory). The
native source has not been compiled.

Mac pass (Codex, second attempt, on `06b3094`; recorded in the PR review of
October 16): the guarded incremental build completed 7 steps in 35.94 seconds
and a repeated preparation plus guarded dry run reported zero actions; no
cache, toolchain or build-mode change. The runtime checks were **automated
bridge and DOM checks driven through DevTools** on the permanent profile with
localhost fixtures, not native mouse or keyboard input; the one native shortcut
exercised was ⌘⇧N. They established: the host's `toggleBookmark` saved a fixture
into Chromium's model and removed it again; `saveFavorite('Codex PR 858')`
saved a second fixture into that named folder; the already open start page
acquired the Favorite without reloading and its Ledger, Shelf and Tally
renderers produced the link (Billboard shows recent sites by design); history
returned the localhost visit; the Quick Switcher showed one Favorite row with
its letter fallback and no duplicate history row for that URL (an open-tab row
for the same page still appeared, as designed); `openPage` opened Chromium's
bookmarks and history managers; Favorites, the folder assignment and history
survived a full quit and relaunch; in a private window on a real http fixture
the snapshot reported `private: true` and `bookmarked: false`, both hearts were
hidden, `toggleBookmark` was silent with no banner, and Favorites and history
listed empty; the extension picker listed all six installed extensions, with
their six service-worker targets present after relaunch. Only the test
bookmarks, the empty test folder, the exact fixture history entries and the
temporary tabs and windows were removed; the prototype was left open on its
original start page.

That initial pass did not establish native input behavior. The later Mac pass
on `3d9fcd3c` completed those checks: native clicks on both hearts; native typing
and Enter for `/save`, `/favorites` and `/history`; Favorites/History footer
clicks; Quick Switcher Favorite/history Enter navigation; case-insensitive
folder reuse, bare-save deduplication, moving an existing bookmark and rejection
of a 101-character folder name. A fresh-origin page saved with native Cmd-D
before its delayed favicon arrived subsequently acquired the cached PNG icon.
Ledger, Shelf and Tally were each selected with native mouse input and verified
while visible: insertion/removal through Chromium's bookmark API refreshed the
rendered list without reload. Those observer mutations were API-driven, not
native input. Native clicking on a rendered Favorite also navigated correctly.
Bookmark IDs, folders, history and favicon data survived a full restart; the
favicon assertion waited for asynchronous cache loading. Start-page/private
HTTP Cmd-D no-ops, hidden private hearts, and precise fixture cleanup passed.
Authenticated extension workflows were not repeated.

The focus failures discovered in that pass were fixed and natively retested at
`a50eb2a`, as described below. Evidence is now committed:
[initial bridge results](evidence/favorites-bridge-results.json),
[initial final window](evidence/favorites-bridge-final.png),
[broader native results](evidence/favorites-native-results.md) and
[focus retest](evidence/favorites-focus-results.md), with the chronological
[native run](evidence/favorites-native-run.json) and
[focus run](evidence/favorites-focus-run.json). The run records retain failed
harness attempts and their corrected retests; the reports distinguish these
from product findings. No broader native-input checklist item above remains
pending within this tested scope.

First Mac build attempt on `89d7637` (Codex): the guarded build failed after
8.77 s with three compile errors, caches and the running prototype preserved.
Fixed in the follow-up commit: `GetMostRecentlyAddedUserNodeForURL` is a
`BookmarkModel` member in this pin, not a `bookmark_utils` free function;
`NavigationEntry::GetFavicon()` is non-const, so the entry pointer is
non-const; `history::QueryOptions` names the field `duplicate_policy`. The
same review found that the copied hearts enable on any http(s) page without
checking `private`, so a click in an incognito window reached the native
guard and surfaced its error banner; the host now treats a private tab as a
silent no-op and hides both hearts under the private theme, with the native
guard kept as defense in depth. The retest above used a real http(s) page in a
private window, not its start page.


## ⌘D toggles the Island Favorite — October 16, 2026 (built and natively retested on the Mac at `a50eb2a`)

Chromium's `IDC_BOOKMARK_THIS_TAB` (⌘D) opened the native star bubble, which
has no toolbar to anchor to in an Island window. `prepare.mjs` now inserts a
call to `blanc_prototype::ToggleFavoriteFromIsland(browser)` at the start of
the shared `BookmarkCurrentTab` command function (it accepts either the
`BrowserWindowInterface*` or `Browser*` signature, failing closed if neither
is found exactly once). In Island windows the function toggles the Favorite
under the same rules as the heart (committed http(s) page, loaded model, no
private windows; otherwise a no-op like Electron), then asks the Island host to
refresh so the heart repaints immediately. Other windows keep Chromium's
bubble. ⌘⇧D (bookmark all tabs) is untouched.

Checks run in the Linux session: Node syntax checks, the eight build-guard
tests and ESLint recommended rules over the prototype JavaScript; the native
source is not compiled in that environment. The Mac passes below ran
`prepare.mjs`, the guarded check and build, then verified native Cmd-D on/off
without a bubble, start-page/private HTTP no-ops, and preservation of the
baseline tabs. A non-Island popup did not show a bookmark bubble: pinned
Chromium's `CanBookmarkCurrentTab()` restricts that command to `TYPE_NORMAL`.
The popup therefore cannot establish ordinary-window bubble preservation;
no such bubble pass is claimed.

Mac result on the ⌘D head (Codex): the guarded build passed in 58 seconds with
no cold rebuild; restart persistence and the other tested controls passed; test
data was cleaned up and the prototype left on the original tab. Two shortcut
failures remained: ⌘D while the Island had focus, and ⌘L after closing the
Island with Escape until the page was clicked. Both share one cause. The
Island's WebContents is created by `views::WebView`, which gives it no handler
for keyboard events its renderer leaves unhandled, so non-reserved key
equivalents (⌘D, ⌘L, ⌘R, …) died whenever the Island was the first responder;
reserved commands (⌘T, ⌘W) are dispatched before the first responder and kept
working, and the host's Escape path parked focus in the hidden overlay, which
is why ⌘L stayed dead until a page click. The follow-up commit sets a
process-wide `content::WebContentsDelegate` on the Island WebContents whose
`HandleKeyboardEvent` redispatches through `views::UnhandledKeyboardEventHandler`
with the Island view's FocusManager (the pattern BrowserView and Chromium's
side-panel WebUI views use), and the host's close path now asks the bridge to
focus the page (`focusPage`), matching Electron's hideOverlay; extension
activation keeps passing `focus = false` so the native popup takes focus.

Mac result on `a50eb2a` (Codex): the guarded build passed in 37 seconds with
no cold rebuild, and every native retest passed: ⌘D toggles the Favorite with
the Island's address input focused; Escape then ⌘L reopens the Island without
clicking the page; ⌘R and ⌘[ work from the open panel; Escape restores typing
to the page; Bitwarden's popup retains keyboard focus after selection from the
Extensions view. Fixtures were cleaned up, the original tab preserved and the
prototype left open. The exact build took 36.54 seconds (7 steps), and the
final guard scheduled zero actions. See the committed
[focus report](evidence/favorites-focus-results.md) and
[run record](evidence/favorites-focus-run.json).
