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
- **Extension side panels as Start Page cards (2026-11-13, owner: "Prototype
  it"; fork only, prototype):** an installed extension with a side panel
  (`chrome.sidePanel`, `side_panel.default_path`) appears in Customize as one
  more widget tile. Turned on, it becomes a card in the side columns, moved
  like the others, and Blanc draws the extension's own panel page over the
  card's slot: Chromium's side panel host (`CreateSidePanelHost`) in an
  `ExtensionViewViews` below the Island, in the extension's process, never
  inside the Start Page. The page reports the slot's place on every move;
  panels hide under popovers, while a card is dragged and on other tabs, and
  close with the page. Private Start Pages show a note instead. The enabled
  panels are saved with the widgets (`panels`, cards `ext:<id>`). Test
  `chromium/tests/native-start-panels.mjs` (sample extension in
  `tests/fixtures/side-panel-extension`, loaded by the gated
  `testLoadUnpacked`): 3/3. Not yet: the panel's own height, keyboard focus
  between page and panel, and a check with real Web Store extensions.
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

## Android
Plan: `docs/superpowers/plans/2026-11-03-android-port.md` (design and plan in
[PR #1333](https://github.com/bnfy/blanc/pull/1333)). Milestones: **A0
Foundation**, 5 of 6 exit gates passed on the emulator, and **A1 Island and
pages**, **A2 Tabs, groups, palette and tab grid** and **A3 Blocking**, every
emulator gate passed (below); the Pixel runs wait for the device. **A4 Sync** is in three PRs; A4a (the runner, keys, pairing and Profile Sync) is below. Owner approved the download and cold builds on 2026-11-03.

- **Lane:** Chrome stable for Android 156.0.8078.79, chromium
  `a21ce95c24ce3964416f09ae1862f53f319eb4d0` (chromiumdash, 2026-11-03).
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

- **Not built (A5b, A5c):** Start page layout, wallpaper and clock, the default-browser row, Language, Measure
  usage and onboarding.
- **Known gaps:** Chromium's own default search engine follows Blanc's choice only after Settings has been
  opened (a startup sync is a follow-up); Settings asks the sync runner for its status on every update; the
  Open-source licenses row opens Chromium's legal page, which the wording scan doesn't cover.

| A5a gate | Result | Evidence (`~/blanc-evidence/android/a5a-gate/`) |
| --- | --- | --- |
| Settings on the emulator (rows, order, wording, every row, every way in, no crash) | Pass, 15 checks | `settings/`, `settings.log` |
| Patch reconstruction, android and desktop lanes | Pass | `patches-*.log` |
| Robolectric | 676 pass | `robolectric.log` |
| Runner and tool tests (`node --test chromium/tools/*.test.mjs`, on the Mac) | 216 pass | local |
| A4 gate (A1 to A3, sync, Spaces, Shared Spaces, shield race) | Pass | `a4/` |
| APK (x86_64, emulator) | `b57a4ca6…` | `apk.sha256` |
| APK (arm64, for the Pixel) | `fed28dc1…` (`out/AndroidDebug/apks/ChromePublic.apk`, built; not yet installed) | — |
| Owner hands-on, Pixel and desktop (Sync through Settings) | **Pending** | — |

The first full run failed twice: the A3 check "quick endings stop pages, and Retry recovers" slept a fixed six
seconds and looked once for its notice (it passed alone; it now waits up to 30 s), and the tools tests need iOS
fixtures the server lacks (they run on the Mac). An earlier standalone Settings run had failed
`blanc://settings#privacy` once; it passed in both gate runs, cause not found, so it stays watched.

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
| macOS | Not run for current candidate (previous baseline is stale) |
| Windows | Not run (640 cases) |
| Linux | Not run (640 cases) |

640 executable cases from 591 declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.

Android's Bar A counts the shared scenarios bound in `chromium/tests/android/acceptance/` (A2, A3): 32 (F2–F8, F12, F18, and the phone-only F31-11 and F56-1–3), run on the build server's emulator by `run.sh`; desktop cases don't apply to it.

### Bar B — requirement rows by platform

| State | macOS | Windows | Linux | Android |
| --- | ---: | ---: | ---: | ---: |
| Not started / unassessed | 24 | 81 | 81 | 69 |
| Research only | 1 | 0 | 0 | 0 |
| Drafted | 5 | 0 | 0 | 0 |
| Implemented | 6 | 0 | 0 | 12 |
| Built, isolated (legacy) | 4 | 0 | 0 | 0 |
| Integrated, partial (legacy) | 3 | 0 | 0 | 0 |
| Integrated | 38 | 0 | 0 | 0 |
| Verification needs recheck | 0 | 0 | 0 | 0 |
| Verified | 0 | 0 | 0 | 0 |
| Release-ready | 0 | 0 | 0 | 0 |
| Total | 81 | 81 | 81 | 81 |

Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.

Candidate identities: macOS: macos-76499bdaedc849fc; Windows: none; Linux: none; Android: android-arm64-7bd35e94ef746069.
<!-- END GENERATED PROGRESS -->
