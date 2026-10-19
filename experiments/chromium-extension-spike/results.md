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


## Pin, mute and reorder through the Island — October 16, 2026 (built and natively retested on the Mac at `35f43c6`)

The copied Island's row pin and mute controls, `/pin`, `/mute`, drag-to-reorder
in the ⌘L panel (`tab-drag.js`) and its ⌥⇧↑/↓ keyboard move are now backed by
Chromium's `TabStripModel`. Tab snapshots carry `muted` (`IsAudioMuted`) and
`audible` (`IsCurrentlyAudible`) beside the existing `pinned`, so the rows'
mute control and badge draw from the same fields Electron sends.

- `togglePinned` → `SetTabPinned(index, !pinned)`; Chromium moves the tab to
  the pinned boundary, and the reply re-reads the state at its new index.
- `toggleMuted` → `WebContents::SetAudioMuted(!muted)`, the per-tab mute
  Electron uses (not Chromium's site-level content-setting mute, so
  Chromium's own "Unmute site" entry will not describe it).
- `moveTab [id, beforeId | null]` mirrors Electron's `resolveTabMove`: the
  pinned state never changes, a tab lands only inside its own bucket (pinned
  or unpinned), a before-tab from the other bucket or an unknown id is
  rejected with `false`, and `null` means the end of the bucket; the host
  rejects any intent naming a tab group, since the prototype has none.
  `reorderGroup` resolves `false`.
- `prototype.css` no longer hides `.row-pin` and `.row-mute`; `.row-glance`
  stays hidden. The slash allowlist adds `/pin` and `/mute`.

Checks run in the Linux session: Node syntax checks, the eight build-guard
tests and ESLint recommended rules over the prototype JavaScript. The native
source is not compiled here. Mac checklist: `prepare.mjs` → `build.mjs --check`
→ `--build`; then with native input on fixture tabs: the row pin moves a tab to
the pinned leading section and back; `/pin` and `/mute` act on the active tab;
a playing fixture shows the row mute control and badge, and muting silences it
(`chrome://media-internals` or the fixture's own state as the oracle); dragging
a row reorders it within the loose section, a pinned row within the pinned
section, and a drop across the boundary is refused; ⌥⇧↑/↓ moves the focused
row; Chromium's own order (visible after showing a normal window's tab strip is
not possible here, so use the snapshot or `chrome://tabs`-equivalent DevTools
readback) matches the Island; the original tabs are preserved. Do not record
any of this as passed from this section.

Mac result on `3b6b418` (Codex): the guarded build passed in 36 seconds with no
cold rebuild; native pin/unpin, mute/unmute and restart persistence passed.
Drag and keyboard reorder failed: the copied renderers round-trip tab ids
through DOM datasets (`row.dataset.tabId`, drag intents, `keyboardTabMove`),
so the ids reached the host as strings while the snapshot and the native
handlers used integers, and neither the source nor the destination resolved.
The follow-up commit makes the host present the contract's opaque string
`TabId`: every snapshot id and `activeTabId` becomes a string on receipt, and
every bridge call that names a tab (`switchTab`, `closeTab`, navigation,
`toggleBookmark`, `saveFavorite`, `togglePinned`, `toggleMuted`, `moveTab`
source and before-id) converts back through `nativeId()`; `pageTint`
compares the native id as a string. Assets-only change, no rebuild. Retest:
drag within the loose and pinned sections, a refused cross-boundary drop,
⌥⇧↑/↓, and the untouched controls (row click, close, heart, ⌘D) still work.

Mac result on `35f43c6` (Codex): assets-only update, no rebuild. Native drag
within the loose and pinned sections, keyboard reorder, the refused
cross-boundary drop and the control regressions (row click, close, heart, ⌘D)
all passed, completing the checklist after the pin, mute and restart passes on
`3b6b418`. Fixtures were cleaned up and the permanent profile preserved.
Evidence: committed [Mac acceptance report](evidence/tab-controls-results.md),
[initial native run](evidence/tab-controls-native-run.json), and
[fixed-assets retest](evidence/tab-controls-retest-run.json). The report links
the native build log and screenshots and distinguishes bridge-driven setup
from native-input acceptance.


## `/clear` on a disposable profile — October 16, 2026 (built and verified on a disposable profile at `742cfb4`)

`/clear` is back in the slash allowlist and backed by a `clearHistory` bridge
method. It mirrors Electron's history-only `/clear`: the handler calls
`HistoryService::ExpireHistoryBetween({}, std::nullopt, base::Time(),
base::Time::Max(), user_initiated = true, …)` with the handler's `CancelableTaskTracker`, and
replies only after the deletion callback, through the same guarded `Reply`.
It does not run Chromium's wider Clear browsing data (cookies, cache,
downloads and site data are untouched), so TopSites and the start page's
recent sites update through the history-deletion observers. A private window
gets "Clear history from a regular window." and the history service is never
resolved through an off-the-record profile. Favorites are not affected.

Checks run in the Linux session: Node syntax checks, the eight build-guard
tests and ESLint recommended rules over the prototype JavaScript; the native
source is not compiled here.

Mac protocol (Codex): `prepare.mjs` → `build.mjs --check` → `--build`. Then
**only on a disposable profile** — launch a second instance with a fresh
`--user-data-dir` under `/private/tmp`, never
`~/Library/Application Support/Blanc Chromium Prototype`: visit two localhost
fixtures and save one as a Favorite; ⌘L shows both in history and one as a
Favorite; type `/clear` and press Return; ⌘L shows no history rows, the
Favorite row remains, `chrome://history/` is empty, and the start page's
recent sites are gone; `⌘⇧N`, `/clear` in the private window shows the refusal
notice and leaves the regular profile's state unchanged (verify by reopening
⌘L in the regular window after visiting one more fixture); quit, relaunch the
disposable profile and confirm the cleared history stays cleared. Delete the
disposable `--user-data-dir` afterwards. Do not run `/clear` in the permanent
profile; do not record any row as passed from this section.

First Mac attempt (Codex): compilation failed after 9 seconds because this
pin's `HistoryService::ExpireHistoryBetween` takes a `restrict_app_id`
(`std::optional<std::string>`) as its second argument; the call now passes
`std::nullopt`. Source review also found no refresh path for recent sites on
an already open start page. The start-page handler now also observes
`history::TopSites` (holding its `scoped_refptr` while observing) and sends
`blancNewTabEvent('topSites')` on `TopSitesChanged`; the adapter re-fetches
the native list, replaces `state.topSites` and re-renders the current layout,
coalesced per kind like the bookmarks refresh. TopSites re-queries after
history deletions, so `/clear` and Chromium's own history manager both reach
an open page. `/clear` was not run; no cold rebuild. The disposable-profile
protocol above still applies in full.

Mac result on `742cfb4` (Codex): the guarded build passed in 35 seconds with
no cold rebuild and the final check reported zero pending work. On a
disposable `--user-data-dir`: `/clear` emptied history, the already open start
page dropped its recent sites live, the Favorite and other profile data were
preserved, the private-window attempt was refused, and the cleared state
survived a relaunch. The disposable profile was deleted afterwards and the
permanent profile was never touched by `/clear`. Evidence: committed [Mac acceptance report](evidence/clear-history-results.md),
[disposable-profile run](evidence/clear-history-run.json),
[guarded build log](evidence/clear-history-build.log), and
[Billboard after deletion](evidence/clear-history-billboard-cleared.png).


## Named tab groups through the Island — October 16, 2026 (built and natively verified on the Mac at `fd12eb2`)

Blanc's named groups now run on Chromium's `TabStripModel` tab groups. The
snapshot fills `groupId` on each tab (`TabGroupId::ToString()`) and lists
`groups` as Blanc's `{id, name, collapsed}` in cluster order (first tab
index), so the copied panel's group headers, the pill's active-group dots and
the Quick Switcher's group results work unchanged.

- `groupTabByName` mirrors Electron: the name is trimmed, lowercased and
  capped at 40 characters; an existing group with that title is reused, else
  `AddToNewGroup` plus `ChangeTabGroupVisuals` sets the title with a fixed grey
  colour that the Island never shows. `setTabGroup` moves a tab into a group
  (`AddToExistingGroup`) or out (`RemoveFromGroup`); a group id that no longer
  exists is a no-op, never an ungroup.
- `focusGroup` unfolds the group and activates its first tab;
  `toggleGroupCollapsed` flips only the model's collapsed flag (panel state,
  as in Electron), not Chromium's tab-strip collapse handler;
  `closeGroup` calls `CloseAllTabsInGroup`, adding a fresh new tab first when
  the group is the whole window, as `closeTab` does.
- `reorderGroup` follows Electron's `resolveGroupReorder`: before another
  group (`MoveGroupTo` its first index) or to the end with `null`.
- `moveTab [id, groupId | null, beforeId | null]` follows Electron's
  `resolveTabMove` across sections: the pinned state never changes, the
  before-tab must be in the target bucket (pins, that group, or loose), and a
  stale group or foreign tab is rejected. Membership changes first, position
  second, and the final bucket is re-asserted and reported, because Chromium
  keeps groups contiguous and may adjust membership at a group edge.
- `/group`, `/ungroup` and `/close-group` join the slash allowlist.

Divergences to record if confirmed: Chromium has no grouped pins, so
`/group` on a pinned tab unpins it (Chromium's own rule) and a drag of a pin
into a group is refused; Electron keeps group-local pins. ⌘1–9 keep
Chromium's nth-tab meaning rather than Electron's nth-cluster meaning. The
tab context menu's Move to Group submenu (an Electron native menu) is not
reproduced. Chromium 156 may also save groups through its Tab Groups
service; the prototype does not expose saved groups.

Checks run in the Linux session: Node syntax checks, the eight build-guard
tests and ESLint recommended rules over the prototype JavaScript. The native
source is not compiled here. Chromium 156 calls to confirm: `TabStripModel::
SupportsTabGroups`, `GetTabGroupForTab`, `AddToNewGroup`, `AddToExistingGroup`,
`RemoveFromGroup`, `ChangeTabGroupVisuals`, `MoveGroupTo`,
`CloseAllTabsInGroup`, `group_model()->GetTabGroup()->ListTabs()` /
`visual_data()`, `TabGroupVisualData(title, color, collapsed)`, and the GN
dependency on `//components/tab_groups`.

Mac checklist: `prepare.mjs` → `build.mjs --check` → `--build`; then with
native input on fixture tabs: `/group work` on two tabs creates one group whose
header reads `work`; `/group Work` on a third joins it; the pill shows only
the active group's dots; the header folds and unfolds; a Quick Switcher
search for `wor` ranks the group above its tabs and Enter focuses it, unfolding
it; drag a loose row into the group and a grouped row back out; drag the group
header above another group (and ⌥⇧↑/↓ on a header); `/ungroup` removes the
active tab and an emptied group disappears; `/close-group` closes the group's
tabs, including the whole-window case; `/group` on a pinned tab (record the
unpin) and a refused pin-into-group drag; folding the active tab's group does
not change the active tab; quit and relaunch to see whether Chromium restores
groups; no saved-group bubble or crash with the tab strip hidden. Original tabs
preserved; remove only fixture tabs and groups. Do not record any of this as
passed from this section.

First Mac attempt on `b7ef09e` (Codex): compilation failed after 5 seconds on
two headers this pin no longer has: `base/containers/contains.h` (the one
`base::Contains` use is now `std::find`) and `chrome/browser/ui/tabs/tab_group.h`
(now `components/tabs/public/tab_group.h`). Codex confirmed that
`CloseAllTabsInGroup` exists in this pin. No cold rebuild; native testing is
still pending, and the checklist above still applies.

Mac result on `fd12eb2` (Codex): the guarded build passed in 36.84 seconds
with no cold rebuild, and a repeated preparation and check reported zero
actions; `tab_group_model.h` and the existing GN dependencies compiled as
written. Native group tests passed: creation and reuse by name, folding,
Quick Switcher search, drag and keyboard reorder, ungrouping, closing groups
including the whole-window case, and persistence across relaunch. The
documented divergences were confirmed: grouping a pinned tab unpins it, and
⌘1–9 keep Chromium's nth-tab meaning.

The relaunch exposed a startup race that predates this milestone: the overlay
frame could load before `host.js` had defined `window.BlancPrototypeHost`, so
its adapter read an undefined bridge (reloading the overlay recovered). The
follow-up commit gives both host frames `data-src` instead of `src` and starts
them right after the host object is assigned; Codex tested that exact change
across three relaunches with native clicks, typing, Escape and ⌘L. It is an
assets-only change. Fixtures were cleaned up and the original tab and
Favorites preserved. Evidence: Codex's run record
(`/private/tmp/blanc-pr867-mac-results.md` on the Mac), to be committed under
`evidence/tab-groups-*`.


### Tab-groups Mac evidence packaged

The committed [Mac acceptance report](evidence/tab-groups-results.md) links the
36.84-second native build log, chronological native checks, group/reorder
screenshots, clean final window and exact locally tested startup patch.
The patch in `0759e7f` matches the tested fix (HTML identical; JavaScript differs
only in comments/whitespace), with unchanged native source. Assets-only
preparation succeeded; no new native build or repeated group acceptance run
was needed. The report preserves the original restart failure, the overlay-only
reload used to finish group checks, and the three successful relaunches with
the fix. It also records Chromium retaining closed saved groups and the targeted
cleanup of those fixture records.

## Chromium 157 Task 0 — unlocked native acceptance (October 17, 2026)

The sibling 157 build passes the native keyboard/mouse, tab/group, Favorites,
private-window, visible start-page, header/window/Dock and normal Web Store
install/popup/persistence checks in the [native acceptance report](evidence/rebase-157-native-20261017/results.md).
A first-loose-tab drag gap with an empty pinned section was fixed in prototype
assets and retested without a native rebuild (14 focused/guard tests pass).

Task 0 stays **in progress**: an actual Google-endpoint extension version upgrade
has not been run because the older signed CRX is unavailable. Bitwarden is
already 2026.10.0; a successful no-change update check does not close that gate.
The 156 baseline is preserved, and 157 baseline promotion remains conditional
on complete acceptance. See the [measured ledger](rebase-ledger.md).

The [review follow-up](evidence/rebase-157-native-20261017/electron-followup/results.md)
confirmed the drag gap in installed Electron, so the fix now lives in shared
`src/renderer/tab-drag.js` with three regression cases; the prototype transform
is removed and its generated bytes are unchanged (51 drag/guard tests pass).
The missing 156 disposable profile prevents the proposed profile-forward test.
Google offers no update to any of the six recorded versions in the saved probes;
a daily bounded check through November 3 is active. Task 0 remains in progress.

### Native blocker and paired synthetic subset — October 17, 2026

[Evidence](evidence/f12-native-20261017/README.md): the opt-in native network
factory hook calls pinned Ghostery 2.18.2 in a sandboxed, jitless Mojo utility.
Two fresh regular and two private full runs match Electron on 5,123 distinct
candidate URLs: 2,503 blocked / 2,620 allowed, zero decision or native-context
differences. The 24-candidate no-referrer subset also passes all four runs (9/15).
Cancellation, allowed-response hashes, DOM execution and script-child loads pass.
Missing/tampered assets and an owned utility termination fail closed before the
fixture server sees the denied requests. Raw failures and successful runs are
retained, including the internal-WebUI interception and response-pipe lifetime
bugs found and repaired during native testing.

Five guarded incremental build invocations inspected 12, 6, 4, 2 and 1 actions;
the first two failed compilation and the final three built. Siso wall times:
4.54, 5.64, 44.33, 44.11 and 31.64 s. Wrapper/guard total 153.075 s. One GN
generation used unchanged args; the final plan has zero actions. No new cold
output, clean, environment re-record, toolchain change or large-build override.
Budget 21/55 → 25 files/62 hunks; 151 dependency checkouts clean at their pins.
Invocation records and source/framework hashes are committed with the evidence.
Task 0's cold column and open upgrade gate are unchanged. Owner/agent attention
is not measured; runtime brackets are not attention figures.

55 replay + 15 validator + 10 build-guard + 11 budget tests pass; lint clean.
This is **synthetic fixture parity for the measured subset**, not full F12
acceptance. Redirect runtime coverage, subframes/opaque origins, 782 domain-scoped
candidates, other resource types, broader first-party cases, workers/SW/cache,
keepalive/teardown, speculative paths, WS/WT interception, resource redirects,
CSP/cosmetics/scriptlets, formal latency protocol and private real-page sample
remain gaps. Startup-delay/timeout injection and live recovery UX remain gaps.
Profiles and fixture keys removed; 156/permanent profiles untouched; no promotion.

### Redirect/worker paths and latency protocol — October 17, 2026

[Evidence](evidence/f12-paths-latency-20261017/README.md) retains three path
attempts and three latency attempts, including invalid harness runs. Final
path run: two fresh Electron and Chromium runs in each profile; authored GET
navigation/fetch/script redirects (allow-to-block, blocked predecessor, two-hop)
and dedicated-worker imports/fetches pass. Shared and service worker behavior
matches, including blocked imports and independent fetches, but unresolved
frame identity leaves those cells **gap**, not admitted parity. No context is
filled from referrer or the active tab.

One guarded incremental timing fix measures factory/redirect entry through
application of the decision, including Mojo. Plan: one action; Siso: six steps,
29.98 s; guard/wrapper: 35.065 s. Final check: zero actions. No GN, args, toolchain,
environment-record, cold output or large-build override. Budget remains 25/62.
Missing/tampered assets and utility termination still fail closed.

Full 5,123-candidate corpus, 26 authored page loads with natural concurrency per
page, one discarded full warm-up then five full measured repetitions per
profile. All 24 full repetitions validate decisions, contexts, response hashes
and DOM/child outcomes. Native median p99: **1.484 ms regular / 2.108 ms private**;
every warm measured native repetition is below 5 ms. The recorded quiet-machine
condition failed before every repetition, so **formal latency qualification
remains open**. Electron JS-observer reference excludes its earlier native
entry and is not an equivalent clock. Cold first-200 figures and the private
warm-up's 7.767 ms p99 are preserved separately, never used for the warm bound.

79 focused replay tests pass; lint: 30 files, zero errors/warnings. Disposable
profiles and certificate keys removed. Routine invocation records, fingerprints,
all observations and failures are archived with hashes. Runtime brackets are
not owner/agent attention measurements. Task 0's cold column, upgrade gate and
156 baseline are unchanged. Subframes/opaque origins, worker identity/teardown,
SW updates/fetch events/cache, keepalive/speculation, WS/WT, additional resource
and rule contexts, cosmetics/scriptlets and private real-page sample remain gaps.


### CodeQL remediation and regression — October 17, 2026

[Evidence](evidence/f12-codeql-20261017/README.md) records fixes for seven CodeQL
findings at aa26d71a: preserve query refusal semantics with separate regexes;
replace exists/read/write with descriptor-based reads and atomic publication;
encode embedded JSON literals for script/HTML boundaries; isolate the local
fixture CA in the TLS agent's secure context. No suppressions or query exclusions.
New-head CodeQL is pending, not inferred from local tests.

84 focused tests pass, seven TLS/network tests pass on rerun, and 44-file lint
is clean. VM decision comparison: 12,830 unchanged. Authored response bytes:
5,123 candidates plus four controls and all 37 path fixtures unchanged. Fresh
native full and no-referrer comparisons pass twice per profile with zero decision
or context differences; GET redirects/dedicated workers and fail-closed probes
pass. Shared/service-worker identity remains a gap.

One guarded incremental bundle-hash build: one planned action, six executed
steps, 29.95 s Siso / 34.983 s wrapper; final plan zero. Budget 25 files / 62 hunks;
151 dependencies clean at pins. No GN, args, toolchain, environment-record or
cold-output change. This is routine tranche-2 work, never Task 0 cold time.
Six verified archives preserve 79 original files. No new latency qualification
is claimed; earlier timings belong to aa26d71a. Broader F12 gaps and Task 0's
upgrade gate remain open. Runtime brackets are not owner-attention measurements.


### Worker context investigation and idle-stop attempts — October 17, 2026

[Evidence](evidence/f12-worker-context-20261017/README.md) records a frame-context
lifetime fix: snapshot the actual frame at request entry rather than after the
async decision. Factory kind, frame state and partition/request isolation origins
are diagnostic fields only. Neither partition metadata nor an apparent owner
fills missing context. The audit explains Chromium's intentionally frameless
worker factories and the Electron observer's missing request-to-client identity.
**Shared/service-worker strict context remains GAP**, despite matching block/allow
behavior. Multi-client/no-client lifecycle correlation and teardown remain open;
no acceptance-contract relaxation or Electron rebuild was made.

One guarded incremental build: two planned actions, seven executed steps,
41.38 s Siso / 46.861 s wrapper; zero-action recheck. Budget unchanged at 25 files /
62 hunks; 151 Git dependencies clean at pins. No GN, args, toolchain, environment-record,
cold-output or large-build override. This is routine tranche 2, not Task 0 cold time.
86 focused tests and 44-file lint pass. Full corpus passes twice per regular/private
profile: 5,123 candidates, 2,503 blocked / 2,620 allowed, zero decision/context
changes. All four no-referrer runs pass 24 candidates. GET redirect/dedicated-worker
and fail-closed probes pass; shared/SW unresolved fields remain explicit.

The owner approved temporary Spotlight/updater pauses and restoration. Spotlight
was paused/restored for each attempt; root-owned Logitech updater could not be
signaled and passwordless sudo required authentication, so it was never paused.
The new --require-idle option retains and stops a run before any repetition below
the existing 90% idle gate. Combined-browser attempt: preflight 92.19%, first
Electron baseline 86.11–89.90%, stopped. Chromium-only attempt: preflight 93.78%,
first baseline 71.86–89.78%, stopped. Both produced zero measured repetitions and
cleaned disposable profiles/keys. No new latency result or qualification is
claimed. Earlier aa26d71a busy-machine timings remain historical. An administrator
authentication question is pending; no credential is collected by the harness.

Lossless hashed archives preserve both stopped runs, pause/restoration records,
build/regression logs, observations, audit and fingerprints. Existing 156/profile/
tabs and Task 0's upgrade gate are unchanged. Runtime brackets are not attention
measurements. Broader request coverage, cosmetics/scriptlets and private sanity
sample gaps remain open.


### Explicit worker contexts — October 17, 2026

Owner approval: “Yes—use explicit worker contexts with strict evidence.”
[Evidence](evidence/f12-worker-identity-20261017/README.md) records the contract
branch and independent CDP worker/realm/client observations in both runtimes.
Six service-worker subrequests per profile and variant now compare with observed
empty or single controlled-page sets. Raw unresolved top-frame fields stay raw;
no sidecar client origin changes engine inputs. Shared connected-client lifecycle
and the initial service-worker script remain gaps. No general worker acceptance.

Final paths-06 and controlled-07: eight fresh runs each, stable and valid in both
profiles, no failed cases; 25.791 s and 21.366 s respectively. Earlier probes and
the paths-04 private instability are archived with their limitations. A first-script
observation barrier fixes missing first-import telemetry; it changes scheduling
and is never enabled for latency. Recomparison with the final code is identical.

One guarded incremental build: one planned action, six steps, 30.65 s Siso /
36.441 s wrapper; zero-action check. No GN/args/toolchain/cache/cold-output change.
Budget 25 files / 62 hunks, 151 dependencies clean at pins. Routine tranche-2
cost only, never Task 0 cold time. 104 tests and 47-file lint pass. Full corpus
and fail-closed tests remain the previous 3ca65a11 results, not re-claimed here.
Eight verified archives preserve 129 files, including failed attempts and exact
capture-module snapshots. No private keys or permanent profile data.

Latency remains deferred by the owner; no process pause or password dialog.
Correction to the earlier checkpoint: administrator authentication is no longer
pending. Multi-client/teardown, service-worker fetch-event/cache/update behavior
and other F12 gaps remain open. The 156 baseline and Task 0 upgrade gate remain
unchanged. Attention/agent time is not measured.

### Worker ownership and initial service script — October 17, 2026

[Evidence](evidence/f12-worker-ownership-20261017/README.md). Actual MessagePort
challenges now link shared-worker connections to independently observed page and
worker realms. Initial service scripts join the new worker's DevTools target token
and pre-install lifecycle; no document top frame is invented. Actual hook inputs
and referrers remain compared, including the no-referrer variant.

All ten authored cases pass in default, controlled-client and no-referrer variants,
twice per runtime and regular/private profile (24 final runs). Six shared
subrequests and the initial service script close within these bounds; broad
multi-client/teardown, updates, failed scripts without a realm and fetch/cache
behavior remain gaps. No full corpus or formal latency re-claim.

Two exploratory runs retained shared gaps (25.552 s, 20.700 s), then the authored
readiness gate passed (21.172 s); final runs took 21.028 s, 21.371 s, 51.223 s.
These are probe invocation times, not decision latency or owner attention.
Correction: a97cec27's requested debugger barrier did not establish a pause;
current evidence uses observed agent readiness and actual port handshakes.

122 focused tests pass; 52-file lint clean. No native build, prepare, GN, args,
toolchain or environment change. Framework/native/engine hashes equal a97cec27;
zero added upstream files/hunks, preceding footprint 25/62. This is routine
tranche-2 work, never Task 0 cold time. Eleven verified archives retain 223 files,
including nonclosing attempts and the explicitly incomplete exploratory paths-02
source snapshot. Final source hashes match all three final reports. Disposable
profiles/certificate keys removed; no owned probe remains. Latency deferred,
156 and permanent tabs untouched, Task 0 upgrade gate open. Attention/agent time
not measured.
### Shared-worker multiple clients and owner teardown — October 17, 2026

[Evidence](evidence/f12-shared-lifecycle-20261017/README.md). Two separately
observed same-origin documents connect to one shared worker through distinct
MessagePorts and challenges. The first phase reports two live documents/two
ports. After one exact document realm is destroyed by navigation, later worker
requests report one live document/port plus one ended document. Unique allow,
block and redirect cases agree between Electron and Chromium in regular/private
profiles, twice per runtime: eight final sessions and sixteen document instances.

The first two attempts were retained after an over-strict pagehide wait stopped
the run (17.774 s, 16.975 s). A third attempt passed each phase but exposed a
nondeterministic one-time worker-script initiator between equivalent same-origin
clients (23.970 s); it is not acceptance evidence. The corrected final run took
20.307 s. The existing ten-case path regression passed in 20.647 s.

127 focused tests pass with zero failures/skips; 55-file ESLint is clean. The
guarded plan check took 5.686 s and reported zero scheduled actions, so no native
compile ran. Native/framework/engine/args remain byte-identical to the preceding
checkpoint. Seven evidence archives retain 63 files: the failed attempts, exact
final sources, checks and final reports with verified hashes. No private keys or
permanent profile data are present.

This closes only the bounded two-client and navigation-driven exact-owner
teardown cases. More owners, embedded/top-site combinations, port transfer/close
and garbage collection, target/window-close continuation, in-flight teardown,
opaque/subframe owners, rapid reconnect, worker recreation, and broader service
worker behavior remain gaps. Formal latency stays deferred by the owner. The 156
baseline, permanent profile/tabs and Task 0 upgrade gate remain unchanged.
Attention and agent time are not measured.

### MV2 audit and service-worker lifecycle — October 17, 2026

[Spike B source audit](evidence/f12-spike-b/README.md) starts the approved second
F12 spike. Ordinary MV2 install/enable/startup gates are hard-disabled in the 157
pin; parser, component exception and blocking API remain. Component packaging,
privileges and payload dependencies need further audit before a runtime decision.
No ordinary MV2 restoration or uBO runtime success is claimed. Spike B remains
in progress; no extension-system patch or native build occurred.

[Service lifecycle evidence](evidence/f12-service-lifecycle-20261017/README.md)
records eight passing behavior sessions across Electron/Chromium and regular/private:
failed registration, controlled network fetch, cache response, blocked fetch and
replacement by a different script URL. Raw provider decisions independently verify
allow/block, profile and initiator. Observer session-loss errors remain in all
final sessions, so strict context acceptance stays open. Same-URL update revalidation,
failed-script realm correlation, multi-client/in-flight ownership and cache restart
remain gaps. Both attempts are archived with verified hashes; the first stopped
on offline-rejected background requests. Final invocation bracket: 27.831 seconds.

57-file lint is clean; eight evidence-verifier cases pass. No native build,
prepare, GN, output, toolchain or args change; zero upstream patch delta. This is
routine tranche work, not Task 0 cold time. Owner attention and agent time are not
measured. Latency remains deferred; 156, permanent profiles/tabs and Task 0's
extension-upgrade gate are unchanged. Plan progress table and coverage gaps updated.

### Component-loading audit and same-URL service updates — October 17, 2026

[Component audit](evidence/f12-spike-b/README.md) traces allowlisting, required
manifest key, component feature auto-grants, background-page creation and updater
ownership. Component loading is not ordinary MV2 compatibility. Runtime remains
unproven; no extension-system patch or component privilege was introduced.

[Service update evidence](evidence/f12-service-update-20261017/README.md) records
8 passing same-URL changed-byte update sessions, twice per runtime/profile, with
actual v1/v2 response hashes and controller version. The 404 startup target explains
the observer failures: original setup errors were masked by resume in finally.
Exact-session detach reconciliation now records incomplete lifecycle observations;
unknown errors remain faults. All final sessions have zero unexplained faults.
Strict failed-script/controlled-fetch context, unchanged-byte/cache-validator
updates and broader lifecycle coverage remain gaps; acceptance stays open.

Existing ten-case worker-path regression passes across eight sessions. 92 focused
tests pass; 58-file lint clean. Three sandbox-only loopback EPERM test failures
and the failed first update attempt are retained beside successful runs. Five
archives have verified member hashes. No native build/prepare/GN, no upstream
patch delta, no new output. Latency deferred. Test invocation timestamps are in
reports; owner attention/agent time not measured. Plan and coverage updated;
156, permanent profiles/tabs and Task 0 extension-upgrade gate unchanged.

### Controlled-fetch contexts and component-path design — October 17, 2026

[Context evidence](evidence/f12-service-context-20261017/README.md) closes the
bounded single-client controlled-fetch join: eight fresh runtime/profile sessions,
16 allowed/blocked worker requests. A proven page event is separated from the
worker network event; unknown duplicates remain gaps. Actual hook inputs and
observed worker/client contexts compare, without substituting a top-frame origin.
Same-URL update behavior still passes, but update-script attribution remains open
because the native update-check request lacks a DevTools ID. Failed-startup and
cache-only attribution and broader lifecycle cases remain gaps.

[Component assessment](evidence/f12-spike-b/README.md) identifies a narrow
browser-owned Add/allowlist candidate, without claiming runtime feasibility or
extension-core restoration. Pinned Chromium uBO cannot suspend requests during
filter-engine reset. Authenticated startup/reload holds, failure recovery and
privilege containment are requirements before adoption, not implemented features.

93 focused tests pass; 58-file lint clean. Existing worker-path regression is
retained with the fresh context run. No native build, upstream patch delta or
new output; latency deferred. Evidence archives/member hashes and source hashes
verified. Plan and coverage updated. Owner attention/agent time not measured;
156, permanent profiles/tabs and Task 0 upgrade gate remain unchanged.

### HTTP-failed loader identities and update-correlation guard — October 17, 2026

[Evidence](evidence/f12-service-loader-20261017/README.md): eight token-linked
HTTP 404 initial-script loader identities resolve across fresh runtime/profile
sessions. Execution realm is explicitly unobserved, never invented. The 16
controlled-fetch contexts and same-URL update behavior still pass. Broader failed
startup and update-script attribution are not closed.

Update investigation found a false Electron match when two same-URL hook
occurrences shared one initial Network event. The new hook/event bijection guard
rejects it; all eight captured updates remain gaps. Source inspection confirms the
native update checker lacks a frame/tab and recorded DevTools ID, so a later worker
with the same URL cannot establish its identity. Negative tests cover mismatched
HTTP tokens, non-failure responses, event ordering and repeated hook occurrences.

The [uBO assessment](evidence/f12-spike-b/README.md) now specifies browser hold
acknowledgement before engine reset, generation-safe release, fail-closed startup
and failure probes. These are runtime prerequisites, not implemented protection.
95 focused tests pass, 58-file lint clean; final worker-path regression retained.
Three archives verified with source hashes. No native build or patch delta;
latency deferred. Plan/coverage updated. Owner attention/agent time not measured;
156, permanent profiles/tabs and Task 0 upgrade gate unchanged.
# Offline uBO component admission checkpoint — October 17, 2026

See [component evidence](evidence/f12-component-admission-20261017/README.md).
Pinned uBO 1.75.0 background target and popup runtime identity pass in an offline
disposable profile; private availability is disabled. Ordinary MV2 gates remain
untouched. Initial compile and harness failures are retained. Incremental repair
build: 33.35 seconds, six steps; footprint 27 files / 65 hunks. 95 context tests
and three component tests pass. Update-script identity remains unresolved;
no initial-token borrowing or URL-based attribution was admitted. Blocking parity,
authenticated startup/reload hold and privilege containment remain open. Latency
stays deferred and 156/permanent profiles remain untouched.
# Bounded uBO readiness and reload protection — October 17, 2026

[Evidence](evidence/f12-ubo-reload-20261017/README.md) records the opt-in native
cancellation hold and generated GPL payload integration. The browser authenticates
the registered uBO background host, committed document, initiator, profile and
reload generation; acknowledges before engine reset; and releases only after
filters freeze and startup observers are installed. Missing readiness and lost
background documents fail closed for new intercepted HTTP(S) requests.

Sandboxed tests pass for actual authored-rule blocking/allowed control, bundled
list suppression via a local data replacement, reload cancellation/release,
stale/page/popup release rejection, background-target destruction and private
Blanc Blocker independence including private-profile teardown. A separate missing
handshake run cancels startup traffic. Full synthetic corpus parity is not claimed.
Failed build, response-pipe crash, profile lifetime fault and harness attempts are
retained. Final native repair: 31.29 s / six steps; only incremental output used.
103 focused tests pass; lint clean. Footprint remains 27 files / 65 hunks.

Eight fresh service lifecycle sessions retain 16 controlled contexts and eight
failed-loader identities. Native initial/update factory/request IDs are distinct;
all eight cross-runtime update-script contexts remain gaps. Latency deferred.

## Full synthetic uBO network parity and unchanged update checks — October 17, 2026

[Evidence and independent-verifier protocol](evidence/f12-ubo-parity-20261017/README.md).
Two fresh runs per runtime: 5,123 candidates + four controls, 2,113 blocks /
3,014 allows each, zero context/decision/fixture differences. Same pinned uBO
inputs, ten lists, automatic updates disabled; failed startup-observer and
interrupted automatic-reload attempts retained. This is regular-profile synthetic
network parity, not full F12 or real-web acceptance.

Eight unchanged-byte and eight changed-byte service sessions pass behavior;
32 controlled contexts and 16 failed initial-loader identities pass. All sixteen
update-check contexts remain gaps. Identical bytes keep one observed worker target,
so a new-realm join cannot be assumed. 128 tests pass, 67-file lint clean; zero
native builds and zero-action guarded check. Latency deferred, footprint unchanged
at 27/65; Task 0 upgrade gate and the verified 156 baseline unchanged.


### Bounded uBO cosmetics and update collision — October 17, 2026

See [evidence/f12-ubo-cosmetics-20261017](evidence/f12-ubo-cosmetics-20261017/README.md). Four fresh uBO sessions / eight normal+CSP pages match on static CSS,
`has-text` mutations and late constant/fetch scriptlets. First-inline constant
check fails in both runtimes on all eight pages; document-start acceptance stays
open. Initial favicon misses retained; final fixture explicitly serves them.
Eight same-URL/two-registration update sessions pass behavior; all 16 update
identities remain ambiguous gaps. No URL/order/timing join introduced.
138 focused tests and 73-file lint pass; guard schedules zero actions, zero native
compilations, no cold cost. Native footprint unchanged. Reports give session
brackets only; owner attention/agent time unmeasured. Latency deferred. Full
Spike A/B acceptance, Task 0 outcome and baseline promotion remain unchanged.


### Document-start / update-identity follow-up — October 17, 2026

See [evidence](evidence/f12-scriptlet-start-20261017/README.md). Two four-session sets (with/without injection
observer), 48 loads across normal/CSP, first visit/reload/fresh navigation:
0 early constant and 0 immediate-fetch prevention passes; later getter/constant
succeed. Both gates remain open; no fixture delay or fabricated identity fix.
Pinned source shows update version omitted and full scope collapsed to origin
before factory interception. Correct fixes require pre-page-script registration
with generation/document binding, and an independent loader-registration join
in both runtimes. 142 tests / 77-file lint pass; archives independently verified.
Guard zero actions, no native compile/cold cost; footprint unchanged. Latency
deferred; owner attention/agent time unmeasured. Plan acceptance unchanged.


### Native document-start and update-loader implementation — October 17, 2026

See [evidence](evidence/f12-document-gate-20261017/README.md). Chromium now passes
12/12 first-inline constant/getter and immediate-fetch checks across normal/CSP,
reload and fresh documents; Electron remains 0/12. Seven document/profile/filter
safety probes and ten prior reload/ownership checks plus unready startup pass.
Static/has-text/late-fetch regressions pass; early timing difference is explicitly
reported, not hidden as parity. Native-only loader tokens prove eight unchanged
same-URL collision checks and four changed-byte updates; Electron's independent
identity and cross-runtime acceptance remain gaps. Eight changed-byte sessions
retain controlled-fetch and failed-initial-loader proofs.

162 tests and 84-file lint pass. Four guarded incremental attempts: 55.62 s
stopped after an unexpectedly expanded header rebuild, 15.65 s compile failure,
13.26 s API-spelling failure, 43.98 s success / 10 steps; final guard zero actions.
128.51 s total invocation wall time is routine repair/build overhead, not cold
cost. Exact pristine header bytes and their recorded checkout metadata were
restored to avoid needless recompilation; proof is archived. No output, args or
toolchain reset. Footprint 31 files / 74 hunks (limit 40/120). Initial payload
import-order timeout is retained; final lazy initialization passes. All seven
archives independently verify and disposable profiles/keys were removed.

Main-frame guarantee only; synchronous gate/polling overhead remains unqualified.
Electron correction, subframes/opaque contexts, broader scriptlets/paths/lifecycle,
component containment and recovery remain open. Latency deferred; owner attention
and agent time unmeasured. Task 0 outcome/baseline and 156/permanent data unchanged.


### Subframe scriptlets and cross-runtime update tracing — October 17, 2026

See [evidence](evidence/f12-subframe-trace-20261017/README.md). Native HTTP(S)
subframes use browser frame IDs/ancestor chains and uncached current-engine
selection: 16/16 first-inline constant/getter, ancestor and immediate-fetch cases
pass across same-origin, cross-origin, nested CSP, fresh navigation, exception
and changed/restored ancestor cases. Electron early 0/16; late 12/16 versus
Chromium 16/16. Shipping Electron remains unchanged. Main-frame 12/12 and seven
safety regressions pass on the new binary.

Eight same-URL collision sessions with native ServiceWorker tracing complete.
Eight native update joins pass; eight Electron identities remain gaps. Stock
checker constructor traces expose script URLs, not the independent registration,
checked-version or hook-token join needed to close the cross-runtime gate. No
URL/time/order or numeric trace-ID equivalence is inferred. First trace attempt
stopped on a two-second flush deadline and remains excluded; final ten-second
bounded flush requires actual completion. Old unit job fixtures were corrected
to carry the now-required frame ID/ancestors; 172 tests and 89-file lint pass.

One guarded incremental build: 37.57 s wrapper / 33.65 s Siso, eight steps, no
failure or cold output. Final guard zero actions, footprint unchanged 31/74.
All build wall time is routine tranche work, separate from Task 0 cold cost.
Owner attention/agent time not measured. Latency including gate overhead remains
deferred. Private subframes, opaque/non-HTTP/fenced contexts, broader scriptlets,
component containment, recovery UX and independent Electron identity remain
open. No Task 0 outcome/baseline promotion or change to 156/permanent profiles.


### Private/opaque frames and Electron instrumentation assessment — October 17, 2026

See [evidence](evidence/f12-opaque-electron-audit-20261017/README.md) and the
[source-backed Electron assessment](electron-update-instrumentation.md).
Eight fresh sessions (two per runtime/profile) complete 56 frame cases. The
24 private script-enabled cases keep uBO disabled, permit the allowed control
and reject the blocked probe with zero blocked arrivals. Eighteen have actual
private Blanc Blocker cancellation records; six Electron srcdoc/data cases
remain attribution gaps because the existing observer scrub rejects non-HTTP
frame metadata. This does not count as private uBO scriptlet acceptance.

Four native regular HTTP/sandbox-HTTP cases pass first-inline constant/getter
and fetch suppression. Eight native non-HTTP regular cases lack the tested
early effects; Electron's 12 regular script-enabled cases lack them too.
Late effects differ: Electron HTTP/sandbox-HTTP/about:blank flags appear, while
srcdoc/data flags do not; Chromium non-HTTP flags do not appear. Eight sandbox
no-script cases prevent authored script execution; this is sandbox enforcement,
not successful scriptlet coverage. Actual opaque origins stay literal `null`.

The Electron v44.8.0 source pin is Chromium 152.0.7977.167. The assessment maps
browser-owned update metadata → per-load token → ResourceRequest → real Electron
webRequest hook, with collision/profile/old-version/lifetime safeguards and
required negative tests. It is unimplemented/uncompiled and needs a separately
approved Electron diagnostic build. Existing native joins retain their prior
meaning; independent Electron update identity stays open.

Two incomplete matrix attempts remain archived (opaque frame-name lookup,
then about:blank navigation replacing document.write); the corrected harness
uses element.contentFrame and writes to the default blank document. The first
unit invocation hit nine sandbox loopback EPERM errors; the authorized loopback
rerun passes all 181 tests. Lint: 93 files, zero issues. No native edits or
compilation; the existing output's final guarded plan has zero actions. Last
measured footprint 31 files/74 hunks is unchanged by these harness/docs changes.
All profiles/CA private keys and owned browser processes are removed. No native
mouse/keyboard or latency claim. Latency stays deferred; broader opaque/fenced
coverage, scriptlets, containment, recovery, worker contexts and both full
acceptance gates stay open. Plan items 3–6 remain unstarted; no Task 0/baseline
promotion and no 156/permanent-profile changes. Attention/agent time unmeasured.


### Inherited document start, Electron observer and diagnostic-build proposal — October 17, 2026

See [evidence](evidence/f12-inherited-observer-20261017/README.md). The opt-in
native gate now considers about:blank/srcdoc only when the committed browser
URL matches, its non-opaque HTTP(S) origin matches its actual parent origin,
and the existing profile/document/generation checks hold. That origin supplies
scriptlet rule selection only; document identity and request metadata remain
unchanged. Opaque about/data and unsupported schemes do not acquire a guessed
parent origin or an early-protection claim.

Eight fresh sessions repeat all 56 frame cases. Native early checks now pass
8/8 across HTTP, sandboxed HTTP, inherited srcdoc and blank (four newly passing
inherited cases). All 24 private script-enabled cases have actual private Blanc
Blocker cancellation records and unchanged allowed/blocked network outcomes.
The six former Electron attribution gaps are closed by synthetic-only exact
about/data metadata admission, with observed initiator presence and literal
opaque null preserved. Unknown data/blob/file metadata and exempted network
fields are rejected; the public recorder scrubber is unchanged.

Six inherited normal/exception/restoration probes and all seven gate-safety
regressions pass. The 56-case matrix retains 16 early-scriptlet gaps: four native
opaque srcdoc/data cases and 12 Electron regular cases. Eight sandbox script-denial
checks remain scoped enforcement evidence, not scriptlet passes. Broader nested,
blob/fenced/CSP/lifecycle contexts, full provider/containment acceptance and
cross-runtime update identity remain open. The full 5,123 corpus was not rerun.

187 focused tests pass; lint covers 96 files without issues. One guarded
incremental build: 37.45 s wrapper / 33.62 s Siso, eight steps, after a two-action
plan. No compile failure, cold output, GN-arg/toolchain or hook change. Final guard
zero actions; measured footprint31 files/74 hunks. Build time is routine tranche
work, never Task0 cold cost. Profiles, fixture CA keys and owned browser processes
removed. No physical-input claim. Latency remains deferred; attention/agent time
not measured, items3–6 unstarted, Task0/156/permanent data unchanged.

[Electron diagnostic build proposal](electron-instrumentation-build-request.md)
is drafted with separate unchecked §8 approval. It pins Electron44.8.0/Chromium152,
one isolated arm64 testing output, local tools and resource/time limits. Estimates
are labelled unmeasured (4–8h cold compile; up to220GiB new-root budget). No fetch,
setup or build started. The current tranche approval does not authorize it.

Inherited-frame native/extension late-path deduplication is not proved by the bounded constant/fetch cases; an exactly-once probe remains required for broader scriptlets.

## Opaque about selection and inherited deduplication — October 17, 2026

Evidence: [opaque/dedup checkpoint](evidence/f12-opaque-dedup-20261017/README.md).
Browser-side selection now admits exact committed about:blank/srcdoc with a
browser-recorded tuple/precursor matching the actual non-opaque HTTP(S) parent.
The precursor selects rules only; opaque origin stays `null` and is never used
as a same-origin grant or a replacement network observation. Unknown precursor,
opaque parent and unsupported URLs remain outside this bounded gate.

The generated uBO payload wraps both its exported native main-world body and
its extension insertion body with one per-payload random, per-realm once marker.
The marker is non-enumerable/non-configurable/non-writable after installation.
It is duplicate prevention, not an authorization boundary against page code.
Exceptions that select no payload set no marker; a throwing body is not retried.
New documents have independent markers. In-place filter-generation semantics
and arbitrary scriptlets remain broader coverage work.

Eight fresh sessions repeat 56 frame cases: **42 scoped passes / 14 gaps**.
Native regular early checks now pass 10/10 (HTTP, sandbox HTTP, inherited srcdoc,
blank, opaque srcdoc, each twice). All 24 private cancellation observations
still pass; uBO remains disabled there. Two native data cases and twelve Electron
early cases remain gaps. Eight no-script cases are sandbox enforcement only.

Four inherited repeat-delivery cases, across two fresh document cycles, show
one body execution with 4–5 attempts after two deliberate extension deliveries.
The test explicitly resets upstream's isolated injection sentinel to force the
late main-world path; it does not pretend these deliveries occurred naturally.
Two opaque srcdoc cases pass early checks but extension late delivery cannot be
observed, so their repeat-delivery scope remains a gap. Independent verification
rejects missing attempts, duplicate bodies and opaque-origin substitution.

Boundary run records blob, data and nested-opaque early gaps, plus one passing
opaque-srcdoc exception. Seven existing gate-safety and six inherited
normal/exception/restoration checks pass; a separate observer/counter-free
payload repeats the six inherited checks. Full 5,123-network parity and complete
previous ancestor matrices were not rerun and remain historical.

One guarded incremental build: **34.24 s wrapper / 30.61 s Siso, six steps**,
from a one-action plan. Final guard zero; fresh footprint **31 files / 74 hunks**.
**195 focused tests / 102-file lint pass**. First lint found one harness global
reference and was corrected. Two excluded dedup probes are retained: first
never forced late delivery past upstream's isolated marker; second overclaimed
opaque extension reachability and stopped. Neither is counted as acceptance.
Disposable profiles/fixture CA keys/runtime processes were removed.

Latency remains deferred, including gate and marker overhead. Electron early
behavior and independent update-loader identity remain open; its diagnostic
build request §8 is unchecked and no checkout/build started. Broader lifecycle,
CSP/opaque/fenced contexts, arbitrary scriptlets, component containment and
plan items 3–6 remain open. Task0 and the156 baseline are unchanged.

## Data/blob and nested-opaque document coverage — October 17, 2026

Evidence: [non-HTTP chain checkpoint](evidence/f12-data-blob-20261017/README.md).
The native gate now accepts data/blob along with about documents only when the
exact browser-committed URL matches and its browser-owned tuple/precursor is
HTTP(S). Every opaque parent must carry that same tuple; selection stops at the
first non-opaque parent and requires an exact match there. Mismatches, unknown
precursors, no parent, unsupported ancestors and chains beyond 64 hops receive
no added payload. No ancestor is skipped to borrow the visible top tab. This is
rule selection only, never inherited origin privileges or substituted network
context. Document/profile/generation binding and once-only payload remain.

Four fresh native regular/private sessions cover nine cases each. **14 regular
early checks** pass over data, blob, sandboxed blob, nested opaque srcdoc/data/blob
and child-origin blob. Host-specific first-inline markers prove top-vs-child rule
selection. **16 private-policy checks** have actual Blanc cancellation records
with the observed initiator (including opaque `null`); private uBO stays disabled.
Six of the 36 cases remain gaps: four cross-owner blob navigations are rejected
by Chromium before an inspectable document, and two regular mismatched-chain
data documents receive no early payload. Browser rejection is not a native
scriptlet/selection pass. The private mismatched chain still has its own network
cancellation proof and is not counted as private uBO coverage.

Two more fresh regular sessions exercise explicit exceptions and the baseline
again: seven exception outcomes and seven baseline early outcomes pass; four
mismatch/navigation gaps remain. The latter session is labelled `restored` in
raw data but is a **fresh-session baseline**, not an in-place filter-generation
restoration claim. The 56-case Electron/native matrix is also rerun on this
binary; its proof and exact scoped counts are in this checkpoint's evidence.
Inherited deduplication and document-gate safety regressions are rerun separately.
Full 5,123-URL network parity and full previous ancestor matrices remain historical.

One guarded incremental build: **36.01 s wrapper / 32.36 s Siso, eight steps**
after a two-action plan. Final guard zero. Fresh measured footprint **31 upstream
files / 74 hunks**. **202 focused tests / 106-file lint pass**. No cold output,
GN-args/toolchain changes, latency run or Electron diagnostic build. §8 of that
separate proposal remains unchecked. Plan items 3–6 and Task0 remain unchanged.

Two failed harness attempts are retained/excluded: the first assumed a rejected
cross-owner blob had a visible document; the second evaluated that absent
execution context and stalled. Only its verified disposable browser was stopped
with SIGTERM so the runner saved evidence and removed its profile. The final
probe uses actual browser console rejection without evaluating a missing realm.
All final and failed-run cleanup reports, raw observations, source snapshots,
binary hashes, invocation logs and independent verification are archived.

Remaining: cross-owner/unknown-precursor and mismatched chains, top-level data/blob,
deeper/fenced contexts, opaque-specific ancestor rules and CSP permutations,
opaque extension late-path reachability, arbitrary scriptlets/lifecycle/recovery,
component containment, independent Electron update identity and Electron early
timing. Qualified latency remains explicitly deferred, including gate overhead.

Final regression evidence: the eight-session56case matrix verifies **44 scoped
passes /12 Electron early gaps** (native12early,24private attribution and8sandbox
no-script enforcement). Four inherited repeat-delivery proofs and seven gate
safety checks pass; two opaque extension late-delivery attempts remain unproved.
These scoped categories are not summed into full provider acceptance.

## Opaque late delivery and duplicate suppression — October 17, 2026

Evidence: [late-delivery checkpoint](evidence/f12-opaque-late-20261017/README.md).
Two fresh native regular profiles each create eight document kinds twice: opaque
srcdoc, data, blob, sandboxed blob, nested opaque srcdoc/data/blob, and child-origin
blob. Native first-inline effects and original security origins are checked before
any diagnostic delivery. No private uBO or Electron parity claim is added.

- **8 actual extension repeat-delivery passes:** data and nested-data documents
  receive two deliberate late deliveries through raw `chrome.tabs.executeScript`.
  The real engine's assembled injector executes, its main-world attempt count rises
  by at least two, and its body count remains one. The upstream isolated injector
  sentinel is deliberately reset; the shared main-world once marker is not reset.
- **8 opaque-srcdoc delivery gaps:** direct and nested sandboxed srcdoc callbacks
  explicitly refuse access at origin `null`, even with `matchAboutBlank: true`.
  The earlier wrapper hid this error; it is now archived. Permissions are unchanged.
- **16 blob delivery gaps:** `webNavigation.getAllFrames` omits the blob leaf.
  A separate all-frames diagnostic message probe supplies browser-owned sender
  metadata for reachable parents, but no matching blob document. No frame id or
  parent origin is substituted. The pinned `IsValidUrl` source excludes blob from
  webNavigation's accepted schemes; the all-frames omission's deeper cause remains
  unproved. An omitted frame is not proof that every possible extension path fails.
- **32 direct mechanism passes:** the same real engine main-world payload is also
  delivered twice by explicit Playwright evaluation in each actual document realm.
  Attempts rise by exactly two, bodies remain one, origins and early effects stay
  unchanged. This is diagnostic duplicate-suppression evidence, **not extension
  delivery acceptance**. The fixture supplies the selection origin for this direct
  test; unresolved extension frame ids use a diagnostic-only `-1`. New document
  cycles prove marker state is per realm, not retained from the previous document.

Seven negative verifier tests reject missing main-world arrival despite successful
API callbacks, repeated bodies, missing direct attempts, replaced opaque origins,
stale/wrong document identity, silently discarded blob candidates and changed
payload bytes. Both final runs independently verify. Three failed harness attempts
remain excluded: Playwright's stale empty opaque URL twice, then assuming blob
appeared in webNavigation. The final harness reads `location.href` in the actual
realm and records absent extension identity as a gap.

**209 focused tests and 109-file lint pass.** The first sandboxed unit invocation
failed on loopback `listen EPERM`; the permitted run passed without code changes.
No native or payload code changed. Guarded plan: **zero actions, 3.77 seconds**;
no compile launched. App/framework hashes match the prior checkpoint. The last
measured upstream footprint remains 31 files / 74 hunks (not remeasured here).
Both final runs took 13.33 and 13.07 seconds; these are harness wall times, not
latency measurements. All five attempted disposable profiles were removed.

Claude Code plan: Spike B remains in progress. Production opaque-srcdoc/blob late
reachability, mixed/unknown/top-level/deeper/fenced contexts, ancestor/CSP rules,
arbitrary scriptlets, lifecycle/filter generations and privilege containment remain
open. Previous network, private and gate-safety matrices were not rerun for this
harness-only change. Latency stays deferred. Electron diagnostic proposal §8 is
still unchecked; no checkout/build started. Task 0 and plan items 3–6 are unchanged.

## Opaque/blob static origin fallback investigation — October 17, 2026

Evidence: [static fallback checkpoint](evidence/f12-origin-fallback-20261017/README.md).
The pinned source distinguishes legacy `matchAboutBlank`'s about-only ancestor
climb from static content scripts' `match_origin_as_fallback` origin/precursor
matching for about/blob/data/filesystem. Host permission checks remain in place.
The legacy climb can stop at a remote parent; this is consistent with the opaque
refusal, but no internal trace proves that particular bailout. webNavigation's
valid-scheme list separately excludes blob, explaining its enumeration omission.

Two **diagnostic-only copies** of the existing observed uBO payload add one static
isolated-world content script, matched only to the two authored fixture origins,
at document idle. They differ only in `match_about_blank` versus
`match_origin_as_fallback`. Existing scripts, permissions and private exclusion
are preserved. The prototype's existing payload is not edited. The test receiver
sends actual browser `MessageSender` frame/document id, URL and origin; the harness
requires an exact unique authored document before targeting its `documentId`.
No permission or extension-system patch, guessed frame id or substituted origin.

The matched final comparison has ten frame kinds over two document cycles:

- About-only mode: **4 positive-control passes / 16 absent-receiver gaps**.
  The HTTP and inherited-srcdoc controls confirm the content script is loaded.
- Origin mode: **14 diagnostic static-delivery passes / 6 gaps per profile**,
  reproduced in two fresh profiles (**28 / 12**). New reachable kinds are opaque
  srcdoc, blob, sandboxed blob, nested opaque srcdoc and child-origin blob.
  Their browser-provided origins stay unchanged, including opaque `null`.
- Static data, nested-data and nested-blob receivers remain absent. The earlier
  programmatic data/nested-data passes still stand; the two APIs behave differently.
  This absence is retained as a gap, not attributed to a source cause without proof.
- All three final profiles pass two out-of-scope controls: unmatched HTTP and
  sandboxed srcdoc produce no diagnostic receiver or fixture-specific scriptlets.
  Existing generic native scriptlet counters may still be present and are recorded.

Each successful receiver gets the real engine main-world payload twice through
extension messaging and DOM script insertion. Actual main-world attempts increase
by at least two while the body count remains one. **No direct Playwright payload
evaluation is used.** Payload bytes and exact responses/identity are archived.
This proves a bounded, supported extension delivery mechanism. It is **not yet
provider integration**: fixture-selected rule context is still supplied by the
harness; authenticated context selection, readiness/generation/lifetime binding,
CSP/ancestor rules, recovery and privilege containment remain required. The
receiver is intentionally an isolated experiment, never shipped or installed into
the permanent profile. No new private uBO or Electron acceptance claim is added.

**216 focused tests / 114-file lint pass.** Seven new verifier tests reject absent
arrival, wrong/stale identity or origin, duplicate execution, direct-eval claims,
widened manifest scope, unmatched-host delivery and payload tampering. The loaded
manifest itself is verified. Guarded native plan: **zero actions, 5.68 seconds**;
no compilation. Native app/framework hashes remain unchanged; last measured patch
footprint remains 31 files / 74 hunks, not remeasured here. All experiment profiles
are removed. Early exploratory runs are archived separately from the final proof;
one scope-control attempt failed because it incorrectly expected no generic native
counter at all. The final control checks actual fixture-specific effects instead.

Claude Code plan and routine ledger updated. Spike B remains in progress. Qualified
latency remains deferred; harness wall times are not latency measurements. Electron
diagnostic build §8 remains unchecked/unstarted. Task 0 and items 3–6 are unchanged.


## Static origin fallback integrated — October 17, 2026

[Evidence and exact limits](evidence/f12-static-integration-20261017/README.md).
Browser-owned live document/tab/frame/origin, precursor/ancestor selection and
reload generation now bind the automatic static late path to the real uBO engine.
Two fresh profiles: **36 non-HTTP late-delivery passes + four HTTP early controls**,
one body per document; **26 identity/generation checks**. No fixture context or
harness payload delivery supplies those results. The former data/nested-data/
nested-blob receiver gaps were a diagnostic `crypto.randomUUID()` failure in
insecure contexts; its corrected diagnostic passes **20/20**, superseding that
hypothesis. Existing private/non-HTTP matrix **30 passes/six boundary gaps**,
exceptions/fresh restore **14/four**, and **seven gate safety checks** pass.

**228 tests / 119-file lint pass.** One incremental build **35.12 s wrapper /
31.49 s Siso, six steps**; final guard zero actions. Fresh footprint **31 files /
74 hunks**. Exploratory/failed attempts and cleanup are retained in the evidence.
No full network-corpus or Electron rerun. In-flight delivery/reload atomicity,
broader CSP/Trusted Types, lifecycle/owners/scriptlets/containment and Electron
identity remain open. Latency deferred; Electron build §8 unchecked/unstarted.
No baseline promotion or change to plan items 3–6.


## Static fallback reload schedules and CSP — October 17, 2026

[Evidence and exact limits](evidence/f12-static-race-csp-20261017/README.md).
Assets-only final reply generation check: final **45 diagnostic schedules** include
15 actual filter-list reloads; **36 pre-dispatch drops / nine after-delivery stale
attempts**, no duplicate bodies. Explicit diagnostic pauses establish controlled
behavior, not natural race incidence. **After-dispatch atomicity remains a gap**;
unchanged-rule reloads do not qualify in-place changed-rule semantics.

Ordinary provider CSP matrix **15/15** actual late attempts with one body. Page
nonce/script-none and Trusted Types controls remain enforced; extension-world
insertion is privileged/exempt in this pin. Receiver comment corrected, no policy
weakening; full CSP/containment remains open. Ordinary regression **18 late + two
HTTP controls + 13 identity checks** passes. **238 tests / 126-file lint** pass.
Zero-action guard **4.57 s**, no compile; last upstream footprint31/74 unchanged,
not remeasured. Initial lint and all runtime attempts retained. No full network,
Electron/private/safety reruns. Parent32790e0b CodeQL four alerts remain unresolved.
Latency deferred; Electron build §8 unchecked/unstarted; Task0/items3–6 unchanged.


## Four CodeQL remediations — October 17, 2026

[Changes, evidence and limits](evidence/f12-codeql-final-20261017/README.md):
readiness fixture HTTPS, exact parsed-host checks in probe/verifier, and HTML-safe
marker literals in the self-contained generated wrapper. No suppressions.
**10 readiness + one startup check**, **18 late deliveries + two HTTP controls +
13 identity checks**, **15 CSP cases**, **242 tests / 128-file lint** pass. Initial
mixed-content-short-circuit attempt and lint failure retained and excluded.
The final page HTTPS control proves native fail-closed rejection, not isolated
sender authorization. Native source unchanged; **zero actions / 4.29 s**, no build.
CI must confirm the four alerts clear on the pushed head. After-delivery atomicity,
broader acceptance/containment and Electron identity gaps remain; latency deferred,
Electron build §8 unchecked/unstarted; Task0/items3–6 unchanged.


## Static delivery barrier and broader CSP — October 18, 2026 UTC

[Evidence and exact limits](evidence/f12-static-drain-20261018/README.md).
The static receiver now holds a document-bound delivery lease until synchronous
insertion finishes. Reload acknowledges the native request hold, then drains
committed deliveries before engine reset/readiness. Sent code is serialized,
not revoked. A three-second timeout retains the lease and fails closed; lost
acknowledgements have no automatic recovery yet.

**45 controlled schedules:** 36 pre-dispatch drops, nine deliveries drained before
reset, no duplicate bodies; 15 actual unchanged-rule reloads. A destroyed receiver
makes actual reload reject while unready. This qualifies static-delivery/reset
ordering, not native-early/upstream injection atomicity, changed-rule semantics or
natural race incidence.

**15 new policy cases:** five HTTP-header controls and ten inherited srcdoc/blob
cases cover nonce, none, Trusted Types, strict-dynamic and report-only. Page-policy
negative controls remain effective while privileged extension delivery succeeds.
Not full containment. Existing **15 meta-CSP**, **18 late + two HTTP + 13 identity**,
and **10 readiness + one startup** regressions pass. **253 tests / 133-file lint**.
**Zero actions / 5.18 s**, no native build; binary hashes unchanged, last footprint
31 files/74 hunks unchanged and not remeasured. Four archives, 231 members, five
independent extracted proofs; all disposable roots removed. Initial test-import
failure and earlier race run retained/excluded from final proof.

Remaining: lost-ack recovery, concurrent reload/lifecycle/recreation, native early
and non-static upstream deliveries, in-place changed rules, asynchronous effects,
adversarial/deeper/combined CSP and full containment, broader coverage and Electron
identity. Latency remains deferred; Electron diagnostic build §8 stays unchecked
and unstarted. Task0/items3–6 unchanged. Parent b99334c7 passed all 22 CI checks,
none skipped, CodeQL no new alerts; this checkpoint awaits its own CI.


## Lost acknowledgement recovery and reload lifecycle — October 18, 2026 UTC

[Evidence and limits](evidence/f12-static-recovery-20261018/README.md).
A held reload can now retire a static lease after the browser proves the exact
previously verified document is absent. This proof chain starts with actual
MessageSender identity and two LateContext checks; an arbitrary absent ID is not
destruction proof. The authenticated query preserves inactive/BFCache/retained
crash documents as present, based on the pinned source audit. Runtime BFCache,
prerender and crash cases remain unqualified.

**45 controlled schedules pass**, retaining 36 pre-dispatch drops / nine drained
committed deliveries and zero duplicate bodies. Additional runtime checks prove:
live receiver timeout keeps page fetches blocked; two real load calls share a
promise through acknowledgement; overlapping begin and stale completion reject;
receiver acknowledgement allows retry after failure; destroyed receiver permits
actual reload recovery with exact native lifetime evidence. Malformed ID,
stale/malformed generation and popup query controls reject.

Generated uBO clears its shared load promise after native readiness acknowledgement
on success or failure; completion uses the epoch returned by begin. This broadens
reload lifecycle coverage but does not close native early/upstream non-static
injection atomicity, changed-rule semantics, asynchronous effects or full recovery UX.

**260 tests / 133-file lint**, ordinary **18 late + two HTTP + 13 identity**,
**15 header/inherited CSP**, and **ten readiness + one startup** checks pass.
One guarded incremental **34.59 s wrapper / 30.82 s Siso, six steps**; final guard
zero actions **4.39 s**. Fresh footprint **31 files / 74 hunks**. Four archives,
236 members, four independent extracted proofs. Initial test/harness failures and
pre-final runtime retained and excluded; all disposable roots/private keys removed.
No full network, Electron or meta-CSP rerun. Latency remains deferred; Electron
build §8 unchecked/unstarted. Task0/items3–6 unchanged; CI pending this checkpoint.

## Native early and upstream completion ordering — October 18, 2026 UTC

[Evidence and limits](evidence/f12-delivery-order-20261018/README.md).
Native nonempty GetScript responses retain a document-bound token through synchronous
renderer execution and completion acknowledgement. Begin cancels only undispatched
jobs; provider reset/ready drains dispatched work, and native ready refuses pending
deliveries. Generated initial startup also drains native leases. Upstream scriptlet
injection and log-level API calls synchronously acquire completion leases, released
only when the pinned API settles. Missing completion times out held, not expired.

Four controlled schedules pass: two inside native ExecuteScript (with queued upstream
work also pending), two after actual exact-tab upstream API settlement but before
acknowledgement release. Both paths block actual filter reload, remain held on timeout
and recover on completion/retry; no duplicate main-world bodies. The upstream two
are completion-boundary diagnostics, not a renderer execution pause or exact-document
identity proof. Attempts 01/02 failed to pause upstream; attempt 03 caught empty-result
about:blank work; all are retained/excluded. Final attempt 04 requires positive exact-tab
API results. Broader lifecycle/navigation/async effects and non-scriptlet injection
channels remain gaps; native destruction recovery is source-backed, not runtime-tested.

Regressions: 45 static schedules and lost-ack controls; 18 late + two HTTP + 13 identity
checks; 15 header/inherited CSP; ten readiness + one startup. 268 tests / 139-file lint.
One incremental build 45.70 s wrapper / 41.73 s Siso, 19 steps; final guard zero actions
4.98 s. Fresh footprint 31 files / 74 hunks. No cold/args/toolchain changes. Full network,
Electron and meta-CSP matrices not rerun. Latency deferred; Electron build §8 unchecked.
Previous-head 79588947 CodeQL passed with no new alerts; oauth-compatibility failed in
wallpaper smoke line 151 (30 s private fade wait), not OAuth itself. No rerun. Current
checkpoint CI remains to be evaluated. Plan items 3–6 and Task0 promotion gate unchanged.


## Procedural helper completion drains — October 18, 2026

Four additional messaging API sites join the upstream barrier; awaited results are preserved. Two procedural drain/timeout schedules and four existing native/upstream schedules pass. 272 regression tests pass; 127 scoped lint checks pass. Zero-action guard in 5.06 s, no compile; binary hashes unchanged. Runtime durations are diagnostic execution brackets, not latency or owner-attention measurements. Logger/noscript/picker runtime, exact document identity, other injection channels and lifecycle/async semantics remain gaps. Latency deferred; Electron build unapproved. See [evidence](evidence/f12-helper-delivery-20261018/README.md). Task 0 and baseline unchanged.

## Logger, noscript, picker and navigation checkpoint — October 18, 2026

Six disposable regular-profile Chromium schedules pass: logger, noscript and
picker each drain normally and fail closed on an intentionally withheld API
acknowledgement, then recover after release/retry. These exercise the real helper
files. Noscript replaces its authored fallback; picker preserves its awaited
reply and does not return early. Logger coverage proves helper execution and
completion ordering, not the logger UI or every logged cosmetic rule.

Two additional picker schedules navigate after actual helper execution while its
acknowledgement is withheld: same URL and another path on the same origin. The
actual extension MessageSender documentId matches webNavigation's old document;
the new document has a different ID and cannot retire the old pending lease.
These are post-execution identity observations, not document-bound pre-dispatch
targeting. Legacy executeScript loads the file asynchronously and targets a frame;
ScriptExecutor explicitly notes its preallocated document ID can become stale.
Pre-dispatch navigation, cross-origin/BFCache/lifecycle races, async effects and
other injection channels remain gaps. No full atomicity or acceptance claim.

Diagnostic payloads only add exact helper-entry observations and controlled
completion holds; no production/native changes. First attempt failed because the
picker hold intercepted initialization instead of the requested picker helper;
the corrected harness arms picker after initialization. The failed attempt and
intermediate pass remain archived; the final source passes all six cases with
the document observer enabled. Independent verification rejects eight corrupted
evidence variants. 272 regression tests pass; 127 scoped lint files clean;
zero-action build guard, no compilation, binary hashes unchanged from 249b086c.
Fresh disposable profiles/certificate keys removed. See
[evidence](evidence/f12-helper-channels-20261018/README.md).
Latency deferred; Electron diagnostic build approval remains unchecked. Spikes
A/B remain in progress, items 3–6 not started, no baseline promotion.

## Browser pre-dispatch document constraint — October 18, 2026

The opt-in uBO identity/switch path accepts `blancDocumentId` for single-frame
JavaScript only. ScriptExecutor compares the browser document ID within its own
tab/frame; ExecuteCodeFunction checks after asynchronous file loading and before
dispatch. Missing/replaced, malformed, cross-tab, CSS/webview and all-frame uses
of this constraint are refused. Other extensions cannot use it. Legacy calls
without the field retain their upstream behavior.

The generated adapter acquires a completion lease before querying browser frame
identity, rechecks readiness/generation, and supplies the observed document ID.
All-frame calls without a subtree root expand a maximum 64-document snapshot
into individually constrained calls; newly created frames are not added later.
A partial error cannot release another pending call. Subtree all-frame targeting
and larger snapshots refuse. The observation boundary is the browser snapshot:
this does not prove the original caller's earlier event belonged to that document.

Eleven offline regular-profile runtime checks pass: current code/file execution;
same-document fragment acceptance; same-URL, cross-path and cross-origin stale
rejection; malformed/wrong-frame/cross-tab/all-frame raw rejection; two-document
adapter fanout. Controlled navigation pauses after the actual browser snapshot
and before raw API invocation. Replacement DOM remains untouched. No artificial
pause inside native file loading was used; the post-load check is source-audited.
Six logger/noscript/picker and four native/upstream completion schedules also pass.
Seven corrupted-evidence variants reject. Three verifiers pass again using only
extracted archived sources/reports. 276 regression tests and 130 module plus two
wrapper lint checks pass. The initial nonunique preparation anchor and missing
harness globals lint failure are retained with corrected passes.

One guarded incremental build: 317.03 s wrapper, 312.06 s Siso, 1,017 executed
steps. Initial plan 208 actions expanded after schema generation; existing output,
GN args and toolchain retained. Final check zero actions (3.91 s). Footprint
35 upstream files / 79 hunks, within 40 / 120. No cold build. This is routine
tranche build effort, not Task 0's clean-build column.

Remaining: navigation after browser validation/before renderer execution still
needs a renderer document-token guard; queued runAt scheduling, BFCache/prerender,
crash/lifecycle and asynchronous effects remain open. No full exact-delivery or
all-path atomicity claim. Logger UI and arbitrary scriptlet/cosmetic coverage are
unchanged gaps. Latency (including snapshot overhead) stays deferred. Electron
diagnostic build §8 unchecked/unstarted. Spikes A/B in progress; items 3–6 not
started. No baseline promotion. Disposable profiles and fixture keys removed.
Evidence: `evidence/f12-document-target-20261018/`.

## Renderer document-token guard — October 18, 2026

Browser validation now resolves the actual Blink DocumentToken only from a live,
active, non-error committed document after verifying the API document ID in the
executor's own tab. An optional immutable token travels in ExecuteCodeParams.
The renderer checks WebDocument.Token() when the injection becomes eligible and,
for the experimental uBO component, immediately before execution after delayed
permission replies. Other extensions retain their permission-reply path. The
new content helper avoids exposing RFHImpl through the extensions layer.

Eight bounded offline cases pass: three deliberate transport-token mismatches
(document_start/end/idle), each with a matching-token positive control; a legacy
unconstrained control; a genuinely deferred document_end release; and same-URL,
cross-path and cross-origin replacements while document_end work is queued.
Replacement markers remain untouched. Navigation callbacks return [null], which
is recorded as teardown behavior, not evidence that the old document never
began executing. Two failed harness attempts expected an error/empty array;
they are retained, not counted as passes. The final validator requires actual
replacement identity and untouched DOM as well as the non-positive callback.

The mismatch switch is opt-in, exact-component and exact-source-marker gated,
and only corrupts an already-present token. It cannot bypass the guard. These
three denials are diagnostic fault injection, not an observation of a naturally
occurring IPC race. The permission-reply recheck is source-audited, not exercised
through a native permission dialog. BFCache/prerender, crashes, original caller
identity before the browser snapshot and asynchronous scriptlet effects remain
unqualified. No all-path atomicity or full acceptance claim.

281 focused regression tests and 135 module lint checks pass. Two incremental
builds: 162.37 s wrapper / 158.51 s Siso / 251 steps, then 34.30 s wrapper /
29.69 s Siso / six steps to narrow the permission recheck to this component.
The initial 89-action plan expanded/pruned after Mojo generation; both retained
the existing cache. GN regeneration followed the added header's BUILD.gn edit,
with unchanged arguments/toolchain. Final guard zero actions (4.26 s).
Footprint: **40 upstream files / 91 hunks**, at the file ceiling of 40 / 120.
The five added existing paths are content public BUILD.gn, RFHImpl.cc, frame.mojom,
programmatic_script_injector.cc and script_injection.cc; the new Blanc header is
separately inventoried. Any further upstream-file addition needs consolidation
within the budget or a new owner decision. No cold output.

Latency stays deferred, including token-check overhead. Electron diagnostic build
§8 remains unchecked/unstarted. Spikes A/B in progress, items 3–6 not started;
Task 0 upgrade gate and baseline promotion unchanged. Evidence and failed attempts:
`evidence/f12-renderer-target-20261018/`.

Final binary regressions also pass: eleven browser document-target checks, six
logger/noscript/picker checks and four native/upstream completion schedules. Each
report has an independent verifier. Repeated preparation leaves all 40 existing
upstream files and the new Blanc header byte-identical.

Archive verification: 108 members (338,786 compressed bytes), hashes checked; all
four report proofs pass using extracted archived sources and reports.

## BFCache, prerender and renderer crash coverage — October 18, 2026

This checkpoint changes only disposable offline harnesses. The native renderer
document-token guard and binary are unchanged. Lifecycle06 proves a real BFCache
restore (persisted pageshow, same document ID and page-instance nonce, preserved
marker), rejection while that document is cached, and successful exact targeting
after restore. A queued document_end injection is pending before an actual
renderer crash; its callback fails. Browser API recovery creates a different
document, whose marker remains untouched; the stale ID is refused and the new
ID succeeds. These are bounded regular main-frame cases, not all lifecycle or
asynchronous-side-effect acceptance.

The lifecycle probe removes Playwright's default BFCache-disable switch only for
this test. Pinned uBO disables preloading by default; the first prerender attempt
observed PreloadingDisabled. Later conditional probes enable browser prediction
only in disposable profiles and record both settings. Playwright-attached probes
do not prove prerender activation; ordinary navigation is explicitly a gap.

Earlier attempts are retained: DOMContentLoaded was an invalid restore wait;
Playwright commands failed after an intentional crash; direct frame debugging
suppressed prerender; and an isolated-world recovery observer incorrectly read a
main-world variable. Lifecycle06 reads authored DOM data and passes the two scoped
cells. These harness failures are not counted as product passes. Raw-launch attempt
01 also failed because the component manifest argument lacked the established
ASCII escaping; its fatal startup and cleanup are retained.

287 tests pass; final guard zero actions, no compile. Measured footprint remains
40 upstream files / 91 hunks (40-file ceiling). Latency remains deferred and the
Electron instrumentation build remains unapproved/unstarted. Original caller
identity, subframe/multi-document lifecycle, permission replies, and asynchronous
scriptlet effects remain gaps; no full acceptance or baseline promotion.

The raw background-only probe also reached configured preloading but observed no
prerender target within its 15-second bound. Its cause is unresolved; this result
cannot be attributed solely to Playwright and is not a prerender acceptance pass.
Raw attempts 02/03 lost their popup observer during startup; attempt04 uses the
surviving background only. All four failed raw attempts are archived and cleaned.
139 module lint checks pass. Binary hashes and the ordinary component inventory
match the prior renderer-token checkpoint. Guard duration 3.65 s; fresh budget
scan 45.76 s. These are test/tooling costs, not compilation or latency measurements.
Evidence: `evidence/f12-lifecycle-20261018/`. Full network parity was not rerun.

Archive: 48 members, 52,881 compressed bytes; every hash checked and the
independent lifecycle proof passes from extracted sources/reports. All attempt
reports record cleanup. Historical failed raw source versions are not fully
snapshotted; final sources and the through-attempt05 lifecycle source are saved.

## Prerender cancellation and lifecycle lease recovery — October 18, 2026 (EDT)

Prerender investigation exposed a synchronous-binder hazard. DocumentStart made
synchronous GetScript/Complete calls while its unlisted non-associated binder
inherited Chromium's prerender deferral. Chromium's own policy implementation
warns of this deadlock pattern. The raw control fetched the speculative document
but produced no target; enabling discovery and attempting renderer-initiated
navigation then timed out. Target absence alone is not proof of non-existence:
DevTools enumeration walks the primary frame tree.

The opt-in document-start experiment now sets only its own binder to kCancel.
No prerender capability is granted and no gate is bypassed. The policy lives in
Blanc-owned code with one call added to an already-patched browser-client file.
Prerender activation remains unsupported. The new runtime proves explicit
SpeculationRule Mojo-policy cancellation (enum11), normal-load activation values,
first-inline scriptlet protection, untouched DOM, stale-target refusal and a
successful exact-current-target control. This is protected fallback, not a
prerender activation pass or general containment acceptance.

Two broader lifecycle schedules pass on the rebuilt binary. A genuine queued
upstream document_end injection holds one delivery lease and an actual filter
reload. Removing its iframe or crashing the renderer settles the API, drains
the lease, and lets reload complete; the surviving/recovered main DOM is clean.
The diagnostic component exports references to the actual production modules;
it does not replace dispatch, acknowledgement or reload behavior. This does not
qualify crashes inside synchronous native execution, lost native acknowledgements,
background recreation, private uBO, asynchronous effects or original caller identity.

294 tests and 142 module lint checks pass. One guarded incremental build:
46.43 s wrapper / 40.92 s Siso / eight steps. The three-action initial plan expanded
and pruned generated dependencies; existing output/cache retained. Repeated
preparation and the final guard report zero actions (3.48 s). No GN arguments,
toolchain, cold output or 156/permanent profile changes. Fresh footprint:
**40 upstream files / 92 hunks**, one additional hunk and no additional file.
The file ceiling remains binding. Latency remains deferred, including binder and
gate overhead. Electron diagnostic build §8 remains unchecked/unstarted.
Spikes A/B remain in progress, items3–6 unstarted; no baseline promotion.

Failed raw controls and the first lease harness attempt are retained. The latter
assumed Playwright exposed component background pages; the corrected probe uses
a diagnostic module export through the existing popup. All test profiles and
private certificate keys are removed. Native binaries changed only through the
recorded incremental build; payload source/pin lineage remains explicit.
Evidence: `evidence/f12-prerender-recovery-20261018/`.

Final-binary regressions also pass: the bounded BFCache/crash targeting pair
and eight renderer-token/queued-navigation cases, with independent report proofs.
The lifecycle harness still correctly labels prerender activation as a gap.

## Native execution crash recovery — October 18, 2026 EDT

Evidence: [bounded crash and background recreation](evidence/f12-native-recovery-20261018/README.md).
A paused native ExecuteScript plus actual Page.crash exposed a retained weak
document lease; the browser now retires only absent or non-live-renderer
documents. The repaired schedule drains pending1→0, releases held reload and
verifies protected replacement DOM. Actual background-document reload produces
a new realm and ready engine, preserving authored blocking and first-inline
protection. Background-process crash/restart policy and async effects stay open.
One guarded incremental build: 35.07 s wrapper / 31.39 s Siso, six steps from
one planned action. Final guard0; fresh budget40files/92hunks, no new upstream
file. This is routine repair/testing, never Task0's cold-build column.
Latency deferred; Electron diagnostic build unapproved/unstarted. UI migration
to the recent Electron releases is the next owner-requested task, inventoried in
`ui-refresh-20261018.md`; no new UI parity is claimed by this checkpoint.

## Electron 1.38 partial UI preview — October 18, 2026 EDT

See [UI preview evidence](evidence/ui138-preview-20261018/README.md) and
[migration inventory](ui-refresh-20261018.md). Native group and bounded tab actions,
Start Page image/color controls, reviewed Island assets and 79 pure-module tests
pass scoped automation. This is not full migration acceptance: vertical rail,
Recently Closed, site mute, Spaces/Glance, native input and matched visual checks
remain open. The reported 157 content/header overlap was a skipped prepare anchor,
now corrected; final geometry proof is retained separately in the archive.
Latency and Electron diagnostic build remain deferred/unapproved respectively.

## October 18 rail, Recently Closed, site mute and Store follow-up

Implemented native page-width reservation and hit testing for the reviewed vertical rail,
profile-local layout/width preferences, native TabRestoreService entries/restore/forget/clear,
and exact-host session-only site mute with independent private policies and per-tab unmute.
No new upstream path: 40 files / 94 hunks. Native rail switching, page click-through,
keyboard width change, menu site mute and Recently Closed row restore were exercised.
Bridge tests cover new/existing same-host tabs, host transitions, private isolation,
restore/forget and native viewport resize. Restart preserved rail width and closed entries,
cleared site mute, and showed an empty error status. Forget All passes on the final binary.

The owner-requested Chrome Web Store promotion rule is exact-origin and download-campaign
scoped, runs in Chromium's internal isolated world, and hides only the promotional container.
Normal Google installation of Extensity 1.14.0 passed through the native permission sheet
and success bubble; persistence and native removal passed. Test profile removed; original
preview New Tab and Store tabs restored. This is not a UA spoof or permission bypass.

Evidence: `evidence/ui138-rail-store-20261018/` (31 hashed archive members).
Four focused tests and scoped lint pass. Incremental successful wrapper times:
39.57, 57.36 and 41.97 seconds; failed 14.66/35.98-second attempts retained. Final guard zero.
Remaining: full matched visuals, broader rail drag/group/window restoration qualification,
and reconciliation of Chromium's profile-wide Recently Closed list with Electron's window-local
semantics. Glance/Spaces remain unported. The promotion may briefly paint before load callbacks;
its empty wrapper remains labelled in AX, and the separate inline Chrome-install banner is
outside the popover rule. Latency stays deferred; Electron diagnostic build remains unapproved.
Task 0 promotion/upgrade gate and F12 acceptance gaps are unchanged.

## October 18 rail/restore and visual acceptance follow-up

Native drag/keyboard, tab/group/window restoration and private isolation now have bounded
acceptance evidence. Fixed opaque rail renderer paint, redundant rail header offset, loose-tab
end-of-strip movement and insertion before a group's first tab; interior/pinned targets stay
rejected. Matched 1280x800 rail/panel geometry and private color pass; Billboard's 68px header
reservation matches. Component screenshots are not complete composed visual parity: content,
pill controls, Start Page features, narrow/DPI/palette/find and wider lifecycle cases remain gaps.
Evidence: `evidence/ui138-acceptance-20261018/` (hashed archive, failed attempts retained).
79 renderer tests, three promotion tests and scoped lint pass. Two incremental builds 44.17s
and 43.66s; final guard zero. Budget unchanged at 40 files / 94 hunks; no increase needed.
Disposable profiles removed; original two preview tabs restored. Recently Closed remains
profile-wide; Spaces/Glance unported. Plan item 4 started, incomplete; items 3/5/6 unchanged.
Latency deferred, Electron diagnostic build unapproved/unstarted; F12/Task0 gates unchanged.

## October 18 narrow/palette/find diagnostic checkpoint

Native command entry now selects palette mode, full-window scrim/hit region and copied
repeat-command selection behavior; click/typing/new-tab entries remain panel mode. Five
actual Chromium sizes, 1280x700 through 500x400 pass bounded palette geometry/typed-selection
checks. Crowded 500x400 panel/list/footer and rail scrolling pass. Electron reference uses
renderer viewport emulation and diagnostic palette CSS, not native window/keyboard input.
Electron actual find API returns 1/1 fixture match at five sizes; Chromium Blanc find capsule
and bridge remain unported (/find filtered out), native Find not tested while locked.
Native Cmd-L/Escape/outside-click acceptance awaits unlock; no physical checks claimed.
At <=800px native controls require Chromium panel y48 vs Electron y12; full composed/DPI/
private parity remains open. Evidence: `evidence/ui138-narrow-palette-20261018/`.
One 37.69s incremental build, six steps; final guard zero; 40 files / 94 hunks unchanged. Four regressions
and focused host lint pass. Disposable fixtures removed, original preview two tabs restored.
Plan item4 in progress; previous F12/Task0 gates unchanged. Latency deferred; Electron
diagnostic build unapproved/unstarted. Find migration and unlocked input are next gaps.

## October 18 find-capsule checkpoint

The copied Electron 1.38 find capsule now uses Chromium WebContents Find/StopFinding and
window-local result events. Native Find and Find Next/Previous route through the capsule;
/find is restored. Stale request IDs, inactive/foreign tabs and navigation resets are guarded.
The query limit is 4096 UTF-8 bytes; case-insensitive search uses Chromium's engine.

Automated final-binary checks match installed Electron 1.38 on four matches including a
same-origin iframe, next/previous/wrap, Unicode and zero results. Rapid query replacement,
cross-document reset, tab switch/closure, same-document preservation, private isolation,
foreign/inactive rejection, slash listing and empty host status pass. Command helper calls
exercise the Cmd-G destination, not physical shortcuts. Capsule bounds pass at actual native
1280/800/500px widths. Component screenshots are not full composed visual parity.

Two incremental builds: 62.04s and 60.37s wrapper (58.06s and 55.07s Siso), 15 steps each.
Final guard zero actions; footprint 40 upstream files / 96 hunks, within 40/120. Four focused
regressions, syntax and focused host lint pass. No cold build, GN/toolchain change or latency run.

Failed harness attempts retained: private context requested on page endpoint instead of browser
endpoint; immediate post-restart connection before browser readiness; Node 20 invocation without
experimental WebSocket support. Final matrix and commands pass. Diagnostic background flags
were used only in disposable instances because the Mac is locked. Profiles removed and fixture
server stopped; original preview New Tab and Store restored on final binary with empty status.

Native Cmd-F/Cmd-G/Enter/Shift-Enter/Escape/button clicks, focus/passthrough, IME, VoiceOver,
DPI/full composed visual comparisons, PDF/cross-origin frames and crash/BFCache remain untested.
Native input stays pending unlock. Plan visual item 4 remains incomplete; prior F12/Task0 gates
unchanged. Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-20261018/`. Build times are routine incremental work, not Task 0 cold-build cost.

## October 18 expanded find and visual checkpoint

An actual crash of the exact active disposable tab left its find capsule visible. The native
owner now retires the request ID and query/count state and resets the capsule when the primary
renderer exits, without sending StopFinding to a dead renderer. The before-fix regression fails;
the final binary closes the capsule and searches successfully after navigation reload. This is
bounded regular-tab recovery, not every crash/BFCache/private lifecycle combination.

Eight queries agree with installed Electron 1.38: cross-origin iframe (different local port),
open shadow DOM, hidden text exclusion, input/textarea text, Japanese, accented text and no match.
Six component style comparisons (1280/500px, light/dark/private diagnostic theme attributes)
match rendered dimensions, colors, borders, radii, fonts and shadows for the six capsule controls.
Empty, no-match and 300-character no-match states agree on count and outer bounds. Input client/
scroll metrics differ between Chromium152 and157 (24px client difference); recorded, not hidden
or presented as full pixel equivalence. Native CSS sizing and Electron viewport emulation are
explicitly distinct. Matching-DPR clipped component captures supplement the numeric checks;
these are diagnostic theme renders, not physical private-window/input or whole-window parity.

One guarded incremental build: 41.02s wrapper /37.23s Siso, six steps from a one-action plan.
Final guard zero; budget unchanged40 upstream files /96 hunks. Four focused tests pass. No cold
output, GN/toolchain change, latency test, or Electron diagnostic build. Binary hashes recorded.
Failed window-target harness attempt and overstrict client-metric comparison retained. The
first broad crash probe did not establish exact active-target identity; only crash-before/after
with unique URLs qualify that regression. CDP crash and dead-runtime timeouts are recorded.

Disposable profiles and fixture servers removed; original two preview tabs preserved and
reopened on the final binary. Native input stays pending unlock. PDF, BFCache/back-forward,
private crash, IME, VoiceOver, physical display-scale, hover/focus and complete composed visual
parity remain gaps. Plan visual item4 remains incomplete; prior F12/Task0 gates unchanged.
Latency deferred; Electron diagnostic build remains unapproved/unstarted.

Evidence: `evidence/ui138-find-expanded-20261018/`. Build time is routine incremental work, not Task0 cold cost.

## October 18 BFCache/private find checkpoint

Regular A→B→back A→forward B restores the same document instance markers and records
pageshow.persisted=true in both documents. Find closes at each cross-document transition,
then finds the expected two/three matches after each actual BFCache restore. Private A→B→back A
also restores the same document with persisted pageshow and successful find. No forced BFCache
flags, Playwright browser defaults or assumed reload-as-cache pass were used.

A fresh private window exposed a theme gap: direct-open Find skipped the copied panel renderer's
private-theme application. The prototype host now applies or clears that scope from its active
native tab snapshot before opening Find. This is an assets-only integration fix; copied Electron
source is unchanged. The first failing theme assertion is retained, not counted as a pass.

Private search, cross-window and inactive-tab rejection, tab-switch/navigation resets, reopen,
BFCache restore and exact active private renderer crash/reload pass. Regular listeners receive
no private search results; private Recently Closed stays empty. Disposing the private context
removes its targets, regular find still works and the regular theme remains non-private. Crash
transport/dead-runtime timeouts are retained. This tests one bounded private context, not every
multi-window/subframe/process-sharing schedule or durable profile-forensics guarantee.

No native compilation. Assets-only prepare 0.05s; final guard zero actions (3.39s); native binary
hashes identical to the prior expanded-find checkpoint. Native patch footprint remains 40 files /
96 hunks because no native/preparation source changed. Four focused regressions, host syntax and
focused lint pass. Disposable profile/server removed; original preview's two tabs restored.

Native input remains pending unlock. PDF, IME/VoiceOver, physical focus/hover/display-scale,
BFCache eviction/ineligible pages, private forward restoration, private subframe crashes and full
composed visual parity remain gaps. No Electron comparison is claimed for these lifecycle runs;
installed Electron was not launched. Visual plan item4 remains incomplete. Latency deferred;
Electron diagnostic build unapproved/unstarted; prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-lifecycle-20261018/`. No change to the Task0 cold-build column.

## October 19 PDF and private lifecycle find checkpoint

An authored two-page text PDF contains three occurrences of needle. Chromium's real PDF viewer
loads it and native Find reports all three matches in regular and private windows. Regular next/
previous returns 1→2→1; no-match returns zero in both windows. PDF→HTML navigation resets the
capsule and HTML search succeeds. Private theme and cross-window rejection pass; private search
produces no regular-window result events. PDF fixture pages and the actual viewer capture were
visually inspected. This is a simple selectable-text PDF, not OCR, encrypted or form-document coverage.

Private A→B→back A→forward B preserves each document instance and reports persisted pageshow;
find resets at transitions and returns the expected three matches after forward restoration.
Removing a cross-origin iframe during an open find session leaves zero child matches on a fresh
query while parent text remains searchable. Closing the active searched tab resets the capsule;
private Recently Closed remains empty. Context disposal removes its targets and regular host
status remains empty. These are real bridge/engine checks, not physical key or pointer events.

No production code changes, preparation or compilation were needed. Build guard zero actions
(5.38s); native hashes unchanged from the expanded-find checkpoint, footprint remains 40 files /
96 hunks. Focused host lint passes. No repeat unit suite is claimed for this evidence-only change.
Disposable profile/server removed; original two preview tabs restored. Initial Poppler rendering
emitted Fontconfig configuration/cache warnings; a fixture-local config/cache rerender completed
and both pages were inspected. No system font configuration changed.

Remaining: PDF wrap/end-page selection, PDF reload/crash/plugin lifecycle, scanned/encrypted/forms,
cache eviction/ineligible pages, private subframe crashes/process sharing, IME/VoiceOver/physical
focus/display scale and full composed visual parity. No new Electron comparison was run. Native
input remains pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted.
Visual plan item4 remains incomplete; previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-pdf-20261019/`. No change to Task0 cold-build costs.

## October 19 PDF reload/crash checkpoint

Regular and private selectable-text PDF find each return three matches before reload, after
Page.reload, after an actual outer-page renderer crash and recovery navigation, and after switching
away and reselecting the PDF tab. Reload/crash/tab transitions reset the capsule. The crashed target
rejects/times out a Runtime evaluation; crash command responses are retained. Private theme stays
private, closing the searched private PDF resets find, private Recently Closed remains empty and
private context disposal succeeds. Page.crash selected the PDF URL's outer page target: this does
not prove independent PDF plugin-process crash recovery. No physical keyboard/mouse acceptance.

No production changes or compilation. Guard zero actions (3.59s); native hashes match the prior
PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated for evidence-only
work). Setup failures were a sandbox ps denial and immediate CDP-readiness race; both occurred
before test cases and are recorded in attempts.json. Final browser results are in results.json.
Disposable profile/server removed; existing preview tabs and empty host status verified without
relaunching the preview. No new Electron comparison, unit suite or PDF visual comparison claimed.

Remaining: independently selected PDF plugin failure, scanned/encrypted/forms and selection/wrap,
cache eviction/ineligible pages, private subframe crashes/process-sharing, IME/accessibility/full
visual parity. Native input pending unlock, latency deferred, Electron diagnostic build unapproved
and unstarted. Visual item4 and previous F12/Task0 gates remain incomplete/unchanged.

Evidence: `evidence/ui138-find-pdf-recovery-20261019/`. No Task0 cold-cost change.

## October 19 PDF-plugin/private subframe checkpoint

Regular and private tests separately select exactly one process with both the disposable profile
argument and --pdf-renderer, record its command line, kill that process, verify its exit, and prove
the outer PDF page retains its JavaScript marker. Reload resets Find and restores all three text
matches in both profiles. This closes the bounded independent PDF-renderer recovery case rather
than repeating the earlier outer-page crash. The find capsule remains open immediately after
plugin death in both profiles; fresh-query/no-reload behavior and crash-state UI handling remain
unqualified. The recovery pass does not imply that the capsule automatically clears on plugin exit.

A private cross-site iframe (localhost child inside 127.0.0.1 parent) is independently exposed as
an iframe CDP target. Page.crash times out as recorded; parent marker survives, parent search
returns one match and child search returns zero. Navigating the child again restores two matches;
removing it returns zero. Private theme, closed-tab empty Recently Closed and context disposal
pass. No broader process-sharing or simultaneous-frame failure claim is made.

Evidence-only, no production changes or compilation. Guard zero actions (4.14s); native hashes
match the previous PDF checkpoint. Footprint remains 40 upstream files/96 hunks (not re-enumerated).
Disposable profile/server removed; preview original tabs and empty status verified. No physical
input, Electron comparison or repeat unit suite claimed. The fixture is the previously authored
selectable-text PDF, unchanged; no new rendering/visual comparison is claimed.

Remaining: plugin crash-state capsule handling and no-reload queries, complex/scanned/encrypted/
form PDFs, concurrent renderer failures, cache eviction/ineligible pages, wider private frame
process-sharing, IME/accessibility/full visual parity. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-plugin-20261019/`. No Task0 cold-cost change.

## October 19 PDF-plugin find reset fix

The active WebContents observer now retires its find session when a PDF renderer frame is deleted,
including independent plugin-process exit. The shared renderer-loss reset invalidates request ID,
query and cached counts, then closes the capsule; late find replies are ignored. Ordinary subframe
deletion does not take this path. Main-frame crash behavior uses the same reset helper.

Final native tests kill a uniquely identified disposable --pdf-renderer in regular and private
windows and prove the outer page's marker survives. The capsule now closes in both cases (prior
checkpoint recorded false). Reopening find WITHOUT reloading returns final zero matches for both
needle and a missing query, without hanging; this does not resurrect the crashed PDF or claim its
text remains searchable. Reload restores three matches. Private cross-site iframe crash, parent
search, missing child search, child recovery/removal, theme and closure regressions also pass.

One guarded incremental build: 38.53s wrapper /34.85s Siso, six steps, from a one-action plan.
Final guard zero (4.68s). Fresh footprint 40 upstream files/96 hunks, within 40/120. No new upstream
file, cold output, GN argument or toolchain change. Native binary hashes and invocation records
are archived. Disposable profile/server removed, original preview relaunched on the final binary
and original tabs/empty status verified. No new unit suite, Electron comparison or physical-input
claim; the actual native regression is the acceptance test.

Remaining: complex/scanned/encrypted/forms PDFs, multi-plugin/concurrent failures, broader cache/
private process-sharing/accessibility/full visual cases. Native input pending unlock; latency
explicitly deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and earlier
F12/Task0 gates remain incomplete/unchanged. Build time is routine, not Task0 cold cost.

Evidence: `evidence/ui138-find-plugin-fix-20261019/`. No Task0 cold-cost change.

## October 19 complex PDF/concurrent crash checkpoint

An authored four-page PDF adds two-column text, 90-degree rotated text, an image-only page and
an interactive AcroForm field. Structure checks confirm four pages, field value and widget; all
four Poppler page renders were visually inspected. Regular/private native Find each returns two
column matches, one rotated match and one form-label match. The actual form-field value and
image-only text both return final zero matches in both profiles: these are observed limitations,
not OCR or full form-content acceptance. No password-protected PDF check is claimed.

With regular and private PDFs open together, exactly two owned --pdf-renderer processes are
selected from the isolated profile and SIGKILL is sent in one host-clock-millisecond batch. Both
processes exit; both outer-page markers survive; each capsule closes. Reopened no-reload search
completes with zero matches, and reload independently restores two column/one rotated matches.
The kill calls share a batch, not a claim of simultaneous OS scheduling or exhaustive concurrent
crash coverage. Private context disposal succeeds. No main-plus-plugin or browser/GPU failure.

No production changes or compilation; guard zero actions (3.53s), binary hashes match the PDF
reset fix. Footprint remains40 files/96 hunks (not re-enumerated for evidence-only work). Disposable
profile/server removed; preview original tabs/empty status verified without restart. No new unit
suite, Electron comparison, physical input or performance claim. The source PDF, structural checks,
rendered pages, runtime observations and harness are archived.

Remaining: encrypted/password documents, XFA and form edits, OCR, embedded fonts/large PDFs,
main-plus-plugin and wider concurrent failure schedules, cache/process sharing/accessibility/full
visual coverage. Native input pending unlock; latency deferred; Electron diagnostic build remains
unapproved/unstarted. Plan item4 and previous F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-complex-20261019/`. No Task0 cold-cost change.

## October 19 protected/large PDF checkpoint

A two-page AES-256 PDF uses an explicitly nonsecret fixture password. Structural checks verify
wrong-password rejection and successful decryption. The actual Chromium viewer password dialog
is observed in its extension target: regular/private runs submit a wrong password through the
real dialog control and observe invalid=true, then submit the correct fixture password and find
two secretprobe matches. A find request before unlock reports no positive matches in its observed
window; this is not an exhaustive security audit or a physical password-entry check.

The authored larger PDF is 250 pages and 15,199,513 bytes, including one high-entropy image and
text on every page. Both profiles return251 substring matches for pageprobe (one per page plus
lastpageprobe), one unique last-page match, zero for absentprobe, and one last-page match after
reload. This is bounded functional acceptance, not throughput/latency/memory qualification.
Protected page1 and large page250 were rendered and visually inspected; not all250 pages.

No production changes or compilation. Guard zero actions3.97s; native hashes match the PDF reset
fix. Footprint remains40files/96hunks (not re-enumerated for evidence-only work). Fixture profiles/
server removed; original preview tabs and empty status preserved. PDF bytes, generators, structure,
sampled renders, runtime results and harness are archived; fixture password is public test data.

Remaining: password persistence/re-prompt after restart, permissions-only encryption/other crypto,
XFA/form edits/OCR, embedded fonts/malformed/extreme PDFs, wider concurrent/lifecycle/cache/
accessibility/fullvisual coverage. No Electron comparison or physical input claim. Native input
pending unlock; latency deferred; Electron diagnostic build unapproved/unstarted. Plan item4 and
prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-20261019/`. No Task0 cold-cost change.

## October 19 PDF password lifecycle checkpoint

Eight actual viewer-dialog observations pass across regular/private windows: initial open,
Page.reload, closing/reopening the same URL, and reopening the same URL after a full browser
restart using the same disposable profile. Every checkpoint presents a visible password dialog
with an empty input. Pre-unlock search observations contain no positive result; correct re-entry
restores two matches. The fixture is unchanged AES-256 with a public, nonsecret test password.

The first browser exits with a private PDF open. Its PID is confirmed absent before relaunch;
the second browser has a different PID and uses the same profile directory. Startup targets
contain only New Tab and host, no prior private PDF. The post-restart regular/private URLs are
opened explicitly: this does not qualify automatic session restore, crash restore or Recently
Closed restoration. These observations establish re-prompt behavior for the tested paths, not
proof that no password bytes ever reach memory/disk or a general persistence/security audit.

No production changes or compilation. Guard zero5.64s; hashes match the PDF reset binary;
footprint remains40files/96hunks (not re-enumerated). No latency run, unit-suite repeat, Electron
comparison or physical input claim. Disposable profile/server deleted; preview original tabs
and empty host status preserved. Before/after results, PIDs, fixture and harness archived.

Remaining: automatic session/crash/RecentlyClosed restore, password-manager integration,
permissions-only encryption/other algorithms, XFA/OCR/form edits, extreme PDFs and wider
lifecycle/accessibility/fullvisual coverage. Native input pending unlock; latency deferred;
Electron diagnostic build unapproved/unstarted. Plan item4 and prior F12/Task0 gates unchanged.

Evidence: `evidence/ui138-find-password-life-20261019/`. No Task0 cold-cost change.

## October 19 PDF session/crash-restore checkpoint — blocked on startup crash

Normal saved-session restoration PASSES using --restore-last-session in the same disposable
profile. The regular protected PDF URL is present without a createTarget/navigation call, prompts
with an empty password field, exposes no positive pre-unlock result during the observation, and
returns two matches after re-entry. A private PDF open at shutdown is absent from restored targets.
The regular/private seed checks and a new private PDF opened after normal restoration also pass.
This is actual session restoration, not the earlier explicit URL reopen test; no native button input.

Crash restoration FAILS before password checks. After unlocking regular/private PDFs and allowing
session saving, the exact owned browser PID is SIGKILLed. All owned browser processes are checked
gone before the same profile is relaunched with --restore-last-session. Startup terminates at
app_menu_button.cc:61 CHECK(element), through AppMenuButton::GetAnchor and
SessionCrashedBubbleView::ShowBubble. The hidden Island-only app menu selects its fallback anchor,
which is unavailable at this point. The fatal stack is archived. The first CDP fetch failure was
initially suspected to be readiness; a second failed read plus the fatal log disproved that. Neither
is a successful crash-restore test. No recovery dialog was suppressed and no pass claimed.

No repair or production change in this checkpoint. A direct edit of the failing app-menu file would
add an upstream file beyond the current40-file inventory; a repair within existing patches or an
explicit budget revision is still required. No compile; guard zero3.59s, binary hashes unchanged,
footprint40files/96hunks not re-enumerated. Disposable profile/server removed; preview preserved.
Crash-restore password behavior remains blocked; normal session restore is separately qualified.

Native input pending unlock, latency deferred, Electron diagnostic build unapproved/unstarted.
Other restore paths, encryption formats, broader PDF/lifecycle/accessibility/fullvisual remain
open. Plan item4 and prior F12/Task0 gates unchanged. This is a failed acceptance checkpoint,
not evidence that Chromium's generic recovery behavior is safe in the Island-only prototype.

Evidence: `evidence/ui138-find-session-20261019/`. No Task0 cold-cost change.

## October 19 crash-recovery anchor repair

The existing BrowserView toolbar-provider integration now delegates through a Blanc-owned
adapter. App-menu bubbles receive the Island View anchor; other toolbar/menu operations
forward to Chromium. The recovery bubble is preserved, not suppressed. No new upstream
file: inventory is 40 files / 97 hunks (one additional BrowserView hunk; below 120).
The first implementation compiled but exposed a shutdown dangling toolbar pointer because
ToolbarView dies before the Island owner. A ViewObserver now clears that pointer at deletion.
The failed attempt and diagnostic are retained; final normal shutdown has no fatal/dangling report.

Two guarded incremental builds: 62.76 seconds (15 executed steps), then 38.61 seconds
(six steps) for the lifetime repair. Final guard: zero actions in 4.06 seconds. No cold
output, toolchain, GN-argument or latency changes. The inventory was measured before the
Blanc-owned lifetime repair, which adds no upstream file/hunk; final source patch is archived.

Actual normal same-profile session restoration passes: regular protected PDF restored without
manual navigation, empty password re-prompt, no observed positive pre-unlock result, two matches
after re-entry, private PDF excluded. The owned browser was then SIGKILLed and relaunched.
It survives, and Session.SessionCrashed.Bubble records SHOWN=1, ERROR=0. The harness initially
expected automatic crash restoration; that assertion correctly failed because the real recovery
bubble waits for user choice. Mac locked, so its native Restore button and visual placement
remain NOT RUN. No automatic crash-restore/password pass is claimed.

Separately, the existing Recently Closed bridge restores the saved window after the crash:
regular PDF password field is empty, re-entry yields two matches, private URL absent. This
is saved-entry restoration, not acceptance of the recovery bubble button. Harness readiness
failures and the corrected asynchronous helper are recorded in outcome.json. Disposable profile
and server removed; original preview New Tab/Web Store tabs restored on final binary with empty
status. Native input pending unlock; latency deferred; Electron diagnostic build unapproved.
Broader recovery/UI/accessibility and prior F12/Task0 gates remain open. Plan item4 incomplete.

Evidence: `evidence/ui138-crash-anchor-20261019/`. Routine incremental cost only; Task0 cold column unchanged.

## October 19 repeated recovery/lifecycle checks

Two same-profile crash/recovery rounds survive with Chromium's recovery-bubble SHOWN histogram.
Saved windows restored through the existing Recently Closed bridge contain the regular protected
PDF and exclude the private PDF. Both rounds re-prompt with an empty password field and return
two matches after re-entry; no positive pre-unlock matches were observed. These are bridge tests,
not activation of the native recovery button. Owned PID/command and persisted Crashed marker
are checked before subsequent kills. A third crash relaunch also shows the bubble successfully.

Closing the browser while the recovery decision is unresolved and restarting offers the bubble
again. The original assertion expecting no bubble failed and is retained as a harness assumption;
no dismiss/Restore choice was exercised. Three private PDF context creation/disposal cycles pass
without removing existing regular targets. Final orderly shutdown logs no fatal/dangling pointer.
Normal session restoration also passes again. An initial SIGKILL run automatically restored the
PDF and re-prompted, but its prior disk exit marker was not captured: suspected persistence timing
is not proven. Histogram/CDP readiness failures remain in invocation records; subsequent probes
poll readiness explicitly. No general crash policy or password-storage security claim.

Evidence-only: no production changes or compilation. Guard zero actions in5.61s; native hashes
unchanged. Footprint remains40files/97hunks, not re-enumerated. Disposable profile/server removed;
original preview New Tab/Web Store tabs preserved with empty status. Native recovery buttons,
focus/visual placement and physical input remain pending unlock. Latency deferred; Electron
diagnostic build unapproved/unstarted. Wider lifecycle/corrupt-session/OS restart behavior and
prior F12/Task0 gates remain open; plan item4 incomplete.

Evidence: `evidence/ui138-recovery-repeat-20261019/`. No cold-build cost change.

## October 19 corrupt-session checks

Seven bounded cases ran in offline copies of disposable regular/private PDF session seeds.
Mutations were made only after owned browser processes exited: invalid first eight bytes,
half-file truncation (retaining header), or deletion of Session_* files. Before/after sizes and
SHA-256 values are recorded. Intact control restores the regular PDF; private PDF never restores.
The first matrix damages only Default/Sessions while Sessions_Encrypted remains intact;
restoration there does not establish recovery from loss of both stores. A fresh seed supplies
three cases damaging both stores. Tabs_* and other profile data remain untouched.

| Case | Original regular PDF restored | New page/search and next clean restore |
| --- | --- | --- |
| intact | True | pass |
| invalid-header | True | pass |
| truncated | True | pass |
| missing | True | pass |
| both-invalid-header | False | pass |
| both-truncated | False | pass |
| both-missing | False | pass |

A fallback to New Tab is startup resilience with original-session data loss, not successful
restoration. Every case accepts a new authored page, native Find returns one match, and that
new page restores and searches on the next clean launch. No private URL appears. No fatal or
dangling-pointer diagnostic appears across the run. These are CDP/bridge checks; no recovery
button, filesystem permission failure, partial-write concurrency, Tabs_* corruption, encrypted
key loss, OS reboot or general profile-corruption resilience is claimed.

Evidence-only: no production changes or compilation; guard zero3.62s, binary hashes unchanged,
40files/97hunks not re-enumerated. Disposable profile copies/server removed, original preview
preserved. Native input pending unlock, latency deferred, Electron diagnostic build unapproved.
Plan item4 and broader F12/Task0 gates remain open; no cold-build column change.

Evidence: `evidence/ui138-corrupt-session-20261019/`.
