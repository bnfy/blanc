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
D4 decided for Windows 2026-11-17: cross-compiled on the Android lane's Linux
server, tested on GitHub-hosted Windows runners. Approved with it: a second
checkout there, the Visual Studio toolchain package, one cold Windows build
and its incremental rebuilds, and one GN regeneration on the Mac Studio
(`docs/superpowers/specs/2026-11-17-windows-fork-design.md`). Linux desktop
hardware stays pending.

## Current work
- **2026-11-28 — Mini window: links from other apps open in one (#1734 part 3,
  shipping bnfy/blanc#1792).** Settings → Appearance has "Open links from
  other apps in a mini window" under the mini window shortcut, off,
  device-wide (local state `blanc.mini_window.links`, patch 0121), on the
  Mac only: Windows and Linux hand web links from other apps to Chromium's
  startup tabs, not `OpenExternalLink`, so there the switch would do nothing
  (as link rules don't). With it on, a link no rule claims joins the link
  profile's most recently used mini window as a new tab, or opens a new one
  on the link alone with no start page beside it. Last use is a serial
  bumped when a mini window opens, gains focus or takes a link, so links
  arriving together share one window before it is active; a closing mini
  window is never chosen, and a link stripped of a chromium: scheme never
  opens one. A link received before Chromium's startup window exists waits
  for it: `openStartupUrls` offers it to `ClaimStartupLink` (its rule, then
  the mini window), so a mini window never precedes the session's window.
  The two strings are fork strings until the Settings pin moves past #1792.
  Evidence on the Mac Studio's BlancPrototype (159.0.8154.33, incremental
  build, candidate `macos-feea0b0ffd8b05f4`, Island files from disk):
  `tests/native-mini-links.mjs` passes 5 of 5 through the app controller's
  own `application:openURLs:` (off by default; F61-12, two links in a row in
  one new mini window, the last in front; the most recently used of two
  mini windows; F61-13 with a rule to a Space; `ClaimStartupLink` on and
  off). Not checked: a cold launch by a link (the hand-off before startup),
  and anything by hand.
- **2026-11-28 — Mini window: switch to tabs and Spaces (#1734 part 2,
  shipping bnfy/blanc#1791).** A mini window's search lists this profile's
  tabs in its other windows, in Spaces held live and in saved Spaces (never
  private tabs or start pages), each saying which Space or window holds it,
  and offers this and other profiles' Spaces by name again. Picking a tab
  brings its window forward with it selected, or opens its Space with it
  selected (a held page rebuilt after a crash is found by address and
  place); picking a Space goes there; nothing moves, and an untouched mini
  window closes. One pick runs at a time. The panel's changes are
  `MENU_EDITS` on the pinned overlay.js and its three strings fork strings,
  until the Spaces menu pin moves past #1791; the list is one native read
  (`miniSwitchList`). Also fixed: a new mini window opened its search before
  its panel page listened, so that first panel showed without Favorites,
  history or tabs elsewhere (about half the native runs). Evidence on the
  same candidate: `tests/native-mini-switch.mjs` passes 6 of 6, four runs in
  a row (F61-9 to F61-11, a held Space, a double pick, a private tab);
  `tests/native-mini-move-to-space.mjs` 5 of 5 seven runs in a row (one
  earlier run timed out waiting for the window to close after New space… and
  did not recur), `tests/native-mini-windows.mjs` 4 of 4,
  `tests/native-link-routing.mjs` 6 of 6 and
  `tests/native-spaces-across-profiles.mjs` 20 of 20. Not checked by hand.
- **2026-11-28 — Mini window: Move to Space (#1734, shipping bnfy/blanc#1763).**
  A mini window's Island has shipping's Spaces button beside Open in Blanc,
  and its Spaces menu has shipping's move mode: this profile's Spaces and
  New space…, which file every tab into the Space, close the mini window and
  bring the Space forward (or open it in a new window at an ordinary
  window's size, `NewSpaceWindow`'s bounds, since Chromium's window sizer
  copied the mini window's 760 × 600). The menu files and their five strings
  come from `blanc/spaces-menu.json`, now at #1763's merge (870c400de), with
  one edit of their own (`MENU_EDITS`: the editor's tab count, as this
  payload has no `tabOrder`); the button and its styles are anchored edits on
  the v1.49.1 renderer (`tools/island-renderer.mjs`). The move is the host's
  (`moveMiniWindowToSpace` in `island/host.js`) on the native batch move it
  already had: one `spaceMoveTabs` per run of tabs, each run keeping its
  group, after `batchTabsMenuState`'s `canPlace` says every page can go (all
  or nothing; a private tab, sound, capture or a pop-up refuses with its
  reason); a later run waits out another window's Space write. Only the
  menu's move mode (`move: true`) moves; switching by name was refused
  until part 2 (below), which goes to the Space instead.
  Two differences from shipping: every start page stays behind and closes
  with the window, used or not (a Space record here holds only web pages;
  a grouped one leaves its group first), and pinned tabs arrive unpinned, as
  with every fork Move to Space (the native batch move). No patch changes.
  Evidence on the Mac Studio's BlancPrototype (159.0.8154.33, rebuilt
  incrementally with this change, candidate `macos-d823ed3fcd374089`):
  `tests/native-mini-move-to-space.mjs` passes 5 of 5 with the Island files
  from disk and compiled in (F61-6 to F61-8 through the real button, menu and
  editor, a start page in the moved group, the editor's count, the Space
  window's size, and the refusal of a move by name); the earlier candidate's
  compiled-in files, without the button, fail it (the positive control).
  `tests/native-mini-windows.mjs` passes 4 of 4.
  `tests/native-spaces-across-profiles.mjs` could not run there this time:
  it stops at its first "window in front" wait over SSH with unchanged files
  too, so it is unverified, not failed. Not checked by hand; Windows and
  Linux carry it in their next nightly. Also fixed: `tools/assets.mjs --out`
  threw on an undefined `spec`.
- **2026-11-27 — Windows video decoding.** Settings → System now exposes the choice
  previously available under `chrome://flags/#disable-accelerated-video-decode` in
  public Beta 159.0.8154.910. Both controls use the same Local State flag. The
  three-launch test in `tests/windows-video-decoding.cjs` passed on Windows 11 with
  private candidate `windows-x64-d346a0468749e3bf`. It checked both directions,
  the effective startup switch and the independent graphics acceleration setting.
  Including 0118, the desktop lane has 116 incremental patches covering 228 paths
  and 754 hunks (262 paths and 943 hunks with the foundation baseline).
- **2026-11-24 to 25 — Desktop lane on Chromium 159.0.8154.33 (plan `docs/superpowers/plans/2026-11-22-desktop-fork-chromium-159.md`, branch `chromium/rebase-159`, not merged).**
  Tasks 1–5 and 6: every desktop patch applies to the 159 Beta (`ab2e5d8ad16c`), the Mac Studio and
  the Linux server checkouts moved (owner approved 2026-11-24), and all eight desktop outputs build;
  `reports/rebase-159-preflight.md` has the patch, toolchain and build record. Task 6, on the 159
  prototypes with the Spaces menu fix (`tools/island-renderer.mjs`, F41-27):
  - **Mac** (`macos-0dd860d9e9c65826`): the full suite 637 pass, 0 fail, 30 excluded, as at 158; the
    environment API-key check, the pf outbound check (`beta-20261125T165912Z`: 20 controls, only
    localhost and the probe) and the active-session check (only localhost and the probe; it now runs
    with `--use-mock-keychain`, since a rebuilt unsigned beta's keychain prompt made the first run
    invalid) pass on the 159 BlancBeta. A copy of the owner's used 158.0.8127.37 Blanc Beta data (five
    profiles, 25 Favorites, Spaces, Sync) opened in the 159 Beta offline: the version moved to 159, and
    Favorites, Spaces, session URLs, Sync state and Island settings were unchanged in every profile, with
    no crash. The Touch ID passkey check is not due (no `webauthn` path in `standing.json` changed).
  - **Windows** (`windows-x64-dd191713b8f2ad9b`, run 45657910859): launch and frame pass; 633 pass,
    2 fail, 32 excluded. `local-profiles:27` passed on rerun; `F41:16` failed again (45679873683) but
    passed in the first 159 run (45632894403). The 159 beta's install smoke passed all 14 checks
    (45632900285). Windows night `20261124-0400` on 158.0.8127.37 failed seven cases; five of them pass
    on 159, and `F41:133`, which began failing with the .37 move, is intermittent on 159.
  - **Linux x64** (`linux-x64-435fe7054393ac0a`, run 45657907501): 634 pass, 2 fail, 31 excluded.
    `F41:133` passed on rerun; `island-and-commands:61` failed again (45680647667) but passed in the
    first 159 run (45632905414).
  - **Linux arm64** (`linux-arm64-00d2e79e6743b649`, run 45659618547): 634 pass, 2 fail, 31 excluded;
    `ad-blocking:77` and `island-and-commands:49` passed on rerun (45680651296), as the same timing
    cases did at 158.
  - The Studio's two nightlies stay paused (since 2026-11-24 19:09 UTC) until the branch merges (Task 7).
- **2026-11-19 — Spaces across profiles (spec `docs/superpowers/specs/2026-11-19-spaces-across-profiles-design.md` §6, plan `docs/superpowers/plans/2026-11-19-fork-spaces-across-profiles.md`; the owner said "go" after the plan merged in #1643), candidate macos-8614a3a373fe16f9:**
  With two or more Chromium profiles, the Spaces menu and the Quick Switcher
  list every profile's Spaces under their names, open another profile's
  Space in a window of that profile, and create a Space in another profile
  (empty start only), as shipping does since bnfy/blanc#1642.
  - **Listing:** each loaded profile copies its Space list into the Local
    State dictionary `blanc.spaces.profiles` (patch 0106, one registration
    in `browser_prefs.cc`), keyed by profile directory: id, name, color,
    symbol and tab count only, through the pure rules in
    `blanc/browser/ui/spaces_across_profiles.h`, checked against shipping's
    `src/main/spaces-across-profiles.js` by
    `tools/spaces-across-profiles.test.mjs`. `SpacesMirror`
    (`spaces_across_profiles.inc`) writes it on every change of
    `blanc.spaces.meta` and refreshes every window's menu when a profile is
    added, renamed, hidden, needs sign-in, or is deleted. Listing never
    loads a profile.
  - **Opening and creating:** `spaceOtherProfiles`, `spaceOpenInProfile` and
    `spaceCreateInProfile` load the profile with `profiles::LoadProfileAsync`
    and open a new window of it without session restore; that window's own
    Island host opens or creates the Space in its profile. A Space already
    on screen brings its window forward (restored if minimized). Duplicate
    requests join one load. A mini window answers `busy`.
  - **The menu:** #1642's `workspace-ui.js` and `overlay.js` and its nine
    strings come from their own pin, `blanc/spaces-menu.json` (#1658's
    merge, f91530b22, which carries #1642 and fixes a refused Quick
    Switcher open showing nothing and `/space <name>` offering the Profile
    choice), ahead of the renderer's v1.49.1;
    #1642's three `styles.css` rules are anchored edits
    (`tools/island-renderer.mjs`, `tools/spaces-menu-pin.test.mjs`). The host
    carries #1642's focus fix: a window brought forward stays in front when
    the menu closes. Another profile's row has no context menu.
  - **Evidence on the Mac Studio:** `tests/native-spaces-across-profiles.mjs`
    passes 20 of 20 (F41-83 to F41-92 through the real menu, editor and Quick
    Switcher; a private tab active in Personal still opening a normal Work
    window; the mirror written, following edits and read with Work unloaded;
    a rename reaching the heading; open from an unloaded profile; a double
    open joining one window; a deleted Space answering not-found; create;
    Chromium's deletion of a throwaway profile taking it off the menu). The
    shipping runner's F41 slice passes 84 of 84 and local-profiles 2 pass, 1
    excluded, as in the last nightly. Fork unit suite and `check-patches.py`
    pass (105 patches; 213 upstream files, unchanged by this work).
  - **Review:** each task was reviewed as it landed, and Codex reviewed the
    whole branch. Its five findings in this branch's code are fixed: two
    creates at once no longer drop a Space, the window made for a Space
    comes forward only once the Space is in it, a pending open rechecks the
    list, stale Local State entries are dropped at start, and the listing
    check lists through the menu. Its other two are in shipping's
    `workspace-ui.js` (#1642), which the fork takes as it is: a failed
    Quick Switcher open shows no error, and `/space <name>`'s editor offers
    the Profile choice. They belong in a shipping fix, then the pin.
  - **Not checked:** Windows (the cross build compiles the same code; no
    check ran there); a real mouse and finger on the menu; the menu at the
    smallest window with many Spaces; a site signed in only in Work (spec
    §9's hand check). F41-92 can only show that no sync state crosses
    profiles, because the fork's menu draws no Shared Spaces marks in any
    window. F41-83 to F41-92 are not in the shipping runner's inventory
    until it moves past #1642.
  - **Proposed divergences, for the owner:** V31 (a profile's Spaces are
    listed once it has been opened in a build with the Local State copy),
    V33 (other profiles in Chromium's profile-picker order) and V34 (no
    "Couldn't read this profile's Spaces." line), in the replacement spec's
    table. The plan's V32 and V33 became V33 and V34 because `chromium/next`
    recorded its own V32 the same day.
  - **Incident:** the first BlancPrototype rebuild for this work (20:23)
    replaced the app beta.8's outbound check was relaunching, which stopped
    the beta.8 release at that check; nothing was published, and the check
    passed on rerun against its own copy. Rule: never rebuild
    `out/BlancPrototype` while a release's checks run.
- **2026-11-18 — The Favorites manager (F63) in a tab of its own (owner approved the plan, `docs/superpowers/plans/2026-11-18-fork-favorites-manager.md`):**
  Favorites is bnfy/blanc#1614's page: a tab, shown as `blanc://bookmarks/`,
  with the F63 manager and its Edit dialog. Every way to it (⌘⌥B and the
  menus through patch 0012's `OpenUtilitySheet`, typed `blanc://bookmarks`,
  `openPage`, the sheets' nav links) opens or switches to that tab
  (`OpenFavoritesTab`, a singleton tab); a private window opens it in a
  regular window, as Chromium's bookmark manager does; the Start Page's
  Favorites link opens it in that tab, as #1614 does. The page is shipping's
  at its own pin, `blanc/favorites-page.json` (`3f9a3aff0`, #1614's merge),
  written and checked by `tools/favorites-page.mjs` with two declared edits;
  the manager's pages.css rules sit between markers in the fork's pages.css,
  and its `favorites.*` messages come from the same pin
  (`interface-strings.mjs`). `pages/favorites-adapter.js` is its
  `window.bowserPages`; `FavoritesHandler` (`favorites_page.inc`) answers
  only that page in a regular profile's tab, from `favorites_page::` in
  `utility_sheet_ops.inc` on Chromium's bookmark model: the tree (Other
  bookmarks, with the bar, mobile and account folders as fixed top-level
  folders), create, rename (a sibling's name merges), move and remove
  folders, move, reorder, remove and edit favorites (a Start Page pin
  follows an edit), with shipping's error codes. Nested folders are
  Chromium folders; a path is their names joined by ` › `
  (`favorite_helpers.h`). Sync, `/save`, imports and the Start Page now read
  and write whole paths; `NormalizeFavoriteFolders` splits a flat
  `A › B` folder into the nested pair and merges same-named sibling
  folders (the merge approved by the owner after the PR review), at the
  tree's first read. The bookmarks bar, mobile and account folders show
  under names that never repeat a top-level folder's (" 2"), in the tree
  and in every Favorites list alike; the tree has no cap, and a favicon is
  encoded again only when it changed. After those changes the Favorites
  check passed 8 of 8 again and the Favorites V30 cases passed on
  macos-f575679c518bca5c. Order and empty folders stay on this
  Mac: `favoritesLayout` is still kept whole and never applied (plan
  decision 3). The sheet's Favorites ops and bridge are gone. V30 (below)
  replaces ten v1.49.1 steps that assume the sheet. No upstream patch
  changed. Checked on the Mac Studio the same day: `gn gen` for
  BlancPrototype and BlancBeta with unchanged arguments (served.txt is a GN
  input), then a guarded incremental BlancPrototype build (6 steps) on
  candidate macos-ed0ac0f28dd90c86; `native-favorites-manager.mjs` passes
  8 of 8 (the tab from its command and a typed address, the manager drawn,
  nested create, move, reorder, rename, a refused cycle, folder removal,
  edit with refused addresses and the pin following, removal) and
  `native-new-tab-reuse.mjs` 9 of 9 (after the PR review's fixes, imports
  behind the editing policy and a move across account and local storage
  refused, the Favorites check passed 8 of 8 again on macos-48672c9cd81512a3);
  the V30 cases (internal-pages F16-2,
  F16-5, F16-8, F16-10; F9-3; F35-5; browser-migration F30-1, F30-2 and
  :28/:35) and sync.feature :38/:49, which share a replaced step, pass.
  Not yet: the strip doesn't take the page's color (#1614's page tint), the
  browser importer still keeps only each favorite's immediate folder, the
  flat-folder split and Sync of a nested path weren't run against a real
  profile or the local Worker, and the full suite hasn't run on it.
- **2026-11-17 — Carried checks come due on the Chromium version alone (owner: "Yes, narrow it"):**
  `release/standing.json`'s `anyChange` (`chromium/upstream/**`) also
  matched the pristine Chromium files pinned for each new patch, so
  patches 0087 to 0093 made every carried check due although Chromium did
  not change. `anyChange` is now empty, and a new `chromiumVersion` rule
  compares the `version` and `upstream` fields of
  `chromium/lanes/desktop.json` between a check's last pass and the
  release (`chromiumVersionAt` in `standing.mjs`, used by `beta-prep.mjs`).
  Each check's own paths still make it due. A dry run of beta.7's gates at
  the current head now carries all four: webauthn from beta.5,
  sparkle-N-to-N+1 from beta.6, desktop-sync and no-drm-handoff from beta.7;
  only production-sync-real-device stays waived. A new Chromium makes all
  of them due again (unit test).
- **2026-11-17 — desktop-sync rerun for beta.7 (owner: "Rerun Sync"):**
  due because the importer changed Sync's code. Both parts pass, the same
  way as beta.6's: `native-sync-organic-tabs.mjs` on the prototype
  macos-cbb4a951532f5900 (6 of 6: pages reach the peer on the runner's own
  timers, in a Space, after a relaunch and after joining again) and
  `beta-sync.mjs` on a local-qualification beta.7 built from the same source
  (5 of 5, every Sync request on the Mac Studio). Evidence at
  `evidence/foundation/beta7/desktop-sync.json`, pinned in
  `release/standing.json` as desktop-sync's last pass from `18d761d3c`. The
  Studio's `out/BlancBeta` was switched to the local-qualification arguments
  for that build (`records/beta7-local-qual/`) and put back to the release
  arguments afterwards, as for beta.6. Still due for beta.7 by the
  `anyChange` glob: webauthn (owner) and sparkle-N-to-N+1.
- **2026-11-17 — Importer: Sync's failure paths (candidate macos-cbb4a951532f5900):**
  from a source review the owner passed on. Two faults, both confirmed in
  the code before fixing. (1) Personal was marked imported before Sync was
  staged, and a failed staging write showed only as `staged: false`, which
  Settings never read; a second run skipped Personal, so Sync was never
  tried again. Personal's marker now carries Sync's own state (`staged`,
  `none` or `failed`); a run that finds `failed` stages Sync alone and
  imports nothing else twice; Settings says "Your data is here, but Sync
  couldn't be set up. Try again to set up Sync." (a new fork string in six
  languages, translations unreviewed) and offers Try again. (2) At launch
  the staged stores were moved with failures ignored and the staging folder
  deleted anyway. Each store is now copied, put in place and compared;
  `sync.json`, which turns Sync on, goes last; the staged copy is removed
  only when every store is in place, so a failed move is taken up at the
  next launch. Test hooks: `setImportSyncStagingFails` and the switch
  `--blanc-test-sync-adopt-fail`, both compiled out of beta and release
  builds. `native-profile-import-sync.mjs` now has 6 checks, adding a
  failed staging write with its retry through Settings, and a failed move
  across two relaunches; the importer's other tests pass (11 and 7). The
  new checks were not run against the build before the fix. A Personal
  imported before today has no Sync state in its marker and is treated as
  done.
- **2026-11-17 — The no-drm-handoff standing waiver is retired from beta.7 (owner: "Yes, retire it"):**
  `release/standing.json` sets the waiver's `until` to 2.0.0-beta.7, so
  from that beta the gate must pass. It passes as a carried check:
  `native-protected-media.mjs` on the prototype (8 of 8 on
  macos-1400e3914b1a7bdf, source `ded39777f`), evidence pinned at
  `evidence/foundation/beta7/no-drm-handoff.json` on the Mac Studio, due
  again when the notice's code changes. Protected video still does not
  play (no Widevine), so the limitation stays listed: a new `keptLimits`
  list keeps a retired waiver's line in the release notes and on the
  website, whose page text therefore does not change. The release-notes
  line now says the beta shows a notice offering the regular Blanc. Not
  covered by the evidence: the notice on live sites and the real handoff on
  a notarized beta (the owner's hand check). **For the next beta, seen in a
  dry run of its gates:** desktop-sync is due (the importer changed Sync's
  code), and webauthn (the owner's Touch ID check) and sparkle-N-to-N+1
  show as due because `anyChange` (`chromium/upstream/**`) matches the
  pristine files newly pinned for patches 0087 to 0093, although the
  Chromium version did not change. Whether that glob should be narrower is
  the owner's standing decision; nothing was changed.
- **2026-11-17 — Close-out of the macOS remaining-work plan; tracker moved to macos-1400e3914b1a7bdf:**
  the nightly full suite 20261117-0700 passed on the merged head
  `ded39777f` (bnfy/blanc#1586): 635 of 667 pass, 1 fails
  (`link-routing.feature:37`, passed on its rerun), 3 undefined (runner
  gaps), 28 excluded. The tracker's candidate, baseline and every
  suite-backed row's counts are from that run (F41 84 of 84 now that the
  Spaces fade case is fixed, F37 9 of 9 with the New Tab reuse cases, F60
  6 of 7 for the link-routing flake). N13 and N17 move to Integrated on
  their rechecks; F51 stays Implemented, inert until a release version.
  macOS rows: 70 Integrated, 8 Implemented, 2 not started by owner
  decision, 1 research, none Verified. What remains for the owner, the
  decisions and what is left to build are in §7 of
  `docs/superpowers/plans/2026-11-16-macos-fork-remaining-work.md`.
- **2026-11-16 — The Start Page import no longer costs the phones a request (candidate macos-1400e3914b1a7bdf):**
  the iPhone and iPad unit test `MobileStartPageTests.testFavoritesWidgetListsAndFollowsFavorites`
  failed on bnfy/blanc#1586. The phones share `newtab-adapter.js`, and the
  importer's change made every Start Page ask `importRead` before its data,
  a request only the desktop browser answers. The page now asks only when
  the desktop browser's `firstRun` answer carries `startPageImport`, which
  it sets while wallpaper choices are waiting. `native-profile-import-start.mjs`
  (3) and `-settings.mjs` (7) pass on the new build; the iPhone tests are
  CI's to confirm.
- **2026-11-16 — Mute Site is Chromium's sound setting (V21; candidate macos-4148a26f1387076a):**
  the recheck found Mute Site kept its sites in memory, as shipping does,
  not as approved divergence V21 says. The owner confirmed V21 on
  2026-11-16. Mute Site now writes Chromium's own sound setting for the
  site, as Chromium's own Mute site does, so a muted site stays muted
  after a relaunch until it is unmuted and shows in Chromium's site
  settings. A private profile reads the regular profile's sites and keeps
  its own changes for its session (Chromium's map; not tested here). The
  per-tab mute, the unmute of one tab on a muted site and the background
  guard are unchanged. Difference from before: the setting is per origin
  (scheme, host and port), where the in-memory set was per host.
  `native-recheck-n13.mjs` passes 4 checks, now asserting muted after a
  relaunch and unmuted after an unmute and a relaunch. Shipping's step
  "the tab on {string} is not muted", used only after the relaunch in
  "Mute Site lasts until Blanc quits", is rebound to V21 in
  `fork-steps/divergences.mjs`; that scenario and the Glance mute cases
  pass. The rest of the suite was not re-run. GN was regenerated with
  unchanged arguments after the merge with `main` (an Android-only
  argument in `config.gni`).
- **2026-11-16 — Rechecks for N17, F51 and N13, and the Spaces fade flake (candidate macos-f581c659f1207624):**
  three new tests, all passing on the Mac Studio. **N17 Invite**
  (`native-recheck-n17.mjs`, 2 checks): `/invite` hands the mail app
  shipping's email (no recipient, its subject, greeting, pitch and the
  blanc.day invite link), and with no mail app puts the text on the
  clipboard and says so. A test launch opens no mail app; a stand-in says
  whether one would answer (`setInviteMailApp`, `inviteHandoffs`). **F51
  What's New** (`native-recheck-f51.mjs`, 4 checks, `--blanc-test-version`):
  nothing without a release version; after an update the pill shows with
  the version and its changelog link; opening the link or closing the pill
  ends it across a reload and a relaunch; the next update shows it again.
  Not exercised: the page-found path and its one-time tab (offline).
  **N13** (`native-recheck-n13.mjs`, 4 checks): Mute Site silences the
  playing tab and every tab on the site, old and new, and Unmute Site
  restores them; the Island takes the page's color, and Match site colors
  off clears it. **Finding:** after a relaunch the site is no longer muted.
  The code keeps muted sites in memory, as shipping does, so divergence V21
  (approved 2026-11-05: Chromium's own sound setting, kept across a
  relaunch) is not what is built, and shipping's scenario "Mute Site lasts
  until Blanc quits" passes. Owner to decide which stands. **K10:** the
  Spaces menu fade case (`F41-named-workspaces.feature:211`) failed 4 of 5
  when run alone. A probe showed the test pressed Escape before the fork's
  overlay had drawn the menu, so there was nothing to fade; shipping's hook
  delivers the show before the key. `pressOverlayKey` now waits for the
  overlay to draw the host's mode: 6 of 6, and the whole F41 file passes
  (84 cases). The menu itself was not changed. The tracker rows move at the
  next nightly refresh.
- **2026-11-16 — Electron profile importer: the Start Page's settings (candidate macos-14061c5b07c620fd):**
  the import now carries the Start Page's layout, the clock's six values,
  the wallpaper choices (time of day, color, preset, fill, wash, style) and
  the person's own image. The layout and clock are preferences the browser
  sets; the wallpaper lives in the Start Page's own storage, so it waits
  for the profile's next Start Page, which stores it once
  (`start_page_import.inc`, `importRead` / `importDone`). Widgets nobody
  has changed follow the imported layout. `native-profile-import-start.mjs`
  has 3 checks; the other importer tests pass (11, 7, 4). Trials on both
  real copies: no errors, sources unchanged; the Mac Studio copy, which
  shows its own image, carried it, and the MacBook Pro copy, which does
  not, carried none. Not carried: following a Space's color. Not seen on
  screen by the owner. The shared Start Page adapter changed, so Android's
  copy was regenerated; Android answers the new request as unsupported and
  carries on.
- **2026-11-16 — Electron profile importer: the result list (candidate macos-88c3fcc0786de627, patch 0093):**
  after an import, Settings, About lists each profile by its own name with
  what came across, names a profile that could not be read, and says what
  is never imported (website sign-ins, the downloads list, a few settings).
  The labels are shipping's own strings; three new lines are fork strings
  in six languages, translations unreviewed. Profile names reach the
  Settings page only; test hooks and the real-data tool still get counts
  and codes. `native-profile-import-settings.mjs` has 7 checks. The trial
  on the MacBook Pro profile copy was repeated on this build: no errors,
  five profiles, source unchanged. Not seen on screen by the owner.
- **2026-11-16 — Electron profile importer: second trial on real data (candidate macos-a094fb86f8dba413):**
  the data files of the MacBook Pro's Blanc folder (v1.49.1, 30 stores,
  Personal and four named profiles) were copied to the Mac Studio's
  `~/Projects/Blanc/scratch/real-import/` and imported from the copy into a
  throwaway test profile, counts only. **Two real faults found and fixed:**
  a `history.json` written before Blanc kept site icons has no `siteIcons`
  list, so two named profiles were refused whole (`invalid-shape`); the list
  is now optional, and still refused if present and not a list. And a Space
  with no saved tabs was dropped without a word; it is now kept by name,
  color and symbol with one new tab, since the fork has no Space without a
  tab (an empty saved window is still nothing to open). Tests for both in
  `profile-import.test.mjs` and `native-profile-import.mjs`. Result after
  the fixes: no errors; Personal 25 Favorites, 4,996 visits, 232 site
  icons, 21 permissions, 1 pin, 10 archived tabs, 1 Space, one saved window
  of 24 tabs in 3 groups with 23 left unloaded; four Chromium profiles
  created (1, 22, 41 and 3 visits; one with 2 Spaces); 26 settings copied
  and 7 converted; the copy's stores hash the same before and after. The
  history read-back reports 3,581 added for Personal's 4,996 visits;
  Chromium's count takes an address once a day, which is the likely
  reason, not checked visit by visit. Still not tried: the real Keychain
  prompt and a real Sync account (the owner's check).
- **2026-11-16 — Electron profile importer: first trial on real data (candidate macos-911d46dcfc30de03):**
  the Mac Studio's own Blanc folder (v1.49.1, 17 stores, one profile) was
  copied to `~/Projects/Blanc/scratch/real-import/` (a private APFS copy,
  which is also the backup; the original was not touched and Blanc there
  was not quit) and imported from the copy into a throwaway test profile
  with `tests/real-profile-import.mjs`, which prints counts, store names
  and reason codes only. Result: no errors in 0.3 s; 45 Favorites, 436
  visits, 43 site icons, 3 pins, 2 permissions, 26 settings copied and 7
  converted, one saved window of 10 tabs with 9 left unloaded; no
  `workspaces.json`, `archive.json` or `profiles.json` in that folder, which
  the importer treats as absent; the copy's stores hash the same before and
  after. Sync was staged with its key `unavailable`, as a test launch reads
  no Keychain item. **A real bug found and fixed:** an install older than
  shipping's first-day signals has the word "legacy" for its date, not a
  number, so the install id was refused; it is now kept, with the date 0
  (a new check in `native-profile-import-sync.mjs`). The synthetic fixture
  has only the number form. Not tried: a profile with named profiles and
  Spaces (the MacBook Pro's has four profiles), and the real Keychain
  prompt.
- **2026-11-16 — Electron profile importer, task 8: the Settings command and the profile picker (candidate macos-91f427ea33bb6e2a; patch 0093):**
  Settings, About has a row, "Bring your data from the released Blanc app",
  with **Import**. The page sends no path: the browser takes the released
  app's own folder (`~/Library/Application Support/Blanc`), refuses while
  that app is running (`NSRunningApplication` for `me.bnfy.bowser`), runs
  the importer and replies with counts and codes, which the page turns into
  one line (your data is here; Sync picks up after a restart; sign in to
  Sync again; already imported; no data found; quit the released app;
  update it to 1.40; some data left out; didn't finish) and **Try again**
  where that helps. A test launch reads neither the real folder nor the
  real app's state. After an import that created a profile the importer
  switches off Chromium's own `profile.show_picker_on_startup` (owner
  decision), so the next launch opens Blanc's windows. The fourteen new
  strings are in `blanc/fork-strings.json` in six languages, which
  `settings-strings.mjs` now also reads (`FORK_STRINGS`); the translations
  were written here and not reviewed by native speakers.
  Evidence on the Mac Studio: `native-profile-import-settings.mjs` 6 of 6
  (the row; no source; the released app running; the import; a second run;
  no profile picker and a Blanc window after a relaunch with two profiles);
  `native-profile-import.mjs` 11, `native-profile-import-sync.mjs` 4 and
  `native-trust-receipt.mjs` 3 still pass.
  **Not done:** the row was not looked at on screen; a detailed list of what
  came across and what did not; the replacement build's automatic import on
  first launch; the Start Page's own settings and wallpaper; a real profile
  and the real Keychain prompt (the owner's check, after a backup); the
  beta's profile gate (`release/profile-evidence.mjs`) checks that a launch
  creates or changes nothing in the released app's folders, which stays true
  because the importer only reads them, and only on the person's command;
  no gate yet runs the importer itself or covers its Keychain read.
- **2026-11-16 — Owner decisions for the importer's last task:** (P1) Blanc
  Beta's Settings gets an import command now, and the replacement build
  also imports automatically on first launch. (P3) After an import that
  created a profile, the importer turns off Chromium's own "show the profile
  picker at startup" setting, so Blanc reopens its windows as the Electron
  app did. Importer plan, task 8.
- **2026-11-16 — Electron profile importer, task 7: Sync's stores and key (candidate macos-22d3967de015b079):**
  the plan passes Electron's protected Sync key on as it is (a legacy plain
  key never). The browser opens it with the password of Electron's Keychain
  item (`Blanc Safe Storage`, read with `SecItemCopyMatching` and nothing
  else; OSCrypt v10: PBKDF2-HMAC-SHA1, AES-128-CBC), checks it is a 32-byte
  key and protects it again with the fork's own Encryptor. Sync's stores
  (`sync.json`, `tab-sync.json`, `tab-icons.json`, `sends.json` and
  Personal's `shared-spaces.json`, `synced-closed.json`) are staged in
  `<Default>/BlancSyncImport/`, `ready` written last, and
  `AdoptImportedSyncStores` (desktop_sync_service.cc) moves them into
  `BlancSync/` at the next launch before the runner reads its stores, unless
  that profile is already syncing. Where the key cannot be opened (the
  Keychain read refused, a wrong password, no protected key) the stores are
  staged with Sync off and the device identity kept. A test launch never
  reads the real Keychain item.
  Evidence on the Mac Studio: `native-profile-import-sync.mjs` 4 of 4
  (refused: the rest imports and Sync is off; kept: the same key under the
  fork's protection, the stores staged with the same device id; a wrong
  password is a refusal; after a relaunch the live Sync folder holds the
  imported stores, device id and key and the staging folder is gone);
  `native-profile-import.mjs` and `native-tab-handoff.mjs` still pass;
  `profile-import.test.mjs` 11 of 11.
  **Found:** once the import has created a second profile, Chromium opens
  its profile picker at the next launch instead of the saved windows
  (owner decision P3 in the importer plan).
  **Not done:** the real-account check and the real Keychain prompt (the
  owner's, after a backup); Sync actually resuming against the production
  service; Windows and Linux key formats.
- **2026-11-16 — Electron profile importer, task 6: site permissions; the downloads list left behind (candidate macos-a458cc792c40c1c5):**
  each profile's saved answers for microphone, camera, location and
  notifications are written to Chromium's content settings
  (`SetContentSettingDefaultScope`, origin for both sides). An old
  `origin|media` answer covered both devices: a deny is kept for both, an
  allow is asked again, as shipping reads it. Only http and https origins,
  only allow and deny. **Owner decision:** the downloads list is not
  imported (files stay on disk; Chromium's own list is used); the answer key
  and the plan builder name it as left behind. Evidence on the Mac Studio:
  `native-profile-import.mjs` 11 of 11 (the four answers read back; old
  broad deny and allow; an unknown answer and an invalid origin ignored);
  `permissions-and-auth` scenarios still pass; `profile-import.test.mjs` 10,
  `importer-fixtures.test.mjs` 15.
- **2026-11-16 — Electron profile importer, task 5: named profiles (candidate macos-2b57f628562ead96):**
  the importer works through the plan's profiles in turn: Personal into the
  first profile, then each named profile into an ordinary Chromium profile
  created with `ProfileManager::CreateMultiProfileAsync` (the Blanc name,
  Chromium's placeholder avatar). A profile's data is converted in full
  before its profile is created, the apply waits for the new profile's
  Favorites to load, and its saved windows open in it. The marker records
  each profile's `directory`. Nothing Blanc-specific is kept beyond that
  (owner direction, 2026-11-16).
  Evidence on the Mac Studio: `native-profile-import.mjs` 10 of 10: a
  damaged Personal store fails Personal only while the named profile still
  imports; the named profile has its own Favorites, 5,000 visits, pin,
  archived tab, Space and window; the profile being deleted is not created;
  Personal's Favorites stay its own; nothing is created twice.
  **Divergences from Electron Blanc, recorded for the owner, not built:**
  (1) *Settings scope:* Electron's device-wide settings (Island size,
  auto-hide, quiet delay and the rest) land in Personal only; a named
  profile starts on Chromium's per-profile defaults. (2) *Deleting a
  profile* is Chromium's own confirmation, with no typed-name check and no
  crash-resumable deletion. (3) *Avatar and color:* imported profiles get
  Chromium's placeholder avatar; Blanc profiles had none. (4) *Profile ids:*
  Electron's opaque ids exist only in the import marker, so link routes,
  which name a profile by id, are still not carried. (5) *The picker:*
  whether Chromium shows its profile picker at launch once several profiles
  exist was not checked. (6) A second import after the marker is lost would
  create a second profile of the same name.
- **2026-11-16 — Owner direction on profiles:** use Chromium's own profile
  feature to the fullest before building custom support to match the
  Electron build. The importer's named profiles become ordinary Chromium
  profiles (standard creation, Chromium's per-profile settings, Chromium's
  picker, rename and delete); differences from Electron are recorded as
  divergences, not coded around. Importer plan, task 5.
- **2026-11-16 — Electron profile importer, task 4: the open session (candidate macos-beb93342b0ee850e):**
  each of the first profile's saved windows (`session.json` v2, at most ten)
  opens as a window of its own: tabs restored unloaded with their titles,
  pins with their home address, groups with name, color and folded state,
  two-pane splits with their ratio and focus, and the saved current tab
  loaded. `ConvertImportedWindow` is shared with the Space conversion and
  keeps each kept tab's place in the saved columns. **Found on the way:** the
  first tab added to a window is always shown and loaded, whichever it is,
  so the current tab is added first and the others placed around it (the
  handoff and tab-import batches never met this because they make their
  first tab current). Evidence on the Mac Studio:
  `native-profile-import.mjs` 9 of 9 (the saved window with its pin, group,
  color, split and current tab; the tab behind the split unloaded with its
  saved title; no window from another profile; none opened twice), two
  probes with other window shapes (current tab last; no split), and
  `arc-spaces-import` and `native-tab-handoff` still passing.
  **Not done:** windows of named profiles (task 5); splits inside a saved
  Space; a tab's custom name; three-pane and grid splits (the fork has
  two-pane splits only); placing a window where it was.
- **2026-11-16 — Electron profile importer, task 3: settings and the install id (candidate macos-2fde2b7b2c1ae676):**
  `chromium/settings-keys.json` is at v1.49.1 (85 keys, `reuseNewTab`
  added) and marks each importable key with an `import` field (its
  preference, and the values or range it may take). The bundle builder turns
  those into the plan builder's rules with each preference's registered type;
  the plan carries `settingsPrefs` `{prefs, skipped, notCarried}`. In the
  browser the seven keys Sync carries go through Sync's own converter
  (`ApplyDesktopSyncSettings`), and the rest are written only into a `blanc.`
  preference (or `search.suggest_enabled`) registered with the same type, in
  the profile's store or Local State. A value the fork would refuse is
  skipped and named. The install id and its dates replace the fork's own in
  Local State. Settings land in the first profile only for now.
  Evidence: `native-profile-import.mjs` 8 of 8 on the Mac Studio (Island
  size, hover-open, quiet delay, page zoom, Ctrl+Tab order, usage
  measurement, first-run time, theme, Bangs, blocking exceptions and the
  install id read back; an invalid surface style skipped);
  `profile-import.test.mjs` 10 of 10.
  **Not carried yet:** the Start Page's own settings (they live in the page's
  storage), link routes (they name profile ids), the mouse gesture mapping,
  the WebRTC policy, secure DNS, recent Bangs and the checklist markers.
- **2026-11-16 — Electron profile importer, task 2: the runner, the marker and the Personal profile's data (candidate macos-0998ddd2080544a0; patch 0092):**
  `profile_import.inc`. *Reading:* the browser reads the folder's known
  stores only (regular files, never through a link, 32 MiB each and 256 MiB
  in all, profile folders by id pattern, at most 64) and never writes there.
  *Planning:* `ProfileImportRunner` starts the sandboxed service with the
  pinned profile-import bundle (hash checked, 60-second limit, every host
  call refused). *Applying:* a profile's stores are all converted first
  (`PrepareImport`); then Spaces are written (the one write that can refuse),
  then Favorites (`browser_import::Import`), history (`AddPage` with each
  visit's own time, then titles), site icons, Start Page pins and the Tab
  Archive. *Marker:* Local State `blanc.profile_import`
  `{sourceVersion, profiles: {personal: {importedAt}}}`; a second run reports
  `alreadyImported` and writes nothing. Only the first (`Default`) profile is
  imported so far; reached only through the test hook `profileImportRun`.
  Evidence on the Mac Studio: `native-profile-import.mjs` 7 of 7 (failed on
  the build before): a damaged store leaves the profile untouched; a
  non-Blanc folder and a v1.39 source are refused; Favorites in order with
  their folder; 5,000 visits with their own times; the pin; the archived
  tab; the Space with its name, color, symbol and tab; the source folder
  byte for byte unchanged; nothing imported twice. Also
  `arc-spaces-import` 7 of 7, `find-favorites-history` 7 of 7,
  `native-tab-handoff` 9, `native-protected-media` 8.
  **Not done or not checked:** splits inside a Space; site icons on screen;
  a real profile (only the synthetic fixture was imported); the service's
  size limit for a very large real history or icon store.
- **2026-11-16 — Electron profile importer, task 1: the plan builder (plan `docs/superpowers/plans/2026-11-16-electron-profile-importer.md`):**
  `shims/profile-import.js`, built into `generated/profile-import-bundle.js`
  (pinned hash in `profile_import_bundle_hash.h`) by
  `tools/build-profile-import-bundle.mjs`, turns the text of an Electron data
  folder's stores into one plan: each listed profile's stores in shipping's
  shapes, the device's stores, what is left behind with reasons, and which
  profile failed. It has no prelude and makes no host call. Rules from the
  answer key: tombstones dropped, 5,000 visits, only promptable permission
  kinds, private downloads never, a half-finished profile deletion finished
  by not importing it, folders read only for profiles the registry lists,
  the Sync keys never in a plan. A damaged store fails its own profile only;
  a source older than v1.40.0, or with no readable settings, is refused
  whole. The source version is read from `settings.lastRunVersion`, which a
  real profile that never recorded one would fail: to check against real data
  in task 2. The answer key now carries the owner's answers (synced settings
  to Personal only; every Sync field but the keys), so `undecided` is empty.
  `profile-import.test.mjs` 9 of 9, `importer-fixtures.test.mjs` 15 of 15.
  Not built into the browser yet: no build was needed or run.
- **2026-11-16 — The protected-video notice (X2 beta requirement, plan K8; patch 0091; candidate macos-e1f8cb12fc0a503f):**
  a page asking for protected playback gets a card under the Island: "Blanc
  Beta can't play this video yet" / "Protected video works in the released
  Blanc app." with **Not now** and **Open in released Blanc** (owner's
  design and wording, 2026-11-16; the first wording, "This video needs
  Blanc", was dropped because a person in the beta already thinks of it as
  Blanc). Where the Electron app is absent the action is **Get released
  Blanc**, which opens blanc.day/download in a tab.
  *Signal:* Blink's own use counter for `requestMediaKeySystemAccess`
  (`kEncryptedMediaSecureOrigin`), read by a page-load observer
  (`protected_media.inc`; patch 0091 registers it in
  `page_load_metrics_initialize.cc`), so no renderer change. It does not
  name the key system: a page asking only for Clear Key, which the beta can
  play, is noticed too. *Behavior:* the notice belongs to the page that
  asked (a new page load clears it) and shows only while its tab is current;
  an open Island panel, a sheet or a permission prompt takes its place; it
  never takes focus; Not now and the handoff put it away for that site until
  Blanc quits. *Handoff:* the page's address goes to the app with bundle id
  `me.bnfy.bowser` through NSWorkspace; only http and https; a private tab's
  address is handed off too (owner, 2026-11-16: keep it; the released app
  opens it as an ordinary tab). A test launch records the handoff and starts
  nothing. *Strings:* shipping has no words for this, so the fork has its
  first own catalog, `blanc/fork-strings.json`, merged into the Island's
  `strings.js` by `interface-strings.mjs`; every key must carry all six
  languages and may not shadow a shipping key (unit-tested). The five
  translations were written here and not reviewed by native speakers.
  *The browser serves its pages without queries* unless one is allowlisted,
  so the notice's document asks the host which action it carries.
  Evidence on the Mac Studio: `native-protected-media.mjs` 8 of 8 (failed on
  the build before); `permissions-and-auth` 6 of 6, `island-and-commands` 67
  of 67, `native-tab-handoff` 9, `native-new-tab-reuse` 8,
  `native-capture-indicator` 5. Screenshots:
  `docs/chromium-replacement/images/protected-video-notice-{light,dark}.png`.
  **Not done:** no check on live sites (a test launch blocks outside
  network), so whether sites such as YouTube ask for protected playback on
  ordinary videos is unknown; the real handoff to an installed Electron
  Blanc was not exercised; the standing waiver `no-drm-handoff` stays until
  the owner retires it; Windows and Linux have no handoff.
- **2026-11-16 — Owner decisions for the protected-video notice and the importer:**
  (1) the notice is a capsule under the Island, like the permission prompt:
  "This video needs Blanc" / "Blanc Beta can't play protected video yet." /
  **Not now**, **Open in Blanc**; it goes when the person leaves the site.
  (2) Site sign-ins are not migrated: people sign in again. (3) The synced
  settings of Electron's one device-wide `settings.json` go to Personal only.
  (4) Sync stays on across the move: device identity kept, the key
  re-protected (one Keychain prompt). Recorded in the plan, section 2d.
- **2026-11-16 — Shipping target moved to v1.49.1 (plan K13), and Chromium 158's action dispatch (candidate macos-bed55af2cf2cf43d):**
  the pins, the generated Island renderer, the interface, menu and Settings
  strings, the asset copies and the Android strings copy are at v1.49.1
  (`673ff2eb`); the inventory is 618 declarations, 667 cases. The host sends
  `panelSideClearance` with the panel, as shipping's main does. New at
  v1.49.1 and now bound: F37-5..9 (New Tab reuse; the runner turns reuse on
  for the cases shipping's `support/hooks.js` does), F37-9's New Private Tab
  command, and F28-21 (the rail's Space mark clear of the traffic lights,
  read from the real window through the `windowButtonPosition` hook).
  **Found by F37-9:** Chromium 158 runs browser commands through its actions
  (`features::ShouldUseActionsForBrowserCommands`, on by default), so the
  menu and keyboard never reach `HandleCommandWithDisposition`, where patches
  0011, 0012, 0019, 0076 and 0086 answer ⌘⇧N and the sheet commands. ⌘⇧N
  therefore opened a separate private window, not a private tab (shown with
  logging in a test build; no real key was pressed, and Blanc Beta
  2.0.0-beta.5, on the same Chromium, was not checked). Fixed without a new
  upstream hunk: `ExecuteIslandCommand` answers New Private Tab, History,
  Downloads, Favorites, Settings and About from `ExecuteForFocusedGlance`,
  the one call every command still passes (patch 0074). Whether the sheet
  commands were broken before is not known. The switch edits in those five
  patches are now dead code, to remove at the next patch consolidation.
  Evidence on the Mac Studio: `blank-tab-affordance.feature` 9 of 9,
  `vertical-tabs.feature` 20 of 20 (1 excluded),
  `native-new-tab-reuse.mjs` 8 checks (the command opens a private tab, then
  reuses it; four sheet commands open their sheets), and
  `native-tab-switch`, `-dock-menu`, `-tab-handoff`, `-trust-receipt`,
  `-capture-indicator` and `-window-size-relaunch` pass.
  **Full suite on this candidate (Mac Studio, 2026-11-16):** 633 of 667
  cases pass, 3 fail, 3 undefined, 28 excluded (the 07:00 nightly at
  v1.49.0: 629 of 661, 1 fail). `link-routing.feature:37` passes alone.
  Two fail again alone and are **open**: (1) `sync.feature:120` (F27-12,
  the Other devices drawer in a 640 by 480 window at 125%): the tab list is
  52px, under the two rows asked for. Measured: v1.49.1's
  `panelSideClearance` (92px a side on macOS, same number as shipping's
  `chrome-layout.js`) makes the panel 328px wide, the footer wraps to three
  rows (105px) and the list loses the room. Whether shipping passes this
  case on a Mac at v1.49.1 was not established (its scenario would not
  launch from the Studio's node_modules). (2)
  `island-and-commands.feature:49` (F1-6, motion inside the Island opens
  it): the hover state never reports inside. It passed in the nightly; its
  neighbor `:61` was already pointer-dependent. Not diagnosed.
  **F27-12 fixed (candidate macos-7aef7a5dc6e2a13c):** shipping passes the
  case on the Mac Studio at v1.49.1 with the same 328px panel and three-row
  footer, but its panel starts 12px from the top; the fork's started at 48px.
  `prototype.css` still carried the fork's own narrow-window rule (below
  800px wide, drop the panel 48px to clear the window buttons), which
  shipping's side clearance now replaces. The rule is removed, so the panel
  sits where shipping's does. `sync.feature` 18 of 18 and
  `island-and-commands.feature` 66 of 67 on that build; the tracker's
  baseline stays the full run on macos-bed55af2cf2cf43d until the next
  nightly. **F1-6 was the test bench, not the fork:** the Mac Studio's
  real pointer was resting inside the test window, over the page. When the
  panel opens, Chromium re-reads the real pointer, the host sees it leave
  the Island (a trusted mouseleave at the real pointer's coordinates, logged
  in a probe) and the hover-opened panel closes, as it should for a person.
  This is the cause of the pointer-dependent hover flakes. The runner now
  moves the test window clear of the real pointer before `@island-hover`
  cases (`tests/lib/real-pointer.mjs`; the pointer is read, never moved) and
  records what it found on the case. `island-and-commands.feature` 67 of 67.
  **Tab handoff names the window's profile (candidate
  macos-b318dc8cdfcc630e):** the sheet said Personal for every profile; the
  projection now carries the profile's name (empty for the first profile
  under its default name, which the page calls Personal).
  `native-tab-handoff.mjs` 9 checks; the new one failed on the build before.
  **Test runs moved to the Mac Studio (owner, 2026-11-16):** no fork test
  window opens on the MacBook Pro. Staging is `~/Projects/Blanc/scratch/tests`
  (`repo`, a worktree apart from the pinned release checkout; `app`, a copy
  of the build; `config.json`); windows launched over SSH draw there.
- **2026-11-16 — Tab handoff (N20; candidate macos-6e37801aafbe77a1; design `docs/superpowers/specs/2026-11-16-fork-tab-handoff-design.md`, approved by the owner with D1–D3):**
  the Bring Your Tabs extension's `blanc-import://tabs?v=1&id=…&key=…` link.
  `OpenExternalLink` hands such a link to `TabHandoff` (`tab_handoff.inc`)
  and it is never a navigation, a tab or a history entry. A short-lived
  sandboxed service (`HandoffRunner`, host refusing every call) runs
  shipping's `tab-import-handoff.js` at v1.49.1 unchanged
  (`tools/build-handoff-bundle.mjs` → `generated/handoff-bundle.js`, SHA-256
  pinned in `handoff_bundle_hash.h`): it reads the link and returns only the
  claim address; the browser checks that address is the relay's claim path
  and makes the one request itself (`POST`, no credentials, cache or
  referrer, redirects an error, 10 seconds, shipping's size cap); the
  service then validates the envelope, decrypts it with the link's key and
  the id and expiry as additional data, checks the 10-minute lifetime and
  cleans the list; the browser checks the cleaned list again (web addresses
  only, at most 100, exactly one active) and keeps it in memory. Shipping's
  `tab-handoff` sheet shows the count, source browser, titles and host names
  (never an address); Open in this window or in a new window opens the tabs
  quiet, all or none, with the source's active tab in front; Cancel, Esc or
  closing the sheet discards the list. The service's AES-GCM helper takes an
  optional fourth argument for additional data; Sync still passes three,
  and the Sync and import bundles are byte-identical to before
  (`--check`). The handoff bundle has its own crypto shim for that reason.
  **Differences from the design and from shipping:** the browser makes the
  claim request directly, not through the service's host `Fetch` (same
  limits; the host refuses every call); shipping's "waiting" state is gone,
  because a cancelled claim is destroyed at once here; the sheet names the
  profile "Personal" for every profile; shipping's official-builds-only
  check is not ported (every build from this tree may use the relay).
  **D1:** no build registers `blanc-import:`. `release/verify.mjs` already
  refuses a beta whose link types are anything but its own four, and
  `branding/beta/metadata.py` now strips `blanc-import` too (test). Checked:
  `tools/handoff.test.mjs` 6 of 6 in bare V8 (the bundle is the pin's
  module; a link gives only its claim address; cleaning; each error code;
  the 100-tab ceiling; nothing else can be dispatched);
  `tests/native-tab-handoff.mjs` 8 of 8, twice, against a stand-in relay on
  127.0.0.1 with real AES-256-GCM envelopes (the sheet's contents and one
  bare claim; a second link not claimed; Open here; a used link; Cancel;
  ten failures each showing shipping's message; a malformed link; a new
  window). Regression on the same build: `sync.feature` 18 of 18 and
  `tab-migration.feature` 15 of 15. Not checked: a link from macOS, the
  real extension and relay, a link arriving with no window open.
- **2026-11-16 — N14 and N15 rerun; what N20 still lacks (candidate macos-1f6cbe46be1f2dfd):**
  `tests/native-mouse-gestures.mjs` passes 13 of 13 (N14 Integrated) and
  `tests/native-local-files.mjs` 9 of 9 (N15 stays Implemented: no
  `public.html` association or isolated preview window). **N20** is half
  there: the tab import page works (F40, F45), but tab handoff, the path the
  Bring Your Tabs extension uses, is not started: no `blanc-import:` scheme
  in the app, nothing takes a `blanc-import://tabs` link, and none of
  shipping's `tab-import-handoff.js` (claim from the relay at
  `tabs.blancbrowser.com`, AES-GCM decryption with the key from the link,
  a 10-minute lifetime, at most 100 web tabs) or its `tab-handoff` page is
  in the fork. It adds a URL scheme other apps can call and an outbound
  request, so it needs its own short design before code.
- **2026-11-16 — Trust receipt and Diagnostics in Settings → About (N16; patch 0090, candidate macos-1f6cbe46be1f2dfd):**
  shipping's About & Trust and Diagnostics, in Chromium's About page. The
  receipt lists, from this device and with no network request: the build
  (the bundle's version and build number; "development" unless a beta
  build), Chromium's version, platform, the publisher (the app's own
  signature read with `codesign`: verified against team XYGUCY4498, a
  mismatch, unavailable, or a development build), the embedded blocker
  bundle's SHA-256, Sync and open-tab sharing, usage measurement, search
  suggestions, secure DNS and the crash ledger. The ledger is Blanc's own
  (`blanc.crash_ledger` in Local State, at most 50 events of time, process
  type and reason; renderer and child-process crashes), with Export
  diagnostics… and Clear crash history, which asks on the first click in
  shipping's words. All text is shipping's, through `settings-strings.mjs`
  (41 strings), including its one plural.
  **V28, crash dump files (owner, 2026-11-16):** Chromium writes a dump
  file per crash under the app's default data folder (`Crashpad/`); a dump
  is a slice of memory and can hold page addresses, which shipping's ledger
  never does. Blanc builds have no upload address
  (`crash_reporter_client.cc` sets one only for Google Chrome), so nothing
  is sent. The owner chose to keep the dumps for debugging the beta, say so,
  and have Clear delete them: About shows their count on a `chrome://crashes`
  row (an address, so no new untranslated copy) that opens Chromium's page.
  `tests/native-trust-receipt.mjs` passes 3 of 3 (the facts for this build,
  a real renderer crash recorded with nothing of the page in the report,
  Clear asking first). **Incident:** Chromium keeps that dump folder in the
  default data folder whatever `--user-data-dir` says, so the test's first
  passing run shared the real preview build's folder on the MacBook Pro
  (`~/Library/Application Support/Blanc Chromium Preview/Crashpad`) and its
  Clear emptied it: six dump files, most or all from this session's own
  test crashes, gone. Blanc Beta's folder was not touched. Clear now leaves
  dump files alone under a test launch (`BlancTestLaunch()`), and the test
  asserts that; each run still adds its one test crash's dump there.
  Not checked: the Verified line on a signed build, Export's saved file,
  dump deletion on purpose (seen only in that accident), other languages.
- **2026-11-16 — Capture indicator checked; a screen share lights the Island (N2, N3; candidate macos-039ca82eb0d47756):**
  **N2** was listed as not started but is built: shipping's
  `permissions-and-auth.feature:13` has passed all along (it maps to F13).
  `tests/native-capture-indicator.mjs` adds what that case leaves out (the
  camera, both glyphs, the popover row going to its tab, Stop ending both):
  5 of 5. **N3**: sharing is Chromium's own `getDisplayMedia`, and a tab
  share worked, but the Island never showed it: the native snapshot always
  sent an empty `displayShares` and `prototype.css` hid the chip. Now each
  tab that shares a tab, a window or a screen is reported as shipping's
  share row (Chromium's capture indicator knows the kind of surface, not
  its name), the sharing chip shows window-wide, the capture popover opens
  for a share alone and hangs under whichever chip shows, and its row's Stop
  ends the share (`stopDisplayShare`, the display-media kind only).
  `tests/native-display-share.mjs` passes 3 of 3, three runs. The first
  version of Stop also asked Chromium to stop the managed all-screens kind,
  which it CHECKs against; the test caught the crash before it was
  committed. Both tests run with `--use-fake-device-for-media-stream`; the
  share's source is chosen by `--auto-select-tab-capture-source-by-title`,
  so no picker opens and no screen is captured. **Incident:** the first run
  of the capture test lacked the fake-device flag, so the page's
  `getUserMedia({video:true})` reached for the MacBook Pro's real camera.
  No stream started (the call never resolved and the test timed out), but
  macOS may have shown its camera prompt for Blanc Prototype for a few
  seconds. The test now sets the flag before launch and says why. Not
  checked: Chromium's picker in an Island window, a window or screen share,
  real devices. N3 stays Implemented for that reason.
- **2026-11-16 — Dock menu's current-tab row and Check for Updates… (N18; patch 0089, candidate macos-23064fbfabd20e7b):**
  the tracker had N18 as not started, but the Dock menu's New Window, New
  Private Window and New Mini Window (patches 0013, 0067) and About in the
  Settings sheet (0076) were already in. Two pieces were missing and are
  now built as shipping's: the Dock menu leads with the front window's
  current tab (`dock-menu.js`, `dockActiveTabDescriptor`: its icon and
  title cut at 75 characters, "Private tab" with no icon for a private tab,
  nothing while no window shows) and a separator, and choosing it brings
  that window forward; and the application menu has Check for Updates…
  directly under About. In Blanc Beta that item runs Sparkle's check; a
  build with no updater opens About. `AppController`'s Dock menu calls
  `blanc::AddDockActiveTab` (patch 0089, two lines); the rest is in
  `app_menus_mac.mm`. `tests/native-dock-menu.mjs` passes 6 of 6;
  `native-app-menu-about.mjs` 3 of 3, `native-mini-windows.mjs` 4 of 4 and
  `native-tab-switch.mjs` 8 of 8 still pass. The Dock tile carries no badge
  (shipping only ever clears one). Not checked: the beta's Check for
  Updates… itself (compiled, not run), the row with every window closed, a
  page calling the Badging API. Built incrementally (35 steps, then 6).
- **2026-11-16 — Reading Mode is observable and checked (F58, candidate macos-b6c8f300a889d3a1):**
  `/reader` already ran Chromium's Reading Mode (owner, 2026-11-02), but
  nothing told the Island it was open, so shipping's exit button never
  showed and no test could see it. The native tab snapshot now carries
  `readerActive` for the tab in front
  (`ReadAnythingEntryPointController::IsUIShowing`). In Chromium 158 Reading
  Mode is a full reading view over the page pane, not a side panel.
  `tests/native-recheck-f58.mjs` passes 2 of 2, twice: the command opens it
  at the page pane's size with the article's heading and body text, the
  Island reports it, the command closes it, and a private tab does the same.
  A screenshot shows the view with its own controls. Not checked: the View
  menu item, Reading Mode's controls, a page with no article. Built
  incrementally (6 steps).
- **2026-11-16 — Ctrl+Tab by most recent use (F59; patch 0088, candidate macos-9d3053da65b5aea9):**
  the fork had none of it (`tabSwitchOrder` was a later key). Now, as
  shipping: Settings → Appearance → Switch tabs with Ctrl+Tab (pref
  `blanc.tabs.switch_order`, `recent` by default or `list`, shipping's
  strings); holding Control and pressing Tab steps back through the window's
  tabs by last use, Shift+Tab forward; nothing changes until Control comes
  up, so stepping never moves focus or wakes a quiet tab; the card shows
  after 150 ms or at the second Tab, only over a bare page, and never takes
  focus; Esc or any other key cancels; Ctrl+W closes the pick; a click on a
  card tile lands on it. How: patch 0088 lets `chrome::SelectNextTab` and
  `SelectPreviousTab` ask `blanc_prototype::TabSwitchCommand` first, which
  takes the step only when the event being handled is Ctrl+Tab
  (`tab_switch_keys_mac.mm` reads `NSApp.currentEvent`), so Ctrl+PageDown and
  the ⌘ shortcuts stay positional. The host runs shipping's
  `tab-switcher.js` unchanged (generated like `island-proximity.js`) over
  Chromium's own last-active time per tab (`tabActivationOrder`), and a
  local event monitor that lives from the first Ctrl+Tab until Control
  comes up sends the release, Esc, Ctrl+W, other keys, clicks and the app
  losing focus. The card is shipping's overlay `switcher` mode, placed by
  shipping's `switcherBounds`; the host asks for room without focus
  (`height`, false). Checked on the MacBook Pro against the Mac Studio's
  build (GN regenerated with unchanged arguments for the new source file;
  40 steps, then 7): `tests/native-tab-switch.mjs` passes 8 of 8, three
  runs, posting real NSEvents to the app's own queue (`postTabSwitchKey`),
  so the command path and the watcher both run; a screenshot shows the card
  (five tiles by last use, the pick outlined, its title and host) and
  Settings shows the row with both choices. Differences from shipping: a
  menu click on Select Next Tab stays positional (shipping treats it as a
  tap). Not checked: hardware keys from a keyboard, another app coming to
  the front mid-switch, a split as one entry, a private window, Windows and
  Linux (the hook returns false there). Ships in the next beta. Regression
  on the same build: `tabs-and-groups.feature` 47 of 47 and
  `island-and-commands.feature` 71 of 72 run, the one failure being
  `:61` (hover-open under a resting pointer), which fails as often on the
  unchanged nightly build on this Mac (2 of 4 against 4 of 6 passes,
  interleaved): it depends on where the real pointer rests.
- **2026-11-16 — A restored window keeps its size (patch 0087, candidate macos-ef1d86d7ab21bc63):**
  the open bug behind `vertical-tabs.feature:58` (a window reopening at an
  earlier size) is found and fixed. Cause, from an instrumented build: the
  session file's bounds were right and the window was created with them, and
  about 40 ms later Chromium replayed AppKit's archived window state onto it
  (`-restoreStateWithCoder:` in `native_widget_ns_window_bridge.mm`, which
  Chromium uses to return a window to its Space). That archive includes the
  frame and is written half a second after a change, so it often held an
  older one. On a build that logged the frame either side of the replay
  (macos-914063c2e1c2a1ac), it changed the frame in 11 of 16 relaunches: to
  640 by 480 twice and to the first launch's 1200 by 841 nine times. The
  scenario only caught the narrow case, so the bug was far more common than
  its 1-in-10 failures suggested: most relaunches soon after a resize got a
  wrong size. Patch 0087 keeps the frame the window was created with across
  the replay (skipped for a full-screen window), so the Space still comes
  from the archive and the size and position from the session. Checked on
  the MacBook Pro against builds copied from the Mac Studio (incremental, 7
  to 10 steps each; diagnostics removed, and the tree's file matches
  `source-map.json`): `vertical-tabs.feature:58` passes 16 of 16 on the
  logging build and 10 of 10 on the final one (before: 2 of 6, 9 of 10 and
  3 of 4 on the unpatched build); new `tests/native-window-size-relaunch.mjs`
  passes 3 of 3 checks and `native-mini-windows.mjs` 4 of 4. That new test
  is a regression check only: it also passed without the patch. Not checked:
  a window restored into full screen, a window on a second display or
  another Space, and the beta build. Ships in the next beta. Upstream
  Chromium has the same behavior.
- **2026-11-16 — Importer fixtures and answer key (plan M.1; Codex card C4, c2274c41d):**
  `node chromium/tools/importer-fixtures.mjs --out <new dir>` writes a
  synthetic Electron `userData` (Personal, one named profile and one pending
  deletion; 32 files in shipping v1.49.1's formats, invented data only) and
  `expected.json`, what a correct importer carries over after each rule of
  spec §7: Favorites tombstones dropped, 5,001 visits bounded to 5,000, a
  `clipboard-read` permission dropped, the pending profile removed. Two runs
  are byte-identical; its 15 unit tests pass, and the copied constants are
  compared with `git show v1.49.1`. No Sync or Patron secret, no site
  storage. The answer key leaves two questions open, for the owner before
  M.2: which Chromium profiles receive the synced keys of the one
  device-wide `settings.json` (and where `_syncMeta` and the tie-breakers
  go), and which non-secret `sync.json` fields migrate when the key is
  re-wrapped separately. The importer itself (M.2–M.4) is not started.
- **2026-11-16 — N1 rechecked; F59 and F58 need native work first (Codex card C2b, 71d6ca969):**
  `tests/native-recheck-n1.mjs` passes 5 of 5 on the staged
  macos-4f9e9bb648216395 (entry and title, nothing for a private tab, Forget,
  Clear all, reopen), and fails when its expected entry count is made wrong;
  N1 is Integrated. Codex reported the other two as blocked and wrote no
  test for them, and both hold up: **F59** Ctrl+Tab recent order is not
  built (`settings-keys.json` has `tabSwitchOrder` as `later`; nothing
  native reads it), and **F58** has no way to observe Reading Mode open
  (the native snapshot never fills `readerActive`). Both are Claude-lane
  items now. Difference noted: Recently closed is profile-wide here
  (Chromium's TabRestoreService), per window in shipping.
- **2026-11-16 — Remaining-work plan started; F49, F50 and F54 rechecked:**
  the split with Codex is `docs/superpowers/plans/2026-11-16-macos-fork-remaining-work.md`.
  Codex works sandboxed in `~/Projects/Blanc-Codex/repo` (branch
  `codex/fork-lane`) and writes tests it cannot run; Claude runs them on a
  staged copy of the nightly's Prototype (`~/Projects/Blanc-Codex/app`,
  candidate macos-4f9e9bb648216395) and audits before merging. Card C2a
  (ee26ec3d5): `tests/native-recheck-f49.mjs`, `-f50.mjs` and `-f54.mjs`
  pass on the staged app (4, 4 and 7 checks), their expected values match
  shipping at 8a4e57e78, and a wrong expected color fails the clock test. The
  three rows are Integrated. Found on the way: the fork's Match each space's
  color control is unavailable, and the fork stores an imported wallpaper in
  IndexedDB where shipping writes `current.jpg`.
- **2026-11-16 — Tracker refreshed from the first full nightly (candidate macos-4f9e9bb648216395):**
  `tracker.json` still described early November: it listed the vertical rail,
  Sync, passkeys and 21 other rows as not started, and its shipping commit and
  scenario list were v1.46.0's. It now takes the nightly full suite
  20261116-0700 on the Mac Studio (fork e7b716378, shipping 8a4e57e78) as the
  macOS baseline, committed as
  `scenarios/baseline-macos-4f9e9bb648216395.json`: 629 of 661 cases pass, 1
  fails (`F41-named-workspaces.feature:211`, the Spaces menu's closing fade,
  which passed on its rerun; the baseline keeps the failure), 3 are undefined
  (runner gaps: `platform-services.feature:25` the in-app updater,
  `private-tabs.feature:40` private-tab passkeys,
  `supporter-and-session.feature:12` Patron) and 28 are excluded. Every row
  with passing shipping cases is Integrated on that candidate with its
  counts; rows with no scenario moved only on recorded evidence (the beta's
  gates in `release/standing.json`, a native test, or host code) and say so,
  and the rest are marked "not rechecked". macOS Bar B: 58 Integrated, 9
  Implemented, 14 below that, 0 Verified (the manual accessibility and visual
  checklist has not been run for any row). Not Integrated on macOS:
  - Not started: X2 protected-video notice and handoff; N2 capture indicator;
    N3 screen-sharing picker; N16 trust receipt and diagnostics export; N18
    Dock menu, badge and Check for updates; N20 tab import and handoff pages;
    F38 and F42 (owner: Web Store extensions instead); X1 uBO (research).
  - Implemented, not proven end to end: F22 updates (beta channel only; no
    replacement channel, Intel build or Electron bridge), R2 and R3 Sync
    with a real iPhone, N1 Recently closed's Forget and Clear all, N13 site
    mute and page tint, N14 mouse gestures, N15 local HTML, N17 Invite, F51
    What's New.
  - Not rechecked (legacy or drafted stage kept): F49 and F50 wallpaper, F54
    clock Font & color, F58 Reader, F59 Ctrl+Tab recent order.
  Also outside the rows: the Electron profile importer (plan M.1–M.4) has no
  code, and the shipping target is still v1.48.0-36 while shipping is v1.49.1.
- **2026-11-15 — Settings asked for at launch opens instead of vanishing:**
  since the utility pages moved into the sheet (0814560c8, November 13), a
  tab that loads Settings, History, Downloads or Favorites closes and the
  sheet shows the page. In the first half second after launch,
  `OpenUtilitySheet` ran before host.js had defined `BlancPrototypeHost`, so
  its call did nothing while it still reported success and the gate closed
  the tab: the page never appeared. The release check `beta-sync.mjs`, which
  opens `chrome://settings/sync` as soon as the debugging port answers, failed
  on the beta.5 candidate three times in a row (beta.1's build kept the tab).
  The call now leaves the request in `window.blancPendingSheet` until host.js
  is up, and host.js opens it then. `beta-sync.mjs` also now opens Settings
  again after it opens the page it shares, because a new tab dismisses the
  sheet (as in shipping); it was written when Settings was a tab. On the
  local-qualification beta.5 with the fix it passed 3 of 3. Ships in the
  next beta.
- **2026-11-14 — Hover previews in the vertical tab rail (patch 0084 plus
  host and native code, owner-approved layout A; design
  `docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md`, plan
  `docs/superpowers/plans/2026-11-14-rail-hover-previews.md`):** with vertical
  tabs, resting 500ms on a rail row shows a card beside the rail with the
  tab's title, host and Chromium's thumbnail; resting on a collapsed group's
  header shows a list card of its tabs, whose rows show the picture card
  beside it (clicking one opens the group and switches to the tab). Once a
  card is up the next row swaps it at once, and so do arrow/Home/End focus
  moves; a click, scroll, key (in the rail or the page), blur, resize, tab
  switch, any surface, a Glance or a changed card closes it. Private tabs
  never get a picture; a quiet tab shows only what Chromium kept and is
  never subscribed to (that would load a restored tab); the current tab and
  visible split panes show none. No Settings switch yet (owner: no
  English-only label; it follows when shipping has the copy). Chromium 158
  leaves `kTabHoverCardImages` off on macOS (Google turns it on through the
  `TabHoverCardImagesMacArm` field trial, which Blanc doesn't receive), so
  no tab had a ThumbnailTabHelper; owner, 2026-11-14: patch 0084 turns it on
  in Blanc builds (cost: a small in-memory JPEG per backgrounded tab).
  Pure rules in `island/rail-hover.js`, cards in `island/rail-hover-card.js`,
  the host section in `island/host.js`; native `tabThumbnail`,
  `watchThumbnail`/`unwatchThumbnail`, `hoverCardBounds` and
  `railCardsShown` in `blanc_prototype_ui.cc`; rail rows drop their system
  tooltip through two declared `vertical-tabs.js` edits. Patch totals: 83
  desktop patches touching 166 files (340 file diffs, 713 hunks). Checked:
  the fork unit suite (498 pass, 0 fail, 12 skipped), patch reconstruction
  (both lanes), the Island renderer and asset checks, and a syntax-only
  compile of `blanc_prototype_ui.cc` with out/BlancBeta's flags on the Mac
  Studio (read only). Built incrementally into out/BlancPrototype (GN
  regenerated with its unchanged October 16 arguments, since served.txt and
  blanc/BUILD.gn changed; plans of 6 and 1 steps). On screen, on the MacBook
  Pro against a copied build: `tests/native-rail-hover.mjs` passes 10 of 10
  on candidate macos-b2d742a39a1021c2 (Chromium's picture on a background
  tab's card, instant swap, closing on leaving the rail and on a key in the
  page, no picture for the current tab or a private one, Dark, a collapsed
  group's list card with a row's picture beside it, a row click opening the
  group, a split row's two panes). The first on-screen run (macos-9a6ff1dd…)
  found a split card titled with the row's fallback icon letters and a
  private card saying "private" for the chip's "Private"; both fixed in
  c1a1c3d6d. Then (owner, after trying the build): pictures ahead of time.
  With vertical tabs each background tab gets one picture once it finishes
  loading (`warmThumbnail`, two at a time, never private, quiet, Blanc pages
  or what's on screen), so a never-shown tab's first card no longer shows
  its icon for about a second first; 748e0992d, 11 of 11 on screen on
  candidate macos-a2155191264ea1f7. Then the two deferred gaps: another app
  coming to the front (⌘-Tab with the page focused) and a site permission
  prompt now close a card (a background window may still show cards, as
  macOS lets it take hover). 2f08fe889: `tests/native-rail-hover.mjs` passes
  14 of 14 on candidate macos-80a0b0baafd9ca87, including a quiet tab's card
  showing the picture Chromium kept without waking the tab. The last
  deferred item (a watched tab going quiet under its card) can't happen:
  Chromium doesn't quiet a tab while its thumbnail is being drawn, so the tab
  under a card stays awake and goes quiet once the card closes; a tab that
  does turn quiet changes its card, which closes and ends the watch. Pinned
  by a unit test and on screen: 15 of 15 on candidate macos-80a0b0baafd9ca87
  (one earlier run timed out opening a card at that step, likely the real
  mouse on the test window; the rerun passed).
- **V27 — rail rows carry no native tooltip while hover previews are on (2026-11-14, owner, the rail hover previews design; fork only):**
  the design (commit 8d57ddb46, layout A, owner-approved) keeps each rail
  row's `title` attribute out so the system tooltip and the hover card never
  show together; the card shows the whole title instead. The first nightly
  (20261115-0102) failed vertical-tabs.feature:74 (F28-17) on shipping's last
  step, which reads the row's `title`. That step now runs as a V27
  replacement: under reduced motion the title stays still, the row's
  accessible name is the whole title, there is no native tooltip, and the
  hover card shows the whole title.
- **2026-11-14 — The vertical tabs rail's layout toggle clicks again (owner's report):**
  On macOS the rail's header shares the title-bar band, and `IsCaption`
  treated every point of that band outside the Island pill as the window's
  caption, so a click on the toggle ("Turn vertical tabs off") started a
  window drag instead. The rail is now never a drag handle, as shipping marks
  the whole rail `no-drag`; the strip beside it still drags the window.
  Checked on the Mac Studio with `chromium/tests/rail-toggle-caption.mjs`:
  with the fix the toggle's point is not a caption, the strip beside the rail
  is, and clicking the toggle turns vertical tabs off; the same check on the
  build without the fix (2f08fe889) failed at the toggle. The screen there
  was locked, so the run skipped the drawing guard (hit-testing and layout
  need no frames). Ships in the next beta.
- **2026-11-14 — The Dock icon follows Dark again (owner's report on beta.4):**
  Beta.4 (published from 57e3109dd, with patch 0082) handed the Dock the
  named Icon Composer stacks directly. AppKit draws a stack given to
  `NSApp.applicationIconImage` once, in Light, and never redraws it: a
  rasterized stack is byte-identical under Aqua and Dark Aqua (measured). So
  in Dark, Sunrise, Spectrum and Amber stayed Light. Shipping never did
  this: Electron 45's `nativeImage.createFromNamedImage` reads a name
  without an NS prefix as an SF Symbol, finds none and returns an empty
  image, so shipping always fell back to a Light or Dark image, reapplied on
  each appearance change, with only the bundle icon live. The beta now does
  the same with Icon Composer's own renders:
  `blanc/branding/beta/render-dock-icons.mjs` exports each non-bundle stack's
  Default and Dark renditions with ictool (macOS platform), at shipping's
  Dock geometry (an 824 px tile in a 1024 canvas), into
  `branding/beta/dock/`, which `//blanc:beta_dock_icons` copies into the
  app's `Resources/dock`; `blanc::SetDockIconFromBundle` loads the one for
  the current appearance, and host.js already asks again when it changes.
  Sunrise Gold (the bundle icon) stays live, and Clear and Tinted still put
  the bundle icon back. `icon-manifest.json` pins the renders. Checked: the
  fork unit suite (466 pass), patch reconstruction, and a syntax-only
  compile of both changed files with out/BlancBeta's flags. Not yet built or
  seen in the Dock; it ships in beta.5. Also: installing the published
  beta.4 over an earlier beta.4 candidate on the MacBook Pro left 22
  LaunchServices registrations of `me.bnfy.blanc.beta` (Trash, scratch
  folders, mounted images); all but `/Applications/Blanc Beta.app` were
  unregistered.
- **2026-11-14 — The red button keeps the main window's tabs (patch 0083
  here, 0082 on beta.4's branch; candidate macos-f390619940f08515, owner's report on beta.4):** shipping's
  macOS Dock close (`windowCloseSessionEffect` → `'dock'`, `dock-reopen.js`)
  was never ported: in the fork the red button closed the window and every
  tab, so the beta shared no tabs and dropped off the owner's phones. Now a
  person's close of the primary Island window (the first ordinary window of a
  launch) hides it with its tabs live, in the session and in Sync
  (`HoldWindowOnClose`, from `BrowserView::OnWindowCloseRequested`; never
  while quitting, while Chromium already closes it, on a forced close or with
  no tabs), and the Dock icon with no window showing brings it back
  (`ReopenHeldWindow`, from `applicationShouldHandleReopen`). Other windows
  close as before. Checked by hand on the MacBook Pro with the real red
  button: same window and same live page back from the Dock, a second window
  closes normally, quitting while held exits and restores the tab; mini
  windows and profile removal tests pass. Also: the published device name is
  the Mac's computer name ("MacBook Pro") as shipping's device-name.js picks
  it, not Chromium's local host name ("MacBook-Pro");
  `tests/native-sync-organic-tabs.mjs` (Sync with no pass asked of the Mac:
  new pages, a saved Space, a relaunch, joining again) passes and its peer
  sees "MacBook Pro".
- **2026-11-14 — Blanc Beta's icon: Sunrise Gold by default, and Sunrise follows Light and Dark (patch 0082, owner's report):**
  The beta's bundle icon was the prototype's Sunrise Dark (kept for Dock
  testing), so the default Sunrise stayed dark in Light mode. Owner decision:
  Sunrise Gold is the beta's default icon for now. `blanc/branding/beta/`
  now holds Sunrise Gold compiled by actool 27.2 from shipping's colorway
  (Light, Dark and Tinted stacks under the same `BlancDK` name, plus the
  `app.icns` fallback; `icon-manifest.json` records the inputs), and patch
  0082 points chrome/BUILD.gn's `chrome_app_icon` and `chrome_asset_catalog`
  at it in beta builds only. `blanc.app_icon` defaults to `sunrise-gold` in
  beta (`kDefaultAppIcon`, applied by NormalizeAppIcon with
  SetDefaultPrefValue, so a saved choice is kept), and that choice leaves the
  Dock on the bundle icon. Preview builds keep their Sunrise Dark bundle
  icon, and Sunrise there takes shipping's flat Light or Dark image instead.
  Then (owner, the same day, after comparing renders): the beta's Dock shows
  the Icon Composer versions, not the flat images. Its Assets.car now carries
  all five colorways as named stacks (Icon, SunriseDark, BlancDK for Gold,
  SunriseSpectrum, SunriseAmber), and `blanc::SetDockIconNamed` loads one by
  name on macOS 26 and later, as shipping's packaged builds do; Clear and
  Tinted put the app's own icon back, and the flat images stay the fallback
  on older macOS. Spectrum's and Amber's stacks carry the muted warm Dark
  rim from bnfy/blanc#1528 (merged as a54d27a75; `icon-manifest.json` pins
  that commit). The fork's flat fallback images (`island/pages/`) still carry
  the white Dark rim until the Island's shipping pin moves past it. Not handled: a change of Icon & widget
  style while Blanc runs is picked up at the next icon or appearance change
  (shipping rechecks every 10 s). Checked: the fork unit suite (466 pass), patch
  reconstruction, and a syntax-only compile with out/BlancBeta's flags. Not
  yet built or seen on screen: that waits for beta.4 to publish (the Mac
  Studio tree stays untouched until then), and it ships in beta.5.
- **2026-11-14 — Extensions can open their own popup (patch 0081, candidate
  macos-cf13e2bc70dce670, owner's report):** 1Password's in-page "Unlock
  1Password" did nothing in Blanc Beta. It calls chrome.action.openPopup, and
  Chromium refuses that with "Browser window has no toolbar." (confirmed on
  beta.3) because the baseline makes IsToolbarVisible false in Island windows.
  OpenPopupInBrowser now lets an Island window through unless a page is
  fullscreen (`CanOpenExtensionPopup`); IsToolbarVisible itself is unchanged.
  The popup anchors on the Island's Extensions button, so SetPopupOwner tells
  the Island (`ExtensionPopupChanged`): with Auto-hide on it comes down and
  stays while the popup is open, and an open popup follows the button's
  slide. `tests/native-extension-open-popup.mjs` passes on the MacBook Pro
  (Auto-hide off, float and push; popup at the same spot in all three);
  macOS window full screen opens it too. Not run: a page-fullscreen refusal
  (Chromium denied requestFullscreen in the fixture), Windows/Linux, the
  vertical tab layout, a real 1Password account.
- **2026-11-14 — Beta.4 full suite (prototype candidate macos-402d768b8c8f6e43, source 75f85e960):**
  run on the owner's MacBook Pro (the Mac Studio's screen was locked) from a
  clean checkout: 577 pass, 4 fail, 4 undefined, 27 excluded (636 executed),
  against beta.2's 578 / 3 / 4. Failures: `vertical-tabs.feature:58` (known
  intermittent); `island-and-commands.feature:61` (new, the swell's: Blink
  repeats a document's last pointer position as a move whenever what lies
  under it changes, and the swell waking under a resting pointer made that
  stale repeat re-arm a disarmed hover-open; the host now ignores a move that
  does not move, as shipping's main sees only real input; passes on
  candidate macos-fc405801653febe3); `F41-named-workspaces.feature:203` and
  `:211` (new since beta.2: the Spaces menu closes without its fade when
  Escape follows the click at once; it fades correctly when driven by hand,
  and fails the same on both candidates. Not the swell's: on the MacBook Pro
  it fails the same on a build without the swell's class watcher and on a
  prototype built from beta.3's own source c3a3bc898 (candidate
  macos-225a6eebdcb1a6fb: :203 failed twice, :211 passed only on its retry),
  while beta.2's full run on the Mac Studio passed both. It is the machine:
  on the Mac Studio, three runs of the two cases on beta.4's own source
  e47bf1bcf (candidate macos-cf13e2bc70dce670, records/spaces-fade-studio{,-2,-3})
  passed both every time, :203 on its first attempt each time and :211 on
  its first attempt in two runs and on its retry in one ("the menu is still
  drawn after the overlay closes"). So :211 is slightly flaky on the Studio
  too, and the MacBook Pro fails both). `island-and-commands.feature:348`/`:372` passed this time.
- **2026-11-14 — Island approach swell, for beta.4 (candidate macos-78921cb9b998cb49):**
  the owner noticed the resting Island ignores an approaching cursor. Shipping's
  resting Island has five pointer behaviors; four were already in the fork's
  code (dots bloom into site icons, button hover states, tooltips, opt-in
  hover-open). The fifth, the approach swell (the pill rises 2px and grows 2%
  within 250px, settled 80px out; shipping's `island-proximity.js`), was off:
  `prototype.css` forced `transform: none` because the native extension
  buttons could not follow it, and nothing sent the cursor's distance. Now the
  host runs shipping's module (generated `island-proximity.js`), native
  forwards page moves within 260px of the Island at most once a frame
  (`island_proximity.h`, `island_proximity_controller.inc`), and the
  extension buttons take the slot's measured swell as a native transform
  (owner's choice over keeping the pill flat with extensions). Running it on
  the build found that a swell set without a page move (the Island's own
  moves, a sampled cursor when a panel closes) could stay on if the next page
  move landed beyond reach; the host now arms native (`armIslandPointer`) so
  that move is sent wherever it lands. Built on the Mac Studio after beta.3
  was published (Blanc Prototype, incremental: 26 then 8 and 8 steps; GN
  regenerated with unchanged arguments for `served.txt`). Checks ran on the
  MacBook Pro (the Studio's screen was locked) against the copied build:
  `tests/native-island-swell.mjs` 3 of 3 runs, 7 checks each (from the page,
  partial partway out, extension buttons 1.02× and about 2px, rest on leaving,
  over the band and leaving far down, asleep with the panel open and woken on
  close, still under Reduce motion); `tests/native-island-hover.mjs` 3 of 3,
  4 checks each (dot bloom, button hover, tooltip, hover-open). One difference
  found: a strip button's tooltip sits 8px higher than shipping's (top at
  44px against 52px) because the host clamps it inside its 68px view, over
  the pill's bottom edge; shipping's floats onto the page. The owner saw
  both side by side and chose to leave it as it is (2026-11-14). Not covered: the
  swell sleeping while the window is in the background. Unit suite: 464 of
  475 pass, 11 Sync page tests skipped without Chromium's TypeScript.
- **2026-11-10 — Beta identity patch (preview candidate macos-77c0cea3ecc01285):**
  dedicated gated Blanc Beta identity, profile guards, version metadata and
  release policy implemented. Preview incremental build passes; pure native
  path tests and pinned-compiler identity syntax pass. Separate beta/official
  build and signed OS/Keychain qualification remain outside this queue.
- **2026-11-10 — Vertical-tab repairs (candidate macos-e7a071bb7948929b):**
  shortcut, focus/dismissal, group menus and 32px favicon conversion repaired.
  All seven former vertical adapter gaps now have passing execution; the
  approved grouped-pin divergence and Linux-only controls remain explicit.
  Expanded tabs/Send local gate passes 3/3, including cloned policy exclusions
  and restart. Full final-candidate regression remains owed; see queue report.
- **2026-11-10 — Desktop Sync S4c (candidate macos-9320a60d81bec2f7):**
  open-tab sharing defaults off; Other devices, Rename Device and Send use the
  native default-profile service. Private and policy-marked tabs are excluded.
  One clean full local gate passes 21 checks. The four requested files record
  108 pass / 4 fail / 9 undefined, preserving all 100 prior S4b passes and gaining
  eight Sync cases. Shared Spaces needs a desktop entry in the frozen bundle;
  remaining repairs and final-candidate qualification are still in progress.
  [Queue report](CODEX-NOTES-finish.md).
- **2026-11-09 — Desktop Sync S4b (candidate macos-9d75c2778b9b408a):**
  native Settings now offers iPhone/add-device pairing with shipping's code,
  QR, expiry/cancel states and capture request. The Start Page checklist opens
  Sync and reflects actual enabled/iOS-device state. The loopback-only gate
  extends S4a with all seven setting mappings, stalled-runner/write-fault
  preservation and private/secondary-profile refusal. Scoped results and
  remaining S4c/S4d work: [S4b report](CODEX-NOTES-s4b-sync.md).
- **2026-11-09 — Requested non-Sync acceptance repairs (candidate macos-c50cd71293d37d45):**
  all 18 supplied case IDs were reproduced and rerun together: 13 pass,
  4 fail and 1 undefined. Rail geometry, replacement-tab focus, oversized quiet
  recovery, renderer release, Glance positioning and floating/split controls
  are repaired. Two stale shipping scenarios remain; grouped pins and the
  excluded Settings/Sync work remain open. The eight affected files total
  275 pass / 10 fail / 72 undefined; the sole lost morning pass is a confirmed
  System/Dark versus assumed Light theme setup in F41:182. This is scoped
  acceptance evidence, not beta qualification. Exact output, commits and
  remaining causes: [repair report](CODEX-NOTES-17-failures.md).
- **2026-11-09 — Extensions icon follows Auto-hide (candidate macos-bf6e0c81960ab463):**
  the icon is Chromium's native view over the pill, so it popped on and off
  while the pill slid in CSS. It now runs the pill's slide natively (same
  distance, durations and ease-out cubic), staying visible until it has left;
  the push style keeps it through the page's slide too. Measured against the
  pill frame by frame: within about a frame on hide, usually about 11px on
  reveal with one 28px sample. `autoHideState` reports the view for tests.
  Regression: glance and split-view match the morning baseline;
  `island-and-commands` 68/3, the only difference being the known `:107`.
- **2026-11-09 — Font size scales Blanc's pages (candidate macos-78ea0ebc8eca0ed5):**
  owner expected Appearance > Font size to show a change at once. It already
  changed web page text, but no Blanc page. Settings, the Start Page and
  Favorites / History / Downloads now follow it live, from `zoom` on the
  document: Medium is 100%, and the scale is eased and held to 75–130% so those
  layouts survive (`BlancPagesZoom`). pages.css is served with its viewport
  units divided back by the zoom, because CSS zoom enlarges `100vh` too and
  overflowed the window. Mahjong keeps its scale; the Island is not affected.
  Checked at every preset on Settings and the Start Page (no overflow), History
  at the largest. Regression: internal-pages 9/1, settings-and-theming 6/0,
  supporter-and-session 2/0, newtab-layouts 22/1.
- **2026-11-09 — Extension pages, pin toggle, footer Settings (candidate
  macos-1916198683b42fbc):** the Island named an extension's page by its raw
  `chrome-extension://<id>` address; the pill and the address field now show
  the extension's name (host.js fills `extensionName` from the installed
  list), and Enter on the untouched name does not search for it. The
  Extensions page no longer offers "Pin new extensions to Toolbar", since the
  Island has no toolbar. `#footerSettings` came off the prototype hide-list, so
  the open Island has shipping's Settings icon. Verified with a real unpacked
  extension and a real click on the icon. `island-and-commands` 67/4:
  `:295` and `:359` as in the morning, `:107` as before, and `:99` failed once in
  the full run but passes 4 of 4 alone. `internal-pages` 9/1, settings-and-theming 6/0.
- **2026-11-09 — Settings redesign (candidate macos-80cf90e240933cec):** owner:
  the Settings experience was "ugly and poorly executed", not all screens
  scrolled, and it had to use Instrument Sans everywhere. New patch 0038, with
  the sheet's header in `host.*`. **Font:** Chromium sets `system-ui` on
  `body`, so Blanc's root font never reached any page; Instrument Sans is now
  set on `body`. An audit of every text element on 19 screens finds only the
  font-preview samples in Customize fonts on another face, which is their
  job. **Scrolling:** the persistent nav (patch 0037) made a dead zone: the
  sidebar's `overscroll-behavior: contain` swallowed the wheel; a wheel over
  it now scrolls the page. A new section also starts at its top rather than
  at the last section's scroll position. **Layout, per shipping:** the sheet
  header holds Settings / Favorites / History / Downloads and Close over a
  hairline; search sits atop a text-only sidebar with rounded-rectangle
  selection; the page takes the rest of the width. **Controls:** fields are
  outlined rounded rectangles the same height as their buttons, Blanc's own
  lists lose Chromium's indent and the row line through their field (the
  "notch"), selects share one chevron, radios and focus take the palette,
  subpages are rounded cards as tall as their content, supporting text is a
  step smaller, large headings are tracked tighter, and a profile with no
  chosen picture shows the Sunrise. Every page ends with room below its card, and
  the sheet draws its own scrollbar while the pointer is over something
  scrollable. Font size was reported as doing nothing: it does work on web
  page text that uses the default size (checked at 24, 9 and 16px), but not on
  sites that set their own sizes or on Blanc's own pages, Settings included. Reviewed in screenshots, light and dark.
  Not changed: Chromium's page order and section names, and the native
  pop-up list of a select. Regression against the morning baseline:
  internal-pages 9/1 (`:7`, as before), settings-and-theming 6/0,
  interface-language 5/0, supporter-and-session 2/0, local-profiles
  unchanged. Tool tests pin 142 upstream files.
- **2026-11-09 — Settings polish pass (candidate macos-a7d83e2ea8141aff):**
  owner asked for Settings to feel like shipping's Blanc, not stock Chromium
  ("Logo + About + General", closer to the Electron styling). New patch 0037:
  Chromium's logo (About, the toolbar, `chrome://version`) is the Sunrise mark
  (`product_logo_32` at 1x and 2x); every Settings string, and the placeholder
  profile name, says Blanc instead of Chromium (one hook in
  `WebUIDataSourceImpl`, for the `settings` source only, leaving any string
  that links to chromium.org or credits "The Chromium Authors" alone); About
  drops Chromium's update-status row, since Blanc has its own channel; the
  left navigation stays beside the page in the sheet (breakpoint 980 → 600px,
  with the toolbar search field sized to fit) as text-only neutral pills;
  section headings are larger; buttons, fields, the search box and the nav
  take the Sunrise/Neutral palette tokens instead of Chromium's blue. Real
  screenshots checked (General, About, Appearance, Privacy). Not changed:
  Chromium's page order and section names (no General/Sync/Diagnostics
  groups as in shipping), the blue profile avatar, and a few strings that
  link to chromium.org stay "Chromium". Regression: internal-pages 9/1,
  settings-and-theming 6/0, interface-language 5/0, supporter-and-session 2/0,
  newtab-layouts 22/1 (also fixed `:35`, `:41`, `:161` earlier in the day),
  sync unchanged (10 failing as in the morning baseline), tool tests 189/189
  on Node 22 (`check-patches.test.mjs` pin now 136 upstream files).
- **2026-11-09 — Open Island closes on a click outside it (candidate
  macos-8a58ea5cd8ede2f6):** the fork's expanded Island stayed open when the
  page, another window or another app was clicked; shipping's overlay `blur`
  closes it. `host.js` now closes the panel/palette/shield/spaces/switcher
  surfaces when the host and overlay frames lose focus, except for Find
  (stays open between matches), the display-share dialog, a native context
  menu in the overlay, and the first 400 ms after it opens (a new tab's page
  can briefly take focus). Verified over CDP with real mouse input.
  Regression on this candidate, against the morning baseline: F41, tabs and
  groups, quiet tabs and split view identical; glance `:337` failed once in
  the full run and passes 4 of 4 alone, with and without the fix;
  `island-and-commands.feature:107` (a pending permission prompt blocks
  hover-open) fails 4 of 4 now but fails identically with the pre-fix
  `host.js` served from disk, so the fix is not the cause; its cause is
  still unknown and it passed in the morning baseline.
- **2026-11-09 — Preview disclosure moved to Settings → About (candidate macos-f15e19cfa024fb72):**
  owner asked for the "Preview … · Version & security" footer badge to move.
  Settings → About now has a "Version & security" row (new patch 0036, plus
  `blancSettingsPreviewNotice` in the settings handler) that opens the Start
  Page at `?preview=1`, which shows the same notice dialog unchanged (status,
  build, support, rollback guidance). The footer button is gone; the Island's
  own "Security & updates" link is untouched. The row's label is English-only
  because the generated settings strings come from shipping's catalogs, which
  have no key for this preview-only text. Real click verified. This also fixed
  `newtab-layouts.feature:161` (the badge made the footer's left group wrap):
  22 pass, 1 fail (`:21`, deep hooks); `internal-pages.feature` 9 / 1 (`:7`,
  also failing this morning).
- **2026-11-09 — Start Page's Patron pill (candidate macos-cd5dbbaafb7c657d):**
  the pill's `blanc://settings/#group-patron` link went nowhere. It now opens
  the Settings sheet at `chrome://settings/help`, where the `#patronCheckout`
  row is, as shipping's link opens Settings at Patron. A real click was
  verified; the row is on screen. `newtab-layouts.feature` 21 / 2 and
  `internal-pages.feature` 9 / 1 fail only where they did before
  (`:21`, `:161`; `internal-pages:7`); `supporter-and-session.feature` 2 / 0.
- **2026-11-09 — Start Page footer fixes and corrections (candidate macos-d40bfa2514c288c3):**
  owner dogfooding found what the Mahjong round 1 tests missed. `#mahjongLink`
  was still in `newtab-prototype.css`'s hide-list, so the footer link merged
  in #1425 was invisible; the F35-4 pass was a false positive because the
  adapter's `.click()` fires on a hidden element. Removed. F35-9 was never
  mysterious: `NewTabHandler::Handle`'s private-profile allowlist rejected
  `openMahjong`; added it. Reloading a game hit Chromium's error page because
  Mahjong writes `?game=<id>` and the request filter only aliased an exact
  query; any `pages/mahjong.html?...` now serves that one page. Checked with
  real CDP mouse events: link visible and hittable, regular and private games
  open, reload keeps the game, Finish setup opens. `newtab-layouts.feature`
  21 pass / 2 fail (`:21` F35-3 deep hooks unported; `:161` F35-10, the footer's
  left group wraps at 1260px). `island-and-commands.feature` 63 / 3: `:295` and
  `:359` also failed in the morning's full run; `:107` (permission prompt
  blocks hover-open) passed that run and has failed 3 of 3 since, cause
  unknown. Open: moving the preview disclosure to Settings → About.
- **2026-11-09 — ⌘L panel's Private button, owner-reported (candidate macos-2126247dc249b5b7):**
  the owner noticed the panel's footer had no Private button, unlike shipping.
  It was already fully wired — `footerNewPrivate`'s click handler
  (`overlay.js`) calls the exact same `window.browserAPI.createTab(null,
  {private: true})` as the already-working `/private` command, and ⌘⇧N opens
  an in-window private tab natively (`patches/0011-in-window-private-tabs.patch`)
  — but `prototype.css`'s "not yet backed by a native bridge" hide-list
  (written early in the prototype, listing controls like `#panelSiteInfo`
  that genuinely weren't wired yet) still included `#footerNewPrivate`, stale
  since private tabs were built. Removed it from that list; confirmed live
  via CDP (button renders, `getComputedStyle().display` went from `none` to
  `flex`, and clicking it creates a real private tab). Full regression:
  `island-and-commands.feature` 62-63/77 executed across two runs — one
  scenario flaked once then passed on retry, two failures were already in
  the same-day full-suite baseline before this change, and the fourth
  ("A pending permission prompt blocks hover-open") failed both runs; sibling
  hover-open scenarios pass, but the cause is unknown (see the entry above). `node --test` 262/262; `check-patches.py` passed.
- **2026-11-09 — Mahjong round 1, footer launch (candidate macos-aef74633b0b1595d):**
  the owner's named S1 close-out item. Ported shipping's 27 `mahjong*` files
  byte-identical (SHA-256-verified against `git show`), wired the footer link
  that was already in `newtab.html`/`.js` but called a nonexistent
  `window.bowserPages.start.openMahjong` (added the JS bridge and a native
  `NewTabHandler` case opening a new tab at
  `chrome://blanc-prototype/pages/mahjong.html`), and extended the existing
  `shippingPageUrl()` test-only URL projection so acceptance scenarios see
  `blanc://mahjong/...` as shipping expects. `newtab-layouts.feature:35`
  (F35-4, ordinary footer launch) passes live. `:41` (F35-9, the private
  variant) did not; see the correction above, including that this F35-4 pass
  did not prove the link was visible. `:21` (F35-3, deep game correctness)
  intentionally unattempted this round; `:161` (F35-10) is unrelated,
  pre-existing, and untouched. See `CODEX-NOTES-mahjong-round1.md`.
- **2026-11-09 — Batch 1 + Batch 2 merged (candidate macos-507866b59af7ffc6):**
  PR #1420 (batch 1) merged to `chromium/s3-quiet-tabs` first, which left PR
  #1421 (batch 2) with real conflicts — both touched `blanc_prototype_ui.cc`,
  `host.js`, and the generated `island-assets.json`/`source-map.json`/
  `tracker.json`. `blanc_prototype_ui.cc` and `host.js` merged cleanly (the
  two batches' changes don't overlap in either file); the generated files
  were resolved by recomputing their real hashes and rebuilding, not by
  hand-merging JSON. Rebuilt candidate independently verified. Full combined
  regression: `glance.feature` 39 pass/2 fail (only the still-open
  `glance.feature:98` and `:538`, both already documented below — `:538`'s
  fix is proven by the batch 2 algebra/diagnostic-logging record even though
  this scenario's separate Island-sliding assertion still doesn't trigger
  locally); `split-view.feature` 28 pass/2 fail (only the still-open
  `:110`/F53-14 and `:159`/F53-22). No regressions from either batch
  individually. `node --test chromium/tests/*.test.mjs` 72/72;
  `check-patches.py` passed.
- **2026-11-08 — Batch 2, two of four verified (candidate macos-e4317b7b0e5b22ae):**
  Codex's own attempt was blocked before any build (sandboxed loopback,
  process-inspection and Git-index denials); it recorded useful source
  findings but made no commits. Continued directly from those findings.
  (1) **split-view.feature:135 fixed and verified**: `keepGlanceAsSplit`
  wasn't failing to move the reference into main's group — `previewGlancePair`
  already does that silently when Glance opens, sharing the group-moving
  block with `createSplit`. `keepGlanceAsSplit` now compares the reference's
  current group against `glance_origin_group` (saved at open time) and
  announces the move via the already-defined-but-unused `split.groupMoveInto`
  copy key. (2) **glance.feature:538 fixed, empirically confirmed, but not
  independently re-verified end-to-end locally**: `AdjustSplitLayout`'s
  Glance branch was placing the card from an Island-relative origin instead
  of the raw container origin, leaking the Island's current auto-hide
  animation offset into the card's actual screen position — confirmed with
  temporary diagnostic logging showing `raw_origin.y() + height` constant at
  1140 across every frame of a real reveal, and the bug reproducing exactly
  as derived. Fixed by placing the card from the raw origin and computing the
  (already-correct) pageArea/band diagnostic from an explicit local
  Island-relative value instead of a shared, mutated one. Local re-run after
  the fix never hits the original invariance assertion — it's blocked by this
  scenario's separate "did the Island visibly slide" check (a 16ms-tick timer
  in `island_autohide_controller.inc`, a file this fix never touches) not
  registering `sliding:true` in this environment even with an extended
  sampling window, across multiple repeated runs. (3) F34-1 `glance.feature:98`
  and F53-22 `split-view.feature:159` remain open — not reattempted this
  round. `glance.feature:337`'s one-off failure
  ("Timeout waiting for #glancePickerInput[aria-busy=\"true\"]") matches the
  same Glance-picker wake-timing flake class already seen once this session
  (did not reproduce there either); not investigated further as part of this
  batch. Regression (this branch alone, without PR #1420's unmerged split
  persistence/move-to-new-window/focus-hook fixes, which live on a separate
  branch): `glance.feature` 36 pass/5 fail against a 37/4 baseline, the
  difference being the `glance.feature:337` flake above (538 was already
  counted in the 4); `split-view.feature` 25 pass/5 fail against a 24/6
  baseline, the +1 pass being this round's F53-18 fix. `node --test
  chromium/tests/*.test.mjs` 72/72; `check-patches.py` passed. See
  `CODEX-NOTES-batch2.md`.
- **2026-11-08 — F53/F34 batch 1, verified (candidate macos-593cbf5c187af246):**
  found by sweeping `glance.feature`/`split-view.feature` for the next batch of
  gaps after F41-78 merged. Three of four scoped fixes landed and are confirmed
  working with zero regressions: (1) `TestSessionWindowsRead`'s `sessionWindows`
  test-hook never read the already-working `kPersistentSplitKey` persistence,
  so its `splits` array was always empty — fixed, unblocking F53-12 and both
  F53-27 examples (relaunch/Space-round-trip split persistence); (2) Glance's
  "move the main page to a new window" had no host.js/native path at all
  (`glance.feature:52`) — added `moveTabToNewWindow`, reusing Chromium's
  `chrome::MoveTabsToNewWindow`; the first pass moved the whole native split
  (Glance's main/reference pair) instead of just the requested tab, found and
  fixed in review by dissolving the split via the existing `EndGlance()` helper
  first; (3) `testFocusTabContents`, a gated (`BUILDFLAG(ENABLE_BLANC_TEST_HOOKS)`)
  test-only hook, now lets a scenario simulate keyboard focus landing in a
  background tab, fixing `glance.feature:144`. The fourth (F53-14,
  `split-view.feature:110`) is NOT fixed: its `testNavigateTabAnyScheme` hook
  is reachable and correct in isolation (confirmed via the working
  `testFocusTabContents` sibling on the same `HandleTest` channel), but
  navigating a tab that's part of an active native Chromium split to an
  internal `blanc://` page silently never commits — no thrown error, no
  pending navigation entry, just reverts to a no-op. That's a real product
  question (can a split pane host an internal page at all?), not a test-hook
  gap, and needs its own investigation before further attempts. Regression:
  `glance.feature` 39 pass/2 fail (was 37/4), `split-view.feature` 27 pass/3
  fail (was 24/6); `node --test chromium/tests/*.test.mjs` 72/72;
  `check-patches.py` passed. See `CODEX-NOTES-f53-f34-batch1.md`.
- **Branch and PRs (owner, 2026-11-02):** the fork's integration branch is
  `chromium/migration` (renamed from `codex/f12-socket-speculation`), with
  [PR #1304](https://github.com/bnfy/blanc/pull/1304) as its integration PR
  into `main`, not merged until the fork is ready. It replaces #1028, which
  GitHub closed when the branch was renamed. Each new piece of work
  gets its own branch and small PR into `chromium/migration`.
- **Release-candidate readiness tracker:**
  https://claude.ai/artifact/BKaBQpYoAMMeUmqBfVbBPA (private to the owner).
  It shows each shipping acceptance case's latest macOS result (the newest
  full run overlaid by every targeted run since, so it mixes candidates),
  the tracker rows' stages per platform and the gates outside the code.
  Refresh it after each piece of work: `node chromium/tools/
  rc-readiness.mjs --baseline <evidence>/<newest full run>/baseline.json
  --runs <evidence> --out <dir>` (since 2026-11-12 the newest full run is
  `main-full-1`, against shipping main 8a4e57e78 on macos-19c5d5e4546d8b41), upload the three files to the dashboard
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
- **Shipping target moved to main 8a4e57e78 (2026-11-12, owner):** the
  fork now follows shipping's unreleased main (the coming 1.49.0) at
  8a4e57e78dfe47a72c05d17fd6040be26c3dffd3, labelled by that commit. The
  Island and strings are regenerated (the Mini-window edit now rides on
  #1450's rule that the resting Island never shows the Space mark), the
  shipping page copies follow it (#931/#1489's Mahjong: 82 files added, 14
  retired, 5 changed), and the inventory has 612 declarations and 661 cases.
  #1450/#1454/#1461/#1464 arrive with the Island; #1478 (a pop-up honors a
  tab's certificate Continue) is Chromium's own per-profile decision, and
  F39-10/11 pass through two new main-process ports and a gated
  closeAllConnections hook. spaceMarkState reports where the mark sits.
  Known: newtab-layouts.feature:21 (F35-3) fails because shipping's step
  still expects text tile faces in JetBrains Mono, which #931 replaced with
  image art; shipping's own reader fails the same way and its CI doesn't run
  the scenario. Not changed here (shipping's test is read-only to the fork).
- **V24 follow-up — widgets beside the clock, placed by hand (2026-11-13,
  owner):** on a window 1200 px or wider the widget cards sit in a column on
  each side of the Start Page, level with each other, clear of the header and
  footer; narrower, the two columns sit side by side under the clock. Each
  card has a grip: drag it to reorder or move it to the other side, or use
  its arrow keys (Up/Down within a column, Left/Right across), announced to
  assistive technology. The placement (Favorites and other devices on the
  left, Sent and the chart on the right by default) is saved device-wide with
  the widgets (`place` in blanc.start.widgets) and every open Start Page
  follows it. Each card is its own glass panel. Customize offers the widgets
  as a 2×2 grid of preview tiles (a drawing of each; gold outline and a check
  when on). The line under the clock is the count alone ("121 ads blocked
  this week", fork string start.billboard.blocked). native-start-widgets.mjs
  8/8 (a real pointer drag included); newtab-layouts 24/25 (:21 is
  shipping's stale Mahjong check; :134 passes once its audit reads the tiles).
- **Installing an extension is not a download (2026-11-13, owner's report):**
  adding an extension from the Web Store lit the Island's Downloads, because
  Chromium's installer fetches the package through the download system. A
  download made by the extension installer (its download source) is no
  longer counted by the Island's Downloads or listed on the Downloads page.
  Test `chromium/tests/native-downloads-extensions.mjs` (gated
  `testStartDownload`/`testDownloadSources`): the installer's download is
  made and ignored, an ordinary one still shows. downloads.feature 2/2.
- **The Web Store's "Switch to Chrome?" card is hidden (2026-11-13, owner's
  report):** opening a gallery extension's listing showed a new Store card
  (heading, one sentence, No thanks / Yes) over the install button, which
  the existing rule did not know. `blanc_webstore_promotion.h` now also hides
  that card, matched by its whole English copy and exactly those two
  controls, and nothing larger. Test `chromium/tests/native-webstore-promotion.mjs`
  (the rule's own script on Store-shaped markup): 3/3; it fails on the old
  rule. Other languages' cards are not matched yet.
- **V26 — no Blocked this week widget (2026-11-13, owner; fork only):** the
  week's chart is no longer a Start Page widget; Billboard's line under the
  clock ("N ads blocked this week") always shows the count, and a private
  page's line says it counts nothing, as before. A saved "chart" choice or
  place from an earlier build is ignored and dropped (natively), and a
  profile moving from Tally gets Favorites alone. Customize offers three
  widgets plus any extension panels. Shipping steps it changes run as V26
  replacements: Tally's two columns at 1440x840 (now the Favorites card
  beside the week's line), the two Mahjong footer steps (three Customize
  choices, not four), and the typography audit (ten samples, not twelve);
  Tally's narrow "data above the list" runs as shipping wrote it, reading
  the line. newtab-layouts 24/25 (:21 is shipping's stale Mahjong check).
- **Shortcuts is a choice, not a widget (2026-11-13, owner):** More shortcuts
  never was a card; it doubled Billboard's tiles under the clock. Customize
  now has a Shortcuts section (6 or 12, the Wallpaper section's segmented
  control) in its place. Billboard draws only the sites it has (pins and the
  most visited), so with fewer than the count chosen the choice seemed to do
  nothing (the owner's report: a dev profile with one site). Customize now
  says "N sites so far. More appear as you browse." in that case. Shipping's
  Mahjong steps count three Customize choices (V26, two tiles and this one).
  native-start-widgets 8/8; newtab-layouts 24/25 (:21 as before).
- **Customize, redesigned (2026-11-13, owner; apple-design):** two columns
  from 760 px wide (stacked when narrower): Widgets, Shortcuts and Clock on
  the left; Wallpaper on the right with every option it had (Sunrise, Color
  with its fill and space color, Your image with Wash and Fade, time of
  day). The widget tiles are skeleton drawings of each card, like the old
  layout picker's thumbnails (gold outline when on). Shortcuts is a − / +
  stepper from 1 to 12, saved as `shortcutCount` in blanc.start.widgets (the
  older 6-or-12 `shortcuts` is kept in step for earlier builds); arrow keys
  step it, a run of presses saves once, and its ends use aria-disabled so
  focus stays put. Billboard's tiles wrap into centered rows of at most six.
  The popover never covers the clock or the line under it, so a change to
  the clock's look stays in view: its height is capped to the room between
  that line and its button, and it scrolls inside when it needs more (by
  16 px at 1000 × 760; it fits at 1280 × 800 and larger, in every
  wallpaper mode). native-start-widgets 8/8; newtab-layouts 24/25 (:21 as
  before).
- **Gate decisions for the first public beta (owner, 2026-11-14):** acceptance
  by equivalence (full suite on the same-source prototype plus the beta's
  own checks), desktop Sync by the local-build check, and the update gate by
  the local proof; the first signed handoff is beta.2 → beta.3 after release
  (docs/chromium-beta-release.md, Owner gate decisions).
- **Protected-video gate waived for beta.2 (owner, 2026-11-14):** the EME
  notice and Electron Blanc handoff (`no-drm-handoff`, D3/X2) are not built;
  beta.2 ships without them and the notice is due in beta.3. Only that gate
  and release can be waived (`policy.mjs` `GATE_WAIVERS`); `manifest.mjs`
  accepts a `waived` gate only with the descriptor's `gateWaivers` entry.
- **Beta.2 signed and notarized (owner, 2026-11-14):** release stages
  preflight through sparkle ran from the owner's Terminal at `058277389`
  (DMG `d155c316…`, Notarized Developer ID; Gatekeeper accepts the DMG and the
  app). On it: native signature, Gatekeeper and notices-and-credits pass, and
  the owner's Touch ID passkey checks pass 5 of 5. The owner waived the
  real-iPhone Sync gate for this first fork beta; that waiver's reason rides
  in `acceptance.json` (policy `GATE_WAIVERS`), since `release.json` was fixed.
- **Blanc Beta 2.0.0-beta.2 published (owner, 2026-11-14):** the first public
  fork beta, a GitHub pre-release (not latest; v1.49.0 stays latest), tag
  `chromium-beta-2.0.0-beta.2` at `058277389`, nine assets, DMG `d155c316…`.
  Acceptance by equivalence: the full suite on the same-source prototype
  passed 578, with 4 undefined, 27 excluded; the two Island auto-hide failures
  passed when rerun with the Mac idle, and `vertical-tabs.feature:58` is a
  known intermittent issue (the rail can reopen at its narrow cap after a
  relaunch; fix in beta.3). 11 gates passed, 2 waived (no-drm-handoff,
  production-sync-real-device). The update key's 1Password copy was made on
  the MacBook Pro (1Password won't stay unlocked on the Mac Studio). The
  Sigstore stage first hung (cosign had no terminal and fell back to a
  hidden device-code sign-in); fixed by giving it the Terminal (`99bcadb21`).
  Logged-out public verification passed. After publication: the website
  shipped the feed, the Download page tile and `/dl/beta` (#1511, #1512), and
  the hosted smoke check passed all six checks (run 43561295021 on `main`,
  with the live feed). Still owed: the first signed beta.2 → beta.3 handoff.
- **Blanc Beta 2.0.0-beta.3 published (owner, 2026-11-14):** a GitHub
  pre-release at 07:16 UTC (not latest), tag `chromium-beta-2.0.0-beta.3` at
  `c3a3bc898`, nine assets, DMG `a31422ed…`. It fixes beta.2's Sync lockout
  and turns Safe Browsing off by default (0079). Run entirely from the
  MacBook Pro over SSH (`chromium/release/owner/remote/`). 11 gates passed,
  2 waived (no-drm-handoff, production-sync-real-device: the real-iPhone pass
  found the Sync faults in item 5a below). The website shipped it (#1518);
  blanc.day's feed equals the release appcast. Its hosted smoke
  check passed all six checks (run 43573427182 on `main`), and the first
  signed Sparkle handoff passed: the public beta.2, reinstalled on the
  MacBook Pro, updated itself to beta.3 from inside the app (About shows
  2.0.0-beta.3; the installed code hash matches the release).
- **Beta.2 production build (owner, 2026-11-14):** `out/BlancBeta` switched to
  production (2.0.0-beta.2, build 2, the production key, local qualification
  off) and rebuilt through the guard with the owner-approved
  `--allow-large-build` for the changed build-flag header (27 steps). The app
  reports 2.0.0-beta.2 (2), trusts the production key and feeds from
  blanc.day. On it, with a local draft descriptor (placeholder hashes), the
  blocker, hooks, profile and notices/credits checks pass; no update check
  ran. The outbound isolation check also passed on it (run
  beta-20261114T030319Z: controls logged, only the probe's lookups blocked,
  no outside host in any network log). Still to come: the 1Password key
  backup, signing, notarization, the real descriptor and evidence on the signed
  DMG, production Sync with a real iPhone and passkeys.
- **Production update key and beta.2 (owner, 2026-11-14):** the key ceremony
  ran split because 1Password kept locking: the production EdDSA key is in
  the owner's Keychain (`me.bnfy.blanc.beta`) and its public key is pinned
  for the build; the 1Password copy is pending (`sparkle-key-backup.command`),
  and `release.mjs` refuses to draft or publish until it is verified. A
  private local-qualification beta.2 (build 2) had been built for the local
  update proof; its copies were deleted and the owner kept 2.0.0-beta.2
  (build 2) for the first public beta.
- **Hosted smoke workflow (2026-11-14):** `chromium-beta-smoke.yml` +
  `chromium/release/public-smoke.mjs`, the fork's exact-tag hosted check of
  a published beta (assets, manifest, appcasts, pre-release state, verify.mjs,
  launch, optional live feed). Runnable once it reaches `main`.
- **Utility pages never open as tabs (owner, 2026-11-14):** a Settings page
  could open as an ordinary tab (only the exact `chrome://settings/` went to
  the sheet), showing Chromium's blue Settings icon in the Island. Now any
  `chrome://settings/...` (opening the sheet at that page), Downloads,
  Favorites or History load in a tab of an Island window opens the sheet
  instead (a navigation check handed to the blocker's throttle hook by the
  UI, `UtilityPageGate`); a tab opened only for it closes, an existing tab
  keeps its page. Typed `blanc://settings[/section]`, `blanc://downloads`,
  `blanc://bookmarks`/`favorites` and `blanc://history` open the sheet as in
  shipping (they did nothing before). `native-utility-sheet.mjs` 3/3 twice;
  internal-pages :17–:66 and settings-and-theming :29 pass; beta Sync check
  still passes on the rebuilt beta.
- **Desktop Sync on the local beta (2026-11-14):** `chromium/tests/beta-sync.mjs`
  drives the beta's Settings → Sync (no test hooks) against the local
  Worker on its fixed loopback endpoint: Sync turns on, an independent
  iPhone-bundle peer pairs with the code shown, and with tab sharing on the
  peer sees the beta's open page. Passed.
- **Local Sparkle update proof (2026-11-14):** `local-update-proof.mjs` on
  local beta.1 and beta.2 builds: the good feed installed build 2; a feed
  signed with another key and one changed after signing were downloaded and
  refused (build 1 kept). The first throwaway key was kept in /tmp and lost
  in a restart, so a new one lives in `records/local-update-key` (owner-only,
  outside Git) and the local beta now trusts it.
- **No test hooks and profile separation (2026-11-14):** the hooks audit
  found four `--blanc-test` reads outside the test-hooks flag (first run,
  version, data home, telemetry collector, a Sync test call); they now go
  through `blanc::BlancTestLaunch()`, false in beta and release builds.
  `hooks-evidence.mjs` (no test switch name in any beta binary; every test
  switch inert at runtime) and `profile-evidence.mjs` (own folder only;
  nine refusals of the Electron, release and preview identities' folders)
  both passed on the rebuilt local beta.
- **Outbound isolation of the packaged beta (2026-11-14):** the S1.1 harness
  can't show what a beta contacts on its own (test hooks, proxy, background
  networking off), so `chromium/tests/outbound/beta-scenarios.mjs` runs the
  beta as a person does under the owner-approved pf anchor, with Chromium's
  network log, and `analyze-beta.mjs` judges it. The local-qualification
  beta passed: all controls logged, no blocked packet from a Blanc process
  beyond the page probe's own DNS lookups, no outside host in any network
  log. `beta-root.sh` is the owner's one command (start, wait, stop).
- **Blocker payload evidence (2026-11-14):** `chromium/release/blocker-evidence.mjs`
  writes the blocker-payload gate evidence: the embedded engine is the pinned
  bundle, and with no development switch and loopback only, ordinary and
  private windows (each proved by whether a page cookie reaches the profile)
  block two EasyList hosts while the page loads, and app clones with a
  changed or missing engine let nothing through. All four passed on the
  local-qualification beta. Tests 3/3; unit 426/426.
- **SBOM, NOTICES.txt and the notices-and-credits gate (2026-11-13, owner):**
  `chromium/release/sbom_scan.py` lists what `//chrome:chrome` ships with
  Chromium's own `licenses.py` (322 components on out/BlancBeta, versions for
  all but 19 in-tree ones), hashing each licence text and recording the 7
  folders the tool skips; `sbom.mjs build` writes a deterministic CycloneDX
  1.6 SBOM and a deduplicated NOTICES.txt (334 components, 178 texts);
  `sbom.mjs audit` checks the packaged notices, credits and SBOM and writes
  the gate evidence. Reviewed extras: `chromium/release/sbom-extra.json`.
  `manifest.mjs` now also requires the SBOM to name the release's source
  commit and input digest. Both gaps the first run found are fixed: the beta
  embeds the pinned blocker engine (GN `blanc_blocker_bundle`, checked by the
  build, preflight, verify.mjs and the browser), so it blocks when opened from
  Finder, and its THIRD_PARTY_NOTICES.txt is its own, generated by
  `chromium/release/fork-notice.mjs` (no Electron components). A component
  Chromium's credits page misses (@vscode/web-custom-data, left out of
  DevTools' credited folders) is credited there instead. The first beta build
  failed Chromium's helper library check: Sparkle and Cocoa reached the
  Aperitif helpers through all_dependent_configs; they now link only into the
  browser framework. On the rebuilt local beta: notices audit passed, the
  embedded blocker blocked EasyList hosts the unblocked preview loaded, and
  the helpers link exactly Chromium's libraries. No full suite was run.
- **Staged beta release operator (2026-11-13, owner):** `chromium/release/release.mjs`
  runs the runbook's §10 commands as eleven named stages (preflight, sign,
  notarize-app, dmg, notarize-dmg, sparkle, manifest, draft, sigstore,
  publish, verify-public), one per invocation from a foreground Terminal,
  recording each in a private `state.json` bound to `release.json`. From
  `draft` on nothing reruns; absence of the tag and every release (drafts
  included) must be answered, an error is not absence; `draft` and `publish`
  need a typed confirmation, and `publish` checks `/latest` stays stable.
  The Intel waiver moves to beta.2. release-stages 5/5; unit 408/408.
  Owed before a public run: the key ceremony, the beta.2 production build,
  and the §6 gate adapters (docs/chromium-beta-release.md, Staged operator).
- **First public beta is 2.0.0-beta.2 (owner, 2026-11-13):** build 2.
  `chromium/release/ledger.json` keeps 2.0.0-beta.1 reserved for the private
  local-qualification build (the one built tonight, not distributable). The
  production build needs the owner's Sparkle key ceremony
  (docs/chromium-beta-release.md §10.1) for its public key, then production
  arguments (beta.2, build 2, local qualification off); the release
  script's build, signing and publish stages are still the phase-one plan.
- **Final full macOS run (2026-11-13):** on macos-656ae5d81449fec2, the
  source the first beta is built from: 629 pass, 1 fail, 3 undefined, 28
  excluded, in 54 minutes. The failure, internal-pages.feature:7, read the
  week's blocked count from the footer, which shipping shows only in
  Ledger; since V24 the count is the line under Billboard's clock, and the
  fork's step (fork-steps/pages.mjs) now reads it there; it passes. The
  undefined three are the in-app updater, private-tab passkeys and Patron
  icons, as before. The dedicated beta build started after it.
- **Shortcuts stay clear of the widget columns (2026-11-13, owner):** on a
  window 1200 px or wider the columns sit fixed at the sides, and nothing
  kept Billboard's shortcuts from sliding under them. A row now holds only
  the tiles that fit between the filled columns (up to six, from the
  columns' own CSS sizes so the choice can't flip back and forth), and when
  not even three fit the columns go under the clock as on a narrow window
  (`data-rails-stacked`). The row also wraps at all: shipping's single row
  is `nowrap`, so Customize's "rows of at most six" never wrapped before.
  Checked at 1200–1700 px with both columns filled: no tile overlaps a
  column (five a row at 1200). native-start-widgets 8/8; newtab-layouts
  25/25.
- **Shipping corrections (2026-11-13):** a shipping step that shipping
  itself corrected after the fork's reference (8a4e57e78) now runs as the
  correcting commit wrote it, and only that definition
  (`corrections` in `tests/lib/shipping-core.cjs`, each naming its PR).
  First: #1491 brought "the standalone mahjong game is ready" up to date
  with #931's tile art and #1489's Instrument Sans, both already in the
  reference, so newtab-layouts.feature:21 checked a page shipping no longer
  draws. newtab-layouts :21, :35, :41 pass.
- **The Island's band continues the Start Page's wallpaper (2026-11-13,
  owner; fork only):** the band above a Start Page used to take one color
  sampled from the page's top rows, which can't line up with a photo. Now
  the page lays its wallpaper out from the window's corner, under the band
  and the vertical-tab rail (the layers and a fixed copy of the body's own
  background start `--island-band-h` above the page), and the Island host
  paints the band's slice of the same layers, so the image runs behind the
  Island (the owner chose this over mirroring the top edge). The page sends
  each layer's computed background through `islandBackdrop`; native copies
  only known fields of bounded size, adds the band and rail it gave the
  page, and forwards them to that window's host, which draws only Blanc's
  page images and your photo (read from the Start Page's own storage by its
  key) and cross-fades with the page. Sunrise, Color fills and your photo
  continue; website tabs keep the sampled color, private Start Pages and
  installed browser themes keep theirs, and it stands aside with auto-hide,
  in a split, in full screen and with Match site colors off (switching it
  asks each open Start Page again). Test `chromium/tests/native-island-backdrop.mjs`:
  3/3 (across the seam the band's last row and the page's first differ by
  0.6 of 255 on Sunrise and 0.7 on a photo whose bands cross the top edge;
  the photo set through the real file chooser). native-start-widgets 8/8;
  newtab-layouts 24/25 (:21 is shipping's Mahjong check, which since the
  merge from main expects Mahjong's new fonts; the fork's Mahjong page
  copy has not taken them yet).
- **Favorites resizes too (2026-11-13, owner):** like the devices card, by
  its bottom edge onto the fixed sizes. At its own size it lists eight
  favorites; given a size (or while being resized) it lists all of them and
  scrolls inside its card with the same fades, hover scrollbar and touch
  panning. native-start-devices 10/10; native-start-widgets 8/8 (now moving
  Favorites, and checking a saved chart is ignored).
- **On your other devices, redesigned (2026-11-13, owner: "Redesign this
  widget using apple-design"; fork only):** the card groups tabs under each
  device, its name shown once in a small header with a laptop or phone glyph
  and its tab count. Rows are two lines (the whole title, the site beneath)
  that highlight as one rounded row and press in slightly; an empty title shows
  the site. Three tabs a device, then "N more tabs" / "Show fewer". With many
  devices the list scrolls inside the card, with soft fades at its edges.
  The shipping step that reads a row's "site · device" gets the device from
  the row (`data-device`). sync.feature:129 and vertical-tabs.feature:129
  pass; native-start-widgets 8/8.
  Follow-ups the same day (owner): a thin scrollbar shows on hover and while
  the list scrolls, hidden otherwise; a finger pans the list (momentum, a
  contained bounce), rows grow to finger-sized targets on a touchscreen,
  hover highlights apply only where there is hover, and the grips stay
  visible for touch. Dragging the long card had pushed its column under the
  footer: on a wide page a column now fits between header and footer (the
  devices card and an extension panel card give up height and scroll), and a
  tall card is carried as a 220px preview over a slot as short. A
  `:focus-within` scrollbar rule with a color transition froze the page's
  painting when a row took focus (a native sample showed paint repeating);
  both are gone. Test `chromium/tests/native-start-devices.mjs`: 5/5.
  Later (owner): the header holds only the Sunrise and date on the left, so
  on a wide page the right column starts on the header's top line and ends
  level with the left one, above the header's empty right half. The devices
  test checks it: 6/6.
  Resizable long cards (owner, same day): the devices card and an extension
  panel card resize by their bottom edge (a grabber shows on hover, focus and
  touch). The card follows the pointer or finger 1:1, with growing
  resistance past the smallest and largest sizes; a dashed outline shows the
  size it will take; on release it settles on the fixed size nearest where
  the gesture was heading (240, 360, 480, 600 or 720 px, the largest its
  column has room for), with a critically damped spring that starts at the
  gesture's speed. Arrow keys, Home and End step through the sizes; double-
  click or Delete fits the column again. Sizes are saved with the widgets
  (`sizes`, validated natively). While fixing it: a widgets refresh during a
  gesture re-inserted every card, dropping the pointer a resize held; cards
  now move only when out of place. native-start-devices 9/9;
  native-start-widgets 8/8.
- **Extension side panels as Start Page cards: prototyped, then removed
  (2026-11-13, owner):** an extension's Chrome side panel could become a
  Start Page card, and an "Add a widget" gallery in Customize suggested four
  Web Store extensions with side panels. The owner then chose to keep the
  Start Page to Blanc's own widgets "for now", so the cards, the gallery, the
  native panel host (`ExtensionViewViews` over the card's slot), the
  `panel*`/`widgetsPanel` page methods, the gated `testLoadUnpacked` hook, the
  test and its sample extension are gone (in history: d92e63c4b, 280a59a66,
  06284793e). A saved `panels` list in the widgets pref is ignored. Kept:
  hiding the Web Store's "Switch to Chrome?" card and leaving extension
  installs out of Downloads, which help any extension install.
- **Mahjong dock icons (2026-11-13):** shipping's dock uses
  `<use href="mahjong-icons.svg#…">`, which Chromium does not load on the
  fork's internal pages (net::ERR_FAILED), so the dock showed empty circles.
  The served page inlines the sprite; shipping's files are unchanged.
- **V25 — Mahjong takes Patron's place in the Start Page footer (2026-11-13,
  owner; fork only, "for now"):** the Become a Blanc Patron pill leaves the
  Start Page (Settings → Patron still offers it), and Play Blanc Mahjong
  moves from the footer's right to the footer's left in that pill's look
  (gold outline, weight 600, a two-tile mark, no ×). Shipping's two steps that
  find or close the Patron pill run as V25 replacements.
- **V24 — one Start Page with optional widgets, readable on any wallpaper
  (2026-11-13, owner; fork only):** Billboard is the one Start Page layout.
  Customize's layout picker becomes four switches: Favorites (up to eight,
  in columns), On your other devices, Blocked this week (the 7-day chart,
  replacing Billboard's one-line count) and More shortcuts (twelve tiles
  instead of six). Sent to this device is an inbox, not a switch: it shows
  whenever something waits. The choice is device-wide (`blanc.start.widgets`
  in Local State, patch 0078), never synced, and every open Start Page
  follows it at once. On first read a profile's old layout decides it once:
  Ledger → Favorites + other devices, Tally → Favorites + chart, Shelf →
  Favorites + More shortcuts (Shelf's grid showed favorites), Billboard →
  none. Over your image or a theme's image the image stays untouched (owner,
  after the first try's cream plates and clock halo looked wrong): the
  widgets sit on one glass tray in the Island's material family; the date,
  blocked line, tile names and group chips take whichever ink, light or dark,
  stands out more against the image (and wash) right behind them, read from
  the image itself (newtab-adapter.js, the Lock Screen's way; owner, after a
  shadow alone and then a wash behind the date both fell short); the footer
  sits in a fade up from the bottom edge; and the clock is as
  it was (its own opposite shadow). The tray's inks and the footer's ink keep
  4.5:1 or more over pure black and pure white behind them
  (start-plates.test.mjs); native-start-widgets.mjs checks the switches, live
  sharing, relaunch, the move from Tally and that look.
  The footer's Mahjong link reads "Play Blanc Mahjong" (owner; fork string
  start.mahjong.play in six languages). On macos-9cd621a1e07290fa
  native-start-widgets.mjs passes 6/6 and newtab-layouts :85, :134 (on a
  retry), :161, :221 pass; :8, :14, :101, :114, :188, :194, :212 passed on the
  build before the footer fade moved to ::after.
  Shipping's layout steps run as V24 replacements (tests/fork-steps,
  lib/start-widgets.mjs): newtab-layouts.feature 24/25 on
  macos-e66182e9896f8805; :21 is shipping's stale Mahjong check, failing
  before this change too. A page with widgets fits 1000×840 without scrolling.
  On macos-51eaa3444b2f90d6 (names win over addresses in Favorites' columns)
  native-start-widgets.mjs passes 6/6 and :85/:101/:114/:161/:188 pass. The
  local Sync gate ran 12/22 on macos-e66182e9896f8805, Start Page Send
  included, then was stopped to save time (owner: "the gate is going very
  slowly"); the other ten cover code this change does not touch (22/22 on
  macos-c2c2bcc050e0af2d). Rerun the whole gate on the beta candidate.
- **Extensions panel over the floating Island (2026-11-13, owner report):**
  with Auto-hide in float style, the Extensions panel opened behind the
  revealed floating Island (layer 2 under its 4; also under a Glance card's
  3). It now sits on the ⌘L panel's layer (5), as shipping's overlay is above
  its float views and the card. native-extensions-over-float.mjs fails
  before the fix and passes after it (macos-f7b5f8256e4bdf54, Island files
  served from disk because the beta build held the build tree).
- **Resting Island geometry matches shipping (2026-11-13, owner):** measured
  side by side with shipping's Electron build (8a4e57e78) at 1200 px, the
  fork's prototype.css had re-spaced the closed Island (6 px gaps instead of
  10, 26 px action buttons instead of 22 × zoom, a 14 px corner at every
  Island size instead of 17/19/21, and no top highlight in the shadow). Those
  overrides are gone: every gap, button, corner and the shadow now equal
  shipping's to 0.01 px. The only difference left is the fork's native
  Extensions slot at the start of the actions (26 px, shipping's 1.15 px
  step). island-resting-geometry.test.mjs keeps fork stylesheets from
  changing the resting pill again.
- **Beta polish: the app's name and About (2026-11-13, owner):** the
  application menu names the app from its bundle (About, Hide and Quit
  "Blanc Beta" / "Blanc Prototype", patch 0075); About, from that menu or
  the standard About panel, opens Blanc's Settings sheet at About instead of
  a full-page tab (patch 0076); and Chromium's own text names the browser
  Blanc in every language (patch 0077, `blanc/common/product_name.h`,
  owner's choice "Blanc"), keeping "The Chromium Authors", the credited
  "Chromium open source project", ChromiumOS, Chromium Enterprise, URLs and
  longer words. native-app-menu-about.mjs and product-name.test.mjs check
  them. All four land in the first beta (owner: "I need all these fixes in
  the first beta that real users see").
- **Glance over a split (F53-29/30, shipping v1.47.0; 2026-11-12, owner):**
  Chromium's split holds two pages, so a Glance opened over a visible split
  shows its tab in a view of its own, between the split's pages and the
  Island (which draws the card's frame); the tab stays where it is. It stays
  while focus moves between the panes or one closes, and ends on any other
  switch, on its own tab leaving, or when Chromium is about to show its page
  (patch 0072 hooks both of Chromium's attach points). The Island cuts the
  pane frames, corner tabs and divider away under the card; the tab menu
  offers Glance while a split shows. Page commands follow focus into this
  card (patch 0074, 2026-11-13): zoom, Back/Forward, Reload and Find act on
  the Glance page while it has focus and on the pane again once a pane
  does (native-glance-split-commands.mjs). Both scenarios pass,
  and glance.feature and split-view.feature pass 101 with 2 excluded on
  macos-c2c2bcc050e0af2d.
- **F62 default page zoom on Chromium's zoom (2026-11-12):** all 11
  page-zoom.feature scenarios pass on macos-62c03a037c249ee0
  (`v148-zoom-cases-3`). Chromium already keeps a profile's default and
  per-site zoom (private tabs in memory only, profiles apart, ⌘0 back to the
  default, no entry for a site at the default). Patch 0070 gives only web
  content the default, so the Island, the Start Page, Settings and extension
  pages stay at 100% until zoomed themselves (shipping's usesDefaultZoom);
  patch 0071 returns ⌘+/⌘− to Chrome's step ladder, replacing the baseline's
  Electron ±0.5-level steps, as shipping did in v1.47.0. Settings uses
  Chromium's own Page zoom menu (Appearance) and Zoom levels list (Site
  settings). Owner decisions (2026-11-12): the default page zoom is
  device-wide as in shipping (`blanc.page_zoom` in Local State; every
  profile's default follows it, patch 0073), an exception to V18; saved sites
  stay in each profile's Chromium preferences and are listed under Site
  settings → Zoom levels, reached from a link beneath Page zoom (V23,
  approved). Glance zoom, the Start Page layouts and page scaling still pass;
  native-device-zoom.mjs checks the device-wide default and the link.
- **Shipping target moved to v1.48.0 (2026-11-12, owner):** shipping v1.48.0
  went public on 2026-11-11, so the fork's reference moves from v1.46.0. The
  Island renderer (every fork edit still applies; island-autohide.js,
  overlay.js, renderer.js and styles.css changed), the interface, menu and
  settings strings, the asset provenance, the parity tests and the scenario
  inventory (610 declarations, 659 cases, from 591 and 640) follow v1.48.0.
  New for the desktop: F62 default page zoom (11 scenarios, v1.47.0; the key
  check gains `pageZoom`, to build on Chromium's own zoom), Glance over a whole
  split (F53-29, F53-30), a refused bad-certificate frame and a WebSocket past
  a continued warning (F39-8, F39-9). The phone-only tab gestures (F56) map to
  N14 and are excluded. The sandboxed Sync and import bundles stay on v1.46.0
  (`bundleTag`): through v1.48.0 shipping changed neither for users, and
  moving them changes Android's runner. A new spec row is F62.
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
  Kagi under V12 (F5-2). Historical V16 made a pinned tab leave its
  group; queue 3 restores shipping grouped pins and retires those overrides
  (see CODEX-NOTES-quiet.md). V17, Close Tabs Below
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
- **S2 decisions (owner, 2026-11-04):** V18, local profiles are Chromium's
  profiles with its own picker and Manage profile pages, settings per
  profile (F33); V19, Chromium's native passkeys (N7); V20, Chromium's
  Default browser section (N10); telemetry (F21) is built consent-first with
  shipping's fixed events, but the preview channel never sends (only a
  release-channel build would). Favorites import (F30) follows the spec:
  Chromium's importer where it covers a source (Safari, Firefox) and
  shipping's reader for Chromium-family profiles and Arc.
- **S2.1 native profiles in Settings (V18), candidate macos-09aa3d8b79584378
  (2026-11-05):** patch 0027 keeps chrome://settings' People section for
  Chromium's profiles, retitled Profiles (shipping's label), with the
  profile's name and picture (Manage profile), a Profiles row that opens
  Chromium's profile picker (`blancSettingsProfilePicker`; the Island has
  no avatar button) and Chromium's Import bookmarks and settings dialog (the
  native half of F30). Its Sync and Google services rows are gone, and
  `signin.allowed` defaults to false (identity_manager_factory.cc, newly
  pinned with the two People page files; 118 upstream files), so no
  sign-in or Sync promo shows anywhere. The sheet opens it as `profiles` or
  `people`. A probe confirms the row opens chrome://profile-picker.
  settings-and-theming 5 pass / 1 undefined and interface-language 5 pass,
  as before. Default browser (V20) was already Chromium's section. Open: the
  default profile is named "Your Chromium" (Chromium's product string, not
  shipping's Personal), which belongs with the fork's product-name strings;
  F33's three shipping cases drive shipping's own Profiles section and stay
  undefined under V18.
- **S2.2 first run and Favorites import, candidate macos-86a75dc4b5d45861 (2026-11-05):**
  shipping's walkthrough now runs on the Start Page. `first_run.inc` holds
  settings.js's first-run state (Local State `blanc.first_run.completed_at`
  and `blanc.telemetry.usage_ping`, device-wide), pages.js's narrow
  onboarding setters (blocking, theme, and `blanc.tabs.archive` only while
  first run is pending) and browser-data-import.js's reader: Chrome, Edge,
  Brave, Chromium and Vivaldi profiles, Bookmarks and AccountBookmarks, read
  only when asked, labels only to the page. A bookmarks file is chosen and
  parsed in the page (`pages/bookmark-file.js`) and merged natively with
  bookmark-data.js's rules, for the walkthrough and the Favorites sheet.
  Patch 0028 registers the prefs; test profiles finish first run at launch.
  F30 passes all 5; F36 passed 7 here, with F36-8 undefined until S2.6.
  island-and-commands 63 / 3,
  internal-pages 9 / 1, newtab-layouts 10 / 3 (Mahjong only). F30, F33, F36
  and N10 are Integrated on macOS. The default-browser step uses Chromium's
  check and registration (V20). Bring Your Tabs (F40) stays hidden until S3.
  The privacy step keeps shipping's copy (owner, 2026-11-05), though the
  preview neither checks for updates nor sends counts (F21 consent only).
  macOS 27.3 changed clang's `--version` text (same binary); the owner
  approved recording the environment, and the plan stayed small.
- **S2.3 moving-in checklist (N11), candidate macos-27de7410e9f9d890 (2026-11-05):**
  shipping's Finish setup pill runs on the Start Page from native state
  (Local State `blanc.checklist.dismissed` and `default_done`), never in a
  private tab or a named profile. A task is listed only where it works, so
  today it holds Make Blanc your default alone; Sync (F27), Bring your tabs
  (F40), the first space (F41) and the iPhone join through their availability
  flags in `first_run.inc`. newtab-layouts 12 pass / 3 fail (Mahjong only):
  F35-7 and F35-8 pass, and F35-10 and F35-18 now wait only on the Billboard
  history-seeding test op.
- **S2.4 What's New (F51), candidate macos-28492a27347b09a4 (2026-11-05):** shipping's
  `whats-new.js` runs unmodified (a generated wrapper) in the host and on
  the Start Page, over a Local State dictionary `blanc.whats_new` with
  shipping's five fields; `whatsNewCheck` is its one HEAD (no cookies, no
  redirects, only https://blanc.day/whats-new/<release>). It keys off the
  Blanc release version, which the preview doesn't have, so it is inert until
  a release channel supplies `BlancReleaseVersion()`: Implemented, not
  Integrated. A probe with `--blanc-test-version=1.47.0` shows the pill and
  its changelog link and that closing it sticks, and the preview stays
  silent. Not exercised: the page-found path (a 200 from blanc.day, and the
  one-time tab), which the offline fixture can't reach.
- **S2.5 Patron and app icons (F17), candidate macos-df08efed32b15890 (2026-11-05):**
  owner decisions: the preview offers the Blanc Patron row and its checkout
  link only (chrome://settings → About; no license key activation until a
  release channel), and the Start Page's upgrade pill stays off. Settings →
  Appearance has shipping's five macOS icons (`blanc.app_icon`, patch 0029,
  which pins the two About page files); the Dock takes shipping's flat
  images, its development-build path, because the adaptive stacks need
  Assets.car from a packaged build. Sunrise itself is the bundle's icon.
  F17-1 and F17-3 pass, settings-and-theming 6 pass / 1 undefined (F14-2 now
  runs) and island-and-commands 63 / 3 as before. The checkout line is read
  through loadTimeData, not `$i18n{}`: its "$4/month" is a dangling
  placeholder to Chromium's template expressions, which crashed Settings on
  the first candidate. The Dock change itself is not visible to the tests.
  chrome://settings' About page still reads About Chromium, with Chromium's
  logo and an update-check error; that belongs with the product strings.
- **S2.6 welcome tour and telemetry (F36-8, F21), candidate macos-9a9442cac7df94a0 (2026-11-05):**
  Settings → About has shipping's Welcome tour row. It opens
  `chrome://blanc-prototype/pages/newtab.html?tour=1`, the one extra Start Page
  address `IsRegularStartPage` accepts, and the tab reads as a new tab
  everywhere else. From a private window it opens in a regular one. F36 passes
  all 8. Telemetry is `telemetry.inc`, shipping's telemetry.js and
  day-one-signals.js: launch ping, `newtab_layout`, `day1_default` and
  `day1_browsed`, with the install id in Local State
  (`blanc.telemetry.install`, patch 0030) and minted only on the way to a send.
  Settings → Privacy and security has Help improve Blanc and Reset install ID.
  Reset clears the record rather than minting a new id, so a declined choice
  still leaves none. The preview stays silent because `BlancReleaseVersion()`
  is empty outside tests; `tests/telemetry-gate.test.mjs` fails if anything
  else can supply one, and a preview run with a completed first run sent
  nothing and minted no id. F21-1 and F21-2 pass with a test version and a
  capture server. Not exercised: the two day-one signals (no case reaches
  them) and `mahjong_play`, which waits for Mahjong. A page counts toward
  `day1_browsed` only in the active tab, where shipping counts every tab.
  The Help improve Blanc row keeps shipping's copy, which describes sending.
  island-and-commands 64 / 2 (F1-13 passed this time, still unexplained),
  settings-and-theming 6 / 0, browser-migration 5 / 0, internal-pages 9 / 1,
  newtab-layouts 12 / 3 (Mahjong only).
- **S3 decisions (owner, 2026-11-05):** S3 finishes Blanc's own vertical rail
  (F28), not Chromium's native vertical tabs, and shipping's Ctrl+Tab switcher
  with its card (F59), not Chromium's `kCtrlTabMru`, which only flips between
  the last two tabs. Mute Site (N13) is Chromium's own sound setting, so a mute
  now outlives a relaunch (V21). Plan's "Mac stays positional" for F59 is out
  of date: since v1.46.0 recent order ships on every desktop platform.
- **S3.1 Split View (F53), candidate macos-4a72fe8259c85d77 (2026-11-05):** the fork's split
  was already most of the way there, so this is shipping's `split-view` steps
  loaded with adapters, plus three product changes. The tab menu has shipping's
  Split with list (localized, grouped, and open to pinned tabs) in place of one
  English row per tab. The ⌘L panel draws a split as one row, because tab
  records now carry `splitId`. The overlay sits above the split divider, which
  was covering the panel's middle and taking its clicks. The snapshot gains
  `viewBounds`, the page's real rectangle, and the host a `quietTab` call.
  22 of 32 cases pass. Five fail: Keep as split (two) and split pane to Glance
  (two) wait for floating Glance, and F53's floating-Island case can't read a
  float view yet. Five are undefined: Space round trip (Spaces), a corner tab
  after navigating to Mahjong, two pinned-split relaunch reads (no session.json
  to read) and raising a pane above the Island. Windows and Linux not run.
  island-and-commands 63 / 3 (F1-13 failed again, F1-33, F1-39),
  tabs-and-groups 32 / 1 (F3-3), vertical-tabs 0 / 7 as before.
- **S3.2 floating Glance (F34), candidate macos-29b321d4c0aa5f9d (2026-11-05), in progress:**
  Glance stays Chromium's two-tab split underneath, so focus and page commands
  still follow the focused page, with a new layout: the main page fills the
  pane and the reference sits in the card. The card's chrome is
  `index.html?surface=glance`, a host frame above both pages with a clip-path
  hole for the page, because the Island is above page views here (in shipping
  the chrome view is below). Its frame logic is shipping's glance-card.js
  (generated) and the controller's rules in host.js; `blanc.glance.frame` keeps
  the size and place. Chromium's split needs its tabs adjacent and alike, so
  the reference moves next to the main page while a Glance is open and goes
  back when it ends; the ⌘L list shows that order meanwhile. ⌘⇧G is Chromium's
  Find Previous command, redirected (patch 0031); the Edit menu still says Find
  Previous and View has no Glance item. The tab menu has Open in Glance.
  A split pane's tab menu opens it in Glance. Open Link in Glance has a host
  path but no context menu item yet. On macos-1935c1d14bb29c5b: 24 of 69 cases pass (from 2), 14
  fail, 31 undefined. Open failures: the picker's wait for a quiet tab (four),
  card focus after the picker, links from the Glance page (two, not yet
  landing in the card), Keep as split's announcement, and harness gaps. A
  closing Glance's reference goes back to its place. split-view 24 of 32;
  island-and-commands 64 / 2 (F1-13, F1-39) and tabs-and-groups 32 / 1 (F3-3)
  ran one candidate earlier, with no new failures.
- **S3.3 Glance finished for now, candidate macos-87bb16d760497fc1 (2026-11-05):** links from
  the Glance page land in the card; a quiet tab loads before the card opens and
  a dismissal cancels it; cancelling the Change picker returns focus to its
  control; a split pane's menu and the page context menu's Open Link in Glance
  (patch 0032, which pins render_view_context_menu.cc) work. The menu item uses
  an id outside Chromium's command header, to avoid a large rebuild, and no
  test clicks it. Closing the main page's group now keeps a Glance tab that only
  joined to sit beside it; one a person grouped closes with it. The page area
  stays fixed under a pushed Auto-hide. 38 of 69 cases pass, 4 fail, 27
  undefined. The four: moving a tab to a new window (the fork has no
  moveTabToNewWindow call), the Change picker's restore probe, focus in a
  background tab (Chromium can't), and the pushed-Island frames. Most undefined
  cases need adapters: 1Password, media, mouse gestures, Find on the card and
  the strip's chip cases. V22 (card chrome above the page) is approved
  (owner, 2026-11-05). split-view 24 / 2 (F53-18's group note isn't announced, F53-22),
  island-and-commands 64 / 2 (F1-13 failed again, F1-39), tabs-and-groups
  32 / 1 (F3-3). Real clicks in the card page were not exercised: the tests
  move focus through the host, because CDP input skips Chromium's views.
- **Spaces direction (owner, 2026-11-06):** set-aside Spaces keep their pages
  live, as shipping's do, not reloaded on return. Chromium has no equivalent.
  The fork had only a preview store and crash-safe swap, with no mark, menu,
  set-aside Spaces, undo or moves, so F41 is a real build, in slices: mark,
  menu, save and switch; set-aside Spaces; Move to Space; multi-tab selection.
- **S3.4 Spaces slice 1 (F41), candidate macos-94134c211b905005 (2026-11-06):** the Island's
  space mark and shipping's Spaces menu now work over the fork's crash-safe
  store: save, create, switch, edit, reorder, delete, undo and forget.
  Tabs stay in `BlancPrototypeSpaces.json` under each Space's id; names, colors
  and order are `blanc.spaces.meta`, a profile pref (patch 0030). A window in no
  Space parks its tabs under `__scratch__` on the way to a saved one. A switch
  still rebuilds the tabs, so pages reload until set-aside Spaces land: slice 2.
  A spike proved that part: a tab held by `DetachTabAtForInsertion` kept its
  page, form state and sessionStorage with no reload, came back live, and Blanc
  quit cleanly while holding one. A held page counts as hidden, so its timers
  throttle as a background tab's do. Groups and splits weren't in the spike.
  A probe of save, create and switch both ways kept the right tabs. 2 of the
  feature file's cases pass, 42 fail, the rest are undefined; most failures are
  test gaps (`page.waitForSelector`, cucumber Before hooks, the selection and
  move steps), not yet sorted from product gaps. Keyboard, motion and the
  guards around sign-in pages and loading frames are unverified.
  island-and-commands 64 / 2; see the S3.3 note for its known failures.
- **S3.5 set-aside Spaces, candidate macos-6756e7fb9c9633d1 (2026-11-06):** leaving a saved Space
  now detaches its tabs into the window's `held_spaces`, in saved order, and
  returning reinserts them: no reload, form text and sessionStorage kept, with
  groups and splits rebuilt from the saved record (a probe with one of each).
  Up to six Spaces stay held per window; the oldest then opens from its record.
  A tab that navigated while held no longer matches its record, so that one
  rebuilds. A window's held Spaces end with the window and with quitting, and
  reopen from their records. Not built: shipping's room plan, which quiets
  set-aside tabs over a budget, so held pages stay loaded; a held page can't be
  quieted yet. Tabs of a window in no Space still close on a switch. Also fixed:
  saving could fail before the strip loaded its colors; every window's list now
  stays current; Undo rebinds the window. 10 of 84 cases pass, 10 fail, 64
  undefined. Moves and multi-tab selection (about 40 of those) aren't built.
  split-view 24 / 2, island-and-commands 64 / 2, tabs-and-groups 32 / 1, the
  same known failures as S3.3.
- **S3.6 Spaces' room budget, candidate macos-b58823f2ae9957ff (2026-11-06):** shipping's limits
  now hold across a profile's windows: at most six Spaces set aside, two with
  loaded tabs, 16 loaded tabs. Each is checked for unsaved work first, and
  anything with it, pinned, playing, capturing or in an opener family stays.
  Quiet Tabs off leaves loaded tabs alone. A quieted held tab differs from
  shipping's: desktop Chromium discards by swapping contents inside the tab
  strip (`kWebContentsDiscard` is off), so it is released and opens again from
  the record, which loses its back and forward history. Two real bugs fixed: a
  tab held soon after it opened crashed in a delayed metrics task (patch 0033),
  and opening a tab right after a switch left it pending for good, failing every
  later Space action. Other delayed Chromium tasks could assume a window the
  same way; only that one has shown up. 12 of 84 cases pass, 10 fail, 62
  undefined. split-view 24 / 2, island-and-commands 64 / 2, tabs-and-groups
  32 / 1, the same known failures.
- **S3.7 Spaces sign-in guard, candidate macos-fe6c9becc12242de (2026-11-06):** a
  switch is refused while a page has a live pop-up, a live opener, capture, or a
  main document still loading, naming the pages (F41-13, F41-14). A closed
  opener, a frame that keeps reloading and a tab opened in the background don't
  block (F41-80, F41-81, F41-82). Saving no longer refuses a page with a
  `beforeunload` handler: set-aside pages stay live, and `HeldTabCanQuiet` never
  releases one. Two crashes fixed: `TabStripModelChange::GetInsert()` aborts on
  a change that isn't an insert, which the guard's first version hit on every
  tab close and the older search-tab capture could also hit. The Spaces menu now
  sits under the mark; it had been at the window's top left with the wrong click
  region. The test shim gained `context().pages()`, `$`, `$$eval`, `close`
  waits and held keys on mouse clicks, so modifier clicks are tested for the
  first time. 22 of 84 cases pass, 5 fail, 57 undefined. Other features were
  not rerun on this candidate. The five failures are F41-5, F41-6, F41-7, F41-9
  and F41-11; F41-9 is a real gap, because `newWindow` isn't built and the
  decision dialog's New Window button only asks again.
- **S3.8 Spaces fixes, and a crash in set-aside Spaces, candidate macos-8597d2d3b8936eee (2026-11-06):**
  F41-5, F41-7, F41-9 and F41-11 pass in targeted runs. A Space left with only
  private tabs saves a Start Page, so closed pages can't come back. Private
  pages ask in any Space and close on a switch. Opening a Space in a new window
  works, a Space showing elsewhere is focused, and deleting a set-aside Space
  moves its live pages to a window. **Open defect, on `chromium/migration` since
  S3.5:** a set-aside page's `history.pushState` crashes the browser
  (`LensOverlayEntryPointController::From` with a null window; F41-6 reaches
  it). It is the same family as patch 0033: tab features assume a tab has a
  window, and `tab_interface.h` makes that a rule, so a held `TabModel` has no
  safe state. An adversarial review also confirmed, by reading, that
  `window.print()` or a client certificate crashes through the null modal
  delegate, that returning destroys a held page whose URL changed, that closing
  a window destroys its held pages, that the room budget destroys a page with a
  `beforeunload` handler, that `IsBeingCaptured()` misses a live camera or
  screen share, and that a decision has no fingerprint or expiry. Fixed in S3.9.
- **S3.9 Set-aside pages get a window, candidate macos-1dd80a8fa99b18c2 (2026-11-06):** the
  owner approved a hidden window (2026-11-06). Chromium requires every tab to
  have a window, so a Space's pages now live as ordinary background tabs in one
  never-shown popup Browser per profile (`SpaceHold`), moved by WebContents
  because a tab's window type may never change. A blank anchor stays active,
  which keeps held pages hidden and inactive. Patch 0034 adds 19 hunks in 9
  files and patch 0033 is gone. **Owner decisions (2026-11-06):** held pages
  stay until Blanc quits, even with no ordinary window open (macOS; Windows and
  Linux need their own rule, because the hunk that hides the hold from
  last-window checks would start shutdown there while the hold keeps the process
  alive). A held page's permission requests are refused, cancelled rather than
  denied, because a denial would be saved for the site. Also fixed: `window.print()`
  returns (a modal lock), client certificates and external protocols are refused,
  a page keeps a URL it changed while held, closing a window no longer loses
  held pages, a quieted held page keeps its history (native discard, which
  retires S3.6's note), the guard sees real camera, microphone and screen
  capture (`TabIsCapturing`), a decision has a fingerprint and 60 s expiry,
  a refused switch clears its journal, the commit no longer waits on tabs, the
  room budget rechecks after its probe, skips quieted pages so the six-Space cap
  holds, and does nothing offline, a delete unbinds every window and Undo retries,
  and an extension moving a held tab by id leaves it an ordinary page.
  **Evidence (2026-11-07, macos-1dd80a8fa99b18c2):** 26 of 84 Spaces cases pass,
  1 fails, 57 undefined (s3c-spaces); tabs-and-groups 33 / 1 (F3-3), split-view
  25 / 2 (F53-18, F53-22), glance 38 / 4 (the known four), island-and-commands
  69 / 2 (F1-13, F1-39), the same failures as on macos-16d66064b5a930dc. Both
  spikes passed: 16 tabs round trip, pushState, print, `tel:`, no ordinary
  window then back with the page live, and a clean quit with a `beforeunload`
  page held. F41-26 passes in light mode (it failed the night before only
  because macOS had switched to Dark). The one Spaces failure, F41-6, stops at
  `pinned`, because Chromium keeps pinned tabs out of groups. **Fixed
  (2026-11-07, candidate macos-958f4f03569501f7):** the room budget's eviction
  path (`ForgetWithFreshRecord`/`HeldSpaceUnchanged`) now re-reads the Space's
  saved record, replaces each tab's URL with what its held page actually
  shows, and writes that back before `Forget()` destroys the pages — a page
  that navigated while held is found at its real address next time, not the
  one it had when first set aside. The re-check after every async hop (the
  existing discipline this function already had around the dirty-probe) now
  covers the disk read and write too, so nothing is destroyed on stale state.
  A record whose shape doesn't match the held pages 1:1 is left as last saved
  rather than guessed at. Verified directly: held a real page, navigated it
  while held, forced eviction (7 Spaces past the 6-Space cap), and read the
  saved record back — it showed the navigated address. The full F41 suite
  stayed at 52 of 53 runnable cases, no new failures. **Still open:** Undo
  after a reveal flattens groups and splits. A notification click for a held
  page does nothing (deeper than it looks: Chromium's persistent and non-
  persistent notification-click paths differ, and neither currently reveals a
  held page's window). Space records carry no sandbox stamp (the fork hasn't
  ported inherited-document-policy tracking at all yet, not a small gap in an
  otherwise-built system). Not run: the Dock, Window menu and reopen paths
  with only the hold open, which were read, not exercised.
- **F31 Quiet Tabs, two real upstream blockers found (2026-11-07, owner
  decision needed):** the fork's native quiet/discard machinery is mostly
  already built (`QuietAllowed`, `DirtyProbe`, `DiscardPage`, the `quietDelay`
  setting, `/sleep`, the batch "Quiet Tabs" action, the panel/rail's `.quiet`
  dimming), built as shared groundwork for Spaces and tab-selection. Wiring
  shipping's `quiet-tabs.feature` into the test harness (step file now loaded;
  `tests/adapters/tabs.mjs`'s quiet dispatch now releases DevTools connections
  first, since the pinned Chromium discard policy protects a page with
  DevTools attached — committed, `db7ea5d9`) surfaced two defects in
  **upstream Chromium itself**, not the fork's own code, that block F31-8 and
  F31-9 specifically:
  - **F31-8 (a private tab wakes in the private session):** `TabLifecycleUnit::
    FinishDiscard` (`upstream/chrome/browser/resource_coordinator/
    tab_lifecycle_unit.cc:270`) creates the replacement WebContents a
    discarded tab wakes into using `tab_strip_model_->profile()` — the
    *window's* profile, not the discarded tab's own. Shipping's in-window
    private-tabs model (D1) puts a private, off-the-record WebContents inside
    an ordinary window's TabStripModel, so a private tab that gets discarded
    and later wakes would be recreated in the **wrong BrowserContext**. No
    existing patch touches this; patch 0017 only adds inherited-sandbox flags
    to the same call. Relaxing `QuietAllowed`'s private-tab checks to route
    around this would be masking the defect, not fixing it.
  - **F31-9 (page state never escapes persistence):** Chromium's session
    serialization (`upstream/components/sessions/content/
    content_serialized_navigation_builder.cc:40`, used by
    `SessionServiceBase::BuildCommandsForTab`) copies a committed entry's full
    `PageState` — which can hold form data and other page state — into
    `session.json`'s SNSS commands by default. `EXCLUDE_PAGE_STATE` is only
    requested for one narrow pending-navigation fallback, not for ordinary
    committed history, which is exactly what a quiet tab keeps. F31-9 requires
    that state to stay in memory only. This needs a real persistence-policy
    decision, not a test seam: the fix must cover incremental saves, session
    rebuilds, Recently closed and any future sync serialization, while not
    silently breaking the **crash-restore work this session just shipped**
    (S3.10), which relies on committed PageState surviving normal persistence
    for scroll/form recovery on an ordinary crash. Scoping an exclusion to
    quiet-tab-sourced entries only, without touching crash-restore's own
    recovery, is the open design question.

  Per standing instruction, flagging both to the owner rather than patching
  upstream Chromium unilaterally. The other 8 of 10 desktop F31 scenarios
  (F31-1 through -7, F31-10) are **not** blocked by either finding and can
  keep moving — each still needs its own test fixtures/adapters (the exact
  per-scenario remaining work is itemized in
  `chromium/CODEX-NOTES-quiet-tabs.md`'s table). Full findings, evidence and
  the harness fix: `chromium/CODEX-NOTES-quiet-tabs.md`, branch
  `chromium/s3-quiet-tabs` (`db7ea5d9`, pushed, no PR yet).
- **F31 Quiet Tabs continuation, 8 scenarios built and run against a compiled
  candidate for the first time; two more real findings, owner decision needed
  (2026-11-07):** the 8 unblocked scenarios' adapters are built on real
  Chromium primitives (`BrowserLiveTabContext::AddRestoredTab` for lazy
  restore, `TabLifecycleUnitExternal`, `DiscardEligibilityPolicy`, the
  production `AutoTick`/`AutoNext` sweep) — nothing synthetic. Reviewed line
  by line against the actual Chromium headers, applied, committed
  (`df3d0a80`). This was also the first time any F31 scenario ran against a
  real compiled candidate rather than mocked adapters; the run surfaced 3
  failures. One was a genuine, scoped gap: **non-refetchable POST protection
  had never been ported to the fork at all** (zero native references to
  `GetHasPostData` anywhere in `blanc/`), despite shipping Electron having it.
  Fixed directly in `QuietAllowed` (checks the last committed entry's
  `GetHasPostData()`, same pattern as the other eligibility checks),
  candidate `macos-53fb0155deee71ea`; the scenario now passes. The other two
  are real, not adapter bugs, and need an owner decision:
  - **F31-1's dropped-oversized-state assertion:** `quiet-tabs.steps.js:300`
    (`assert.equal(state?.droppedPageState, true)`) encodes Electron
    shipping's limitation that an oversized page's state is dropped on
    discard. Real Chromium discard keeps full navigation/page state
    regardless of size — verified directly: a 600 KB `pushState` payload
    survives quiet→wake intact. This looks like a genuine, probably-better
    behavioral difference between the fork and shipping, not a fork defect,
    but changing the assertion is a product call, not mine to make
    unilaterally: register it as a new divergence and update this one
    scenario's expectation, or decide otherwise. Evidence:
    `spec/acceptance/quiet-tabs.feature:8`.
  - **F31-10's renderer-process-count assertion:** after a confirmed-real
    discard (`asleep: true`, lifecycle state `DISCARDED` via the production
    `TabLifecycleUnitExternal::DiscardTab` → `FinishDiscard` swap-WebContents
    path — not a flag-only fake), the discarded tab's OS renderer process
    does not exit within 30 seconds. Confirmed via a direct `ps` STAT read
    during the wait: the process is reported `S` (sleeping/running), never
    `Z` (zombie), ruling out the one documented false-alive hazard from the
    memory-benchmark work. Root cause is unresolved, with two live
    hypotheses, neither confirmed: Chromium's renderer-process-reuse pool
    keeps that OS PID alive for something unrelated to this tab (making
    PID-based observation the wrong test, not a real resource leak), or the
    fork's own post-discard tab lookup isn't correctly resolving to the
    swapped-in replacement WebContents. Needs real investigation before
    deciding whether the fix belongs in the test's observation method or in
    native code — flagging rather than guessing. Evidence:
    `spec/acceptance/quiet-tabs.feature:118`.

  Full accounting, adapter-by-adapter notes and this round's evidence:
  `chromium/CODEX-NOTES-quiet-tabs.md`, branch
  `chromium/s3-quiet-tabs-codex2` (merged into `chromium/s3-quiet-tabs`).
- **F46 Custom Tab Names, all 10 desktop scenarios now pass, candidate
  macos-40a41ac818ea4e2f (2026-11-07):** found while sweeping for the next
  quick win after F31 — the feature was already fully built natively
  (`RenameTab`, `CustomTabName`, `RestoreCustomTabName`, wired into
  `Snapshot()` and session persistence) with 10 acceptance scenarios already
  written, 7 already passing; only the test harness had gaps, no fork
  defects. Closed all of them:
  - **The `isLoading` presentation seed** (F46-10, "a renamed tab keeps its
    name in the command panel while it loads"): `setTabPresentation` now
    drives a real, slow navigation to the tab's own address via shipping's
    own `?hold=slow` fixture mechanism (2.5s before the body arrives), so
    the tab genuinely starts loading rather than faking the flag. Built and
    verified directly.
  - **A real `sessionWindows` native test op** (F46-5 "a name survives
    relaunch", F46-6 "a private tab's name never reaches session.json"):
    `persistedSessionData()` previously threw, undefined, with no way to
    read back what the fork actually persists (it uses Chromium's native
    session restore, not a session.json file). Built on
    `SessionService::MoveCurrentSessionToLastSession()` +
    `GetLastSession()` — the exact production path Chrome's own session
    restore uses — projected to `{windows:[{tabs:[{customTitle,url}]}]}`.
    `customTitle` reads each persisted `SessionTab`'s
    `extra_data["blanc.tab.name.v1"]`, the same key `RenameTab` already
    writes via `AddTabExtraData`. Confirmed in passing: a private tab's
    name was already correctly excluded natively (`RenameTab` skips the
    write for an off-the-record profile) — this only added the ability to
    verify that rather than assume it. Reviewed against the real Chromium
    headers (`session_service.h`, `session_service_base.h`,
    `session_types.h`) line by line before building; nothing fabricated.
  All 10 `@F46` scenarios in `spec/acceptance/tabs-and-groups.feature` pass
  on this candidate. Branches `chromium/f46-session-codex` (merged) and the
  harness-only `isLoading` commit, both on `chromium/s3-quiet-tabs`.
- **F35-11 Patron callout snooze and F35-19 Launch Sunrise, both pass,
  candidate macos-dea5366ef70d77b9 (2026-11-07):** the next two gaps found
  sweeping `newtab-layouts.feature` — both genuinely not started (zero
  native references), unlike F31/F46's "mostly built, needs wiring"
  pattern, and both needed a new native pref. Registering a pref means
  extending the upstream `browser_prefs.cc` patch
  (`RegisterLocalState`), which is a real patch-budget question — flagged
  to the owner first rather than decided unilaterally; approved. New patch
  `0035-blanc-start-prefs.patch` adds `blanc.start.patron_callout_dismissed_at`
  (Int64Pref) and `blanc.start.launch_sunrise` (BooleanPref), both
  device-local `local_state()`, alongside the existing `blanc.whats_new`
  etc. in the same function. Both features then ported faithfully from
  shipping Electron:
  - **Patron callout**: the pill's markup and JS show/hide logic were
    already built in the fork; only the native `patronCallout`/
    `patronCalloutDismiss` handlers (porting the exact 90-day,
    corrupt-future-time rules from `src/main/patron-callout.js`) and one
    missing bridge method were needed.
  - **Launch Sunrise**: the scene markup, CSS animation and
    `playLaunchSunrise()` are ported verbatim from shipping's
    `newtab.html`/`pages.css`/`newtab.js`. Native state is a process-wide,
    `NoDestructor`-held 30-second launch window with a once-per-WebContents
    guard, porting `src/main/launch-sunrise.js`'s `take()`/`rearm()` logic
    exactly.
  First build caught a real `-Wshadow` error (a redundant local variable);
  fixed directly. First acceptance run then found the Patron scenario
  failing with `patronVisible` always `false` despite the native/JS state
  being correct — spiked the live candidate's DOM directly and found
  `newtab-prototype.css`'s blanket "not implemented by the Chromium
  prototype" rule (`#patronCallout { display: none !important }`,
  predating this feature) was overriding the real show/hide logic
  entirely. Dropped `#patronCallout` from that list; both scenarios pass
  on the rebuilt candidate, no regressions. Branch
  `chromium/f35-start-settings-codex` (merged into `chromium/s3-quiet-tabs`).
- **F35-5/F35-6 Billboard ranking (pinning, hidden-locally, outlasts
  history), candidate macos-7a7adbe83d0dc7b0 (2026-11-07):** `seedBillboardHistory`
  built (`seedBillboardOverflowHistory` stays blocked — see below). Codex's
  own attempt stopped at research, correctly finding `history::TopSites`
  caps `GetMostVisitedURLs` at `kTopSitesNumber` (10) and the native
  `topSites` WebUI message takes no `{offset,limit}` the ported
  `newtab.js` already expects; it never touched the adapters. Built
  directly instead, since the 6-site case is within that 10-site cap.
  Three issues surfaced only by building and running it for real, none
  caught by research alone:
  - `HistoryService::AddPage(url, time, VisitSource)` (the
    `chrome.history.addUrl()` overload the original brief specified)
    defaults to `PAGE_TRANSITION_LINK`, which
    `HistoryBackend::CalculateSegmentID` never credits toward a "most
    visited" segment — seeding with it would have left TopSites
    permanently empty. Switched to the 10-arg overload with an explicit
    `ui::PAGE_TRANSITION_TYPED`.
  - `TopSitesImpl::SetTopSites` always pads real history shorter than 10
    sites with Chromium's own prepopulated pages (desktop: the Chrome Web
    Store) — a real, independent **production bug**: `NewTabHandler::
    TopSitesReady` never filtered it, so any real user with fewer than 10
    browsed sites would see a Chrome Web Store tile on a browser that ships
    no extension store. Fixed by excluding every
    `TopSites::GetPrepopulatedPages()` URL from the reply.
  - The acceptance fixture launches every case against its own local
    `http://127.0.0.1:<port>/initial` control page as a genuine
    command-line-URL navigation, so it is real, segment-crediting history
    in every fresh profile before the op ever runs — found by spiking the
    live candidate directly (`debugProfiles`, `listHistory`, repeated
    `start.data()` reads) after the first build showed it leaking into the
    rendered Billboard. `GetMostVisitedURLs` alone answers from a fresh
    profile's empty initial-load cache and misses it entirely even after a
    5s delay; needs an explicit `SyncWithHistory()` first. Fixed by
    detecting any IP-literal host in the synced read-back, deleting it via
    `HistoryService::DeleteURLs`, and retrying the sync+poll until a fresh
    read confirms it's actually gone — not just filtered from this op's own
    reply, which would have left it for the next real `topSites` caller.
  - `newtab-layouts.steps.js` (pinned, not touched) also asserts exact
    titles for two of the six seeded sites (`'YouTube – videos worth
    watching'`, `'CNET – technology news and reviews'`) and that cnet.com's
    last-visited URL matches `^https://cnet\.com/article/`, plus
    `hasIcon: true` on all six. Added `HistoryService::SetPageTitle` per
    seed and a real `FaviconService::MergeFavicon` (a 16×16 PNG-encoded
    `SkBitmap`) per seed; cnet.com's path changed from the bare domain to
    `/article/1`.
  F35-5/F35-6's three Billboard scenarios in `newtab-layouts.feature` (47,
  58, 71) now pass; the file's other 4 failures (3 Mahjong, 1 checklist)
  and 2 undefined (typography roles, the F35-15 overflow scenario below)
  are unrelated, unchanged by this work. Unit tests 257/258 (the one
  failure is the pre-existing `ui-language.test.mjs` Node-version issue,
  unrelated). Branch `chromium/f35-billboard-history-codex` (merged into
  `chromium/s3-quiet-tabs`).
- **F35-15 Billboard overflow: scoped out (owner decision, 2026-11-07).**
  `seedBillboardOverflowHistory` (the scenario "Billboard continues past its
  initial candidate page", 60 seeded sites, 48 hidden, backfill to rank 49)
  cannot be built by seeding alone: `history::TopSitesImpl::
  GetMostVisitedURLs` unconditionally truncates to `kTopSitesNumber` (10;
  `top_sites_constants.h`, `top_sites_impl.cc`), and the native `topSites`
  WebUI message takes no arguments at all, while the ported `newtab.js`
  (`fillBillboardSites`) already calls `window.bowserPages.start.topSites(
  {offset, limit})` expecting page-2+ support the native handler has never
  implemented (shipping Electron's own Billboard has no such cap — it's
  backed by JS history, not Chromium's real TopSites). Flagged three paths —
  patch `kTopSitesNumber`, add a parallel non-TopSites query path for ranks
  beyond 10, or scope this one scenario out — per standing direction to
  raise native Chromium option changes rather than decide alone; the owner
  chose to scope it out. `seedBillboardOverflowHistory` keeps throwing
  `UndefinedNativeAdapterError` citing the real cap (`pages.mjs`), which is
  the fork harness's only backlog mechanism — it has no RUNNABLE/backlog tag
  system like shipping's `test/desktop/cucumber.mjs`, so the scenario simply
  reports `undefined` until this is revisited. No further action unless the
  owner asks for it again. Full writeup in
  `chromium/CODEX-NOTES-billboard-history.md`.
- **F9-3 Favorites rows show a saved icon, candidate macos-c9349c0989f548b8
  (2026-11-07):** `adapters/pages.mjs`'s `seedFavorite` carried its own
  comment flagging the gap directly ("A seeded icon has no fork path"): the
  seeded favorite's page never really loads in the offline fixture (every
  proxied request is refused — `fixture.mjs`'s `this.proxy` destroys every
  connection it sees), so it never earns a real favicon the way a real visit
  does. Same shape as F35-5/F35-6 just above: added a `seedFavicon` native
  test op (`FaviconService::MergeFavicon`, the same 16×16 PNG-encoded
  `SkBitmap` pattern) and one call to it from `seedFavorite`, right after
  bookmarking. `bookmarks::BookmarkModel::GetFavicon` reads from the same
  favicon database, so no further wiring was needed. Passed clean on the
  first build (7/7 in `find-favorites-history.feature`), but
  `FaviconServiceImpl::MergeFavicon` just forwards to
  `HistoryService::MergeFavicon`, which (like `AddPage`/`DeleteURLs`) only
  posts to the backend sequence — found by spiking the op standalone
  (seed, then poll the sheet's own row-icon query directly) outside the
  Cucumber harness's extra per-step latency, where it never showed an image
  even after 24s of polling; added the same `FlushForTest`-before-reply
  fix as Billboard's seeding, closing a real race that happened not to
  flake in-harness but would have eventually. Regression-checked
  `newtab-layouts.feature` (still 19/4/2 — unchanged) and `vertical-tabs.
  feature` (0/7/19 — unrelated: that feature is broadly unbuilt, no
  favicon-adjacent failures). Branch: committed directly on
  `chromium/s3-quiet-tabs`.
- **F32-1 fixed; F32-2 blocked on a real test-harness design gap, flagged
  to the owner, candidate macos-75cb3812b7ecf53d (2026-11-07):**
  `multi-window.feature` ran 0/2 before this (both already-wired, both
  failing real assertions — a genuine bug, unlike F31/F46/F9-3's
  stub-adapter shape). `sessionWindows`'s `TestSessionWindowsRead` never
  set a per-window `id` or a flat `urls` list (`blanc_prototype_ui.cc`,
  F46-built, never exercised multi-window): every assertion comparing a
  persisted-session entry's `id` against a live `windowRuntimes()` id, or
  reading `entry.urls`, could never pass, no matter what the real session
  content was.
  - **F32-1** ("a secondary window owns and discards its own workspace")
    needed two things: each entry's `id` set to its still-open window's
    Island host DevTools target id (`Owner::Live()`, matched by
    `BrowserWindowInterface::GetSessionID() == SessionWindow::window_id`,
    the same `DevToolsAgentHost::GetOrCreateFor(...)->GetId()` pattern
    `tabTargets` already uses for tabs), and the *first* window (lowest
    `window_id` — `SessionID` is one monotonic counter shared by windows,
    tabs and everything else that takes one, but whichever window was
    created first still holds the lowest id of any window) labeled the
    literal string `"primary"`, matching `windowRuntimes()`'s own
    convention. Added `urls` (a flat array) alongside the existing `tabs`
    non-destructively, so F46's own consumer of `sessionWindows` is
    unaffected. Now passes.
  - **F32-2** ("independent window workspaces restore separately") stays
    blocked on something no native fix can close: it captures
    `openNewWindow()`'s return value (a DevTools target id) *before* a
    relaunch, then compares a *post*-relaunch window's `id` against that
    same stale value — but a relaunch destroys and recreates every
    WebContents, so no window can ever have that id again, by
    construction. `openNewWindow()`/`windowRuntimes()`'s id scheme is
    itself the fork's own test-adapter code (`chromium/tests/adapters/
    tabs.mjs`, `world.mjs` — not shipping's pinned step files), so it's
    editable, but it's used by ~15 other step files across glance,
    mini-window, link-routing, local-profiles, named-workspaces,
    move-to-space, spaces-redesign, workspace-recovery and more — none of
    which cross a relaunch the way F32-2 does. Making window identity
    survive a relaunch (e.g. an ordinal id by restore order instead of a
    raw DevTools target id) is a real redesign of shared test
    infrastructure, not a wiring fix, and risks regressing scenarios this
    session hasn't audited. Flagged rather than decided unilaterally.
  Regression-checked `tabs-and-groups.feature` (36/1/554 — the one
  failure, "Collapsing a group tucks its tabs away in the panel", is
  unrelated and pre-existing). Branch: committed directly on
  `chromium/s3-quiet-tabs`.
- **F32-2 fixed (owner decision, 2026-11-08): window ids now an ordinal by
  SessionID order, candidate macos-cf277bb10ec10b0b.** Owner chose to
  redesign rather than leave F32-2 blocked. Audited every caller of
  `openNewWindow`/`windowRuntimes`/`closeWindowRuntime` first (15 step
  files) before touching the shared scheme: no scenario ever holds a
  captured window id past a point where a different, lower-ordinal window
  closes, and `closeWindowRuntime` is never called on a non-last-opened
  window while an earlier one stays open — so a *dynamic* ordinal
  (recomputed fresh each query by sorting live windows by ascending
  SessionID) is safe; no new persistent native state needed.
  - **Native**: a new `windowOrdinals` test op lists every open window's
    Island host DevTools target id, sorted by ascending `SessionID`.
    `sessionWindows`'s `TestSessionWindowsRead` (F32-1, above) dropped its
    live-window DevToolsAgentHost lookup entirely — it now labels each
    persisted entry purely by its `window_id`'s position among the
    *other persisted windows in that same read*, index 0 `"primary"`,
    others `"window-N"`. The two ops use the same rule (ascending
    SessionID order) independently, so they agree without either
    depending on the other.
  - **Test adapter** (`chromium/tests/adapters/tabs.mjs`, not shipping's
    pinned step files): `runtimes()` now maps each CDP target to its
    `windowOrdinals` position for the reported `id`, instead of the raw
    target id; the CDP connection to actually drive a window is still
    matched by its real target id, independent of that label.
    `openNewWindow()` needed no change — it already just returns
    whatever `runtimes()` assigns.
  - Verified: `multi-window.feature` 2/2 (both F32-1 and F32-2, fresh
    full-file run). `local-profiles.feature`'s own relaunch scenario
    (flagged in the pre-redesign audit as sharing the identical need)
    stays undefined — blocked by an unrelated missing adapter earlier in
    its Given chain, never reaches the part this redesign would help.
    Regression swept six more consumer files: `island-and-commands.feature`
    63/3/525 (exact historical baseline, the three unrelated/pre-existing:
    F1-13/F1-33/F1-39), `glance.feature` 37/5/549, `vertical-tabs.feature`
    0/7/19 (matches this session's own F9-3-round baseline), `F41-named-
    workspaces.feature` 52/2/537, `split-view.feature` 24/6/561 — every
    failure's own message read individually; none mention a window-id
    mismatch, all are pre-existing unrelated gaps (missing adapters,
    split-session-persistence fields never built, focus/accessibility
    timing). `mini-window.feature` and `link-routing.feature` stayed fully
    undefined (unaffected either way). Branch: committed directly on
    `chromium/s3-quiet-tabs`.
- **S3.10 Move to Space, candidate macos-071c3fa883ea19ff (2026-11-07):** the tab
  menu's Move to Space ▸ lists every Space (this window's checked) and New
  Space…, and is shown once a Space exists, never for a private tab, and disabled
  for a window's only tab or a page that can't move (quiet, loading, playing
  sound, capturing, holding a popup, not a web page). Native `spaceMoveTab`
  follows shipping's space-move.js order: the target's record is written first,
  already holding the tab, and checked; only then does the page move, last,
  ungrouped and unpinned. A Space shown in another window takes the tab there
  without selecting it; any other Space is set aside holding the live page (a
  Space open nowhere keeps empty slots for its saved tabs, which load from its
  record when it opens). A failed transfer rewrites the record from what the
  Space holds; if that write fails too, the record keeps the tab, a duplicate,
  never a loss. New Space… writes one record holding the tab, then its list
  entry; a move that fails after that leaves the saved Space with "Saved {name},
  but the tab couldn't move." Test seams: `spaceMoveFault` and `spaceSavedUrls`
  (--blanc-test only). **Evidence:** all 11 of 11 Move to Space cases pass
  (s3ce-*), including the three crash cases (F41-43, 44, 45) once the crash-
  restore work below landed.
- **S3.11 Several tabs (F41-58 to 74), candidate macos-e554011ad2a2b1d2
  (2026-11-07):** selecting several rows (toggle, Shift-click, Shift-arrow) and
  acting on the whole selection through the tab menu — batch pin, mute, quiet,
  move to a Space, move to a new window, New Space…, New Group… — built by
  Codex (gpt-6.1-sol, then gpt-6-astra for the fix pass; the owner's call,
  Astra reserved for work this delicate) from a written brief, under the same
  rule as S3.10: write the target's record first, checked, before any transfer;
  a failed write moves nothing, a failed transfer returns every page whole to
  one place. A multi-reviewer pass (five review dimensions, each finding
  adversarially re-checked, then a completeness critic) found 12 real defects
  before any of this merged, two of them data-loss bugs: a batch move into a
  Space already shown elsewhere could delete that window's active tab even
  when it was a private page with unsaved work, and moving into a Space whose
  held-aside record was a lone Start Page could silently misalign its held
  pages against the record, one position off, corrupting a restored split.
  Codex (gpt-6-astra) fixed all 12, each committed with new regression tests;
  Claude read the fixes for the two highest-risk ones (both above; neither has
  acceptance coverage, since private tabs are outside the Space record) before
  merging. **Evidence:** 251 of 251 unit tests pass; 16 of 19 tab-selection
  scenario rows pass, the other 2 undefined because batch-close (Recently
  closed as one entry) and reading the persisted session aren't built. Spaces
  as a whole: 52 of 53 runnable cases pass (s3ci-spaces-full), the one failure
  still the known F41-6. **Not built:** batch close/restore as one entry; the
  Space-move write path's own test seam doesn't yet cover several tabs beyond
  what the scenarios above exercise. Open Link in Space (F41-51 to 57) is also
  not built. Move Group to Space (F41-75 to 79) is covered below (S3.12).
- **S3.12 Move Group to Space (F41-75 to 79), candidate macos-b231d006b8f5d70e
  (2026-11-08):** the tab group's menu gains **Move Group to Space ▸**,
  continuing S3.10/S3.11's write-first machinery (built by Codex, gpt-6.1-sol,
  from a written brief in a separate worktree; the owner's standing call to
  delegate well-scoped native work and have Claude build/review/test/merge it).
  Native `spaceMoveGroup(groupId, spaceId, create)` resolves the group's
  members in strip order and dispatches into the existing `spaceMoveTabs`
  write-first engine with a 4th, optional source-group argument; `SpaceGroupRows`
  binds the move to the group's exact live membership and visuals across the
  disk write (refusing if `BatchPages`' split expansion would carry along a
  tab that isn't a member), and `SpaceRecordWithRows` now merges the arriving
  rows into an existing same-name destination group (case-insensitive; its own
  members keep leading the arrivals) or stamps a fresh group record with the
  source's name and colour — reordering the written record's `tabs`/`splitIds`
  so the group block stays contiguous, as Chromium's own grouping invariant
  requires. `SpaceBatchWritten`'s live transfer places arriving pages into the
  destination's matching group (`MoveGroupTo` ahead of `AddToExistingGroup`,
  or a fresh `AddToNewGroup` with the source's visuals) for a holder window,
  and the equivalent HeldSpace/record bookkeeping for a space set aside
  nowhere; the existing `write`/`transfer`/`transfer-pane`/`rewrite` fault
  seams (`arm-move-fault`) keep meaning exactly what they did before, since no
  second rollback engine was written. `moveGroupToSpaceByName`/
  `beginNewSpaceForGroupByName` (test-only, case-insensitive name resolution)
  and `spaceSavedGroups` (parallel to the existing `spaceSavedUrls`) round out
  the native side; `chromium/tests/adapters/tabs.mjs` gained the matching
  adapters and a `workspaceAction('saved-groups', …)` branch.
  **Not built: F41-78** ("New Space from the group menu takes the group
  along"). The single-tab "New Space…" editor's purpose data is private to
  `blanc/island/host.js`'s `show()` closure, with no production entry point
  for a group's member ids and name; Codex's `beginNewSpaceForGroup` is an
  explicit refusal stub rather than a guess at that wiring, and
  `beginNewSpaceForGroupByName` inherits the same refusal. A future pass needs
  a host bridge that binds the group's exact members, passes its name to the
  editor, and submits through `spaceMoveGroup` with `create=true`.
  Claude found and fixed two gaps Codex's own handoff flagged as unverified:
  a `base::ListValue` chaining bug (`.Append(...).Append(...)` on a named
  lvalue, which only the builder-pattern `&&`-qualified overloads support —
  the call bound to the `void`-returning lvalue overload instead and failed
  to compile), and a harness gap unrelated to Codex's diff: the fork's step
  loader (`chromium/tests/lib/shipping-core.cjs`) had never added
  `group-space.steps.js` to its audited `stepFiles` allowlist, so all five
  scenarios read as "step definition missing" even with the native/adapter
  work correctly built; added it (confirmed byte-identical between the
  working tree and the pinned shipping reference commit before adding it).
  **Evidence:** F41-75, F41-76, F41-77 and F41-79 pass for real on the native
  candidate (verified individually by exact scenario line, including F41-76's
  non-trivial "existing members keep leading the arrivals" ordering and
  F41-79's real group-menu DOM, which needed no front-end change — the shared
  Island assets already show/hide "Move Group to Space" correctly once the
  underlying Spaces data is right). F41-78 fails exactly as predicted
  (`false !== true` on the refusal stub), not from any other cause. A full
  `F41-named-workspaces.feature` sweep: 57 of 59 decided cases pass (up from
  52 of 54 before this work), the only failures F41-78 above and the long-
  pre-existing F41-6 (Quiet Tabs/workspace-ownership interaction, unrelated,
  unchanged). `tabs-and-groups.feature` matches its exact known baseline
  (36/1, the one failure the pre-existing panel-collapse gap) and
  `multi-window.feature` stays 2/2. Unit tests 257 of 258 pass (the one
  failure the same pre-existing `ui-language.test.mjs` Node-version gap seen
  all session); `check-patches.py` passes.
- **S3.13 F41-78 finished: New Space from the group menu, candidate
  macos-523df9b441bcbe4e (2026-11-08):** closes the one scenario S3.12 left
  as an explicit refusal stub. Built by Codex (gpt-6.1-sol) from a written
  brief, reviewed and fixed by Claude. Opening the editor is purely client-
  side, mirroring shipping exactly: `chromium/blanc/island/host.js` gained
  `beginNewSpaceForGroup(groupId)`, resolving the group and its member ids
  from the live snapshot and opening the real `#workspaceEditor` with
  `{ newSpaceTabIds, newSpaceGroupId, newSpaceGroupName }` — no native call
  at all, same as the existing single-tab/several-tab New Space entries.
  `createSpaceWithTabs` now reads `overlayPurpose?.newSpaceGroupId` back
  (only in Spaces mode) on submit and threads it as the 4th argument to the
  already-built `spaceMoveTabs`, which has carried a source-group argument
  since S3.12. **No native C++ change was needed beyond removing dead
  code:** Codex's prior production `beginNewSpaceForGroup` stub and its
  test-only dispatch branch were a wrong architectural shape (a server-side
  method that can't open client UI) and are deleted; `moveGroupToSpaceByName`
  keeps its own two-argument path unchanged. `chromium/tests/adapters/
  tabs.mjs`'s `beginNewSpaceForGroupByName` now resolves the group by name
  from a snapshot and calls `w.api('beginNewSpaceForGroup', [groupId])` —
  the real Island document, not a native-direct shortcut, since this task
  is fundamentally about opening real client UI. **Two regressions found and
  fixed before merging, neither in Codex's diff's own logic:** (1)
  `chromium/tests/tab-selection.test.mjs`'s `newSpaceHost` test helper
  evaluates `createSpaceWithTabs`'s source text in an isolated VM context
  via a textual slice of `host.js`, which doesn't carry the module-level
  `overlayMode`/`overlayPurpose` free variables the new code reads — fixed
  by seeding `ctx.overlayMode`/`ctx.overlayPurpose` in that helper, and
  added two direct tests for the new 4th-argument threading (with and
  without a group purpose). (2) `chromium/blanc/island-assets.json`'s
  manifest pins `host.js`'s own hash, which editing it invalidated; updated
  the one entry (never regenerate the whole file — a full JSON re-dump
  reformats all 320 lines) and then re-ran `refresh-source-map.py`, since
  `source-map.json` separately pins `island-assets.json`'s own hash too.
  **Evidence:** F41-78 passes for real on the native candidate, exercising
  the actual editor DOM exactly as the single/several-tab cases do. Full
  `F41-named-workspaces.feature` sweep: 58 of 59 decided cases pass (up
  from 57), the only remaining failure the long-pre-existing F41-6. Unit
  tests 260 of 261 pass (the one failure the same pre-existing
  `ui-language.test.mjs` gap); `check-patches.py` and `assets.mjs --check`
  both pass.
- **Batch close as one Recently-closed entry (F41-60) and Open Link in
  Space (F41-51 to 57): investigated, not built — real design blockers,
  not missed effort (2026-11-08).** Both were batched to Codex alongside
  F41-78 above; for both, Codex traced the actual Chromium/fork source
  rather than guess, found the task rests on a genuine open design question,
  and stopped rather than invent an answer. Full investigation notes:
  `chromium/CODEX-NOTES-f41-remainder.md` (Tasks 2 and 3).
  - **Batch close:** the original assumption — that `TabStripModel::
    CloseTabs`/`CloseSelectedTabs` would close an arbitrary selection as one
    native call and get one restorable entry for free — is wrong.
    `components/sessions/core/tab_restore_types.h` has only TAB, SPLIT,
    GROUP and WINDOW entry types; a selection spanning a split plus an
    unrelated ordinary tab produces a SPLIT entry and a separate TAB entry
    from Chromium's own restore service, not one entry. `CloseSelectedTabs`
    also routes through `ExecuteCloseTabsCommand`'s own group-aware
    teardown, which a direct `CloseTabs` call would bypass. Making an
    arbitrary selection restore as one unit needs a real persistence-format
    decision (what a "selection batch" entry even is) before any native
    code is worth writing — exactly the kind of native/Chromium-shape
    choice this project flags to the owner rather than deciding
    unilaterally, so it stays unbuilt pending that call.
  - **Open Link in Space:** the write-first Space-move machinery (
    `CaptureNativeSpace`, `SpaceHold`/`HeldSpace`, the `SpaceDisk`/
    `previewSpaceSave` write) is reusable and the "visible destination gets
    an awake background tab" case is straightforward. The blocker is
    deeper and not link-specific: the fork's saved-record-opening path
    (around the native lines that give a missing held slot to a new
    window) creates that slot's page as a live, foreground load
    immediately on Space open, before the saved active tab is restored —
    there is no existing mechanism anywhere in the fork for a slot that
    stays genuinely unrequested until the viewer picks it, which F41-52/53
    require. This is a gap in a capability `spec/features.md` already
    describes as shipped ("a Space open nowhere... loads from the record
    when it opens"), not something invented for this feature, so it's
    worth the owner's attention beyond just this scenario set.
- **After a crash, Chromium's Restore pages? bubble (owner, 2026-11-07, candidate
  macos-071c3fa883ea19ff):** shipping doesn't restore silently: it opens one
  window with a "Pick up where you left off?" card (Restore tabs, Start fresh)
  and loads no saved site until you choose. The fork keeps Chromium's own
  ask-first prompt, the Restore pages? bubble, made visible in its window,
  instead of porting the card or restoring automatically. (The owner first
  chose "restore automatically" from a question that wrongly said shipping did
  so; asked again with shipping described correctly, they chose the bubble, and
  separately declined restyling it to look Blanc-branded for now.)
  `IslandView::GetAnchorBoundsInScreen()` anchors the bubble (and every other
  bubble Chromium anchors to the app menu) to the Island's resting band, not its
  full view bounds, which can run the window's full height or grow to 10000px
  while a panel is open; no upstream patch needed. Two `--blanc-test` ops
  (`crashBubble`, `flushExitType`) read its state, press Restore with the exact
  button-press recipe `exit_type_service_browsertest.cc` uses, and land the
  crash exit-type mark on disk before a test's SIGKILL (it's set in memory at
  launch but normally only committed on a ~10s delayed writer). One upstream
  hunk, in the already-patched `session_restore.cc` (patch 0002, which already
  renames this file's one include): a reused (not freshly created) browser
  window during crash restore was never getting `RestoreWindowIdentity`,
  silently breaking its Space/split identity on every future save; both paths
  call it now. `MaybeRollback` also now waits for the crash to be acknowledged
  before touching the Space-switch journal, so a window still showing only the
  crash placeholder can't be mistaken for one with nothing to roll back to.
  **Evidence:** a direct spike (native `crashBubble`/`flushExitType`) confirmed
  the bubble shows, anchored to the window and inside it, with Chromium's own
  title and button text, and that pressing it for real restores both original
  tabs. F41-43, 44 and 45 (the three crash scenarios) now pass through the real
  harness; `tests/world.mjs`'s crash relaunch presses the bubble and waits for
  the restore to be acknowledged before continuing, and waits for the blocker
  only when a restored tab is actually a web page (F41-45's successful move
  leaves the source with nothing but a Start Page, which never starts it). Also
  fixed in the harness: `adapters/tabs.mjs`'s `runtimes()` caches the primary
  window's CDP target id across calls; a relaunch is a new process with new
  target ids throughout, and the stale cache made it reinstall the test driver
  a second time on the live post-relaunch page, resetting its id counter mid-
  process and colliding with ids already on native's record — a pre-existing
  gap in the harness (the plain, non-crash relaunch path never cleared it
  either), only ever exercised once a crash scenario actually got this far.
  **Open:** up to 2.5s of tab changes can be lost in a real crash (Chromium's
  session-save debounce; shipping's is 250ms). No guard against a restore loop
  if a restored page itself crashes. No "Start fresh" option, unlike shipping.
  Whether a restored window keeps its Space and split wasn't traced further
  than the identity fix above. Windows and Linux need their own crash-restore
  verification; this was built and tested on macOS only.
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
- V30 (owner, 2026-11-18): Favorites is bnfy/blanc#1614's page in a tab of
  its own, with the F63 manager, ahead of the fork's v1.49.1 scenario pin.
  `tests/fork-steps/divergences.mjs` replaces the v1.49.1 steps that put it
  in the sheet with what #1614's rewrite of the same scenarios says
  (internal-pages F16-2, F16-5, F16-8, F16-10; find-favorites-history F9-3;
  newtab-layouts F35-5; browser-migration F30-1 and F30-2). A private
  window opens Favorites in a regular window (Chromium's behavior), where
  shipping shows it in the private window with the pins hidden.
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

## Follow-ups after Blanc Beta 2.0.0-beta.2 (2026-11-14)
Beta.2 is public (a GitHub pre-release, not latest). Its hosted smoke check
passed, and blanc.day shows it (the `/download` tile, `/dl/beta` and the
Sparkle feed). These are the open items, recorded here so any session on any
machine has them.

**For beta.3**
1. **Protected-video notice** (gate `no-drm-handoff`, waived for beta.2 only).
   On an Encrypted Media Extensions request, show an accessible notice that
   the site needs Blanc, with an explicit Open in Blanc action for the
   current page, and handle the Electron app being absent (D3/X2:
   `docs/chromium-replacement/2026-10-30-desktop-replacement-spec.md`).
   Nothing exists yet; ask the owner about wording and design first, with
   buttons.
2. **The window can reopen at an earlier size after a relaunch** (seen as
   `vertical-tabs.feature:58`, still open for beta.4; investigated
   2026-11-14 on the MacBook Pro, candidate macos-fc405801653febe3). The rail
   is not at fault: its saved 360 px survives every relaunch, and it follows
   the window. The window itself comes back at one of the sizes it had during
   the run: 1200×841 (Chromium's default for a fresh window), 640×480 (the
   scenario's narrow step) or 1000×700 (the size at quit, correct). At 640
   wide the rail caps at 248 px, so the case fails on about 1 attempt in 3.
   Ruled out as the source of the old size, from copies taken after each
   quit: the newest plain session file (always 1000×700; Chromium reads the
   newest file with a valid marker), the encrypted session copy (relaunching
   with `--disable-features=EncryptSessionStorage` changes nothing),
   `browser.window_placement` in Preferences (always 1000×700), macOS saved
   window state (none for `day.blanc.prototype`), and the fork's own Spaces
   and session code (it saves no window bounds). Restore reuses an existing
   window when one is visible (`ShouldRestoreToExistingBrowser`, which skips
   the saved bounds), and the startup log says "No browser window found for
   startup" before the fork's deferred restore (patch 0057, shared session
   plan), so the next step is a Blanc Prototype build that logs which code
   creates the first window and with what bounds. A harness change would hide
   a real bug: users can get an old window size back after quitting.
3. **Production Sync with a real iPhone** (gate
   `production-sync-real-device`, waived for beta.2). The beta joins the
   iPhone's existing Sync through Add this device with a code, with the code
   from the regular Blanc's Add another device. Run
   `chromium/release/owner/beta2-sync-check.command` (copied for beta.3).
4. **The first signed Sparkle update, beta.2 → beta.3**, from inside an
   installed beta.2, published through the website PR that updates
   `site/src/data/blanc-beta.json`, `BETA_DOWNLOAD` in
   `cloudflare/ping-worker/src/dl.js` and
   `site/public/updates/chromium-beta/arm64.xml` together.

5a. **Desktop Sync faults found by beta.3's real-iPhone pass** (2026-11-14,
   gate waived for beta.3), fixed on `chromium/next` for beta.4. Build check
   (2026-11-14, `75f85e960`): `out/BlancBeta` rebuilt through the guard (GN
   regenerated with unchanged arguments for the new keep-alive dependency;
   24 steps). The same script on a throwaway profile with a mock keychain,
   on the MacBook Pro: open Sync settings, close every window, open a new one.
   The published beta.3 then reports Sync unavailable; the rebuilt beta stays
   available. The Connected-to note's text is in the build; a real join was
   not repeated.
   - **Closing every window broke Sync until a relaunch.** On macOS Chromium
     unloads a profile when its last window closes and loads a new Profile for
     the next window; the Sync service stays bound to the first, so Settings
     said "Sync is available only in the default profile" and open tabs
     stopped publishing. Reproduced on a throwaway beta.3 profile. The service
     now holds a `kBackgroundMode` keep-alive on its profile while Blanc runs.
     Known edge: deleting the default profile may now wait until Blanc quits.
   - **No open tabs.** With windows open the beta publishes its tabs (checked
     live on the owner's beta.3). At the owner's join only Blanc's own pages
     were open, so it published none, and after windows closed it stopped
     publishing (the bug above).
   - **No word after joining.** Shipping says "Connected to “{name}”. Pulling
     your favorites and settings now." after a join with a code and has no
     "what will sync" step; patch 0080 shows the same note.

**Other follow-ups**
5. **Sync screen** (both apps): Turn on Sync, Connect your iPhone and Add
   this device with a code, plus a dialog with a third choice, confused the
   owner (2026-11-14). Design one clear "new Sync or join an existing one"
   choice and show the owner options before changing anything.
6. **A faster full suite**: 612 cases, about 75 minutes. Start from the run's
   `timing.json` (per-case phases: `blockerReadiness`, `browserLaunch`,
   `fixturePreparation`), then the slowest cases
   (`shared-spaces.feature:47` took about 8 minutes). Ideas: reuse a browser
   across cases, cache fixtures and blocker readiness, run independent cases
   in parallel, isolate the pointer-sensitive cases. Report "N of total"
   during every suite run (owner preference).
7. **1Password re-locks every ~20 seconds on the Mac Studio** (its security
   options are greyed out). The beta.2 workarounds are in
   `chromium/release/owner/`; fixing it would let `op run` work again.

**For beta.4**
8. **Island approach swell**: built and checked on Blanc Prototype
   (candidate macos-78921cb9b998cb49, see Current work). Still owed in the
   beta.4 candidate: the full suite, and a look at the swell in a background
   window. The strip tooltip's 8px offset stays (owner, 2026-11-14).

**For beta.5**
9. **The Dock icon in Light and Dark** (Current work, "The Dock icon follows
   Dark again"): patch 0082 shipped in beta.4 but its named stacks stayed
   Light in Dark. Build out/BlancBeta with the Icon Composer images, then
   check the Dock in Light and Dark with each of the five icons selected,
   switching appearance while Blanc runs, and in a Tinted icon style.

**What lives only on the Mac Studio**
- The release work folder `~/Projects/Blanc/records/beta2-work`: signed
  app, DMG, `state.json`, `release.json` and evidence bundles.
- The gate evidence in `~/Projects/Blanc/evidence/foundation/beta2-signed`.
- The full-suite run `full-beta2-equivalence`.
- The update key, in the Keychain; its backup is in 1Password Dev,
  "Blanc Chromium Beta Sparkle Signing".
- The Developer ID identity (also on the MacBook Pro).
- Wrangler 4.86.0 signed in to BNFY (npx cache), and the Blubird fonts in
  `~/Downloads/blubird`.
- For a site deploy, make a clean checkout of `main`
  (`git worktree add --detach … origin/main`), run `npm ci` in `site/`,
  install the fonts (`node site/scripts/blubird-fonts.mjs install ~/Downloads/blubird`),
  build with Node 22, and borrow the main checkout's root `node_modules` for
  `brand:check`.
- The Chromium tree and its output folders, `out/BlancBeta` at beta.2's
  production arguments.

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

## Windows
Design `docs/superpowers/specs/2026-11-17-windows-fork-design.md`, plan
`docs/superpowers/plans/2026-11-17-windows-fork-w0.md`. Milestone **W0 First
build** (the fork plan's PW.1). Owner decided D4 and approved the checkout, the
toolchain package and the cold build on 2026-11-17. Per-platform differences:
`PLATFORMS.md`.

- **Lane:** the desktop lane, unchanged pin (158.0.8127.2, chromium
  `681cd621e82e606d7536eae8ea2576afb3c7d65c`). One Windows patch so far:
  `patches/0094` (each channel's own data folder and registry key).
- **Server:** the Android lane's Linux server, cross-compiling for Windows x64
  (Chromium's `docs/win_cross.md`). Checkout `~/chromium-desktop/src` (46 GB
  with dependencies), output `out/BlancWinPrototype`, its own depot_tools,
  evidence in `~/blanc-evidence/windows/`. Layout: `windows/server/README.md`.
- **Toolchain:** Visual Studio 2026 (compiler toolset 14.51.36231) and Windows
  SDK 10.0.28000.0, package `b4f603a344` (tree hash `3bfcb536c8`), made by
  `chromium-windows-toolchain.yml` run 44110078328 and encrypted to a key only
  the server holds.
- **Candidate:** `windows-x64-bdcf3cca0b966646` (tree `cae9db2dd`), `chrome.dll`
  SHA-256 `bdcf3cca0b96664613558954b7d07590571d4f31369a963acf1ce19fe311f994`,
  zip 352 MB, on the unpublished draft release `fork-windows-candidate`.
- **Cold build:** 89,220 steps planned. The first attempt stopped after 11 min
  on "Too many open files" (the ciopfs mount's 1024 limit, now raised by
  `mount-toolchain.sh`); the second ran 1 h 13 min and stopped on four compile
  errors in Blanc's own source (file paths and POSIX permissions); the third
  finished the last 1,392 steps in 3 min 25 s.

| W0 gate | Result | Evidence |
| --- | --- | --- |
| 1. `check-patches.py` for both lanes; fork unit suite; next Mac nightly builds | Pass: the Mac nightly rerun 20261118-1221 at `bedce9a5f` built and passed 637 of 667 (0 fail, 0 undefined, 30 excluded). The 07:00 night had built it but stopped before its suite on a nightly-tooling gap, fixed in `bedce9a5f` | `records/nightly/20261118-1221` on the Mac Studio |
| 2. `progress.mjs --check` with a Windows candidate | Pass | Candidate identities below |
| 3. `chrome.exe` for x64 built on the server through the guard | Pass | `~/blanc-evidence/windows/build-3.log` |
| 4. Launches on a hosted Windows runner; Island draws; blocker ready; a page loads | Pass (Windows Server 2025, run 44137463714) | `smoke.json`, `desktop.png` in the run's artifact |
| 5. The suite runs on Windows and its report is committed | Pass: 667 cases in 1 h 41 min (run 44139976463): 534 pass, 103 fail, 24 undefined, 6 excluded. 56 of the failures are one gap, the window frame (W1) | `reports/f0-windows.json`, `reports/s1-windows.json`, Bar A below |
| 6. This section and `PLATFORMS.md` | Written | — |

### W1 Part A: window frame, buttons and menu (2026-11-18)
Plan `docs/superpowers/plans/2026-11-17-windows-fork-w1.md`. Candidate
`windows-x64-ec914b7ca4b925a1` (tree `38d4ae9da`); record `reports/w1-windows.json`.
Patches 0095 (Windows frame), 0096 (app menu anchor), 0097 (strip drag on Windows).

| Part A gate | Result | Evidence |
| --- | --- | --- |
| 1. The 56 W0 frame cases pass; nothing that passed in W0 fails | 55 of 56 pass (vertical-tabs:74 needs animations, which the runner has off). Three W0 passes failed in this run and each is runner-variable (see the record): glance:337 fails on the W0 build too, vertical-tabs:146 and F41:435 passed on this build in other runs | Run 44207006500: 590 of 667 pass (W0 534) |
| 2. One set of window buttons, Windows' own, working by real clicks | Pass | `windows-frame.mjs`, `restored.png`, `maximized.png` |
| 3. Strip drag moves the window; top edge resizes; double-click maximizes | Pass | `windows-frame.mjs` |
| 4. The menu button opens Chromium's app menu | Pass | `menu.png` |
| 5. Holds at 150% and maximized | Pass | `scale-150.png` |
| 6. Mac: fork suite, both lanes' patch checks, next nightly | Pass: nightly 20261118-1221 at `bedce9a5f` (Part A), 637 of 667, none failing | Mac Studio `records/nightly/20261118-1221` |

Found, not caused by Part A: after any tab has been closed, closing the last
window leaves the process running with no window (W2, `PLATFORMS.md`). Not
checked: Snap Layouts on a real Windows 11 desktop.

### W1 Part B: identity, installer, crash capture (2026-11-18)
Candidate `windows-x64-e42f9e5a532cdf96`; record `reports/w1-windows.json` (`partB`).
Patch 0098; names in `windows/identity.md`.

| Part B gate | Result | Evidence |
| --- | --- | --- |
| 1. Every Windows name listed, none the Electron Blanc's or Chromium's | Pass | `windows/identity.md`, `tools/windows-identity.test.mjs` |
| 2. `mini_installer.exe` builds on the server through the guard | Pass (239 MB, 5,683 steps in 13 min 46 s) | `~/blanc-evidence/windows/b1-1.log` |
| 3. Installs per user beside Electron Blanc 1.49.1; launches from its install folder with no sandbox grant | Pass | run 44235371094, `install.json`, `installed-smoke` |
| 4. Registered under its own names; Electron Blanc's entries and defaults unchanged | Pass (`Blanc Prototype.<suffix>`, ProgID `BlancPrvHTM.<suffix>`) | `install.json` |
| 5. Uninstall removes it, keeps its data, leaves Electron Blanc working | Pass | `install.json` |
| 6. Crash capture recorded | Captured: Crashpad writes renderer and browser dumps locally (Chromium's docs said a cross build could not) | run 44234145350, `crash.json` |

Full suite on this candidate: 591 of 667 pass, nothing that passed on the
Part A build fails (run 44236176647). Not checked: Settings → Default apps
listing and choosing the preview (needs a real desktop session).

### W1 Part C: signing (2026-11-18)
Candidate `windows-x64-e42f9e5a532cdf96`, signed in `chromium-windows-candidate.yml`
run 44316018075 after the owner approved it; record `reports/w1-windows.json`
(`partC`); how it works: `windows/signing.md`.

| Part C gate | Result | Evidence |
| --- | --- | --- |
| 1. `fork-windows-signing` environment, owner as required reviewer | Pass: created 2026-11-18 (reviewer bnfy, `chromium/next` only); both signing runs waited for the owner | Runs 44313102558, 44316018075 |
| 2. Installer, `setup.exe` and every executable inside signed, timestamped, subject equal to `WINDOWS_EXPECTED_PUBLISHER`, in `windows-signature.json` | Pass: 13 files inside plus the installer, 14 signatures, one Bananify Creative certificate, Microsoft timestamps | `windows-signature.json` on the draft release |
| 3. The signed installer passes Part B's install check | Pass, 11 of 11; the installed signed copy launched, drew the Island, started the blocker and loaded a page | Run 44316018075, sign job log |
| 4. Signed files only on the draft release; no signed artifact; no credential on the server | Pass: the run's one artifact holds JSON, logs and screenshots; the installer (SHA-256 `b7efd089…`) is on `fork-windows-candidate`, a draft | Run 44316018075 |

The first signing run (44313102558) signed and verified the same files but
failed gate 3: the test harness refused to launch the installed copy because
signing changes `chrome.exe`'s and `chrome.dll`'s hashes. With `--signed` the
install check now accepts them only when they are the candidate's own files
with an Authenticode signature added (`923457db2`). Open: the files' version
resources still name The Chromium Authors as company, and the installer's
version resource is Chromium's (plan Task C2).

### W2: daily driver (2026-11-18)
Plan `docs/superpowers/plans/2026-11-18-windows-fork-w2.md`; candidate
`windows-x64-7edd9da4f45532ea`; record `reports/w2-windows.json`, triage
`reports/w2-windows-triage.md`, baseline `scenarios/baseline-windows-x64-7edd9da4f45532ea.json`.

| W2 gate | Result | Evidence |
| --- | --- | --- |
| 1. Install check 12 of 12, four files naming Bananify Creative | Pass | Run 44376359872, `install.json` |
| 2. Quit check, four cases | Pass, 4 of 4 | `quit.json` |
| 3. Every non-passing case triaged; nothing that passed on W1 fails | Partly: 625 of 667 pass (W1 591); every case is in the triage record, and `F41:203` began failing with this build. Fixed after this run: the Arc import's lost Spaces (a real Windows bug, argument order; all Arc cases pass in run 44400649685) and the Favorites import (its button worked only once the page script ran; all five cases pass twice in run 44406317334 and a repeat) | `reports/w2-windows-triage.md` |
| 4. Ctrl+Tab by most recent use on Windows | Pass: 8 of 8 posted keys; 2 of 2 real keys (the real-key check found and the fix ended a switch left open when another app came forward) | `tab-switch-keys.json` |
| 5. Mac: fork suite, both patch checks, next nightly | Fork suite and patch checks pass; Mac Studio applied and GN regenerated for the nightly; the nightly itself is pending | Mac Studio `records/nightly` |
| 6. STATUS, PLATFORMS, record and baseline | Written | This section |

Not caused by W2: `supporter-and-session:18` fails on every platform since the
Favorites work's V30 step for "exactly one new tab opens" also matches the
Patron checkout. Owner items: the D1 hand checks on a real Windows desktop, and
whether Windows' caption buttons should come and go with the floating Island.

### W3: Blanc's updater and the online installer (in progress, 2026-11-21)
Plan `docs/superpowers/plans/2026-11-18-windows-fork-w3.md`. Runner proofs:
N to N+1 through blanc.day (run 44555492612), a wrong-key package refused
(44556972300) and a tampered one refused (44558579476), the signed, tagged
online installer installing from blanc.day (44571648134), its Sunrise window
(44601648672, 44601672625) and the staging gate (44609184611). Release stages:
`chromium/release/windows-release.mjs` (not yet run for a release).

Hand checks, 2026-11-21, on the owner's Windows 11 VM (Parallels on the
MacBook Pro; Windows on Arm running the x64 beta under emulation), scripted
inside the VM with `prlctl exec`, candidate `windows-x64-a9f301d5f9c2f316`
(158.0.8127.902, signed in run 44883002621, package `6b5a497d…` signed by the
owner):

| Check | Result |
| --- | --- |
| The signed online installer alone installs the beta from blanc.day | Pass: signature Valid, Bananify Creative; setup exit 0; 158.0.8127.901 registered; Start menu entry **Blanc Beta** |
| An update arriving (blanc.day switched to .902, updater woken) | Pass: 158.0.8127.902 registered, only the .902 folder left, `chrome.exe` names Bananify Creative and Blanc Beta |
| A fresh profile's first page | Pass: `chrome://newtab/` (Blanc's Start Page); no Chromium welcome page |
| Uninstall (the entry's own command) | Pass: exit 19 (success), program folder and Start menu entry gone, updater removed, Electron Blanc 1.51.0 untouched. Kept, as Chromium does: the beta's `User Data` folder (here only Crashpad) and an empty `Bananify` folder |
| The installer window by eye | The owner ran the public setup (2026-11-21): the window is Blanc's, but its taskbar icon drew two suns (Chromium's installer badge, an alias of `IDI_APP`, is the Sunrise too). Fixed for the next Windows beta in patch 0105 (the window keeps its plain `IDI_APP` icon); the capture check now compares the window's `ICON_BIG` with `IDI_APP` and fails on the badge: the public .902 setup failed it (mean difference 58.9 per channel at 32 px, run 44910338564), candidate `windows-x64-919e6019e6e743fa` passed (0, run 44910774231) |
| Start menu and taskbar (check 2), on the public .902 the owner installed | Pass: Start menu **Blanc Beta**; the window's AppUserModelID `BlancBeta.<SID hash>` equals the shortcut's, so it groups as its own taskbar button with the Sunrise, beside Electron Blanc |
| Snap Layouts (check 3) | Pass: the Maximize button answers `WM_NCHITTEST` with `HTMAXBUTTON`, and hovering it opens Windows 11's Snap Layouts flyout (VM capture); Win+Left snaps the window to the left half and the layout reflows. Picking a layout with a scripted click did not land (the flyout closes when a script's console takes focus), so a person's click on a layout is the one part not seen |
| Settings → Default apps (check 4) | Pass: listed as **Blanc Beta** with the Sunrise; **Set default** made it the default for http, https, .htm and .html (.pdf stays Edge's, as Windows leaves it), and a link opened by another app (ShellExecute) opened in Blanc Beta as a new tab. Electron Blanc was set back as the default browser afterwards (.htm and .html stay with Blanc Beta; .html had been Edge's). Seen: the registration's `ApplicationDescription` is still Chromium's product description, and the shortcut tooltip is Chromium's "Access the Internet" |
| A passkey through Windows Hello (check 5), a brand-new Windows user (check 7) | Not done: both need a person (the Hello PIN or face, and signing in as a new user) |
| Blanc's words on Windows (owner, 2026-11-21) | Patch 0098: the window title ends with the channel ("Example Domain - Blanc Beta"), the shortcut tooltip is "Browse the web" and the registered description "A minimal web browser with ad and tracker blocking built in". Candidate `windows-x64-6da9b880bec1c1e7` (with the installer-icon fix) installed over .902 in the owner's VM: its online installer's taskbar icon matched `IDI_APP` (difference 0 at 64 px), and the installed build showed all three. Seen on its relaunch: Chromium's own "Set Blanc as your default browser" dialog, with Chromium's logo, a Google Chrome screenshot and a sync claim Blanc doesn't make, shown when Blanc Beta isn't the default |
| Chromium's default-browser dialog rebranded (patch 0109, owner 2026-11-21: "rebrand it") | `chrome://default-browser-modal` now shows the Sunrise (Chromium's `product_logo.svg` is the Sunrise from `assets/sunrise-mark-4096.png`, so every page that shows the product logo has it, on the Mac too), "Make Blanc Beta your default browser", "Links you open in other apps will open in Blanc Beta. In Windows Settings, select Set default next to Blanc Beta.", a Settings picture of Blanc Beta's Default apps page, Sunrise header art and buttons. Seen in the owner's VM on candidate `windows-x64-c013cb995442adef` (light theme; dark not seen). The "Restore pages?" bubble's Restore button takes the Sunrise accent too (patch 0110, shared with the Mac beta; seen in the VM on `windows-x64-42144a7c3bf6e688`, in light and dark: #d4ad66 with dark text on the dark bubble) |
| Seen in dark mode, 2026-11-21 | Chromium's other default-browser prompt, the infobar "Pin Blanc to your taskbar to get to it quickly anytime", still shows Chromium's logo and a blue **Pin Blanc** button, and says Blanc rather than Blanc Beta. The rebranded dialog itself was not seen in dark (the prompt schedule showed the infobar, and `chrome://` addresses from the command line are refused) |
| Island bars on Windows (fixed 2026-11-21) | Every Chromium bar on Windows kept Chromium's slate, logo and blue button: the Island's band color reached the native side after the bars themed, and `Widget::ThemeChanged()` didn't reach them again (two diagnostic builds in the owner's VM logged it). The bandColor handler now restyles each bar directly; patch 0085 also swaps dark mode's `kChromeProductIcon` for the Sunrise and gives a bar's prominent button the Sunrise accent, kept at 3:1 against the bar; on Windows the pin bar says "Pin Blanc Beta to your taskbar…" (0098). Seen in the VM on `chrome.dll` `e473448a…` with the unsupported-flag bar, dark (ink band, cream text) and light (Sunrise cream); the rebranded default-browser dialog seen in dark. Not seen yet: the pin bar itself on the new build (Chromium's prompt schedule decides when it shows). A multi-agent review with skeptics found two real issues (button contrast, weak tests), both fixed |

**About on Windows (2026-11-21; shipped in .904):**
Settings → About on the Windows beta shows Chromium's own update status
(`version_updater_win` talks to Blanc's updater, W3) with a **Check for
Updates…** button that runs the check again (patch 0111; Google's help link
stays hidden), and shows the Electron import row only on the Mac, where the
importer can read that app's data. The trust receipt names the platform it
runs on, gives the Windows build number and checks `chrome.exe`'s Authenticode
publisher against Bananify Creative with cached revocation data only
(`trust_receipt.inc`). Seen in the owner's VM over a debugging port, on
`chrome.dll` `b18ff9e1…` placed over the signed public .903: "Blanc is up to
date"; pressing the button showed "Checking for updates" (button disabled) and
then up to date again; Build 158.0.8127.903 (903), Platform Windows · x86_64,
Publisher Verified locally — Bananify Creative; no import row. Seen too: typing
`chrome://settings/help` in the Island's address field searches it instead of
opening it.

**No update toast (2026-11-21, after .904; ships with the next Windows beta):**
updating .903 to .904 showed Chromium's non-milestone update toast, a dark
inverse-surface toast with Chromium's product icon and the fixed text "Chrome
was updated" (`IDS_NON_MILESTONE_UPDATE_TOAST_BODY`, not product-named). It runs
when the saved `toast.non_milestone_update_toast_version` is the same major
version and lower; the Mac beta never sees it because its Chromium version stays
158.0.8127.2. Owner: turn it off. Patch 0112 makes `kNonMilestoneUpdateToast`
disabled by default in Blanc builds. Seen in the owner's VM with a fresh profile
whose Local State says .903: the signed .904 showed the toast; with `chrome.dll`
`213bab3c…` placed over it, no toast in two captures 4 s apart.

**Sixth Windows beta public (2026-11-28):** Blanc Beta 159.0.8154.913, GitHub
pre-release `chromium-beta-windows-159.0.8154.913` at `d77142ae9` (never latest;
v1.53.0 stayed latest), published 15:51 UTC through `windows-beta-prep.mjs` and
`windows-release.mjs`, all ten stages: night `20261128-0400` passed 635 suite
cases with none rerun, the first clean night after the flake fixes (suite
46129489292, beta install 46129485029, capture 46129487010), signing run
46160207457 (owner-approved), owner-signed package `926e0386…`, staging gate
46161452889, Sigstore-signed `SHA256SUMS`, verify-public 46162064035. Candidate
`windows-x64-5de179e4080bc14b`. Its changes: the hardware video decoding switch
in Settings → System (0118), the Settings polish (0117, 0119) and the refined
Sunrise icon (#1773). blanc.day offers 159.0.8154.913.

**Fifth Windows beta public, the first on Chromium 159 (2026-11-25):** Blanc Beta
159.0.8154.910, GitHub pre-release `chromium-beta-windows-159.0.8154.910` at
`afd08df8d` (never latest; v1.52.0 stayed latest), published 22:28 UTC through
`windows-beta-prep.mjs` and `windows-release.mjs`, all ten stages: night
`20261125-1417` passed 635 suite cases, with `F41:141` and `glance:538` passing on
the rerun (suite 45686214807, rerun 45708657162, beta install 45686203201, capture
45686208579), signing run 45710806198 (owner-approved), owner-signed package
`6d1cbaa8…`, staging gate 45712323080, Sigstore-signed `SHA256SUMS`, verify-public
45713571364. Candidate `windows-x64-738046910fd57976`. Its changes: Chromium
159.0.8154.33 and the Spaces menu keeping its place as it closes (F41-27).
blanc.day offers 159.0.8154.910.

**Fourth Windows beta public, the first from a nightly (2026-11-23):** Blanc Beta
158.0.8127.907, GitHub pre-release `chromium-beta-windows-158.0.8127.907` at
`ed21560a7` (never latest; v1.52.0 stayed latest), published 13:20 UTC through
`windows-beta-prep.mjs` and `windows-release.mjs`, all ten stages: night
`20261123-0400` passed 635 suite cases on the first try (suite 45145367631, beta
install 45145357992, capture 45145362651), signing run 45179328653
(owner-approved), owner-signed package `7f0953a0…`, staging gate 45181495395,
Sigstore-signed `SHA256SUMS`, verify-public 45182987084. Candidate
`windows-x64-357453694e3d4366`. Its changes: no "Chrome was updated" toast (0112)
and no Google AI Mode check, search prewarm or preconnects. blanc.day offers
158.0.8127.907.

**Third Windows beta public (2026-11-21):** Blanc Beta 158.0.8127.904, GitHub
pre-release `chromium-beta-windows-158.0.8127.904` at `7721085b0` (never latest;
v1.51.0 stayed latest), published 17:54 UTC through `windows-release.mjs`, all ten
stages: signing run 44930878823 (owner-approved), owner-signed package `d9feaa40…`,
staging gate 44931963974, Sigstore-signed `SHA256SUMS`, verify-public 44932619481.
Candidate `windows-x64-24363262869b62ec` passed the runner's install and updater
checks (44930438550) and the installer capture with the taskbar-icon check
(44930451086). Its one change is About's update check and Windows facts (0111).
blanc.day offers 158.0.8127.904 (a signed update check from .903 answers
`nextversion` 158.0.8127.904).
#1685 moved blanc.day's Windows tile and `/dl/beta-win` to it (Pages 1400c80c,
Production at 9b1ea06). The owner announced the Windows beta for testing on
r/blancbrowser (owner-approved text, release flair):
https://www.reddit.com/r/blancbrowser/comments/1y2451g/blanc_beta_is_now_on_windows_try_the/

**Second Windows beta public (2026-11-21):** Blanc Beta 158.0.8127.903, GitHub
pre-release `chromium-beta-windows-158.0.8127.903` at `96315b04c` (never latest;
v1.51.0 stayed latest), published 16:30 UTC through `windows-release.mjs`, all ten
stages: signing run 44923135363 (owner-approved), owner-signed package `d119ad51…`,
staging gate 44924443284, Sigstore-signed `SHA256SUMS`, verify-public 44924998686.
Candidate `windows-x64-f12188c27d3b5d32` passed the runner's install and updater
checks (44922671476) and the installer capture with the taskbar-icon check
(44922682745). Carries this session's Blanc-look fixes (0085, 0098, 0109, 0110,
the bar restyle) and 0107/0108. Spaces across profiles ships in it but is not
claimed for Windows: its checks need test hooks, which beta builds compile out.
blanc.day offers 158.0.8127.903.

**First Windows beta public (2026-11-21):** Blanc Beta 158.0.8127.902, GitHub
pre-release `chromium-beta-windows-158.0.8127.902` at `f64ed2ed9` (never latest;
v1.51.0 stayed latest), published 09:19 UTC through `windows-release.mjs`, all ten
stages: signing run 44885396573 (owner-approved), owner-signed package `d2571c7e…`,
staging gate 44887435753, Sigstore-signed `SHA256SUMS`, and verify-public: a
logged-out download of every file, checksums and Sigstore, blanc.day's signed offer
of .902, and the public setup alone installing .902 on a clean runner (44889077445).
blanc.day offers 158.0.8127.902 (`cloudflare/update-worker/src/release.json`);
ledger `chromium/release/windows-ledger.json`. Not done before release: the five
hands-on checks above, and no website page or download link yet.

### Windows nightly (2026-11-22)

The Mac Studio runs the Windows nightly every day at 04:00 (LaunchAgent
`me.bnfy.blanc.desktop-nightly`, installed by
`chromium/release/daily/install-desktop-nightly.sh`; design
`docs/superpowers/specs/2026-11-21-windows-nightly-design.md`, plan
`docs/superpowers/plans/2026-11-21-windows-nightly.md`, runbook "Windows nightly"
in `docs/chromium-beta-release.md`). It builds `BlancWinBeta` and
`BlancWinPrototype` on the build server at `chromium/next`'s tip under the
checkout lock, puts both zips on the `fork-windows-candidate` draft under its
hold, runs the beta's install, launch, hash and icon checks and the prototype's
launch, frame and suite on GitHub's Windows runners, reruns what failed once, and
records the night in `records/nightly/windows/<stamp>/result.json` (the Mac
Studio's), with `LAST-PASS` naming the newest passing night.
`chromium/release/daily/windows-beta-prep.mjs` starts a release from that night
on the MacBook Pro. It claims the night's build number for its exact source on
`chromium/next` (`build-claims.mjs` `claimExact`, shared with Linux since
2026-11-22) before it touches the draft.

Rehearsal (2026-11-21, `5b0b06608`, build 906, a throwaway draft and records):
every step ran, the checks passed, the hold was released and prep refused the
failed night. Five suite cases failed on both runs (F41-named-workspaces:435,
glance:337, interface-language:43, tab-migration:116, vertical-tabs:146).

First night (2026-11-22, stamp `20261122-0400`, `2c0831c41`, build 905):
**pass**. Beta `windows-x64-7e59824678dae1f5` (zip `ede19df8…`), prototype
`windows-x64-6d6727b13c63748a` (zip `6a22c55d…`); all eight checks true (beta
workflow 45016500918, capture 45016502729); suite 45016505006 passed 635, and
four cases passed only on the rerun 45026829607 (glance:337,
island-and-commands:61 and :115, vertical-tabs:146). Linux's L2 suite fixes in
`2c0831c41` (Glance, import, profiles and window-layout steps) made the
rehearsal's five pass. It ran 4 h 26 min; the hold was released and the build
server left no lock, build or night folder. Prep has not released from it.
The four rerun-only cases, fixed 2026-11-22 (`tests/windows-nightly-cases.test.mjs`).
Each was a difference Windows shares with Linux or a hosted-runner condition:
- glance:337: Windows publishes a woken quiet tab awake and still loading, so
  the picker remembers the chosen tab's id as Linux's did (the overlay edit is
  now every platform but the Mac). Checked on a prototype rebuilt by hand at
  `75d017f2b` (`windows-x64-c0246d1a54192ea0`, zip `fdff76c0…`): all 65 Glance
  cases passed with no retries (45042056622).
- island-and-commands:61: the runner's real pointer rested at (650, 570),
  inside the test window, where no placement clears it. `real-pointer.mjs` reads
  the Windows pointer and, on a GitHub-hosted Windows runner only, moves it to a
  screen corner (45037224663 recorded it at (1918, 1030)).
- island-and-commands:115: Windows moves off a hover-opened panel only after it
  settles (`moveOffSettledPanel`, as Linux).
- vertical-tabs:146: quieting a tab released every DevTools session, which let
  the held loading tab finish; Windows now detaches only the quieted tab
  (`quietTab`). A control run on the unfixed harness (45036183809) failed it twice.
- On slower runners island-and-commands:49 failed too, with or without the
  pointer fix (45039655461, 45039657756): shipping's step allows 600 ms for a
  300 ms dwell. On Windows the moves and the panel check run side by side and
  count only if no gap between moves reached the dwell.
Final check on the rebuilt prototype (45045207804): all of island-and-commands,
vertical-tabs:146 and glance:264, :273 and :337, 71 cases, every one on the first try.

## Linux

**L0 first build (PL.1), 2026-11-21.** The desktop lane built Chromium
158.0.8127.2 for native x64 on `blanc-android-build`, in the Windows build's
checkout at `~/chromium-desktop/src`. The guarded cold build of
`out/BlancLinuxPrototype` took 1 h 10 min 51 s for 57,829 steps, with no
compile errors. [L0 plan](../docs/superpowers/plans/2026-11-21-linux-fork-l0.md)

Candidate `linux-x64-2fcae33ab6ecf405` came from `chromium/next` at
`d827f59a0`. The preview tarball on the `fork-linux-candidate` draft had
SHA-256 `b04f264edd4a5d037911a52dc0de79b92cf16c32c46d2154cf43212780147a96`.
The full suite ran from `83571b839` against the pinned v1.49.1 shipping cases.

| L0 gate | Result | Evidence |
| --- | --- | --- |
| 1. Both patch checks, fork unit suite, next Mac nightly and both Windows build plans | Open. Desktop and Android patch checks passed. The fork unit suite had 1,118 passes, 28 skips and zero failures. Evidence is pending for a Mac nightly containing L0 and the before/after plans for `BlancWinPrototype` and `BlancWinBeta` | Local commands in the [F0 report](reports/f0-linux.json). Linux setup saves the Windows plans under `~/blanc-evidence/linux/plans/` |
| 2. Generated progress agrees with the Linux candidate | Passed locally. Bar A counts 667 cases against the recorded executable hash | `node chromium/tools/progress.mjs --check`, [baseline](scenarios/baseline-linux-x64-2fcae33ab6ecf405.json) |
| 3. Guarded server build of Linux x64 `chrome` | Passed on the first build with the existing amd64 sysroot. L0 setup ran no hooks | `chromium/tools/build.mjs`, [candidate record at 83571b839](https://github.com/bnfy/blanc/commit/83571b839855a5c3a2189e0299883270593afdf2) |
| 4. Ordinary-user launch, sandbox, Island, blocker and page on X11 and Wayland | Passed on hosted Ubuntu 24.04 as UID 1001 with `kernel.apparmor_restrict_unprivileged_userns=1`. All six renderers per display had seccomp mode 2 and a PID namespace distinct from the browser's. The Island drew, the blocker became ready, the fixture page loaded and both browsers exited 0 | [Launch run 44942354424](https://github.com/bnfy/blanc/actions/runs/44942354424), `smoke-x11.json` and `smoke-wayland.json` |
| 5. Full Linux suite recorded, with failures grouped by cause | Passed. On X11, 615 passed, 21 failed, 5 were undefined and 26 were excluded across 667 cases from 618 declarations | [Suite run 44942589970](https://github.com/bnfy/blanc/actions/runs/44942589970), [F0 report](reports/f0-linux.json), [JUnit](reports/f0-linux-junit.xml) |
| 6. Linux status and platform differences recorded | Written for the L0 candidate | [Linux platform differences](PLATFORMS.md#linux) |

L2 Task 2 takes up the 21 failures and five undefined cases. References give
the feature and declaration line in `spec/acceptance/`, plus the example line
for outlines. [L2 triage plan](../docs/superpowers/plans/2026-11-21-linux-fork-l2.md#task-2-every-failing-suite-case-fixed-or-recorded)

| L2 triage group | Failed | Undefined | L0 cases and first observed errors |
| --- | ---: | ---: | --- |
| Arc import adapter and discovery | 7 | 1 | `arc-spaces-import:7,14,23,31,39,46,60` expected Arc discovery or preview data on Linux, which offers a copied-file chooser. At `:53` the adapter explicitly rejected the Linux platform before exercising that chooser |
| Owner decision 5, no Linux app icon catalog | 3 | 0 | `settings-and-theming:12`, `supporter-and-session:7,12` looked for the app-icon control in Settings |
| Owner decision 4, passkeys | 0 | 1 | `private-tabs:40` called the Touch ID ceremony. Chromium on Linux uses a security key or phone for device-bound passkeys |
| Owner decision 6, floating Island controls | 0 | 1 | `island-and-commands:320` requested floating button geometry. L1 checks Chromium's own caption buttons |
| Interface-language harness | 5 | 0 | `interface-language:10,18,26,34,43` all stopped because the harness cannot set the simulated OS language on Linux |
| Single cases for diagnosis | 6 | 2 | `F41-named-workspaces:236` timed out on the hex picker. `glance:506/example-516` saved x = 0 instead of −25. `newtab-layouts:21` put the Mahjong rail outside the board. `split-view:53` left the surviving pane short of full width. `sync:162,181` timed out waiting for a protected window. `navigation-and-context-menu:12/example-22,32` were undefined at the V12 Brave search-engine step |

### L1 identity, frame and packages (PL.2, 2026-11-21 to 11-22)

The hosted frame check used `linux-x64-64f8e6871c8fb16f` from `9f9a0be93`,
which also passed both launch checks. The install runs used candidate 5 from
`abe384098` on both architectures. The owner signed both candidate records
and RPMs on November 22.
The arm64 prototype cold build took 2 h 02 min for 95,221 steps on the same
x86-64 server as the L0 build. [L1 plan](../docs/superpowers/plans/2026-11-21-linux-fork-l1.md#l1-gate-all-must-hold),
[L1 report](reports/l1-linux.json), [frame candidate launch](https://github.com/bnfy/blanc/actions/runs/44948948374)

| Candidate 5 | Candidate ID | Tarball SHA-256 on the `fork-linux-candidate` draft |
| --- | --- | --- |
| x64 | `linux-x64-abbf0c91ab29a46a` | `21f9ce7ae13da6312c601356ddf9682c63d319286033962c6989c7ec2ddcc481` |
| arm64 | `linux-arm64-7f8c53cb7cb20dff` | `b05c2194b5c0129f60fd4cbb9ec47f4d640a29ae1bbf43a2f582ae4e8c630d57` |

| L1 gate | Result | Evidence |
| --- | --- | --- |
| 1. Frame input on X11, layout and VM input on Wayland | Passed. The hosted checks passed 8 of 8 on X11 by real input and 8 of 8 on Wayland for layout. In the VM every button worked by real input in all four layouts at 100% and 200%; strip drag, double-click, corner resize and the menu passed in all four at 100% and in default and left at 200%. Split and Close-only at 200% add no new menu or drag position (the menu button sits on the left as in default). | [Frame run 44950261755](https://github.com/bnfy/blanc/actions/runs/44950261755), [VM results](linux/hand-checks-l1.md#results) |
| 2. Install on Ubuntu 24.04, Debian 12 and Fedora 45 for x64 and arm64 | Passed all six legs, with Ubuntu’s user namespace restriction at 1. The shipping and Chromium profiles, keyring entries, existing default and Google repository files passed every preservation check. Only x64 ships an Electron AppImage to relaunch. | [x64 run 45036361406](https://github.com/bnfy/blanc/actions/runs/45036361406), [arm64 run 45036363620](https://github.com/bnfy/blanc/actions/runs/45036363620) |
| 3. Package scan and cron | Passed. Candidates 5 and 6 packaged cleanly on both architectures. The cron enrolled only Blanc’s staging repository and its key. | [Packager](linux/package-candidate.mjs), [install checks](tests/linux-install.mjs), [VM apt check](linux/hand-checks-l1.md#results) |
| 4. Candidate and RPM signatures | Passed. Both install runs verified the signed descriptors, tarball and package hashes, and RPM signatures using only the committed Blanc key. The VM check also verified the arm64 descriptor and matched the installed Debian package to its hash. | [L1 signing record](reports/l1-linux.json), [repository key](linux/keys/blanc-repository.asc) |
| 5. Mac nightly and both Windows outputs unaffected | Passed. The Mac nightly `20261122-0700` at `2c0831c41` includes patches 0113–0115 and passed; each Linux apply was mirrored on the Mac Studio with both outputs regenerated with unchanged arguments. The first Windows nightly passed. Across 15 Linux setups the Windows plans changed only in timing lines, pending GN regenerations for shared build files, and one intended compile for the Ctrl+Tab change Windows verified (run 44953442824). | [Windows nightly](#windows-nightly-2026-11-22), `~/blanc-evidence/linux/plans/` on the build server |
| 6. Owner’s first look at arm64 | Passed, delegated. On November 22 the owner asked Claude to run the check and watched it in the Parallels window; Claude drove the owner’s Ubuntu 26.04 GNOME Wayland VM by real input. Default Apps listed Blanc Prototype as the current Web choice; the login keyring was unlocked, so no prompt appeared (a locked keyring was not exercised). | [VM hand check](linux/hand-checks-l1.md) |

The first frame run failed on screenshot timing, fixed in `cdf30aa00`. The
first x64 install run reached its final shipping AppImage relaunch, where the
restored session closed the CDP target. The test fix was `b32392b3a`.
[Frame run 44948958941](https://github.com/bnfy/blanc/actions/runs/44948958941),
[install run 45035696993](https://github.com/bnfy/blanc/actions/runs/45035696993)

### L2 suite, quit, Ctrl+Tab and screen sharing (PL.3, 2026-11-21 to 11-22)

Candidate 6 from `3902e2323` on both architectures, signed by the owner on November 22.
[L2 plan](../docs/superpowers/plans/2026-11-21-linux-fork-l2.md#l2-gate-all-must-hold),
[S1 index](reports/s1-linux.json), [triage](linux/triage-l2.md), [VM hand checks](linux/hand-checks-l2.md)

| Candidate 6 | Candidate ID | Full suite |
| --- | --- | --- |
| x64 | `linux-x64-a8ae62abfb80abd5` | 636 of 667 pass, none failing, 31 excluded with named reasons ([run 45041019578](https://github.com/bnfy/blanc/actions/runs/45041019578); L0 was 615, candidate 5 627) |
| arm64 | `linux-arm64-38d1e4faa1e2945e` | 633 pass, 31 excluded; three timing cases (Spaces menu fade, shield popover, pointer dwell) passed on rerun ([run 45041022075](https://github.com/bnfy/blanc/actions/runs/45041022075), [rerun 45052104498](https://github.com/bnfy/blanc/actions/runs/45052104498)) |

| L2 gate | Result | Evidence |
| --- | --- | --- |
| 1. S1 reports from candidates after every L2 fix | Passed. Both per-architecture reports and the index are committed; every non-passing case is excluded with a named reason or passed on rerun. | [s1-linux.json](reports/s1-linux.json) |
| 2. Quit check on X11 | Partial on the runner, passed on a desktop. Six of seven cases pass on X11. `download in progress` can't be operated under Xvfb with Openbox (the dialog has no reachable window there); by real input on GNOME it shows "Download is in progress", and Exit quits every Blanc process within 2 seconds. | [Run 45057217919](https://github.com/bnfy/blanc/actions/runs/45057217919), [triage](linux/triage-l2.md), [VM check](linux/hand-checks-l2.md) |
| 3. Ctrl+Tab by real keys | Passed. Every case on X11 on both architectures from a fresh process; the Windows checks passed on the shared change (run 44953442824); the Wayland check passed in the owner's VM. | [x64 run 45056247216](https://github.com/bnfy/blanc/actions/runs/45056247216), [arm64 run 45056743311](https://github.com/bnfy/blanc/actions/runs/45056743311) |
| 4. Screen sharing | Passed. A tab and the whole screen through Chromium's picker by real input on X11, both architectures; a window through GNOME's portal in the owner's VM. | [x64 run 45059423813](https://github.com/bnfy/blanc/actions/runs/45059423813), [arm64 run 45059705534](https://github.com/bnfy/blanc/actions/runs/45059705534) |
| 5. Mac nightly and Windows outputs unaffected | Passed. The Mac Studio was regenerated with unchanged arguments before each nightly (plans of 3 and 4 actions on November 22); the Windows plans changed only by pending regenerations. | [L1 gate 5](#l1-identity-frame-and-packages-pl2-2026-11-21-to-11-22) |

Open: a day of ordinary use by the owner; the download-quit case on the hosted runner.

### L3 first public Linux beta (PL.4, 2026-11-22 to 11-23)

**Blanc Beta for Linux 158.0.8127.906 is public.** It was published at 03:45 UTC on November 23
as GitHub pre-release
[`chromium-beta-linux-158.0.8127.906`](https://github.com/bnfy/blanc/releases/tag/chromium-beta-linux-158.0.8127.906),
not latest (v1.52.0 stayed latest), and as generation 906 of the signed apt and dnf repository at
`https://pkg.blanc.day` (digest `32459e86…`, the same tree proven on staging). It ships `.deb` and
`.rpm` packages for x64 and arm64, built from `a52e29005` on Chromium 158.0.8127.2. Build 905 was the
proof-only N-1, from the same source and never published. Both numbers are claimed in
`build-reservations.json` and recorded in the [Linux ledger](release/linux-ledger.json).
[L3 plan](../docs/superpowers/plans/2026-11-21-linux-fork-l3.md#l3-gate-all-must-hold),
[L3 report](reports/l3-linux.json)

| L3 gate | Result | Evidence |
| --- | --- | --- |
| 1. Update proof on every leg, refusals refused | Passed. On Ubuntu 24.04, Debian 12 and Fedora 45, x64 and arm64: 905 installed by file, 906 came from staging through apt or dnf, Blanc offered to restart and relaunched into 906 with its tabs, and foreign-key, unsigned and bad-metadata repositories were refused. The repository add, update and remove check passed on all six. The first two runs failed on test assumptions, fixed in `32b7db2e2` and `ffdf6f60f`. | [Update proof 45103487653](https://github.com/bnfy/blanc/actions/runs/45103487653), [lifecycle 45103802669](https://github.com/bnfy/blanc/actions/runs/45103802669) |
| 2. Verify-public on x64 and arm64 | Passed on all six systems. Each downloaded every public asset logged out, checked the Sigstore signature, `SHA256SUMS` and the manifest, and installed from `pkg.blanc.day`. The first run's two x64 jobs got 403 on anonymous `api.github.com` reads (a rate limit shared on the runner's address); only the three metadata reads now use the job's read-only token. | [Run 45108455963](https://github.com/bnfy/blanc/actions/runs/45108455963), [first run 45107889525](https://github.com/bnfy/blanc/actions/runs/45107889525) |
| 3. Owner's VM hand checks | Passed, one item partial. In Ubuntu 26.04 arm64 the Island's Restart to update relaunched 905 into 906 with tabs restored. The Dock icon, keyring, default browser and screen sharing matched L1 and L2. Ubuntu 26.04 has no Software Updater; App Center lists the update only when the repository publishes DEP-11 metadata, which the owner chose to add before the .37 update. | [VM hand check](linux/hand-checks-l3.md) |
| 4. Latest release still Electron's; Mac and Windows betas unaffected | Passed. Latest stayed v1.52.0 (checked by the publish stage and verify-public). The release created only its own tag, pre-release and repository generation and wrote no Mac or Windows asset or feed. | [Release](https://github.com/bnfy/blanc/releases/tag/chromium-beta-linux-158.0.8127.906) |
| 5. Website copy approved by the owner | Passed. The owner approved the Download page's Linux tile on November 23; it merged as `139394045` and deployed to blanc.day (Pages `71c36fae`, Production, `main`), with counted `/dl/beta-linux-<arch>-<format>` routes on blanc-ping (version `defe9dac`). | [bnfy/blanc#1708](https://github.com/bnfy/blanc/pull/1708) |

Found during the release: on Linux, spell checking downloads its Hunspell dictionary from
`redirector.gvt1.com/edgedl/chrome/dict/`, as shipping Electron Blanc does. No other Google update
or release host appeared in the update proof's network logs.

Open: DEP-11 metadata before the 158.0.8127.37 update; the 158.0.8127.37 Linux betas after the
build server moves to .37; the ship note to the release-notes list (owner).

**Blanc Beta for Linux 159.0.8154.912 is public (November 26, 2026)**, the first Linux beta on
Chromium 159 (159.0.8154.33), published at 14:18 UTC from `afd08df8d` with 911 as its proof-only
N-1. Update proof 45761487715 and repository lifecycle 45761910883 passed on all six legs, the
VM hand check moved 911 to 912 through Restart to update (`chromium/linux/hand-checks-l3.md`), and
verify-public 45839063871 passed on all six legs (its first run, 45837770153, failed only removing
a smoke profile still being written, fixed in `2f6c07ece`). Production pkg.blanc.day is on
generation 912; latest stayed v1.52.0. Ledger: `chromium/release/linux-ledger.json`.

**Blanc Beta for Linux 159.0.8154.915 is public (November 28, 2026)**, published at 19:23 UTC from
`83a118d5b` with 914 as its proof-only N-1. It carries patch 0120 (#1630): Open With, or a file
manager, opens a local HTML file in a tab instead of an empty New Tab. Two build breaks in the new
typed-HTTPS fallback were fixed before it built (`e8b2939b4`, `83a118d5b`, `<stddef.h>` under C++
modules), so the 914/915 claims moved from `7744b2bb0`. Update proof 46178005554 and repository
lifecycle 46178301423 passed, the VM hand check moved 914 to 915 through Restart to update and
opened a local page into the running browser (`chromium/linux/hand-checks-l3.md`), and verify-public
46180961512 passed on all six legs. The first draft run stopped reading back a draft GitHub hadn't
listed yet; the resumed stage finished it. Production pkg.blanc.day is on generation 915; latest
stayed v1.53.0. Ledger: `chromium/release/linux-ledger.json`.

## Android
Betas and stable on Play, once production exists: `docs/android/channels.md` (nightly, weekly beta, four-weekly stable, security releases).

Plan: `docs/superpowers/plans/2026-11-03-android-port.md` (design and plan in
[PR #1333](https://github.com/bnfy/blanc/pull/1333)). Milestones: **A0
Foundation**, 5 of 6 exit gates passed on the emulator, and **A1 Island and
pages**, **A2 Tabs, groups, palette and tab grid** and **A3 Blocking**, every
emulator gate passed (below); the Pixel runs wait for the device. **A4 Sync** is in three PRs; A4a (the runner, keys, pairing and Profile Sync) is below. Owner approved the download and cold builds on 2026-11-03.

- **Lane:** Chrome stable for Android 156.0.8078.79, chromium
  `a21ce95c24ce3964416f09ae1862f53f319eb4d0` (chromiumdash, 2026-11-03). Rebased to
  159.0.8154.18, chromium `ee456dcc432646f3d9941126a2c0730fa223e098`, on 2026-11-23
  (`chromium/android/rebase-ledger.json`).
  Patches: `patches/android/0101` (identity, icon) and `0102` (Google
  background services and first run off). No shared patches at A0: they wire
  desktop Blanc into `chrome/browser`, which Android also compiles.
- **Server:** Hetzner EX63-1 `blanc-android-build` (address kept out of this public repository), build user
  `blanc`, key-only SSH. History-free checkout at `~/chromium-android/src`
  (40 GB), outputs `out/AndroidDebug` and `out/AndroidDebugX64` (20 GB each),
  evidence in `~/blanc-evidence/android/`. Layout:
  `android/server/README.md`.
- **Candidates** (tree `27355bbe75d602a24c56f84bbb10adf04497f93d`, debug,
  `me.bnfy.blanc.dev`, "Blanc", 156.0.8078.79):
  - `android-arm64-7bd35e94ef746069`: `out/AndroidDebug/apks/ChromePublic.apk`,
    arm64-v8a, 625 MB, SHA-256 `7bd35e94ef746069062a711948ec72eb2cae687d6da8c1f1dac2eb30cb85a045`.
  - `android-x64-077b76063f75e248`: `out/AndroidDebugX64/apks/ChromePublic.apk`,
    x86_64, 614 MB, SHA-256 `077b76063f75e2487d9cb74c0e18f6ffa56a57086bbb174e815c9fc15a7ba1f7`.
- **Cold build:** about 1 h 25 min compiling per architecture on 20 cores
  (arm64 across three attempts, x86_64 1 h 23 min); incremental rebuilds
  10–20 s.

| A0 gate | Result | Evidence |
| --- | --- | --- |
| 1. `check-patches.py --lane android` passes; desktop output unchanged | Pass | `tools/check-patches.test.mjs` |
| 2. `progress.mjs --check` with an Android column | Pass | Bar B below |
| 3. Both APKs built; `aapt2 dump badging` shows `me.bnfy.blanc.dev`, "Blanc" | Pass | candidates above |
| 4. Installs, launches and loads `https://example.com` | Emulator pass (Android 16 Google APIs x86_64); **Pixel pending** | `a0-example-com-3.png`, `a0-first-launch.png` |
| 5. Outbound gate: no denylisted Google host in the 5-page session | Pass on the emulator, no extra switches | `outbound-11-nofre/outbound-android.json` |
| 6. This section | Written | — |

Gate 5 sees Chromium's network stack only (NetLog), not Play services or OS
traffic. Still Chromium's, for A1: the notifications prompt and the new tab
page's account icon. Debug args differ from the plan's: `is_java_debug`,
`android_static_analysis = "on"` and `disable_android_lint` (reasons in
`android/args/`).

### A1 Island and pages

Plan: `docs/superpowers/plans/2026-11-04-android-a1-island.md`; spike:
`docs/android/a1-island-spike.md`. Owner direction (2026-11-04): Android
follows Blanc for iPhone wherever it can. Milestone **A1**: every emulator gate
passes; the Pixel hands-on waits for the device.

- **Island:** the iPhone's floating Island over a full-screen page (Chromium's
  toolbar hidden, patch 0104): the Sunrise menu, the site, the private chip,
  Reload or Stop, the tab count and New Tab, with the iPhone's sizes, surface,
  tuck rules, top or bottom position and sideways tab swipe. TalkBack hears the
  iPhone's labels, and the tab count as "Show all tabs, 3 tabs".
- **Sunrise menu:** Save to or Remove from Favorites, Share, New Private Tab.
  Customize Start Page (A5), blocking (A3), Find (A2) and Send (A4) are hidden
  until their milestones.
- **Address sheet:** the site opens a sheet above the keyboard; addresses load,
  words search DuckDuckGo (desktop's address rules, 1,746-input differential).
  A2's palette replaces it.
- **Pages:** shipping's page files from v1.46.0, unchanged, at
  `chrome://blanc/<page>.html` (D34, patch 0105) with the iPhone's bridge and
  phone layout; new tabs, Favorites and History open them, so Chrome's New Tab
  page is never created. Bridge members answered in A1: `appVersion`,
  `start.data`/`topSites`/`focusGroup`/`layoutUsed`, `bookmarks.list`/
  `remove`/`capabilities`/`clearFavicon`, `history.list`/`remove`/`clear`,
  `shortcuts.list`, `mahjong.played`. Every other member rejects `not-yet`:
  `start.openIsland` and `surface.*` (A2), `pins.*` and Start Page appearance
  (A5), `start.openSent`/`dismissSent`/`onSentItems`/`onRemoteTabs` (A4),
  `archive.*` (after A2), `errorPage.continueUnsafe` (A6),
  `bookmarks.setFolder`/`renameFolder`/`removeFolder` and imports (after 1.0).
- **No startup prompts:** Chrome's notification prompt is gone (patch 0104);
  Android asks in context.
- **Candidate** (x86_64, emulator): `out/AndroidDebugX64/apks/ChromePublic.apk`,
  SHA-256 `a451b8525c2d9a857473dd37a52c0e69db2c5081f93fed74c09e5e96e199fcdf`;
  arm64 for the Pixel: `out/AndroidDebug/apks/ChromePublic.apk`, 635 MB,
  SHA-256 `8feac58cfc22d82c8c43573d2b86137cbd9663cb15c390a2c5781b6fbb489165`
  (built, not yet run on a device).

| A1 gate | Result | Evidence (`~/blanc-evidence/android/a1/`) |
| --- | --- | --- |
| Robolectric: Island rules, view, menu, address input | 124 pass (62 per SDK) | `junit.log` |
| Island inside the insets and tucking, gesture and three-button navigation, portrait and landscape, top and bottom, at 1080×1920@480, 1080×2400@420 and 720×1280@320 | 24 of 24 | `insets-*/island-insets.json` |
| Sunrise menu, no startup prompt | 7 of 7 | `menu/island-menu.json` |
| Pages: fresh install opens the Start Page; six pages × six languages, phone layout, no sideways scroll, no script errors | 37 of 37 | `pages/pages-phone.json` |
| Outbound gate | Pass | `outbound/` |
| Owner hands-on on the Pixel: one-handed at the bottom, tuck feel, swipe, pages at phone width | **Pending the Pixel** | — |

Run it all with `tests/android/a1-gate.sh` on the server. A final review of
the A1 branch found a crash on a 19-digit port, the Island band taking taps
beside the pill, end-truncated sites and typed `blanc://` addresses going
nowhere; all fixed with tests, and the gate rerun on the fixed build. The
arm64 candidate below predates those fixes. Divergences: D11 and
D15 (Android bullets), D34 and D35.

### A2 Tabs, groups, palette and tab grid

Plan: `docs/superpowers/plans/2026-11-04-android-a2-tabs.md`; spike:
`docs/android/a2-tabs-spike.md`. Every emulator gate passes; the Pixel
hands-on waits for the device.

- **Tabs and groups are Chromium's** (its model saves and restores them),
  with Blanc's rules: group names matched without regard to case, the eight
  preset colors (kept beside Chromium's nearest), a plain new tab always
  ungrouped, pins leading, and a grouped tab's pin kept by Blanc, since
  Chromium keeps pinned tabs apart from groups. Blanc restores what Chromium
  doesn't: the active tab and mute. Private tabs close on a cold start and sit
  in their own section (D36).
- **Palette:** the iPhone's sheet from the Island's site: the tab list with
  groups (fold, "N tabs tucked away"), the Quick Switcher over tabs,
  Favorites and groups (history not yet), and 11 slash commands (13 with A3's). `/space`,
  `/sync`, `/send`, `/settings` and `/reader` wait for their milestones.
- **Tab grid:** from the Island's tab count or a swipe from the Island into
  the page, with group headers and menus (rename, color, new tab in group,
  close), a card menu (pin, mute, duplicate, move to group) and a sideways
  swipe to close with five seconds of Undo. Chrome's own undo snackbar is off.
- **Find in page** above the keyboard (D37), from the Sunrise menu or `/find`.
- **Quiet Tabs:** a background tab is discarded after an hour (the iPhone's
  rules: never the active, pinned, muted, playing or capturing tab, nor one
  with unload handlers) and comes back with its back history. Pull to refresh
  reloads web pages, never Blanc's.
- **Still not built:** a Blanc Undo banner over the page for closes from the
  palette (the grid has one), history in the Quick Switcher, and the bridge
  members `start.openIsland` and `surface.*`, which still answer `not-yet`.
- **Candidate** (x86_64, emulator): `out/AndroidDebugX64/apks/ChromePublic.apk`,
  624 MB, SHA-256 `0dd92ce5330868c90c9eeed4818bedccacb34f41c2c7638271989ce15ec2196c`.
  No arm64 build for the Pixel yet.

| A2 gate | Result | Evidence (`~/blanc-evidence/android/a2-merged/`) |
| --- | --- | --- |
| A1 gate, rerun: Robolectric, insets, menu, pages, outbound gate | Pass (Robolectric 268) | `a1/`, `a1-gate.log` |
| Tabs, palette (three sizes, rotation, commands, groups) | 2 of 2, 7 of 7 | `tabs/`, `palette/` |
| Tab grid at the top and bottom at three sizes, swipe to open, swipe to close and Undo, group menu | 10 of 10 | `tab-grid/` |
| Find in page | 5 of 5 | `find/` |
| Session after a background kill, a force-stop and a reboot | 3 of 3 | `session-restore/` |
| Quiet Tabs and pull to refresh | 4 of 4 | `quiet-tabs/` |
| Groups, private tabs and links over Chromium's model | 5 of 5 | `tab-store/` |
| Shared acceptance scenarios (`tests/android/acceptance/`) | 23 of 23 | `acceptance/` |
| Owner hands-on on the Pixel: palette, grid swipe, groups, pull to refresh, Island swipe | **Pending the Pixel** | — |

Run it all with `tests/android/a2-gate.sh` on the server. The shared
scenarios found two gaps, fixed with tests: pinning a grouped tab took it out
of its group, and the palette had no tucked-away row. A final review of the A2
branch found nine more, also fixed with tests, among them moving one tab taking
its whole group, `/group` crashing on a grouped or private tab, ungroup
reversing the order, Undo after Chromium had committed the close, a link on a
cold start losing to the saved tab, and find staying on the old page. A
background tab's mute was queried too: `session-restore.mjs` keeps it through
all three restarts, though it doesn't prove that tab was frozen. The gate was
rerun on the fixed build, on top of `chromium/migration`; none of migration's
changes feed Android's build, so its APK is unchanged. Divergences: D36, D37.

### A3 Blocking

Plan: `docs/superpowers/plans/2026-11-04-android-a3-blocking.md`; spike:
`docs/android/a3-blocker-spike.md`. Every emulator gate passes; the Pixel
hands-on waits for the device.

- **The desktop fork's blocker, unported:** Ghostery's engine over the pinned
  EasyList and EasyPrivacy, in a sandboxed utility process, with network,
  cosmetic and scriptlet filtering, in normal and private tabs. Patch 0106
  carries the hooks. The bundle is an uncompressed APK asset, refused unless it
  matches the pinned hash, and isn't in git (`android/server/README.md`).
- **Controls:** the iPhone's blocking row in the Sunrise menu, with desktop's
  per-page count under it, `/block-ads` and `/allow-ads`. The Start Page shows
  protection On or Off, as the iPhone's script does (owner, 2026-11-05).
- **Failing closed on a phone:** Android ends background processes in normal
  use, so the engine comes back when next needed and requests it was deciding
  are asked again. Only an end within 10 s of starting counts as a crash: three
  in ten minutes, or a wrong bundle, stop pages, with a notice and Retry on
  screen and in the menu.
- **Page preloading is off by default** (owner, 2026-11-05): speculation-rules
  prefetches and prerenders take a path the blocker doesn't sit on.
- **Hidden tabs stop their cosmetic scan.** A visible page's scan is unmeasured.
- **Desktop:** the shared blocker files syntax-compile for desktop on Chromium
  158 (Mac Studio, `out/BlancRelease` flags, proved with a deliberate error).
  Not linked, and no desktop smoke run with these changes.
- **Not measured:** the engine's memory by process; `ps` can't tell it apart on
  the emulator, so the Pixel run should.
- **Candidate** (x86_64, emulator): `out/AndroidDebugX64/apks/ChromePublic.apk`,
  SHA-256 `a2d7b0dbe98b346d6860f21c13c6caeb50fbfb96138fcccdd80fb3d9a241e7e3`.

| A3 gate | Result | Evidence (`~/blanc-evidence/android/a3/` and, on this candidate, `a3-merged/`) |
| --- | --- | --- |
| Blocking: normal and private tabs, count, allow and re-block, restart, background kills, restored tabs, crash stop and Retry, service worker, prefetch, Start Page state, no network, wrong bundle | 14 of 14 on this candidate | `a3-merged/blocking/` |
| A2 gate, rerun: Robolectric 296, A1's checks and every A2 check | Pass on the build before desktop's week-stats merge (Quiet Tabs rerun alone after its check learned to count the blocker's process); Robolectric rerun on this candidate | `a2/` |
| Shared acceptance scenarios | 32 of 32 on this candidate | `a3-merged/acceptance/` |
| Owner hands-on on the Pixel: blocking on real sites, allow and re-block, a cold launch | **Pending the Pixel** | — |

Run it all with `tests/android/a3-gate.sh` on the server. A final review found
that the first restart rule counted ordinary background kills as crashes, which
could have stopped every page after normal phone use; fixed, with six others.
Merging desktop's weekly count then crashed Android on its first block, because
its preference is registered in a desktop patch; patch 0106 registers it, and
`tools/android-blocking.test.mjs` now fails on any unregistered blocker
preference. Divergences: D1, D13 and D14 corrected.

### A4a Sync: the runner, keys, pairing and Profile Sync

Shipping's sync at v1.46.0 runs unmodified in a jitless, sandboxed utility
(`blanc/services/sync_runner/`, bundled by `tools/build-sync-bundle.mjs`,
hash-pinned). Crypto is BoringSSL, URLs are GURL, and the sync key is wrapped by
Android Keystore. `/sync` opens the iPhone's sheet: pair by an in-app QR scanner
or a typed code, or sign in with a passphrase. Favorites reconcile with
Chromium's bookmarks, and the theme and blocking switch follow. Site exceptions
don't sync, as on the iPhone. Desktop doesn't build the runner until its S4.
Rulings: `docs/android/a4-rulings.md`.

- **Candidate** (x86_64, emulator): SHA-256
  `fe931dfb18215f5ea88fccece0f97b323501395dea09c3f60c8a97040335a6df`.
- On the emulator: first full sync about 270 ms, a passphrase sign-in about
  300 ms, the runner about 48 MB.

| A4a gate | Result | Evidence (`~/blanc-evidence/android/a4-merged/`) |
| --- | --- | --- |
| Sync: passphrase and both pairing directions, a killed runner, a Favorite saved as it dies, a lost key, Favorites and theme both ways, a newer device's setting, the restart limit, a wrong bundle | 10 of 10 against the real Worker code | `sync/` |
| A3 gate: every A2 check, acceptance 32 of 32, blocking 14 of 14 | Pass. Two earlier runs each failed one blocking case that passed alone (3 of 3 and 6 of 6); the menu count was a race in the test, now fixed, and `/allow-ads` wasn't explained | `a4-merged/a3/` |
| Robolectric | 386 | server log |
| Real camera scan | **Pending the Pixel** | — |
| Owner hands-on, Pixel and desktop | **Pending A4's end** | — |

Run it with `tests/android/a4-gate.sh`. A final review found that a refused or
interrupted Favorite could read as a removal and delete the bookmark, and that a
runner not answering read as Sync off; both fixed with tests that fail when the
bugs are put back, with the rest in the rulings.

### A4b Sync: open tabs, Send to device, background sync

Sharing open tabs is off until asked, and private tabs never reach it. Other
devices and sent pages show in the palette and reach the Start Page, and `/send`
and the Sunrise menu send the current page. Background sync runs through
Chromium's own scheduler every 15 minutes at best: it fetches and keeps, and with
no tab model it can't touch this phone's tab list elsewhere. Synced Recently
closed moved to A4c, because the iPhone shows it only with the Spaces switch on.

- **Candidate** (x86_64, emulator): SHA-256
  `d3373a848ae82b558af0ca1db00cc8c730549b0f337db040feef45612c46685a`.

| A4b gate | Result | Evidence (`~/blanc-evidence/android/a4b-final/`) |
| --- | --- | --- |
| Sync: A4a's checks, sharing, private tabs, sent pages, `/send`, a background run with Blanc killed | 15 of 15 | `sync/` |
| Blocking, acceptance | 14 of 14, 32 of 32 | `a3/` |
| Robolectric | 402 | server log |
| A1 and A2 checks | Pass (A1's rerun after the rotation check was fixed) | `a1-rerun/`, `a3/a2/` |
| Owner hands-on, Pixel and desktop | **Pending A4's end** | — |

The review found that saving after each runner call also ran shipping's quit
handler, which cancelled a pairing code as soon as it showed; fixed, with a test
through the real call path. Long gate runs also exposed emulator races in the
tests (the menu's count, rotation after a navigation mode change, refused UI
dumps, the Worker's 30 reads a minute), now fixed in the tests. One `/allow-ads`
timeout stays unexplained: it missed 15 seconds in two full runs and never alone.

### A4c Spaces on this phone

The Island mark, the Spaces card and editor, `/space`, Move to Space, Undo and
Recently deleted, over Chromium's real tabs. A switch keeps each tab's Back and
Forward, its group and its pin, leaves private tabs alone, and a killed app
finishes it on the next launch. Spaces are found in the palette, and the grid
names the Space on show. Shared Spaces and synced Recently closed are A4d.

Chromium's tab group sync is off (patch 0109): it closes groups it doesn't know
at launch, which is every group a switch brings back. Rulings are in
`docs/android/a4-rulings.md`.

- **Candidate** (x86_64, emulator): SHA-256
  `11d4d348464113495caf292487b345696c7fa054e1c981672bd3ac7be5a22766`.

| A4c gate | Result | Evidence (`~/blanc-evidence/android/a4c/`) |
| --- | --- | --- |
| Spaces: switches, restarts, moves, Undo, Recently deleted, the editor, the palette | 15 of 15 | `spaces/` |
| Sync | 15 of 15 | `sync/` |
| Blocking, acceptance | 14 of 14, 32 of 32 | `a3/` |
| Robolectric | 468 | server log |
| A1 and A2 checks | Pass | `a3/a2/` |
| Owner hands-on, Pixel and desktop | **Pending A4's end** | — |

The first full run failed one acceptance scenario, also seen in the A4b run: a
page's only blocked request can miss the shield count, probably by racing the
page's commit. The `/ads` fixture now makes a second blocked request after load,
and A3 passed on the same APK.

### A4d Shared Spaces and Recently closed

The palette's Recently closed band, on or off Sync, and with the Spaces switch on,
other devices' closed tabs. Shared Spaces through shipping's own sharing code in the
runner: the switch and its sheet, a Space shared or joined, tabs added, moved and
closed on either device, Bring a Space with the switch off, other devices' Spaces in
palette search, and the Not synced mark. A tab nothing has loaded arrives quietly, the
tab on screen is never closed from under the person, and a switch waits for the runner
so a tab opened just before it isn't shared twice. Rulings are in
`docs/android/a4-rulings.md`.

| A4d gate | Result | Evidence (`~/blanc-evidence/android/a4d-gate/`) |
| --- | --- | --- |
| Sync, with the two band checks | Pass, 17 checks | `sync/` |
| Shared Spaces on the emulator against a Node peer | Pass, 6 of 6 | `shared-spaces/` |
| Spaces, shield race, blocking, acceptance, A1 and A2 | Pass: Spaces 15 checks, 0 of 40 counts lost, A2, A3 and A4 gates pass | `spaces/`, `a3/` |
| Runner tests (`sync-spaces`, `sync-bundle`, `sync-iphone`) | 15, 10 and 1 pass | CI |
| iPhone reads what Android writes (`AndroidWireTests`) | Pass, iOS 27.2 simulator | local |
| Robolectric | 562 pass | server log |
| APK | `572e310c…` | `apk.sha256` |
| Owner hands-on, Pixel and desktop | **Pending A4's end** | — |

### A5a Settings shell

Blanc's Settings on Chromium's settings stack (spec `docs/superpowers/specs/2026-11-07-android-settings-design.md`,
rulings `docs/android/a5a-settings-spike.md`). Chromium's `MainSettings` keeps its class; patch 0110 hides the
Google and Chrome rows, adds a Sunrise header and the iPhone's sections (Browsing, Appearance, Privacy, Sync,
More, About), and `ThemeOverlay.Blanc.Settings` paints it light and dark. Settings' own search is off, because
it found the hidden pages. Rows: Search engine (syncs), Theme (syncs), Island position (moves the Island at
once), the blocker switch, Allowed sites, Clear site data, the Sync row (opens the Sync sheet), and under More
Chromium's Site settings, Notifications and Downloads. Ways in: `/settings`, the palette's Settings button,
`blanc://settings` with `#sync` and `#privacy`. One Chrome-worded string (auto-revoke summary) is overridden in
all six languages; Accessibility is left out of More because its page names Chrome.

- **Since built:** the default-browser row, Language, Measure usage and the walkthrough came with A5c
  (below). The Start Page's widgets, clock and wallpaper came with A5b (below): Settings has a Start Page row
  that opens its Customize.
- **Known gaps:** Chromium's own default search engine follows Blanc's choice only after Settings has been
  opened (a startup sync is a follow-up); Settings asks the sync runner for its status on every update; the
  Open-source licenses row opens Chromium's legal page, which the wording scan doesn't cover.

| A5a gate | Result | Evidence (`~/blanc-evidence/android/a5a-gate/`) |
| --- | --- | --- |
| Settings on the emulator (rows, order, wording, every row, every way in, no crash) | Pass, 15 checks | `settings/`, `settings.log` |
| Patch reconstruction, android and desktop lanes | Pass | `patches-*.log` |
| Robolectric | 676 pass | `robolectric.log` |
| Runner and tool tests (`node --test chromium/tools/*.test.mjs`, on the Mac) | 216 pass | local |
| A4 gate (A1 to A3, sync, Spaces, Shared Spaces, shield race) | Pass | `a4/` (overwritten, below) |
| APK (x86_64, emulator) | `b57a4ca6…` | `apk.sha256` |
| APK (arm64, for the Pixel) | `fed28dc1…` (`out/AndroidDebug/apks/ChromePublic.apk`), installed on the owner's Pixel 10 Pro | — |
| Owner hands-on, Pixel and desktop (Sync through Settings) | Pass, November 11, 2026: Settings opened from `/settings` with every section; the Sync row opened the Sync sheet; the owner paired with their desktop and the desktop's Spaces arrived. Three bugs found (below). | owner |

A later run on November 11 (APK `0042c649…`) wrote over `~/blanc-evidence/android/a5a-gate/`, so its A4 logs
are that run's, not this gate's: it failed tabs, one Sync case (a lost Keystore key) and all six Shared Spaces
cases ("Timed out waiting for the switch"). Shared Spaces passed 6 of 6 again in the A5c gate.

The first full run failed twice: the A3 check "quick endings stop pages, and Retry recovers" slept a fixed six
seconds and looked once for its notice (it passed alone; it now waits up to 30 s), and the tools tests need iOS
fixtures the server lacks (they run on the Mac). An earlier standalone Settings run had failed
`blanc://settings#privacy` once; it passed in both gate runs, cause not found, so it stays watched.

On the Pixel (November 11) three bugs showed, fixed in the A5a follow-up: the Sync row kept saying Not connected
after pairing until Settings was opened again (it asked only when Settings was built; it now asks again when the
Sync sheet closes); Settings' **?** button opened Google's Chrome help (Chromium hides it only when Settings is
shown in a tab; patch 0110 now hides it on every Settings screen); and a launch after four days away crashed on
Chromium's check that the new tab page it opens after four hours away has Chrome's address, not Blanc's Start
Page (`ReturnToChromeUtil`; patch 0105 makes `shouldShowTabSwitcher` always say no, so Blanc reopens the last tab as
the iPhone does; a first try changed the return-time param's default instead, which review found Chrome caches from
the launch before, so an updated install would still have crashed once). The palette's Settings button, `blanc://settings` and the theme switch weren't tried on the Pixel; they pass
on the emulator.

The fixed build (`1f2faf38…`, arm64, installed over wireless debugging) was checked on the Pixel on November 11:
no help button on Settings, Site settings or Downloads, and a launch from the home screen with Blanc's last-seen
time set five hours back reopened the last tab with no crash (that build carried the param fix; the emulator check now
also plants the old cached four hours). The Sync row's update when the sheet closes wasn't
tried on the Pixel, since that means turning Sync off and pairing again; Robolectric covers the sheet's signal. The
Settings check script's wording scan read Site settings while the root was still on screen and so never opened its
pages; it now waits for the root to go.

The Space mark moved off the closed Island on November 11 at the owner's request, to save room on the bar: it now
sits in the open Island's footer, before Favorites, under the same rule (once a Space exists, never on a private
tab), and opens the Spaces menu. The iPhone is making the same change in its own session, so this isn't a
divergence. The Spaces emulator check now requires the closed Island to have no mark.

The Sync screen was redesigned on November 11 at the owner's request ("visually overwhelming"; they picked a grouped
list from three mock-ups). It opens as a full page with a back arrow instead of a dialog with a stack of eight
buttons and Done: the iPhone's Form groups as Sunrise cards (status, account and last sync; Device name, Share open
tabs and Sync now; the Spaces switch and Choose Spaces to sync; Add another device, Copy recovery code, Switch
account and Disconnect in red), with each group's help under its card. Device name is a row that opens a rename box,
so Save name is gone. The not-connected screens follow the same style. Layouts, colors and sizes are Android
resources. Robolectric covers the groups, the rows (no buttons), the rename box and Back; the owner looked at it on
the Pixel (`bc6fdebd…`) and approved it. The not-connected screens weren't seen on the phone.

The tab count left the closed Island on November 11 too, as on the iPhone since November 5 (#1372). The tab grid
opens with the swipe from the Island into the page; TalkBack hears the count on the address ("Search or switch
tabs, example.com, 3 tabs") and gets a Show all tabs action there. The emulator scripts open the grid with that
swipe and read the count from the grid's header.

The iPhone's pinch into the tab grid is ported in two parts (owner, November 11: "pinch first, motion next"). Part 1,
the gesture: a pinch in on a fully zoomed-out page opens the grid once the fingers close past 0.8 or close quickly
(`PagePinch`, the iPhone's numbers); a zoomed-in page zooms out first. Chromium handles page touches outside the
browser's views (InputOnViz), so the Island hears the gesture events through a native input observer
(`page_pinch_bridge.cc`, patch 0111), alongside the page's own zoom. The grid opens with its present animation. Part
2, the page shrinking into its card under the fingers with the grid behind it, is not built: Android's grid is a
dialog over the page, so it needs the grid moved behind the page and a spike on scaling the page surface.

The Island's layout follows the iPhone's #1463 (opened November 11, not merged at the time of the port): after the
Sunrise mark and the left-aligned address come Stop while a page loads, Back, Forward and New tab. Reload moved into
the Sunrise menu, before Share, where it reads Stop while a page loads, and Settings is the menu's last entry. Opening
the menu gives a light haptic tap. On the Start Page the address reads "Search or type URL", dimmed, while TalkBack
still hears "Start Page"; the owner shortened the shared string on November 11 (#1464 on main, the same edit here) so
it fits a 411dp phone beside Back, Forward and New Tab at the iPhone's 44dp. If #1463 changes in review, this follows
it.

The Start Page's Billboard clock defaults to the iPhone's first-run clock (#1331): Roboto Flex at its tallest (300),
weight 450. `blanc_pages_ui.cc` puts these under the Start Page's appearance settings; Android has no
appearance store yet (A5b), and these are never saved, so a later default reaches everyone who never changed the
clock. The Android clock is solid only (the owner's call, November 13, 2026): the adapter shows every clock as
solid, Font & color offers no Glass or Solid choice (`android-start-page.css`), and Android never saves a clock
style, so a synced Glass stays for the iPhone and desktop. The clock's figures sit at the middle of the screen:
the iPhone's stylesheet centers the clock's box in the page, which on Android starts below the status bar (27 px
low on a Pixel 10 Pro), so the adapter measures the figures from the clock's font and the stylesheet moves the
clock by the difference. The pinned page copies moved from v1.46.0 to v1.47.1, which brings the iPhone's larger
phone clock (30vw, capped at 120px). `pages-phone.mjs` checks the fresh install's clock and that its figures
center on the screen. The layout for the Island along the top is in the next section's Start Page (see "The
Island along the top"). Since A5b the Start Page is the desktop fork's, and
the clock rules above moved with it (next section).

### A5b The fork's Start Page

Plan: `docs/superpowers/plans/2026-11-13-android-a5b-start-page.md`. The owner's direction (November 13, 2026):
the desktop fork's Start Page, Billboard as the one layout with widgets that can be turned on and off, is how
Android works (and how the iPhone will), and its choices stay on the phone, as the iPhone's do.

- **The page:** `chrome://blanc/newtab.html` is the fork's own page (`chromium/blanc/island/pages`), copied byte for
  byte by `tools/android-pages.mjs` into `android/pages/start/` (`pages.json`'s `start` list; `--check` fails on
  drift, and a test fails when the page names a file the list leaves out). The WebUI serves it with
  `<base href="start/">`, so its scripts, styles, images and all-language catalog load from there, and puts
  Android's `android-start.js` and `android-start.css` first. Shipping's v1.47.1 Start Page files and the iPhone's
  phone layout for it (`ios-start-page.*`, `ios-start-rules.js`, `android-start-page.css`) are gone; the other
  pages stay shipping's. The catalog's language is the one Android's other pages use (`ui-language.js`).
- **Phone layout** (`android-start.css`): the clock at the middle of the screen as before (#1504's figure
  centering moved into `android-start.js`), the week's blocked line under it, then the shortcuts and the widgets
  in one column, scrolling with the page; Mahjong and Customize side by side above the Island; Customize and the
  clock's Font & color as sheets over the bottom of the screen, the clock moving to the top as its own preview.
  Card grips and resizing are desktop's (wide windows only). Shortcuts sit four to a row, just above Customize:
  with shortcuts on show the clock moves up to make room (never under the date) and, if that isn't enough,
  shrinks until every row fits; with none its figures stay centered on the screen unless the week's blocked line
  under the clock would reach Customize, which then gets the same room (a 1080×1920 screen put "0 Anzeigen diese
  Woche blockiert" on Anpassen). Before this (November 14,
  #1509 on the owner's Pixel) a tall clock pushed the shortcuts under Customize, behind the footer's dark band.
  A long press on a shortcut or a favorite opens its menu, a sheet over the bottom of the screen (Pin to Start
  Page or Unpin from Start Page, Hide for a ranked site, Open Link in New Tab, Cancel), instead of desktop's
  pin and × buttons, which the owner found too small; they stay for screen readers, out of sight. Each entry
  presses the page's own button. Chromium's link menu doesn't open.
- **Choices:** the fork's adapter (`start/newtab-adapter.js`) runs unchanged and asks native code over
  `blancNewTab`; `PagesHandler::OnStartCall` answers it. Widgets (Favorites, On your other devices), the 1–12
  Shortcuts count, card places and sizes go in the profile pref `blanc.start.widgets` with the fork's validation;
  the clock in `blanc.start.clock` with the fork's field rules but no style: it reads over the iPhone's first-run
  clock (Roboto Flex, 300, 450), never saved, and always reports solid. Patch 0113 registers both. The wallpaper
  and your photo stay in the page's own storage (localStorage and IndexedDB of `chrome://blanc`, in the profile),
  as in the fork. Every open Start Page, private ones included, follows a change at once. Nothing about the Start
  Page syncs (owner, November 13: device-only, like the iPhone); `SyncedSettings` is unchanged.
- **Answered from what Android has:** Favorites (and a refresh when they change), other devices, Sent, the week's
  blocked count (the blocker's `blanc.blocking.week_stats`), Mahjong in a new tab, the Favorites heading, and
  Billboard's shortcuts (below). Empty: tab groups (none on Android's Start Page yet), installed themes, the
  Island's band, Patron, the checklist, What's New. Refused (`not-yet`, A5c): onboarding, default browser,
  Settings from the page, imports.
- **Shortcuts** (November 14): ranked sites and pins, answered as the fork's `NewTabHandler` answers them.
  `topSites` ranks the last 90 days of history (`QueryHistory`, up to 2,000 pages) by every visit to a site,
  one per site with `www.` folded, http(s) only, each shown as its page visited last under that page's title,
  with its icon from the local favicon database (nothing is fetched). Search engines' results pages don't count
  (any engine `TemplateURLService` knows), or every search would put the engine first; its home page does. This
  diverges from desktop, which ranks Chromium's most visited (typed and bookmark visits only): on the owner's
  Pixel that left one shortcut, DuckDuckGo, since a phone reaches most sites from results and links (owner,
  November 14). Pins are the fork's own code
  (`blanc/browser/ui/start_page_pins.inc`: up to eight, http(s) only, titles trimmed to 200) in its pref
  `blanc.prototype.start_page_pins`, which patch 0113 registers. They stay on the phone: the iPhone has no Start
  Page pins, so there is nothing to sync them with. Visits, history deletions and new icons reach every open
  Start Page. A private Start Page shows no shortcuts, as on desktop. The Shortcuts stepper (1–12) sets how many
  show. Not on Android: pinning from the Favorites page (desktop's Favorites sheet can; Android's says it can't,
  as the iPhone's does), and a shortcut's icon is the site's favicon, not a larger touch icon.
- **Ways in:** the Island menu on a Start Page offers Customize first, as on the iPhone, and Settings →
  Appearance has a Start Page row. Both ask through one app preference (`StartPageCustomize`); the Island opens
  `#customize` on the Start Page in view, or on a new one. This is a divergence from the iPhone, whose Start
  Page row opens native Settings screens: the fork keeps these choices in Customize.
- **Footer:** Customize stays above the Island (Mahjong's button is hidden on Android: the game isn't laid out for phones yet; owner, November 14, 2026), as on the iPhone; what scrolls under them goes behind
  shipping's frosted band, tinted from the page's background (a Color's base for Solid and Gradient) so the
  labels read on any wallpaper. The first emulator run showed white labels lost on a cream fade over a blue
  Color wallpaper; this replaced it.
- **Not yet:** a Settings row that opens Customize while several Blanc windows are open opens
  it in each. The fork's all-language catalog (about 1 MB) loads with every Start Page.

| A5b gate | Result | Evidence (`~/blanc-evidence/android/a5b/`) |
| --- | --- | --- |
| `pages-phone.mjs` (fresh install, first-run clock solid and centered, choices saved, choices survive a relaunch, every page in six languages) | 41 of 41 | `pages-phone/`, `pages-phone.log` |
| `start-page-ways.mjs` (the Island menu's Customize and Settings' Start Page row open Customize) | 2 of 2 | `ways/` |
| Robolectric | 808 pass | `robolectric.log` |
| Tool and adapter tests (`node --test chromium/tools/android-*.test.mjs`, on the Mac) | 105 pass | local |
| Patch reconstruction, android and desktop lanes | Pass | local |
| APK (x86_64, emulator) | `50d3d27a…` | `apk.sha256` |
| Owner hands-on, Pixel | **Pending** (no arm64 build yet) | — |

| Shortcuts gate (November 14) | Result | Evidence (`~/blanc-evidence/android/shortcuts/`) |
| --- | --- | --- |
| `start-shortcuts.mjs` (four typed fixture sites ranked by visits, the stepper at 3, a tapped pin leads and survives a relaunch, a second tap unpins and that survives a relaunch, a tap on an icon near its pin opens the site) | 7 of 7 | `shortcuts/` |
| `pages-phone.mjs` | 41 of 41 | `pages-phone/`, `pages-phone.log` |
| `start-page-ways.mjs` | 2 of 2 | `ways/`, `ways.log` |
| Robolectric (no Java changed) | 808 pass | `robolectric.log` |
| Tool and adapter tests (`node --test chromium/tools/android-*.test.mjs`, on the Mac) | 108 pass | local |
| Patch reconstruction, android and desktop lanes | Pass | local |
| APK (x86_64, emulator; arm64, for the Pixel) | `4092f4ff…` / `816aac37…` | `apk.sha256` |
| Owner hands-on, Pixel | Looked at it November 14: pin buttons too small, shortcuts under Customize behind a dark band, one shortcut only. Fixed below | — |

| Long press, ranking and room gate (November 14) | Result | Evidence (`~/blanc-evidence/android/longpress/`) |
| --- | --- | --- |
| `start-shortcuts.mjs` (four typed fixture sites ranked by visits, the stepper at 3, no pin or × on show, a long press opens the menu without opening the site or Chromium's menu, its Pin leads and survives a relaunch, its Unpin and that survives a relaunch, a tap opens the site) | 10 of 10 | `shortcuts/` |
| `pages-phone.mjs` | 41 of 41 | `pages-phone/`, `pages-phone.log` |
| `start-page-ways.mjs` | 2 of 2 | `ways/`, `ways.log` |
| Tool and adapter tests (`node --test chromium/tools/android-*.test.mjs`, on the Mac) | 115 pass | local |
| Patch reconstruction, android and desktop lanes | Pass | local |
| APK (x86_64, emulator; arm64, for the Pixel) | `1d256c58…` / `666f3c54…` | `apk.sha256` |
| Owner hands-on, Pixel | **Pending**: installed November 14 | — |

The check's first two runs failed on the long press: on the emulator a one-second `adb` press sometimes lands as
a tap (it opened the site); 1.8 s worked every time by hand, and the check now holds two seconds.

The first relaunch run failed every choice: the check stopped the app at once, before Chromium had written its
preferences. Each change is now written at once (`CommitPendingWrite`, as the fork does), and the check leaves
Blanc for the home screen before stopping it, as a person would. The setters had worked all along (checked by
hand over DevTools); the check now also fails if saving itself fails.

### A7 Release pipeline and rebase drill

Plan: `docs/superpowers/plans/2026-11-15-android-a7-release.md`. The tooling is written and tested; the
server and Play steps below wait for the owner's approvals.

- **Release build:** `android/args/release-{arm64,x64}.gn` (official, PGO off, release package
  `me.bnfy.blanc`, `blanc_channel = "release"` so no test hooks, lint on). The release version reaches the
  launch ping through `BlancRelease.VERSION`. `android/server/release-build.sh <tag> --previous-map <commit>` builds only a clean,
  tagged commit whose ledger entry matches (`android/release/ledger.json`, codes from 1, names
  `1.0.0-beta.N`) and writes a build record. It also refuses a Chromium checkout that isn't at the pinned
  upstream or that has changes Blanc doesn't apply, and regenerates GN when a release's arguments change.
- **Gates:** `tests/android/release-gate.sh` runs the outbound (privacy) gate, then the acceptance smoke
  set, on the x64 release APK, from a clean runner tree. The exclusions list
  (`release-gate-exclusions.json`) is empty; a scenario that needs a preview hook would have to be listed
  there with that hook and run by hand on the same commit's debug build. Blanc's C++ never reads a test
  switch outside a test-hook guard (`tools/test-hook-guards.test.mjs`).
- **On the owner's Mac:** `android/release/release.mjs` (fetch, verify, sign, attest, upload) checks the
  bundle against the record, signs it with the upload key from 1Password, writes checksums, an SBOM and a
  Sigstore bundle, and uploads a draft release to the internal track only after a typed confirmation;
  the owner rolls the draft out in Play Console (`docs/android/release.md`).
- **About:** Settings → About → Open-source licenses opens Blanc's own notices page, which links to
  `chrome://credits`.
- **Play and Google Cloud** were set up on November 15, 2026 (`docs/android/play-console.md`): the app,
  the upload key, the API service account and the closed-test tester list. Play's automatic protection is
  off.
- **Rebase drill:** `tools/refresh-upstream.py` moves the lane's pin to a new checkout;
  `docs/android/rebase.md` is the procedure and `android/rebase-ledger.json` its record.

| A7 gate | Result |
| --- | --- |
| Tool and runner tests (`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`) | Pass on the Mac, November 15 |
| Release GN args exist at 156.0.8078.79 (`gn args --list`) | Pending (server) |
| First official release build, wall time | Pending (server, owner approval) |
| Release gate on the release APK | Pending (server) |
| Signed bundle verified, SBOM and Sigstore verified | Pending (owner's Mac) |
| Download size for the Pixel 10 Pro (K3) | Pending |
| `1.0.0-beta.1` (code 1) on the internal track installs over Play on the Pixel | Pending (owner) |
| Anything Play's review raises (K5) | Pending |
| Rebase drill: time and cost in the ledger (K4) | Pending (server, owner approval) |

The security clock (design §8.3) applies from the first production release: a stable security release
within 7 days, an exploited-in-the-wild fix within 72 hours, every miss recorded here with its reason.

### The Island along the top on the Start Page

Settings → Island position offers Top, as on the iPhone, and the Start Page now makes room for it there:
the header moves below the Island and the footer, Customize, the clock's settings and the long press's menu
drop to the bottom edge it left. Each of those moves by the Island's height, the iPhone's own rule
(`ios-start-page.css`'s top block), through two variables in `android-start.css`
(`--android-island-above` and `--android-island-below`), so the two layouts can't drift apart.

- **Where the page learns it:** `android-start.js` asks (`blancAndroidIsland`), and `blanc_pages_ui.cc`
  answers from the setting itself, read through `IslandPositionBridge.java`
  (`browser/island_position_bridge.cc`, built in the Island's linked bridge target so no new patch is
  needed). The setting stays only in the app's preferences.
- **No jump on open:** the page keeps the last answer in its own storage and lays out for it before the
  answer comes. A Start Page opened just after the Island moved while none was open still starts from
  the old side for a moment; private Start Pages have no stored answer and start from the bottom.
- **Moving the Island** reloads every open Start Page in that window, as the iPhone does
  (`IslandCoordinator.reloadStartPages`).
- **On the emulator:** `start-island-top.mjs` moves the Island in Settings as a person would and judges
  the layout from what's on screen (UI Automator bounds of the Island, the date and Customize): the bottom
  layout, the move to Top with the open Start Page reloaded, a relaunch, Customize opened with the Island
  on top, and the move back. 5 of 5 on November 14, 2026 (APK `0add18ce…`, the build server's second
  emulator), and the A5c gate runs it. Not yet seen on the Pixel.

### A5c The first minute and the rest of Settings

The A5 row's onboarding and Settings, split in two PRs (owner, November 14, 2026): this one is the
walkthrough and the Settings rows; the launch ping, its native sender and the Worker change adding
`android` come next.

- **The walkthrough** is Blanc for iPhone's (`WalkthroughFlow.swift`, `WalkthroughSheet.swift`): a card over
  the bottom of the Start Page on a fresh install, at the iPhone's sizes. Welcome leads with Pair with your
  Blanc, which opens the Sync screen `/sync` opens (Back returns to Welcome); a join shows What arrived (open
  tabs per device, Favorites, settings, Spaces, counted once the first pass is in), then Share back (Share
  open tabs and the Spaces switch), then Your privacy (Measure usage), then the default-browser offer. A
  phone already paired starts at Share back. Back or the card's × closes it from any step, and it's seen
  once per version (`blanc.walkthrough_completed_version`, device-local). Android's privacy step has
  Measure usage only: Android has no search suggestions yet, so the iPhone's walkthrough version 2 is
  Android's 1 (`WalkthroughFlow.java`). Patch 0114 starts it once the Island exists; background sync
  launches build no Island, so they never show it.
- **Measure usage** is saved only when the privacy step was on screen: Continue saves the switch, and
  closing on that step saves what it shows. A card closed earlier saves nothing, so nothing will be sent
  and Settings → Privacy reads off until the person chooses. This diverges from the iPhone, which saves
  the switch's default when Welcome is swiped away (D38).
- **Default browser** asks with Android's browser-role dialog, at most twice (Android stops showing it to
  someone who turned it down twice), then opens Android's Default apps screen, as it does once Blanc is
  the default. The walkthrough skips the offer when Blanc already is (D4).
- **Language** (under More, as the Settings design places it) offers System and the six languages by their
  endonyms (`AppLanguages.java`, desktop's `i18n-locales.json`). A choice is Android's per-app language
  (`LocaleManager`, or Chromium's own override before Android 13), and Blanc restarts into it at once,
  because Chromium loads its pages' language when it starts and otherwise kills itself on a locale change.
  Patch 0114 names the six as the app's `localeConfig`, so Android's own App languages screen offers the
  same six. A choice made there closes Blanc, which is Chromium's own behavior (seen on the emulator); that the
  next launch then opens in it wasn't checked.
- **Settings rows:** Default browser (Browsing; summary Blanc or Not Blanc), Measure usage (Privacy), Language
  (More) and Show the welcome again (About).
- **Strings:** the iPhone's walkthrough and default-browser copy in all six languages, with four Android
  wordings where the iPhone's names iOS (`android.welcome.shareTitle`, `android.welcome.measureUsageHelp`,
  `android.defaultBrowser.body`, `android.defaultBrowser.open`).
- **Emulator checks skip the card** while `/data/local/tmp/blanc-walkthrough-off` exists, which only a debug
  build reads (`FirstMinute.SKIP_FILE`); every gate script creates it, and `walkthrough.mjs` removes it and
  puts it back.
- **The launch ping** (F21, its own PR) is the iPhone's, in desktop's shape with `platform: "android"`: once
  per process the person opened, when Measure usage is saved on at launch or as soon as it's saved on. Nothing
  leaves before that, and no install id exists until the first send (`LaunchPing.java`). A build with no Blanc
  release version sends nowhere; a debuggable build started with `--blanc-test-ping-host` sends only to that
  loopback collector. The request goes through Chromium's network stack (`launch_ping_bridge.cc`, linked by
  patch 0115), so the outbound gate's NetLog sees it; `launch-ping.mjs` checks both ways on the emulator.
  The ping Worker counts Android under `android:`, apart from desktop and the iPhone, with no GA mirror,
  first-day signals or events, and an `android` block in `/stats`. The owner approved deploying it on
  November 14, 2026, ahead of this PR (version `7955faed…`).
- **Not yet:** pairing in under a minute and the walkthrough on the Pixel wait for the owner.

| A5c gate (November 14, 2026) | Result | Evidence (`~/blanc-evidence/android/a5c-split/`) |
| --- | --- | --- |
| Walkthrough | Pass, 12 of 12 | `lane1/walkthrough/` |
| Launch ping (its PR) | Pass, 5 of 5 | `lane1/launch-ping/` |
| Blanc's pages on a phone | Pass, 41 of 41 | `lane1/pages-phone/` |
| Start Page shortcuts, and the ways into the Start Page | Pass, 10 of 10 and 2 of 2 | `lane1/start-*` |
| A5a: Settings, patch reconstruction (both lanes), Robolectric | Pass: 22 of 22, passed, 904 tests | `lane1/a5a/` |
| A4: Sync, Spaces, Shared Spaces | Pass: 17, 15, 6 of 6 | `lane2/a5a/a4/` |
| A4: shield race | 1 miss in the gate run (the page didn't come back from the back-forward cache), then 3 runs of 2 loads and a 40-load run with none; cause not found | `lane1/a5a/a4/shield-race.log`, `fix-reruns/shield*.log` |
| A3 blocking | 13 of 14 in the run; the Start Page case passes with #1535 | `lane2/a5a/a4/a3/`, `fix-reruns/blocking2.log` |
| A2: tabs, palette, tab grid, find, session restore, Quiet Tabs, tab store | Pass | `lane1/a5a/a4/a3/a2/` |
| A2 acceptance | 23 of 32 in the run; 32 of 32 with #1535 | `lane1/a5a/a4/a3/a2/acceptance/`, `fix-reruns/acceptance/` |
| A1 (JUnit, insets at three sizes, menu, pages, outbound) | Pass | `lane1/a5a/a4/a3/a2/a1/` |
| APK (x86_64, emulator) | `b55c9a2d…` | `lane*/apk.sha256` |

The gate ran across both of the build server's emulators (each lane has its own steps), on one build of A5c
with its launch ping and the Start Page's top Island merged in. The nine acceptance scenarios and the blocking
case failed on main as well: the A5b Start Page (#1506) shows the week's blocked count, not an On/Off state,
and both still read the On/Off field it dropped. #1535 changed the tests; the reruns above are from that change
on the same APK. Shared Spaces passed 6 of 6 with #1531, after failing on November 11 (A5a, above).

### Shield count across a page's commit

The count is fixed in the blocker code desktop shares. A page's first request can
reach the browser before the browser has processed the commit, so it was charged
to the old page or wiped by the page change. Requests from a committing page now
carry that navigation's id, and `shield_page_count.h` holds their blocks until the
commit lands, then drops them if the navigation is abandoned. A page restored from
the back-forward cache keeps its tag.

| Check | Result |
| --- | --- |
| `shield-race.mjs`, attribution off (control) | 6 of 120 loads lost their count |
| `shield-race.mjs`, this fix | 0 of 120, then 0 of 40 in the A4 gate |
| Back-forward cache check | Passes, and fails with the document tag removed |
| `tools/shield-page-count.test.mjs` | Passes |
| Desktop | Patched candidate `macos-6301f30b369c7ed5` (`macos-8597d2d3b8936eee` plus this fix, relinked in a clone, not the live tree): all 9 `ad-blocking.feature` scenarios and the Island's blocked-count scenario pass on macOS |

An iframe's first request can still miss the count, because only the main frame's
factories are tagged. The A4 gate ran on APK
`7874b3de499cb70a521852c7335b227775376aa5390456b8e54da896ef9ff33c`, evidence in
`~/blanc-evidence/android/shield-race/`: sync, Spaces, the race check, blocking and
A1 and A2 passed, and acceptance passed 32 of 32 after the search change below.

The same gate failed the search scenario: DuckDuckGo now sends the build server's
address to its own error page, which drops the search. Blanc had sent the right
address. `duckduckgo.com` is now a fixture host, so the scenario no longer depends
on that site, and a wrong search address still fails it.

<!-- BEGIN GENERATED PROGRESS -->
### Bar A — executable shipping cases on the fork

| Platform | Current-candidate baseline |
| --- | --- |
| macOS | 635/667 executable cases pass; 1 failed; 3 undefined/not run; 28 excluded — [baseline](scenarios/baseline-macos-1400e3914b1a7bdf.json)<br>S1 rows: 260/263 pass; 0 failed; 1 undefined; 2 excluded |
| Windows | Not run for current candidate (previous baseline is stale) |
| Linux x64 | Not run for current candidate (previous baseline is stale) |
| Linux arm64 | Not run (667 cases) |

667 executable cases from 618 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

Android's Bar A counts the shared scenarios bound in `chromium/tests/android/acceptance/` (A2, A3): 32 (F2–F8, F12, F18, and the phone-only F31-11 and F56-1–3), run on the build server's emulator by `run.sh`; desktop cases don't apply to it.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux | Android |
| --- | ---: | ---: | ---: | ---: |
| Not started / unassessed | 2 | 81 | 81 | 69 |
| Research only | 1 | 0 | 0 | 0 |
| Drafted | 0 | 0 | 0 | 0 |
| Implemented | 8 | 0 | 0 | 12 |
| Built, isolated (legacy) | 0 | 0 | 0 | 0 |
| Integrated, partial (legacy) | 0 | 0 | 0 | 0 |
| Integrated | 70 | 0 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 | 0 |
| Total | 81 | 81 | 81 | 81 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-1400e3914b1a7bdf; Windows: windows-x64-dd191713b8f2ad9b; Linux: linux-x64-435fe7054393ac0a, linux-arm64-00d2e79e6743b649; Android: android-arm64-7bd35e94ef746069.
<!-- END GENERATED PROGRESS -->
