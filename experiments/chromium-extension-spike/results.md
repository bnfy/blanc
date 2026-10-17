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
