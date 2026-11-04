# Chromium replacement status

Execution contract: spec and plan approved at e884a6564. Active slice: F0 Foundation.

## Authorization
F0.1–F0.6 and F0.8, with necessary incremental builds, approved. F0.3 and S1
approved 2026-10-31, including one cold release-channel build (new output
folder, pinned toolchain), a pf firewall anchor scoped to the test user for
S1.1, and a Standard test user the owner creates (`blanc-test`, created).
Xcode's Metal Toolchain (27B47) installed with owner approval 2026-10-31;
the cold release build needed it. Pinned environments unchanged.
D1 decided 2026-10-31: in-window private tabs.
D7, F0.7, cold builds, new machines, D2/D4–D6/D8/V2 and replacement D3
remain pending. D3 beta-only no-DRM exception accepted; EME notice/handoff required.

## Current work
- **Branch and PRs (owner, 2026-11-02):** the fork's integration branch is
  `chromium/migration` (renamed from `codex/f12-socket-speculation`), with
  [PR #1304](https://github.com/bnfy/blanc/pull/1304) as its integration PR
  into `main`, not merged until the fork is ready. It replaces #1028, which
  GitHub closed when the branch was renamed. Each new piece of work
  gets its own branch and small PR into `chromium/migration`.
- **Release-candidate readiness tracker:**
  https://claude.ai/artifact/BKaBQpYoAMMeUmqBfVbBPA (private to the owner).
  It shows each shipping acceptance case's latest macOS result (the full run
  of 2026-11-01 overlaid by every targeted run since, so it mixes
  candidates), the tracker rows' stages per platform and the gates outside
  the code. Refresh it after each piece of work: `node chromium/tools/
  rc-readiness.mjs --baseline <evidence>/s1-full-renderer-2/baseline.json
  --runs <evidence> --out <dir>`, upload the three files to the dashboard
  and point its datasets at them. Gates live in that tool; edit them with
  this file.
- F0.1/F0.2/F0.4/F0.8 as before.
- **F0.3 channel identity built; identity spike pending.** Patch 0005 gives
  each channel its own data folder (`CrProductDirName`) and Keychain item:
  preview is Blanc Prototype / `day.blanc.prototype` / "Blanc Chromium
  Preview" / "Blanc Chromium Preview Safe Storage"; release is Blanc /
  `me.bnfy.bowser` / "Blanc Browser" / "Blanc Browser Safe Storage". Neither
  shares a folder or Keychain item with Electron Blanc ("Blanc", "Blanc Safe
  Storage"); `tools/channel-identity.test.mjs` holds that. The cold release
  build (`out/BlancRelease`, 57,200 steps) succeeded and its app reports
  those values. Next: the install-over-Electron spike in `blanc-test`, which
  needs an internally signed build; signing waits for the owner.
- **S1.1 address bar and search on macos-56a7b95ab2df8558** (targeted runs;
  their cases are covered again by the full run on macos-3f969a35b9f9f7ad).
  - Typed text means what it does in shipping v1.45.1
    (`blanc/island/address-input.js`, differential against shipping's code
    over 2,000+ inputs). Familiar links (mailto, tel, facetime, sms) open
    directly; custom app links go through Chromium's external-protocol
    prompt (V9; C++ classifier `external_handoff.cc` compared with shipping
    over 3,100+ inputs).
  - Settings → General → Search is shipping's: engine picker (DuckDuckGo,
    Google, Bing, Brave Search, Kagi, Custom…), custom search address, and
    search suggestions switch, with shipping's copy in all six languages
    (`tools/search-settings.test.mjs`). The choice is stored in Chromium's
    search engine store (stock engines by prepopulated id; one `blanc-custom`
    entry for the custom address), so chrome://settings/search agrees.
    Suggestions use Chromium's `search.suggest_enabled`. A fresh profile
    gets DuckDuckGo unless policy or an extension controls the engine.
  - The Island's Settings action now opens Blanc's Settings page, as shipping
    does; it links to Chromium's settings for everything not yet ported.
  - Live suggestions are shipping's request, sent natively (owner,
    2026-11-01, over Chromium's omnibox suggest, which would add the page
    address and Google cookies): the search group moved to the typed
    interface (`browser_api/search.cc`). Only the typed text goes to the
    selected stock engine's shipping endpoint; no cookies, no redirects, no
    cache, 2.5 s, 64 KB, 30 s memory cache of 64 entries; nothing for a
    custom engine, with suggestions off, from a private tab, or for bang,
    address, path or credential-shaped text. The rules are
    `suggestion_policy.cc`, compared with shipping's code over 4,000+ inputs
    (`tools/suggestion-policy.test.mjs`). Not ported: shipping's
    first-run-complete check (the fork has no first-run flow yet). Tests
    use native `setSuggestionFixture`/`suggestionRequests` ops, which also
    record the credentials mode.
  - New tabs load the address they are given, as shipping does; the old
    Google fallback for other text is gone.
  - Results: navigation feature 10 pass, 1 fail (was 4/14 before S1.1). The
    remaining failure is the private-tab step of "Autocomplete keeps
    opted-out, private, and pasted text local" (needs D1 in-window private
    tabs). Settings and theming fails the same 3 cases as before (theme
    control, private theme, folding explanations).
  - N6: schemes on shipping's deny list (system-command, installer,
    settings and network-file handlers such as `ms-settings:`, `ssh:`,
    `x-apple.systempreferences:`) never reach the OS or a prompt, from a
    page or the address bar: patch 0006 asks Blanc's rule
    (`browser_api/page_handoff.cc`, on the shipping-compared classifier)
    first in `HandleExternalProtocol`, and Chromium cancels the navigation
    silently. Other app links still ask first (V9).
    `tests/external-launch-smoke.mjs` passes: five deny-list launches (link,
    `location.href`, iframe, upper case) refused, three app links prompted,
    the page never leaves. Navigation feature unchanged (10 pass, 1 fail).
    Page-started `chrome-extension:` navigation follows Chromium (V10,
    owner 2026-11-01): Web Store extensions open their declared
    web-accessible pages that way; shipping refused all but the PDF viewer.
  - Bangs (F47) are shipping's: the Island host resolves a typed bang (Enter
    or a search row) with shipping's unmodified `bangs.js` and catalog,
    the way it already reads typed text with `address-input.js`, from bang
    settings kept in profile preferences (patch 0007: `blanc.bangs.enabled`
    on by default, `blanc.bangs.custom`, `blanc.bangs.recent`;
    `browser_api/bangs.cc` applies shipping's limits). The search group
    serves the state and pushes every change, so the open command bar
    follows. Recents are recorded natively, never from a private window,
    and `/clear` forgets them. Settings → General has shipping's switch
    and "Your bangs", with shipping's copy in six languages
    (`tools/bang-settings.test.mjs`).
  - Bang icons (N21) are shipping's: `browser_api/bang_icons.cc` keeps the
    server's icons in `Blanc Bang Icons.json` beside the profile (never
    synced, 300 at most, least recently used dropped first) and asks
    `https://blanc.day/bang-icons/<host>` under shipping's rules
    (`bang_icon_policy.cc`, compared with shipping's code over 6,000+
    operations, `tools/bang-icon-policy.test.mjs`): catalog sites only,
    never a custom bang's site or from a private tab, four at a time, 8 s,
    no cookies or redirects, a 404 remembered for the run, two retries.
    Images are decoded in Chromium's sandboxed decoder and kept as 32 px
    PNGs; `/clear` empties the store and withdraws shown icons. Not
    ported: shipping first offers icons from the person's own visits
    (Chromium's favicon service is the native option), and its
    first-run check. Under the test hook the server is stubbed; a real
    request to blanc.day has not been exercised.
  - Bang scenarios: 16 of 18 pass; the two private-tab ones need D1.
    Navigation and settings features unchanged.
  - Patch series: 0001–0016 touch all 88 pinned upstream files with 286
    hunks.
  - **Outbound isolation passes on macos-92a5c23a766fdc5e (2026-11-01).**
    Run as `blanc-test` with a pf block on that user (owner-approved anchor),
    the fixture's recording proxy and nettop's per-process connection log
    (`tests/outbound/`: `setup.sh --refresh`, `sudo root.sh start`, `user.sh`
    in `blanc-test`, `sudo root.sh stop`, `analyze.mjs`). Every negative
    control (Node and browser: TCP, QUIC, DNS, DoH, DoT, STUN) was blocked
    and logged; the F5 and 18 F47 scenarios ran (16 of 18 pass, as before);
    the proxy saw only the engines and the sites the scenarios choose; the
    leak probe passed (an ordinary prefix reached only duckduckgo.com; a
    credential, card number, bang, suggestions-off and private-window query
    sent nothing); the only other blocks were multicast.
    - The first run found Chromium's component updater, secure network time
      and autofill server predictions reaching Google, which shipping never
      does. Patch 0008 (`blanc/common/background_services.h`, owner's go-ahead)
      applies Chromium's own `--disable-component-update` and disables
      `NetworkTimeServiceQuerying` and `AutofillServerCommunication` at the
      earliest startup callback; `tests/background-services-smoke.mjs` sees
      all three on the old build and none on the new.
    - Not covered: IPv6 (the control had no route on this network) and the
      macOS system resolver, which pf can't block per user (the scenarios
      resolve nothing themselves: `--host-resolver-rules` maps everything
      else to NOTFOUND). A block counts as the account's background only if
      nettop saw a non-Blanc process use that address or, when its 1 s
      sampling missed it, that /24.
  - Gaps: the custom-address and bang hints say they sync, which the fork
    can't yet.
- **S1.2 started: the Island runs shipping v1.45.1's renderer** (was
  v1.38.0) on macos-3f969a35b9f9f7ad. `tools/island-renderer.mjs` generates
  the 11 shipping Island files from the release recorded in
  `blanc/island-renderer.json`: shipping's code, Trusted Types for its HTML
  sinks (`tools/trusted-markup.mjs`, from the prototype) and the fork's
  declared, anchored edits (facade and fork styles, the native extensions
  slot, the preview-build notice). Regenerating from v1.38.0 reproduces the
  previous files except the 15-command slash filter (S1.2 wants all 34) and
  the fork's own split rows (v1.45.1 draws them). The host answers the
  archive and sent-tab reads the overlay makes at startup with shipping's
  empty state; other members of later slices still reject. Embedded-assets
  (58 resources) and typed-interface smokes pass.
- **S1.2 progress (targeted runs; the recorded baseline stays on
  macos-3f969a35b9f9f7ad):**
  - Theme (F15) is Chromium's own browser color scheme (`ThemeService`, the
    setting chrome://settings/appearance changes), so the Island, chrome://
    pages and websites follow it together; the appearance group is on the
    typed interface (`browser_api/appearance.h`), /theme follows shipping's
    rule (`theme_choice.h`, differential against shipping), Settings has
    shipping's Appearance card. F15-1 and two shortened slash commands pass.
  - Shield hit region: below the strip the Island view takes clicks only on
    the open surface, so the page beside Find, the panel and the shield
    popover stays clickable (checked through views' own targeting with the
    test-only `hitTarget` op). F12's Find case passes (once in four runs it
    timed out on the match count first).
  - Interface language (F44), owner's choice of shipping's model on
    2026-11-01: a device-wide `blanc.ui_language` preference (patch 0009),
    read once per launch and served to the Island documents and Settings
    as `ui-language.js`; Settings has shipping's Language row with Relaunch
    to apply. Only Blanc's text follows it; Chromium's UI and Accept-Language
    stay on the OS language. All five F44 cases pass. The Start Page still
    used v1.45.0's catalog, which followed the browser language, until
    S1.8 (below).
  - Hover-open (F1), candidate macos-be7b01cddb488a16 (2026-11-02): the host
    runs shipping's own state machine (`island-hover-open.js`, generated from
    v1.45.1's src/main and stepped against it in a unit test) over the
    pointer moves of the strip, the overlay and the host itself, as
    shipping's main process does over the strip and the pages. A move over
    the page reaches none of them, so the pointer leaving the Island view
    counts as the move outside. The setting is the profile preference
    `blanc.island.hover_open` (patch 0010, off by default) on Settings'
    Island card. 13 of the 14 hover cases pass; F1-13 waits for Blanc's
    permission prompt (S1.6), as F13-1 does.
  - Auto-hide (F1), candidate macos-55a329977de3035f (2026-11-02):
    shipping's policy (`island-autohide.js`) is native C++
    (`island_autohide.h`), compiled beside shipping's module and compared
    over every input grid in `tools/island-autohide.test.mjs`. A per-window
    controller samples the cursor while the strip is hidden, reveals at the
    top edge (or, pushing, after the rest below it), holds while a surface is
    open or the how-to tip shows, and hides once the pointer leaves. Push
    slides page and Island together (none under Reduce Motion). Float, the
    default, leaves the page at the top: the host shows the strip document a
    second time in a frame tight around the pill (`?surface=float`, one
    renderer edit), placed and shown by shipping's own module (wrapped as
    `island-autohide.js`), and native claims clicks only inside that frame
    while it shows. The vertical layout hides too: the rail keeps its column
    and the host clips the strip to it. While the strip is covered the window
    drags only by a 6 px band, as `#dragBand`. macOS's window buttons hide
    with the strip in both styles and stay in the vertical layout, through
    `window_buttons_mac.mm` in Blanc's UI target (owner-approved, 2026-11-02;
    the state reports what AppKit draws). Settings: `blanc.island.
    auto_hide` and `blanc.island.auto_hide_style` (patch 0010; off, float)
    on the Island card. 23 of island-and-commands' 27 macOS auto-hide cases
    pass (the four in Glance and Split View were not run). F1-33 and F1-39
    need Glance as a floating card, F1-34 Settings opened as a page, F1-35
    private tabs (D1). F1-36 is Windows/Linux. island-and-commands, settings-and-theming and
    navigation-and-context-menu show no regressions.
  - Slash commands (F7), candidate macos-e2945bdaad7e13f8 (2026-11-02): the
    overlay offers 32 of shipping's 34; /dark-site and /1password are absent
    because their members are (owner decisions above; one renderer edit
    gives /dark-site shipping's availability check). The host now answers
    /rename and the tab menu's Rename Tab… and Reset Tab Title (native tab
    names), /sleep (each background tab through native's quiet check),
    /copy and /copy clean (shipping's clean-link.js, native copy, the pill's
    notice), /reader (Chromium's Reading Mode, owner's choice), /invite
    (shipping's invite-friend.js; the mail app, or the clipboard without
    one) and grouping a selection. /send answers shipping's "no devices"
    (no Blanc Sync yet), /private waits for D1 (S1.4) and /glance for a
    floating Glance. Six F46 rename cases pass; a probe in an isolated
    profile checked /sleep, /copy, /reader and /invite, which no shipping
    case covers. Seven features show no regressions.
  - S1.2 finished (2026-11-02, macos-d94c3474bbd96627). Zoom needs nothing of
    its own: the page commands are Chromium's zoom (IDC_ZOOM_*), as
    shipping's ⌘+/⌘−/⌘0 menu, and F23-1 passes. Of shipping's 127 browserAPI
    members the host answers 85 (two more are absent by the owner's choice);
    it now also answers beginNewGroup, openGroupMenu and duplicateTab, plus
    the hook beginRenameGroup (four F3 cases pass), and closing or replacing
    the rail's group menu tells the rail. The 40 it still refuses belong to
    later slices: Glance (S3), Spaces and their
    group menu (S3), Ctrl+Tab's switcherPick (S3), Tab Archive (S3), sync
    and sent tabs (S4), capture and screen sharing (S5), the blocking
    provider (D2), the permission prompt (S1.6), the certificate exception
    (N5) and the window buttons and main menu (Windows/Linux).
- **S1.4 in-window private tabs (D1), candidate macos-36a2a32e820bc60d
  (2026-11-03):** a private tab is web contents in the window profile's
  incognito profile, in an ordinary window (`blanc/private/private_tabs.h`,
  patch 0011). Chromium's navigator keeps a private tab's links and children
  private, creates their contents in that profile, and turns an incognito
  disposition into a private tab here; ⌘⇧N, /private and the Island's private
  tab open one. Private tabs are kept out of session restore
  (`session_service_base.cc`), Recently closed, whether the tab or its window
  closes (`content_live_tab.cc`), and tab sync (`tab_contents_synced_tab_
  delegate.cc`); history already follows the tab's own profile. The snapshot
  reports privacy per tab. F4-4 and F4-5 pass; F4-1, F4-2, F4-3 and F4-6 have
  no shipping step definitions (shipping's backlog). Six more cases with a
  private step pass. A probe in an isolated profile, each check beside a
  regular-tab control, found no private page in Recently closed, history,
  the relaunched session or any profile file, and a private tab's
  `target=_blank` and ⌘-click children private in the same window. Eight
  features show no regressions. The native privacy checks now ask the tab
  where the action is the tab's (shipping's rule): a private tab is never a
  Favorite or a Start Page pin, never tints the Island, has no split state
  recorded, and is left out of a saved Space (a split holding one is not
  saved; groups only private tabs used stay out); search matches its own
  profile. The rest stay with the window by design (Recently closed, window
  identity, history list, themes, Spaces recovery); the Start Page and the
  host's recent bangs already asked the tab. A probe found Favorites and pins
  refused for a private tab and allowed for a regular control, and no
  private address in any profile file after a Space save and a relaunch.
  On macos-36a2a32e820bc60d seven features (private-tabs,
  island-and-commands, find-favorites-history, newtab-layouts,
  tabs-and-groups, navigation-and-context-menu, F41-named-workspaces) give
  every executed case the result it had before. Patch 0013 (2026-11-03,
  macos-b6fd93656f8664d0) labels the File menu's ⌘⇧N item "New Private
  Tab" and the Dock's "New Private Window", in shipping's words for
  Chromium's application locale (`blanc/common/menu_strings.h`, generated
  by `tools/menu-strings.mjs`), and the Dock's item, like ⌘⇧N with no
  window open, makes a new window holding one private tab instead of an
  incognito window. The test ops `privateMenuItems` and
  `clickDockPrivateWindow` showed both labels and a new window whose only
  tab is a private Start Page; private-tabs and multi-window are
  unchanged. Not yet: the private theme's quick-exit chip is unchecked
  (F4-2 has no steps).
- **S1.5 utility sheet, candidate macos-deae895ed32ca1f5 (2026-11-03):**
  Favorites, History and Downloads open in the Island's utility sheet,
  never as tabs. The sheet is a frame of the Island host below the strip
  (host.js `showSheet`/`hideSheet`, shipping's `showUtilityPage` rules):
  re-invoking the shown page closes it, Escape closes it unless its page
  armed Escape, a tab switch, a new tab, the palette, Find or Extensions
  dismiss it, and a click in it changes the sheet (a utility page) or
  opens one tab (a web page). Its pages are shipping's own, generated by
  `tools/island-renderer.mjs` with one edit that loads
  `pages/sheet-adapter.js`; the host answers their `window.bowserPages`
  from BookmarkModel, HistoryService and DownloadManager
  (`utility_sheet_ops.inc`: Favorites remove, folder move, rename and
  remove, Start Page pins, every visit and removing one, downloads with
  cancel, resume, retry, open, show and clear). Patch 0012 sends
  Chromium's History, Downloads and Bookmark Manager commands to the sheet
  in an Island window; the Start Page's Favorites heading opens it too.
  Ten cases that failed now pass: F11-1, F10-3, F16-2, F16-4, F16-5,
  F16-8, F16-10, F35-5, `/downloads` and find-favorites-history:7. A probe
  in an isolated profile confirmed each page, the toggle, Escape, a
  Favorite's link (one tab, sheet gone), a tab switch, recreated contents
  after the frame was discarded, a folder move, a pin and one visit
  removed. Five features (island-and-commands, tabs-and-groups,
  navigation-and-context-menu, newtab-layouts, private-tabs) give every
  other executed case the result it had before. Not yet, with reasons:
  F9-3 fails because the fork seeds a Favorite by visiting a page with no
  icon (shipping's hook writes a PNG); Favorites import is hidden until the
  M.2 importer (`capabilities.import: false`); history rows show letters
  (no favicon lookup yet); Tab Archive (F52) lists nothing; Settings is
  still a tab (S1.7), so F16-6, F16-7 and F16-9 fail.
- **S1.6 Shield site controls (F12), candidate macos-48ace292eba182c8
  (2026-11-03):** all nine ad-blocking cases pass (five failed before). A
  tab's blocked count starts at zero on each committed page, as shipping
  resets it (`shield_count.inc`). Site actions bind to the shown document
  and refuse only while a navigation is pending, not while the page loads
  its own resources, and `/block-ads` toggles the global switch on any
  page, as shipping's does. The host gives each tab shipping's `siteInfo`
  (`site-security.js`, generated like the other main-process modules), so
  the HTTP warning badge shows and opens site controls; `prototype.css`
  no longer hides it. Seven features (island-and-commands, tabs-and-groups,
  navigation-and-context-menu, private-tabs, site-certificate-safety,
  newtab-layouts, internal-pages) are unchanged.
- **S1.6 HTTP auth refusal (F20), candidate macos-b063a54c8516241b
  (2026-11-03):** all four F20 cases pass (all undefined before). Patch
  0014 has `ChromeContentBrowserClient::CreateLoginDelegate` return no
  delegate in an Island window (`browser_api/http_auth.h`), so a
  navigation, page-resource or proxy challenge is cancelled and its 401 or
  407 reaches the page; nothing asks for credentials. Under --blanc-test
  each refused challenge is recorded (`authChallenges`,
  `resetAuthChallenges`). Shipping's steps for it evaluate in Electron's
  main process; `tests/lib/main-ports.mjs` ports such evaluations one at a
  time, keyed by the SHA-256 of shipping's exact function source
  (`tests/main-ports.test.mjs` checks every key against shipping), and the
  fixture's own proxy now demands sign-in when the proxy scenario arms it.
  island-and-commands, tabs-and-groups, navigation-and-context-menu and
  ad-blocking are unchanged.
- **S1.6 Blanc permission prompt (F13), candidate macos-08744ec1266cd826
  (2026-11-03):** F13-1 passes (it failed before). Patch 0015 (the newly
  pinned `permission_prompt_factory.cc`) has Chromium's
  PermissionRequestManager use Blanc's prompt in an Island window
  (`permission_prompt.inc`): camera and microphone, location and
  notifications are sent to the host, which shows shipping's own
  `permission.html` (generated, in a host frame) bottom-centre over the
  page, 560 × 84 as shipping's view, without taking focus; any other
  request is denied without asking, as shipping's policy does. Answers go
  through Chromium's own Accept/Deny, so they persist per origin; a request
  that ends otherwise reloads the frame with the rest replayed. A probe
  found the prompt hit-testing as the Island while clicks beside it and on
  the page reach the page, the Island back to the strip after Allow, and no
  second prompt after Allow. The page's Permissions API still reads
  location as `prompt` after Allow because macOS has not granted the test
  app location access; Chromium folds that in. F13-2 (microphone capture
  chip) has no shipping step definitions. tabs-and-groups,
  navigation-and-context-menu, internal-pages, ad-blocking,
  find-favorites-history and island-and-commands are unchanged.
- **S1.6 certificate safety under V8 (N5), candidate macos-2578c8367acd5017
  (2026-11-03):** six of the seven site-certificate-safety cases pass
  (all seven failed before). The snapshot reports each tab's certificate
  state from its committed navigation entry (Chromium's warning page, or a
  page continued past one), which the host gives shipping's `buildSiteInfo`,
  so the badge and site controls report it; site controls' Stop allowing
  revokes Chromium's decision for the host (`forgetCertificateException`,
  RevokeUserAllowExceptionsHard). The fork's state names Chromium's warning
  page as shipping's `blanc://error/?kind=certificate`, and three steps that
  read shipping's own page are replaced under V8
  (`tests/fork-steps/divergences.mjs`, checked by
  `tests/divergences.test.mjs`): its wording, Proceed behind Advanced
  instead of no way through for a public site, and Advanced then Proceed.
  Patch 0016 (the newly pinned `website_settings_registry.cc`) keeps
  private tabs' certificate decisions their own (owner, 2026-11-03).
  F39-6 stays undefined: the fork has no parked-tab tier for Reopen Closed
  Tab (F2). Regression on the Mac mini: ad-blocking, tabs-and-groups,
  navigation-and-context-menu, private-tabs, permissions-and-auth and
  internal-pages are unchanged; three hover-open cases in
  island-and-commands (lines 61, 87, 99) failed there because the mini's
  console had no frontmost app (a Migration Assistant setup session was
  logged in). On the Mac Studio, against the same candidate (built there
  from d85695e7 with the identical framework hash), all three pass, and
  island-and-commands, tabs-and-groups, navigation-and-context-menu,
  ad-blocking and find-favorites-history match F13. There, internal-pages'
  F16-10 (Sunrise palette) got the dark Sunrise tokens (#17130f card,
  #f7f0e5 text) because the Studio is in Dark mode; its expectation is the
  light palette, so that case depends on the machine's appearance, not on
  N5. The runner now refuses to start on a Node without a global WebSocket
  (Node 20 had failed every case before the browser did anything).
- **S1.6 inherited sandbox (N4), network privacy (N8), startup gate (N22)
  and the address menu (F19), candidate macos-068f7d1291cabbbe
  (2026-11-03):**
  - N4 (V4), patch 0017: each tab records the sandbox flags it was born
    with (an opener's propagating sandbox; Chromium's own inheritance keeps
    them live) and keeps them in its session and Recently closed records
    (`blanc.tab.inherited-sandbox.v1`). Restore creates the tab with them
    (`starting_sandbox_flags`, which patch 0017 makes
    `CreateWithSessionStorage` honour), and so does a discard's replacement;
    Duplicate is refused and Quiet already refuses a sandboxed tab.
    `tests/document-policy-smoke.mjs` passes for an opaque sandbox, a
    same-origin sandbox and an unsandboxed control: live, reopened and
    after a relaunch, the sandboxed children keep their flags, refuse
    storage (opaque) and don't post forms, while the control is unmarked and
    duplicates. Not checked: a Space switch (it rebuilds through the same
    Recently-closed path), a discard's replacement (Quiet refuses these
    tabs), and a malformed saved value (restores with every flag).
  - N8 (V11), patch 0018: new profiles default to shipping's WebRTC policy
    (`default_public_interface_only`); secure DNS stays Chromium's
    automatic mode. `tests/network-privacy-smoke.mjs` passes.
  - N22: verified, not built. `tests/startup-gate-smoke.mjs` passes: with the
    blocker's bundle missing, the blocker reports unavailable and neither
    the startup page nor a new tab reaches the server.
  - F19: the Island address input's right-click is Blanc's native menu
    (`IslandDelegate::HandleContextMenu`), shipping's address-menu-model
    items in shipping's labels (generated in `menu_strings.h`); Copy Clean
    Link cleans the field's text with shipping's clean-link.js and Paste
    and Go goes through the host's typed navigation. Under `--blanc-test`,
    Blanc's own clipboard actions (these, /copy and /invite) use an
    in-memory board, never the owner's pasteboard. F19-2 and F19-3 pass
    (both undefined before); F19-1 has no shipping step definitions. The
    `openPanel` adapter now opens shipping's panel (the page's address in
    the field) instead of the new-tab panel. The page link items (Open Link
    in Glance or Space, Copy Clean Link) wait for Glance and Spaces.
  - The patch set covers 91 files with 296 hunks. navigation-and-context-
    menu, island-and-commands, tabs-and-groups, private-tabs, ad-blocking
    and site-certificate-safety are otherwise unchanged.
- **S1.7 settings sheet, candidate macos-61b9387a2d9a8841 (2026-11-04):** Settings opens
  in a native sheet. The host draws shipping's scrim, card and close button
  (`#settingsSheet`); a `views::WebView` sibling of the Island view, above
  it, shows the page over the card's body, in the regular profile in either
  window, with the autofill and password clients chrome://settings expects
  (Chromium's SimpleWebViewDialog pattern). Escape the page doesn't use, a
  scrim click, the ×, a tab switch and a new tab end it; anything it opens
  outside itself becomes an ordinary tab. ⌘, and Chromium's Settings command
  open it in an Island window (patch 0019). General and Blocking show Blanc's
  own page there (`#embedded`, without its own scrim and card) until those
  sections move into chrome://settings; Chromium's sections (search,
  appearance, privacy and others) load chrome://settings itself. The host
  measures the card only after it has grown, so a quick reopen no longer
  gets a zero-height sheet. Verified by a probe on macos-80eb2099924c1845
  (attached above the Island, sized to the card, focused; each way of
  closing it; an outbound link as a tab) and by targeted runs on
  macos-61b9387a2d9a8841: settings-and-theming matches its pre-sheet result,
  internal-pages matches sh1, and island-and-commands matches s16c once
  four Auto-hide pointer cases (241, 258, 276, 403), disturbed by the owner
  using the machine during the run, passed alone, as did 573. The adapters
  had read the page before it filled itself in: the page's address shows as
  blanc://settings/, so the readiness wait never ran; it now asks the
  document, in-sheet readers wait too, and a custom bang's add settles
  before the sheet closes. `tests/window-snapshot.mjs` composites DevTools
  captures into window screenshots without Screen Recording.
- **S1.7 Chromium's settings sections, candidate macos-61b9387a2d9a8841 (2026-11-04):**
  patch 0020 (`page_visibility.ts`, newly pinned: 92 upstream files) gives
  every non-guest profile `{ai, people, safetyHub}: false`, so the Google
  account and Sync section, AI and Safety Check are gone from the menu and
  pages, and Chromium leaves their routes out: chrome://settings/people,
  /syncSetup, /safetyCheck and /ai fall back to chrome://settings/. Every
  reader treats a missing key as shown, so the other sections are
  unchanged. A probe of the sheet confirmed the menu, the Privacy page
  (no Safety Check, Sync or AI elements) and the four addresses;
  settings-and-theming matches s17g. The build's dry run was 55 actions
  (the Settings TypeScript chain plus per-language InfoPlist strings after
  a manifest rebuild; no toolchain change), above the usual 50, so it was
  reviewed and run once with `--max-actions=60`.
- **S1.7 Blanc's controls in chrome://settings, candidate macos-b1e03720c5fd6337 (2026-11-04):**
  the owner chose to put Blanc's settings into Chromium's matching
  sections (not one Blanc section). Patch 0021 (eight newly pinned files,
  100 in all) allowlists `blanc.island.hover_open`, `.auto_hide`,
  `.auto_hide_style`, `blanc.bangs.enabled` and `blanc.blocking.enabled`
  in settings_private, and adds the controls with `pref-key`: Appearance
  gets Open the Island on hover, Auto-hide and (while Auto-hide is on) how
  the Island comes back; Search engine gets Search suggestions (Chromium's
  only switch for it was in the removed Sync section) and Bangs; Privacy
  and security starts with Block ads & trackers. Their labels are
  shipping's in each selectable language, generated into
  `blanc/common/settings_strings.h` by `tools/settings-strings.mjs` and
  added to the page's strings by settings_ui.cc. Their readers already
  normalize what they read. A probe toggled each and saw Blanc's own page
  follow; settings-and-theming matches s17g. Still to come: Your bangs,
  the Blocking exceptions list and the interface language (validated
  natively, so through a handler), then retiring blocking-settings.html.
  Chromium's own Appearance rows that don't apply to the Island (toolbar,
  bookmarks bar, tab strip, side panel) are still shown.
- **S1.7 Blanc's lists and language in chrome://settings, candidate macos-1fa75f97ed921757 (2026-11-04):**
  patch 0022 (three newly pinned files, 103 in all, plus a new
  `blanc_settings_proxy.ts` in Settings' BUILD.gn) adds Your bangs under
  Bangs, the sites that load without blocking under Block ads & trackers,
  and the interface language (with Relaunch to apply) atop Languages.
  They go through `ChromiumSettingsHandler`
  (`blanc/browser/ui/chromium_settings_handler.inc`, registered on
  SettingsUI), which applies shipping's rules natively: normalizeCustomBangs,
  the duplicate check, the built-in a code replaces (read from the bundled
  `pages/bangs-catalog.js`), host normalization (a host Chromium would
  percent-escape is refused, as shipping's URL parser refuses it) and the
  selectable languages. A probe added, refused and removed bangs ("Replaces
  the built-in !a (Amazon.com)", "You already have !m.", the invalid-bang
  message; the Island saw the list), added WWW.Example.com/x as example.com,
  refused "not a host!", and switched the language with the relaunch offer
  appearing and going; settings-and-theming matches s17g. The language menu
  is unstyled and the Languages page still shows Google Translate; both for
  the restyle. The BUILD.gn change needed `gn gen` (unchanged arguments,
  same Xcode, SDK and Clang); `linker_driver.py`'s Oct 28 modification time
  feeds GN's `TOOL_VERSION`, so the regenerated link lines relinked the Rust
  host tools and about 15,000 dependent steps (the owner approved that
  rebuild; about 50 minutes in all).
- **S1.7 Blanc's settings page retired, candidate macos-db431e0fbc2791a9 (2026-11-04):**
  Settings is chrome://settings alone. The sheet opens shipping's General at
  its top and Blocking on Privacy and security; blocking-settings.html, its
  six scripts and the two handlers that served it are gone (the checkout's
  copies are in apply-backup-20261104-studio-s17-retire/removed). Privacy
  and security now shows shipping's status line ("Blanc Blocker ready.",
  refreshed while it starts and when the page is shown again). Owner
  decisions: V12, a custom search address (and engines Chromium's Change
  dialog lacks, such as Kagi) is added under Manage search engines; V13,
  explanations show in full. The adapters drive chrome://settings as a
  person does (the Change dialog, Mode, the switches, the lists, through
  the sheet); F14-5's steps are V13 replacements. settings-and-theming
  matches s17g with F14-5 now passing; island-and-commands matches s16c on
  all 73 executed cases; internal-pages matches sh1, and 66 (Settings'
  section marker following scrolling) now passes under V14 (owner,
  November 4, 2026): chrome://settings's menu marks the page you are on, so
  its replacement scrolls to the end, chooses Help in the menu (behind ☰
  at the sheet's width) and checks that Help is marked and shown.
- **S1.7 four remaining settings, candidate macos-8d8381846146471d (2026-11-04):**
  patch 0023 registers `blanc.island.site_colors` (on),
  `blanc.island.tab_icons` and `blanc.island.search_priority_results` (off)
  and `blanc.appearance.surface_style` (sunrise), allowlists them, and adds
  Match site colors, Show site icons on the Island and Surface style to
  Appearance and Search priority results to Search engine. The Island reads
  them from the snapshot (tab icons, priority results in the panel's open
  payload); Match site colors off stops the page tint and clears it; the
  page server appends pages-neutral.css (and a marker the Start Page's paint
  reads) to pages.css under Neutral, and each window's Island handler
  restyles its open Blanc pages in place, as shipping's RESTYLE_SCRIPT does.
  A probe turned each on and saw it take effect (icons instead of dots, a
  Neutral Start Page restyled with one stylesheet, no tint, the panel opened
  with priority results); settings-and-theming, island-and-commands and
  internal-pages match their last runs, and tabs-and-groups 356 (site icons)
  passes through the new switch.
- **S1.7 Call audio, candidate macos-960785b1fcb658e4 (2026-11-04):** V15
  (owner): native in Blink. Patch 0024 (seven newly pinned files, 110 in
  all) registers `blanc.webrtc.audio_buffer` (automatic; an unsynced
  profile pref, so device-local as in shipping), carries shipping's targets
  (automatic -1, stable 400 ms, resilient 1000 ms) in RendererPreferences,
  refreshes open tabs through PrefWatcher, and has RTCRtpReceiver start each
  new audio receiver with the target (a page's own jitterBufferTarget still
  replaces it and reads as the page set it). Privacy and security shows Call
  audio with shipping's three choices. The owner approved the rebuild it
  needed (1,460 steps, 7 minutes). A probe moved an open tab's renderer
  preference to 400, 1000 and back to -1 as the setting changed. Not yet
  verified: a real call taking the target (the fixture gathers no ICE
  candidates, even with Chromium's default policy and loopback allowed).
  Settings-and-theming, island-and-commands and internal-pages match their
  runs on macos-8d8381846146471d. Every S1.7 key is now built
  (`tools/settings-keys.mjs` lists none to build).
- **S1.7 restyle, candidate macos-5faa4ac34c4be46a (2026-11-04):** owner
  decisions: chrome://settings wears shipping's sheet look under Surface
  style, and Chromium rows that don't apply are hidden. Patch 0025 (five
  newly pinned files, 115 in all) maps Sunrise or Neutral, light or dark,
  onto Chromium's own color tokens from `blanc_settings_proxy.ts` (cream
  canvas, white hairline cards, gold switches; ink and gray under Neutral),
  sets Instrument Sans at width 98 and +0.01em (its bytes come from the
  handler and load with FontFace, since chrome://settings can't fetch
  Blanc's fonts), and insets Chromium's row lines 20px in shipping's border
  colour (owner: inset hairlines). It hides, through Chromium's own
  appearance visibility and flags where they exist (`showPrivacyGuide`,
  `enableLiveTranslate`) and `hidden` elsewhere: Customize your toolbar,
  Show home button, Bookmarks bar, the tab strip, tab search, tab group and
  side panel rows, hover cards, split view drag-and-drop, Performance's two
  tab-appearance rows, Related Google services, the Google Translate
  section, Live Translate, and the Privacy Guide card and row. The sheet's
  card follows Surface style too. A probe listed every page's rows with
  those gone; settings-and-theming, island-and-commands and internal-pages
  match their last runs. Chromium's own name still shows in a few strings
  ("About Chromium", Default browser); that is branding, not this slice.
- **Shipping target moved to v1.46.0, candidate macos-e225d28ca11f8f10 (2026-11-04, owner):**
  `tools/island-renderer.mjs` regenerated the Island from v1.46.0 (every
  fork edit still applies; index.html, overlay.js, renderer.js and
  styles.css gained Island size and Mini Window), the new
  `tools/interface-strings.mjs` rebuilds `blanc/island/strings.js` from a
  tag (it reproduces the v1.45.1 file byte for byte), and the menu and
  settings strings, the 41 shipping asset copies (none changed), the
  parity tests, the scenario inventory (591 declarations, 640 cases) and
  the tracker name v1.46.0. Rows verified against v1.45.1 now read as
  needing a recheck. The key check has 83 keys: `islandSize` is to build
  (S1.7, device-local `blanc.island.size`); `miniWindowShortcut` waits for
  F61. The spec gains F61 Mini Window (S3); F57 and F59 name v1.46.0's
  behaviour. The Start Page's catalogs move with S1.8. Feature reruns on this
  candidate (`evidence/foundation/v146b-*`, compared by scenario name
  because v1.46.0 moved line numbers): settings-and-theming 5 pass /
  1 undefined, island-and-commands 66 / 4 fail / 3 undefined and
  internal-pages 7 / 3 fail, each exactly as on s17x; tabs-and-groups
  28 / 6 fail / 11 undefined against sh1's 27 / 7 / 11, the one change
  being *The Island can show site icons instead of dots* now passing
  (Tab icons, built in S1.7). No regressions.
- **Island size built (S1.8, F3-35, 2026-11-04):** shipping's v1.46.0
  Island size (#1292) is Settings → Appearance → *Island size* (Default,
  Large, Extra large), an unsynced profile pref `blanc.island.size`
  (patch 0026: registration, settings_private allowlist and the dropdown;
  copy from v1.46.0 through `tools/settings-strings.mjs`). Each window's
  Owner keeps its `strip_height` (68, 76 or 84, shipping's
  `stripHeightFor`) and every place that assumed a 68px strip now reads
  it: the resting height, hit testing, the caption band, the split header
  band (strip + 30), the extension slot and auto-hide's pinned test. A
  change moves the page at once and leaves an open surface open. The
  snapshot carries `islandSize`, so the regenerated strip and overlay
  scale themselves; host.js and host.css take `--strip-h` for the strip
  frame, its backdrop, Find, the sheets and menus, and scale the floating
  pill's shadow room like `scaleForIslandSize`. prototype.css no longer
  pins `--pill-zoom`. F3-35 passes on macos-06320784798c07e1; the
  settings-and-theming, island-and-commands, internal-pages,
  tabs-and-groups and glance reruns (`evidence/foundation/s18s-*`,
  `s18t-*`) match their earlier results apart from F3-35. The probe that
  found the strip frame still 68px tall (the shipping step measures inside
  the strip document, so it could not) is the `island-<size>` scene in
  `tests/window-snapshot.mjs`. `settings-keys.json` has nothing left to
  build.
- **Start Page strings on v1.46.0 (S1.8, 2026-11-04):**
  `tools/interface-strings.mjs` now also writes `blanc/island/pages/strings.js`
  (the Start Page, Favorites, History and Downloads) from the release
  `island-renderer.json` names: shipping's six catalogs (73 keys added, none
  removed or changed; all 263 keys the pages use are present) with the
  Island's language chooser and the fork's own page status messages kept
  from the committed file. The four pages load `ui-language.js` first
  (newtab.html directly, the sheets through `island-renderer.mjs`), so they
  follow Settings' interface language like the Island instead of the
  browser's. Candidate macos-3b3c6840f9da0f0a: newtab-layouts (8 pass /
  5 fail / 12 undefined) and internal-pages (7 / 3) match their earlier
  runs, and all five interface-language cases pass. The relaunch case had
  been failing since S1.7 because its fork step still waited for Settings
  as a tab; it now chooses the language in the Settings sheet's Languages
  page. The fork's preview notice in the Start Page footer stays English.
  `tests/window-snapshot.mjs` gains `newtab[-<language>]` scenes.
- **S1 close-out (2026-11-04):** every S1 feature file ran on the current
  candidates (`evidence/foundation/s18*`, `s1c-*`); of the S1 rows' 235
  shipping cases, 58 did not pass at the start. Fixed and rerun: utility
  addresses open in the sheet and toggle it (F16-6, F16-7); the shield
  popover stays open while its exceptions are read (F12-6; a
  `blockingExceptions` test op replaces reading Settings); the floating
  pill's window step (F1-34); Recently closed under Pinned by default and
  kept across a relaunch by index (F2-8, F3-17, F3-26); link children open
  ungrouped at the end (F3-21) while New Tab Below stays in its group
  (F2-9); a group's first tab dragged out lands above its group (F3-23); the
  weekly blocked counter (pref `blanc.blocking.week_stats`, shipping's
  adblock-stats.js week) shows on Ledger, Shelf and Tally (F35-16, F35-17);
  Kagi under V12 (F5-2). Decided (owner): V16, a pinned tab leaves its
  group (F3-5 checks it; F3-34 has no case), and V17, Close Tabs Below
  reopens one tab at a time (F2-10 checks it). Final reruns: tab-drag 15/0,
  ad-blocking 9/0, tabs-and-groups 32/1 (F3-3), internal-pages 9/1 (F16-1),
  island-and-commands 63/3 (F1-13, F1-33, F1-39), newtab-layouts with
  F35-16 and F35-17 passing.
  - Left, classified: shipping's own backlog (not in its runnable profile):
    F3-3, F16-1, F18-1, F19-1, F4-1/2/3/6, F8-1. Other slices: Glance's
    floating card (F1-33, F1-39), Sync (F14-4, F7-3), Spaces, first run,
    Patron and launch Sunrise (F35-7, -8, -10, -11, -18, -19). Test-hook
    gaps: F9-3 favicon seeding, Billboard history seeding (F35-5, -6, -15),
    F2-11 audioMuted, F3-15, F3-16, F32 session windows. Mahjong (F35-3,
    -4, -9, F37-4) is last (owner).
  - F1-13 is a test-transport gap: a probe on the candidate shows a move
    over the Island with a prompt pending registers inside and does not arm
    the dwell (hover-open is now ineligible while a prompt is pending, as
    shipping's permissionViewAttached), but the scenario's own moves never
    reach the host (`hoverState().moves` stays 0). Not yet explained.
  - Rows: the 31 S1 rows other than F35 are Integrated on macOS at
    macos-41cadf1e05df1804 (in the candidate, on by default, reachable through shipping
    UI). Verified still needs each row's manual accessibility and visual
    checklist. F35 stays partial until Mahjong.
- **Mahjong goes last (owner, 2026-11-04):** the fork has no Mahjong yet
  (F35-3, F35-4, F35-9 fail at the footer launch). When it is built it is an
  Island page (shipping's files served as byte-identical copies, opened as an
  ordinary tab), not a Chrome extension; it is the final S1 close-out item.
- **Open question, file picker hang (2026-11-04):** the owner's live
  instance on macos-61b9387a2d9a8841 hung when choosing a custom Start Page
  wallpaper. The hang report shows the UI thread inside AppKit's
  `-[NSSavePanel _initBridgeAndStuff]`, waiting on the system open/save
  panel service (Chromium's ordinary `SelectFileDialogBridge` path, from a
  plain `<input type=file>`). The same click in an isolated fixture did not
  hang, and the owner's retry in the relaunched live instance worked. Not
  reproduced; if it recurs, compare the new hang report with this one.
- **Live dev instance (owner, 2026-11-03):** after every native build,
  `node chromium/tools/live-dev.mjs <runtime config>` relaunches the
  newest candidate from a copy in `~/Projects/BlancChromium158/live/`,
  with the persistent profile there, through `open -n`. It quits only
  the live instance it started; the earlier `zoom-verified-158-20261030`
  instance and its profile stay untouched.
- **S1 baseline on macos-3f969a35b9f9f7ad (fork 82f8cd80), full run of
  2026-11-01:** 101 of the 253 S1 cases pass, 119 fail, 33 undefined. Every
  case that passed on macos-790ca4d6d538c894 (70) still passes; 31 earlier
  failures now pass (address bar, search, Bangs, external links and the
  v1.45.1 renderer); one failure became undefined. Across all 627 shipping
  cases: 101 pass, 163 fail, 361 undefined (most added by the main merge),
  2 excluded. Per-row results and reasons: [reports/s1-macos.json](reports/s1-macos.json) (+ JUnit).
- **F0.6 complete (macOS).** Candidate macos-790ca4d6d538c894, built
  incrementally on the pinned toolchain (args and SDK unchanged):
  - Island assets compiled in from `blanc/island/` (`blanc/island_resources`);
    the asset-folder switch exists only in preview, non-official builds
    (`ENABLE_BLANC_DISK_ASSETS`, `tools/check-hook-gates.py`); patch 0003
    keys Blanc behaviour on `blanc::IslandMode()`.
  - Typed interface: `tools/browser-api-mojom.mjs` generates
    `blanc/common/browser_api/` (one Mojo interface per contract group, C++
    checks for string-union values, a factory base that refuses unmigrated
    groups) and `blanc/island/browser-api-codec.js` from
    `browser-api/contract.json`; `--check` fails on drift. Patch 0004
    registers the binder; only the Island host binds. Migrated: the
    navigation group (navigate, search, back, forward, reload, stop), with
    contract results. Every other group stays on the untyped dispatcher until
    its handler moves; new handlers use the typed interface.
  - Smokes: `tests/embedded-assets-smoke.mjs` (55 resources byte-identical
    with no asset folder) and `tests/typed-interface-smoke.mjs` (host binds; a
    load resolves true; unknown tab and non-web address resolve undefined; a
    Start Page tab's pipe is closed).
- **Earlier baseline on macos-790ca4d6d538c894:** full run at f4a4f2fe plus
  a re-run of the navigation feature at b22cc3f9: 70 pass, 151 fail, 32
  undefined.
- Runner: shipping's 24 S1 step files and fixture server load unchanged from
  v1.45.1 (85883b1a); adapters (tests/adapters/) map shipping hooks to the Island
  facade, native dispatch, Island DOM and CDP; fork steps (tests/fork-steps/)
  cover S1 texts shipping never defined. Cases run their defined prefix and retry
  a failure once. Profiles live in local temp storage; only logs and errors are
  kept. Guards before each case: free memory, and a rendering display.

## PR CI (Electron checks; owner allowed fixes 2026-11-01)
- Windows jobs failed at checkout: 218 paths over Windows' length limit in
  Codex's copied `handoff-20261030/review-material/`. Removed from the tree
  with owner approval (still in history at aea73a85; the handoff README says
  how to read it).
- `main` (7c3f5b44) merged in with owner approval for its fixes to the
  dependency audit, Ubuntu `modified-link-clicks` and the macOS Intel shield
  test (b4a76889). Conflicts kept both sides: main's Shared Space close
  wrapper runs inside this branch's window-view drain; this branch's
  `internalFileResponse` stays in pages.js; versions, lock and SBOMs are
  main's (ECS 44.9.3). The dependency audit and Electron unit tests pass
  locally apart from local-environment gaps (Node 20 has no `node:sqlite`; no
  Electron binary or generated seed in the merge worktree).
- main's contract adds members, among them `toggleReaderMode` in the
  navigation group, which the fork serves in C++. Regenerated the typed
  interface; the fork answers false (no reader mode yet, as shipping answers
  when a page has none). Chromium's Reading Mode is the native option to
  raise before porting shipping's reader. Built incrementally as
  macos-b6f5dd15d7f336ce (18 steps, pinned toolchain); typed-interface and
  embedded-assets smokes pass (56 resources). The fork smokes need Node 22
  (`/usr/local/bin/node`); the shell's default Node 20 has no WebSocket.
- Unrelated flaky checks (nightly acceptance, iOS UI tests, browser
  shortcuts) are not chased (owner, 2026-11-01). The PR now targets `main`,
  and a pull-request push that changes only `chromium/`, the experiment
  folder or docs skips the desktop and iOS jobs, still reporting
  (`scripts/ci-fork-only-push.sh`, fail-closed; `test/unit/ci-fork-only-push.test.js`).

## Observed problems to investigate
- Chromium's teardown watchdog ("Teardown watchdog expired") terminates some test
  browsers on quit (exit 2), intermittently. Cause not confirmed; such cases are
  recorded as failures with the log line.
- The Island's `styles.css` is served without a charset and decoded as
  Windows-1252 (non-ASCII is only in comments today). Same on disk and embedded.
- The Start Page requests `onboarding.js` and `onboarding-guard.js`, which were
  never in the served set.
- A tab created through CDP `Target.createTarget` gets Chromium's NTP, not
  Blanc's Start Page; Island-created tabs are correct.
- `gn check` flags two pre-existing includes in Blanc code: `blanc_prototype_ui.cc`
  (`chrome/browser/favicon/favicon_service_factory.h`, `blocker_proxy.h`) and
  `blanc/services/blocker/blocker_proxy.cc` (`profile_util`). The build is not
  gated on `gn check`; add the deps when those files are next touched.
- 2026-10-30 memory incident (parallel runners, leaked helpers, profiles in the
  synced folder): fixed. Run one native test browser at a time; launch the dev
  instance with `open -n` so it never belongs to an agent's process tree.

## Reading the failures
Most failures on the previous candidate are real product gaps, clustered:
- Settings opens chrome://settings (no Blanc controls): 42 Island hover/auto-hide
  cases (hover-open's and auto-hide's now pass), search engine, suggestions, theme, bang and tab-icon settings.
- Private tabs refused (in-window private tabs not built yet; D1 decided): F4 and every case with a private step.
- Facade gaps: Bangs disabled, no bangIcons, no beginRenameGroup, /allow-ads and
  /block-ads absent from the command list, search hard-coded to Google.
- Settings opens as a tab, not in the utility sheet (S1.7).
- Candidate-bound explicit failures (hooks declare the surface absent, re-check
  when assets change): Mahjong reads (no Mahjong page),
  Glance-card reads (Glance is a split preview).

## Native-versus-port decisions (owner, 2026-10-31)
Recorded in the spec (§4, §9) and plan:
- D1: port shipping's in-window private tabs (deep tab/profile patch, isolated
  in `blanc/private/`). Built in S1.4. Owner, 2026-11-02: private tabs use
  Chromium's incognito profile (the window profile's primary off-the-record
  profile); its session lasts until Blanc quits, as shipping's; ⌘⇧N opens a
  private tab in the current window instead of an incognito window.
- 2026-11-02: /reader is Chromium's Reading Mode, not shipping's reader.
- Pinned tabs stay in their group, as shipped (custom change to Chromium's tab
  collections).
- V8: Chromium's certificate warning page and proceed decisions replace
  `blanc://error` (N5). Rewrite N5's expectations to the approved divergence.
- V9: page-started external-scheme launches ask first through Chromium's
  prompt; typed addresses hand off directly (N6).
- V10 (2026-11-01): pages may open extensions' web-accessible
  `chrome-extension:` pages as Chromium allows.
- 2026-11-02: no built-in Dark Reader (F42 dark websites) in the Chromium
  builds. With the Chrome Web Store supported, people install Dark Reader
  themselves; F42's cases become an approved divergence, not a port.
- 2026-11-03: Settings (S1.7) opens in a native sheet: Chromium's restyled
  chrome://settings in its own native view, drawn as shipping's utility
  sheet card over the page (scrim, card, Escape and ×), since it can't load
  in an Island host frame. Not a tab, and not a port of shipping's page.
  Blanc's own settings become sections inside chrome://settings, bound to
  Blanc prefs, with Google, Sync, Safety Check and AI sections removed; the
  separate Blanc page goes once they're in. S1.7 builds the S1 keys'
  controls; its generated check accounts for every v1.45.1 key (present,
  native, approved divergence, or a named later slice), and later slices add
  their own controls.
- 2026-11-03: the rest of S1.6 goes native. N4: only a tab that inherited
  its opener's sandbox is marked (Chromium can read the flags; shipping
  marks every page-opened tab), the mark keeps the flags in Chromium's
  session and Recently closed records, and a marked tab that is rebuilt
  loads its page again under them (`starting_sandbox_flags`) instead of the
  inert page; this replaces the earlier inert-page decision (V4). N8: secure DNS follows Chromium's settings and provider
  list (V11); WebRTC keeps shipping's policy through Chromium's preference.
  N22: the native blocker's hold replaces shipping's cancel-and-replay, so
  it is verified, not built. F19: Blanc's items go into Chromium's own page
  context menu.
- 2026-11-03: private tabs keep their own certificate decisions; Chromium's
  inheritance of regular-tab decisions into incognito is turned off (patch
  0016).
- 2026-11-03: HTTP sign-in challenges (F20) are refused as shipping's are,
  not shown in Chromium's credential dialog. Sandboxed page-opened tabs
  (N4) keep Chromium's native sandbox inheritance (how a restored one
  comes back: see the later N4 entry).
- 2026-11-02: no 1Password SDK (F38 1Password fill) in the Chromium builds
  either; people install 1Password from the Chrome Web Store, so F38's
  cases become an approved divergence and /1password is not offered.
Everything else already follows spec §4 (Chromium models, Blanc UI): engines
and suggestions through TemplateURLService and native suggest with Blanc's
privacy rules; chrome://settings restyled with Blanc sections (V1); Blanc
sheets over native bookmarks/history/downloads; Island find capsule over
FindTabHelper; a Blanc address menu; native sessions; native permissions with a
Blanc prompt; link children ungrouped (one patch where TabStripModel inherits
the opener's group); Glance stays a custom card; Close Tabs Below as one entry
through TabRestoreService if its group entries allow it.

## Native test ops
Built in d1984adb: slots 4–8 in previewPageCommand; closeWindow. Built for
S1.1: `handoffs` (typed hand-offs recorded under --blanc-test),
`externalLaunches` (every external launch and Blanc's decision),
`setSuggestionFixture`/`suggestionRequests`, `setBangsEnabled`,
`stubBangIconServer`/`bangIconRequests`/`bangIconStore`. Built for S1.2:
`tabTargets`, `hitTarget`, `setStoredUiLanguage`/`storedUiLanguage`,
`setIslandHoverOpen` (the host's `hoverState`/`setLastPointer` stand in for
shipping's hover hooks), `setIslandAutoHide`, `autoHideState`,
`setTestCursorPoint`, `setCursorSamplingUnavailable`, `captionAt` (the
native window-drag answer at a point), `setIslandAutoHideStyle` and
`holdIsland` (shipping's `holdIslandInWindow`). Built for S1.4:
`privateMenuItems` and `clickDockPrivateWindow` (macOS). Built for S1.6:
`authChallenges`, `resetAuthChallenges`, `inheritedSandbox`,
`networkPrivacy`, `addressMenuWired`, `addressMenu`, `runAddressMenuItem`,
`setTestClipboard`, `testClipboard`. Identified, not
built: sessionWindows (session.json-shaped projection); certificate decision
list/forget/cap; history visit + site icon seed; favorite favicon seed;
first-run/checklist/Patron/launch-Sunrise state once stored; address context menu
list/run; overlay drag flag; microphone capture seed.

## Next
1. S1.7 (F14): every S1.7 key is built and checked against v1.45.1's
   DEFAULTS (`tools/settings-keys.mjs`: none left to build), Blanc's sections
   sit inside chrome://settings and blocking-settings.html is retired.
   and the restyle is in. Deferred by the owner (2026-11-04): confirming
   Call audio in a real call on a machine whose WebRTC can connect. PR
   #1356 can merge into the fork branch without it.
2. F0.3 identity spike in `blanc-test` once signing is approved; then S1 work in slice order, moving each
   group's handlers to the typed interface as its rows are worked. Re-run
   affected cases with --only and merge-baseline.mjs.

## Intentionally uncommitted
No canonical `chromium/` changes are left uncommitted. Preserved, not staged:
`AGENTS.md`, `docs/chromium-migration-implementation-plan-2026-10-16.md` and
`experiments/chromium-extension-spike/` (earlier modified source, untracked
drafts, generated candidates and raw evidence; historical, mixed-qualification).
Outside Git: profiles, credentials, caches, apps and raw fixtures stay local.
Use `git status --short` for exact paths. Nothing in Git was discarded.
Deleted outside Git with owner approval (2026-10-31, 70 GB freed): the
Chromium 156 checkout (`~/Projects/BlancChromium`), the 157 recovery tree
(`~/Projects/BlancChromium157Recovery`), the
`workspaces/Chromium158-combined-copy-20261029` tree and the Oct 28–29
evidence folders; older notes that name them are historical. Kept: the 158
checkout and cache, the 157 fallback, signing, backups, profiles, toolchains.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — executable shipping cases on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | Not run for current candidate (previous baseline is stale) |
| Windows | Not run (640 cases) |
| Linux | Not run (640 cases) |

640 executable cases from 591 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux |
| --- | ---: | ---: | ---: |
| Not started / unassessed | 33 | 80 | 80 |
| Research only | 1 | 0 | 0 |
| Drafted | 7 | 0 | 0 |
| Implemented | 0 | 0 | 0 |
| Built, isolated (legacy) | 5 | 0 | 0 |
| Integrated, partial (legacy) | 3 | 0 | 0 |
| Integrated | 31 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 |
| Total | 80 | 80 | 80 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-41cadf1e05df1804; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
