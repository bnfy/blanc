# Queue 3 undefined-case classification

Candidate `macos-f0bd093f621c613f`; complete inventory, 640 executable cases.

Classification uses observed adapter errors plus explicit source evidence. Missing adapter does not establish that the product passes or fails. Missing feature can coexist with missing adapters. Platform cases keep their raw runner result. No new features were implemented from this inventory.

| Case | Class | Evidence / remaining work |
| --- | --- | --- |
| F41-named-workspaces.feature:4:plain | missing adapter | Space action needs an adapter: metrics |
| F41-named-workspaces.feature:16:plain | missing adapter | Page shim lacks getByRole |
| F41-named-workspaces.feature:22:plain | missing adapter | Page shim lacks getByRole |
| F41-named-workspaces.feature:46:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| F41-named-workspaces.feature:57:plain | missing adapter | Space action needs an adapter: fail-session-commit |
| F41-named-workspaces.feature:69:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| F41-named-workspaces.feature:103:plain | missing adapter | Page shim lacks getByRole |
| F41-named-workspaces.feature:153:plain | missing adapter | native hook adapter missing: pressOverlayKey |
| F41-named-workspaces.feature:162:plain | missing adapter | native hook adapter missing: emulateReducedMotion |
| F41-named-workspaces.feature:189:plain | missing adapter | native hook adapter missing: pressOverlayKey |
| F41-named-workspaces.feature:196:plain | missing adapter | native hook adapter missing: emulateReducedMotion; native hook adapter missing: pressOverlayKey |
| F41-named-workspaces.feature:204:plain | missing adapter | native hook adapter missing: pressOverlayKey, spacesMenuExitState; native hook adapter missing: spacesMenuExitState |
| F41-named-workspaces.feature:246:plain | missing adapter | native hook adapter missing: raceSwitchBackDuringQuiet |
| F41-named-workspaces.feature:254:plain | missing adapter | native hook adapter missing: setQuietTabs |
| F41-named-workspaces.feature:262:plain | missing adapter | native hook adapter missing: setQuietTabs |
| F41-named-workspaces.feature:396:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:403:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:413:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:423:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:431:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:439:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:449:plain | missing adapter | step definition missing |
| F41-named-workspaces.feature:480:plain | missing adapter | Batch operation is not built: batch-close |
| arc-spaces-import.feature:7:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:14:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:23:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:31:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:39:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:46:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| arc-spaces-import.feature:53:plain | not applicable to macOS | Scenario explicitly targets Windows/Linux or Linux; raw undefined retained. step definition missing |
| arc-spaces-import.feature:60:plain | missing fork feature | Arc sidebar/Spaces importer absent; first_run.inc kBrowsers omits Arc; tracker F45 unstarted. First runner gap: step definition missing |
| downloads.feature:13:plain | missing adapter | step definition missing |
| glance.feature:24:plain | missing adapter | native hook adapter missing: setTabIdleSince |
| glance.feature:31:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:38:plain | missing adapter | native hook adapter missing: simulateMediaStarted |
| glance.feature:45:plain | missing adapter | native hook adapter missing: simulateMediaStarted |
| glance.feature:117:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:127:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:178:plain | missing adapter | native hook adapter missing: zoomLevel |
| glance.feature:187:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. native hook adapter missing: setOnePasswordConfig |
| glance.feature:197:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. native hook adapter missing: fillStatusState; native hook adapter missing: setOnePasswordConfig; step definition missing |
| glance.feature:207:plain | missing adapter | native hook adapter missing: setMouseGestures |
| glance.feature:221:plain | missing adapter | Keyboard shim lacks key meta |
| glance.feature:234:plain | missing adapter | native hook adapter missing: zoomLevel |
| glance.feature:253:plain | missing adapter | Browser command needs an adapter: find |
| glance.feature:264:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:273:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:280:plain | missing adapter | Shipping main-process evaluate needs a native adapter |
| glance.feature:287:plain | missing adapter | Browser command needs an adapter: find |
| glance.feature:296:plain | missing adapter | Browser command needs an adapter: new-tab |
| glance.feature:345:plain | missing adapter | glanceHeaderMotion needs an adapter |
| glance.feature:459:plain | missing adapter | Key input shim lacks  |
| glance.feature:471:plain | missing adapter | native hook adapter missing: tooltipViewState |
| glance.feature:489:plain | missing adapter | Browser command needs an adapter: find |
| glance.feature:498:plain | missing adapter | native hook adapter missing: closeGlanceAndReadCard; native hook adapter missing: glanceCardMotion |
| glance.feature:506:example-515 | missing adapter | native hook adapter missing: closeTabAndReadGlance |
| glance.feature:506:example-516 | missing adapter | native hook adapter missing: closeTabAndReadGlance |
| glance.feature:519:plain | missing adapter | native hook adapter missing: openFirstGlanceAndRead |
| island-and-commands.feature:320:plain | not applicable to macOS | Scenario explicitly targets Windows/Linux or Linux; raw undefined retained. The fork strip reports no window-button geometry to the host |
| link-routing.feature:8:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:16:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:28:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:37:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:50:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:62:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| link-routing.feature:79:plain | missing fork feature | Appearance::RouteActiveSite returns unavailable (appearance.cc); tracker F60 unstarted. First runner gap: step definition missing |
| local-profiles.feature:7:plain | missing adapter | step definition missing |
| local-profiles.feature:17:plain | missing adapter | step definition missing |
| local-profiles.feature:27:plain | missing adapter | step definition missing |
| mini-window.feature:10:plain | missing fork feature | Tracker F61 says v1.46.0 feature not yet in fork; no native mini-window handler. First runner gap: step definition missing |
| mini-window.feature:18:plain | missing fork feature | Tracker F61 says v1.46.0 feature not yet in fork; no native mini-window handler. First runner gap: step definition missing |
| mini-window.feature:24:plain | missing fork feature | Tracker F61 says v1.46.0 feature not yet in fork; no native mini-window handler. First runner gap: step definition missing |
| mini-window.feature:30:plain | missing fork feature | Tracker F61 says v1.46.0 feature not yet in fork; no native mini-window handler. First runner gap: step definition missing |
| mini-window.feature:36:plain | missing fork feature | Tracker F61 says v1.46.0 feature not yet in fork; no native mini-window handler. First runner gap: step definition missing |
| navigation-and-context-menu.feature:12:example-23 | missing adapter | V12: Kagi is added under chrome://settings → Manage search engines |
| navigation-and-context-menu.feature:77:plain | missing adapter | V12: a custom search address is added under chrome://settings → Manage search engines |
| navigation-and-context-menu.feature:83:plain | missing adapter | V12: a custom search address is added under chrome://settings → Manage search engines |
| navigation-and-context-menu.feature:91:plain | missing adapter | V12: a custom search address is added under chrome://settings → Manage search engines |
| navigation-and-context-menu.feature:100:plain | missing adapter | step definition missing |
| newtab-layouts.feature:126:plain | missing fork feature | seedBillboardOverflowHistory: real history::TopSites caps GetMostVisitedURLs at 10 (kTopSitesNumber); needs an owner-approved native design decision, not a test op |
| newtab-layouts.feature:134:plain | missing adapter | native hook adapter missing: readStartPageFontUsage; native hook adapter missing: readStartPageLayoutFit |
| permissions-and-auth.feature:13:plain | missing adapter | step definition missing |
| platform-services.feature:25:plain | missing fork feature | In-app updater is unstarted (tracker F22); beta build remains on owner hold. step definition missing |
| platform-services.feature:50:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:64:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:76:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:88:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:98:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:105:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| platform-services.feature:112:plain | missing fork feature | Deliberate F38 policy: no 1Password SDK in fork; Chrome Web Store extension is the chosen path. These steps demand shipping SDK integration. step definition missing |
| private-tabs.feature:7:plain | missing adapter | step definition missing |
| private-tabs.feature:16:plain | missing adapter | step definition missing |
| private-tabs.feature:24:plain | missing adapter | step definition missing |
| private-tabs.feature:40:plain | missing adapter | step definition missing |
| quiet-tabs.feature:28:example-45 | missing adapter | Electron listener counts/will-prevent-unload contract has no native counterpart; real native refusal verified separately. Chromium has no Electron WebContents listener counts |
| reader-mode.feature:7:plain | missing fork feature | Shipping Reader Mode contract not ported: Navigation::ToggleReaderMode returns false. Host separately exposes Chromium reading mode; its parity is unverified. First runner gap: step definition missing |
| reader-mode.feature:13:plain | missing fork feature | Shipping Reader Mode contract not ported: Navigation::ToggleReaderMode returns false. Host separately exposes Chromium reading mode; its parity is unverified. First runner gap: step definition missing |
| reader-mode.feature:20:plain | missing fork feature | Shipping Reader Mode contract not ported: Navigation::ToggleReaderMode returns false. Host separately exposes Chromium reading mode; its parity is unverified. First runner gap: step definition missing |
| send-to-device.feature:7:plain | missing adapter | step definition missing |
| send-to-device.feature:15:plain | missing adapter | step definition missing |
| send-to-device.feature:24:plain | missing adapter | step definition missing |
| send-to-device.feature:33:plain | missing adapter | step definition missing |
| send-to-device.feature:41:plain | missing adapter | step definition missing |
| send-to-device.feature:49:plain | missing adapter | step definition missing |
| send-to-device.feature:56:plain | missing adapter | step definition missing |
| send-to-device.feature:63:plain | missing adapter | step definition missing |
| settings-and-theming.feature:49:plain | missing fork feature | Dark websites is unported: Appearance::ToggleDarkSiteOnActiveSite returns null. step definition missing |
| settings-and-theming.feature:57:plain | missing fork feature | Dark websites is unported: Appearance::ToggleDarkSiteOnActiveSite returns null. step definition missing |
| settings-and-theming.feature:65:plain | missing fork feature | Dark websites is unported: Appearance::ToggleDarkSiteOnActiveSite returns null. step definition missing |
| settings-and-theming.feature:74:plain | missing fork feature | Dark websites is unported: Appearance::ToggleDarkSiteOnActiveSite returns null. step definition missing |
| shared-spaces.feature:4:plain | missing adapter | step definition missing |
| shared-spaces.feature:11:plain | missing adapter | step definition missing |
| shared-spaces.feature:17:plain | missing adapter | step definition missing |
| shared-spaces.feature:23:plain | missing adapter | step definition missing |
| shared-spaces.feature:29:plain | missing adapter | step definition missing |
| shared-spaces.feature:35:plain | missing adapter | step definition missing |
| shared-spaces.feature:41:plain | missing adapter | step definition missing |
| shared-spaces.feature:47:plain | missing adapter | step definition missing |
| shared-spaces.feature:57:example-62 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-63 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-64 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-65 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-66 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-67 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-68 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-69 | missing adapter | step definition missing |
| shared-spaces.feature:57:example-70 | missing adapter | step definition missing |
| shared-spaces.feature:73:plain | missing adapter | step definition missing |
| shared-spaces.feature:80:plain | missing adapter | step definition missing |
| shared-spaces.feature:87:plain | missing adapter | step definition missing |
| shared-spaces.feature:94:plain | missing adapter | step definition missing |
| shared-spaces.feature:103:plain | missing adapter | step definition missing |
| shared-spaces.feature:111:plain | missing adapter | step definition missing |
| shared-spaces.feature:119:plain | missing adapter | step definition missing |
| shared-spaces.feature:132:plain | missing adapter | step definition missing |
| shared-spaces.feature:143:plain | missing adapter | step definition missing |
| shared-spaces.feature:155:plain | missing adapter | step definition missing |
| shared-spaces.feature:165:plain | missing adapter | step definition missing |
| shared-spaces.feature:175:plain | missing adapter | step definition missing |
| shared-spaces.feature:181:plain | missing adapter | step definition missing |
| shared-spaces.feature:193:plain | missing adapter | step definition missing |
| shared-spaces.feature:204:plain | missing adapter | step definition missing |
| shared-spaces.feature:211:plain | missing adapter | step definition missing |
| site-certificate-safety.feature:41:plain | missing adapter | Native snapshot adapter does not expose closedEntry.held; later eviction-cap path is also absent (tabs.mjs setCertificateExceptionCap). |
| split-view.feature:201:plain | missing adapter | native hook adapter missing: raiseTabView |
| supporter-and-session.feature:12:plain | missing adapter | native hook adapter missing: setSupporterActive |
| supporter-and-session.feature:26:plain | missing adapter | step definition missing |
| tab-archive.feature:8:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:15:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:22:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:29:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:36:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:43:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:49:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:56:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:64:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:71:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:79:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:87:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:94:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:104:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:113:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-archive.feature:122:plain | missing fork feature | host.js archive.list returns []; restore/forget return false; F52 not in fork. First runner gap: step definition missing |
| tab-drag.feature:136:plain | missing adapter | The fork host discards setOverlayDragState; no overlay drag flag exists to read |
| tab-migration.feature:7:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:15:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:26:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:35:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:43:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:50:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:58:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:66:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:74:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:81:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:88:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:95:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:102:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:109:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tab-migration.feature:116:plain | missing fork feature | Open-tab migration F40 unstarted; first_run.inc ImportSource imports BookmarkModel entries only, with no reviewed session-tab migration path. First runner gap: step definition missing |
| tabs-and-groups.feature:240:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:249:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:256:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:270:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:278:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:284:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. Undefined native adapter: pinnedHome |
| tabs-and-groups.feature:292:plain | missing fork feature | Pinned-home F48 has no home URL state or handlers in native source/patches; pin state only records pinning. native hook adapter missing: pinnedHome; native hook adapter missing: returnPinnedHome, pinnedHome |
| tabs-and-groups.feature:392:plain | missing adapter | Native snapshot adapter does not expose state.tabs.1.audioMuted |

## Source basis

- `blanc/browser/ui/first_run.inc:177`: native browser import source list; tracker F45.
- `blanc/browser/ui/browser_api/appearance.cc:58`: Dark websites and routing unavailable.
- `blanc/browser/ui/browser_api/navigation.cc:211`: shipping Reader Mode method returns false; `host.js:1814` exposes the separate native reading-mode command.
- `blanc/island/host.js:1531`: Tab Archive is not in the fork.
- `tracker.json`: F61 mini windows absent, F22 updater unstarted, F38 deliberate no-SDK policy. Shared Spaces/Send have working native gate evidence despite older tracker stages; those undefined shipping cases are adapters.
- `tests/adapters/pages.mjs:132`: native Top Sites limit; `tests/adapters/tabs.mjs:402`: no certificate-choice cap.
- `tests/adapters/quiet-protections.mjs:46`: Electron-only observation contract; native lifecycle evidence is recorded in CODEX-NOTES-quiet.md.
