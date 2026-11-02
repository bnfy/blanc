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
  - Patch series: 0001–0010 touch all 83 pinned upstream files with 261
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
    uses v1.45.0's catalog, which follows the browser language until S1.8
    replaces its assets.
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
- Utility pages open as Chromium manager tabs, not Blanc's sheet.
- Candidate-bound explicit failures (hooks declare the surface absent, re-check
  when assets change): Mahjong reads (no Mahjong page), utility-sheet reads,
  Glance-card reads (Glance is a split preview).

## Native-versus-port decisions (owner, 2026-10-31)
Recorded in the spec (§4, §9) and plan:
- D1: port shipping's in-window private tabs (deep tab/profile patch, isolated
  in `blanc/private/`). S1.4 unblocked.
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
`holdIsland` (shipping's `holdIslandInWindow`). Identified, not
built: sessionWindows (session.json-shaped projection); certificate decision
list/forget/cap; history visit + site icon seed; favorite favicon seed;
first-run/checklist/Patron/launch-Sunrise state once stored; address context menu
list/run; overlay drag flag; microphone capture seed.

## Next
1. S1.2 rest: all 34 slash commands (deferred features
   answer with shipping's unavailable copy), zoom, copy/clean link, and the
   browserAPI members the host doesn't answer yet. Verify each change with targeted `--only` runs
   merged by `tests/merge-baseline.mjs`. Owner, 2026-10-31: no full S1 run
   (~2 h) unless development can't continue without it; propose one with
   the reason first.
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
| Windows | Not run (627 cases) |
| Linux | Not run (627 cases) |

627 executable cases from 578 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux |
| --- | ---: | ---: | ---: |
| Not started / unassessed | 42 | 79 | 79 |
| Research only | 1 | 0 | 0 |
| Drafted | 11 | 0 | 0 |
| Implemented | 0 | 0 | 0 |
| Built, isolated (legacy) | 9 | 0 | 0 |
| Integrated, partial (legacy) | 16 | 0 | 0 |
| Integrated | 0 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 |
| Total | 79 | 79 | 79 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-55a329977de3035f; Windows: none; Linux: none.
<!-- END GENERATED PROGRESS -->
