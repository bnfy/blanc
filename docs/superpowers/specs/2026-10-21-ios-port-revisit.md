# Blanc for iOS: revisiting the exploration (October 2026)

**Date:** 2026-10-21
**Status:** Assessment, then decision: on 2026-10-21 the owner chose to move forward with an iOS product. §6 is the updated plan.
**Revisits:** [`2026-07-07-ios-port-roadmap-design.md`](2026-07-07-ios-port-roadmap-design.md) and the M2–M5 specs and M0–M5 plans that followed it.

## Summary

Blanc has never shipped a mobile app. Between July 7 and 10, 2026 an
exploratory iOS prototype was built in `ios/` through roadmap milestones
M0–M6 (PR #28 was the last substantive change). It was never uploaded to
TestFlight, never given to testers, and nobody outside development has run it.
Since July 10 only brand and icon commits have touched `ios/`.

In those three months the desktop app, and the `spec/` contract the port was
meant to follow, moved a long way. The contract grew from 24 to 51 features and
from 15 to 28 divergences, and the acceptance suite from 49 to 476 scenarios.
The prototype has fallen behind and now breaks on its own start page. The iOS
platform also moved: iOS 17, the planned minimum, is now a small minority, and
iOS 18.4 added a WebExtension API that changes the blocking options.

The July roadmap's shape (thin beta first, then vertical slices) still holds up.
Its baseline doesn't: if work resumes, it should start with a re-baseline
milestone, not M7. Section 5 lists the decisions that are the owner's to make.

## 1. What actually exists

From the source in `ios/Blanc` (it was not built for this review: there is no
Xcode on the review machine and no iOS job in CI):

| Milestone (July plan) | State in the repo |
|---|---|
| M0–M1 single-tab browser | Done: `AddressNormalizer.swift`, `OSHandoff.swift`, back/forward/reload in `TabNavigationDelegate.swift` |
| M2 multi-tab | Done: `TabsManager.swift`, pill with tab dots, Liquid Glass with a token fallback (D15) |
| M3 palette | Partial, as planned: `PaletteSheet.swift`, `QuickSwitcher.swift`; two slash commands (`/new`, `/close`) |
| M4 `blanc://` pages | Stub level: `BlancSchemeHandler.swift` serves the desktop pages; `PagesBridge.swift` returns empty or default data except `settings.get/set` |
| M5 ad blocking | Done as specified: one `WKContentRuleList` from `adblock/generated/blocklist.json` (108,342 rules, filter sources pinned 2026-07-09), compiled and cached off the launch path, binary shield |
| M6 theming, settings-lite, session restore | Code is in; signing team, bundle id `me.bnfy.blanc`, version 0.1.0 (1) and an iOS 17 target are set. No entitlements file, no export options, no upload. There is no M6 spec or plan document. |

About 1,600 lines of app Swift plus 14 XCTest files (121 cases passed on an
iPhone 17 Pro simulator on July 10; they have not run since). Nothing records a
request for the default-browser entitlement (`com.apple.developer.web-browser`),
which the M0–M1 plan asked to start early.

## 2. What has broken or gone stale

### The prototype itself

- **The start page fails to load.** Since 2026-10-09 (a677edc0) every
  `blanc://` page loads `strings.js` and `i18n.js`. On desktop `strings.js` is
  generated per language by `src/main/pages-assets.js`; no such file exists on
  disk. `BlancSchemeHandler.swift:52-66` serves only bundled files, so the
  request fails, `blancI18n` is never defined, and `newtab.js:3` throws. The
  other pages very likely fail the same way.
- **The pages bridge covers a fraction of the desktop API.** Desktop's
  `bowserPages` (`src/main/tab-preload.js`, `browser-api/bridges.json`) now has
  `surface.*`, `start.topSites`/`onVisibility`/`onRemoteTabs`, wallpapers,
  `archive.*`, Favorites import and more. newtab.js calls some of them without
  a guard. `start.data` returns two fields where newtab now reads about a dozen.
- **The substrate copies are stale.** `ios/Blanc/Tokens.swift` and
  `ios/Blanc/BlancSettings.swift` are copies from July 8, not links to the
  generated files, and nothing checks them. They predate Sunrise (wrong
  palette, missing island, space, radius and type tokens), still offer the
  retired `paper`/`ink` icons, and lack the settings added since (8 keys then,
  26 now). Only `SlashCommands.strings` is a symlink. The generated files
  themselves are current, guarded by `substrate:check`.
  `copy/generated/ios/Localizable.xcstrings` is generated but nothing reads it.
- **No CI.** The XCTests never run, and `SubstrateTests.swift` only checks the
  stale copies against themselves.

### The contract in `spec/`

- **Statuses read as if iOS shipped.** `spec/parity-matrix.md` marks iOS F15
  `SHIPPED` and F1, F2, F5, F6, F7, F12, F14, F16, F18 `PARTIAL`, values
  unchanged since July 10. They mean "implemented in an unreleased prototype".
  Meanwhile `spec/README.md:13` still says every mobile cell is `PLANNED`.
  Neither describes the truth.
- **New features with no or invalid iOS treatment.** F25 (encrypted DNS), F26
  (WebRTC privacy) and F39 (certificate safety) have no matrix row; F41 Spaces,
  F45 Arc Spaces import and F46 custom tab names show `—`, which isn't a legal
  status. D11's text doesn't list F53 Split View although the matrix cites it.
- **Desktop blocking described as it was in July.** `spec/blocking-backends.md`,
  D1 and D13 know only the Ghostery engine. Nothing in `spec/` mentions Blanc
  Blocker by name, the optional uBlock Origin provider (v1.27.0), its private-tab
  rule, or Dark websites (F42) consulting the tab's blocker.
- **Retired names and decisions.** D5 still says Patron unlocks Spaces creation
  and talks of a "supporter" spec, although Spaces are free and Patron unlocks
  nothing. F14's settings table lists the `paper`/`ink` icons and a
  `supporter` key. The acceptance suite still has `supporter-and-session.feature`
  and `F41-named-workspaces.feature`. No iOS step definitions exist; the
  `index.md` iOS column is 0 ✅, 110 ⬜, 131 ➖.

### Public and press surfaces

These are consistent with "not shipped" and need no change:
`site/src/data/roadmap.json` ("Blanc on iPhone", later, "isn't ready for
testers yet"), the privacy and terms pages, `docs/press/known-limitations.md`,
and `docs/blanc-brief.md`. One historic changelog line in
`site/src/data/releases.json` reads "iOS M6: theming, settings-lite, session
restore, TestFlight prep". It is a record of past work and stays as is, but
nothing should quote it as evidence of a TestFlight build.

## 3. What changed on the iOS platform

Researched on 2026-10-21. Treat secondhand items as leads to confirm before
they drive a decision.

- **The minimum version.** iOS 27 shipped in September 2026 (secondhand:
  MacRumors) on the same devices as iOS 26. Apple's June 2026 figures put iOS 26
  on 79% of compatible iPhones, iOS 18 on 11%, and everything older on 3%. An
  iOS 17 minimum now buys almost nothing.
- **WebExtensions in apps.** `WKWebExtension`, `WKWebExtensionController` and
  `WKWebExtensionContext` are available on iOS 18.4 and later
  ([Apple docs](https://developer.apple.com/documentation/webkit/wkwebextension)),
  including the `declarativeNetRequest` permission. An app can host DNR-based
  extensions itself. `webRequest` blocking still isn't available, so this
  doesn't bring uBlock Origin's full MV2 model to iOS. It is a second
  declarative path beside `WKContentRuleList`.
- **Content blockers.** Still declarative, still silent: no per-request
  callbacks, so D13's binary shield remains right. The per-list limit is
  undocumented; Apple's forums cite 150,000 rules, and an app can attach several
  lists. WWDC26's WebKit session added nothing for browser apps.
- **SwiftUI `WebView` and `WebPage`** (iOS 26) wrap WKWebView with observable
  title, URL, progress and history state. They would replace some of the
  prototype's `UIViewRepresentable` code if the minimum were iOS 26.
- **Default-browser entitlement.** Still a managed request
  ([Apple](https://developer.apple.com/documentation/xcode/preparing-your-app-to-be-the-default-browser)).
  The app must open straight to the requested URL, show an address field,
  search or bookmarks at launch, and avoid several Info.plist usage keys (full
  photo library, Always location, HomeKit, Bluetooth Always, Health). The
  passkey browser entitlement has its own form, which only the Account Holder
  can submit; whether it covers iOS is unclear (an open forum question).
- **Alternative engines.** BrowserEngineKit is allowed in the EU (iOS 17.4+)
  and in Japan (iOS 26.2+), each as a region-only app with heavy security
  obligations. No indie Blink or Gecko browser is known to have shipped under
  it. For one maintainer it is not realistic, which also matches the October 5
  decision that a Chromium fork is unsustainable. Blanc on iOS is a WebKit
  browser, as D1 already says.
- **Peers.** Orion (Kagi) ships built-in blocking and partial extension
  support on iOS. Brave converts adblock-rust rules into Apple's content-blocker
  format and adds cosmetic filtering through user scripts. DuckDuckGo applies
  its own tracker list as rule lists. The Browser Company was acquired by
  Atlassian (secondhand), and Arc Search is no longer its focus.

## 4. Does the July plan still hold?

- **Sequencing:** yes. Thin beta first, vertical slices, crude blocking early
  and the full pipeline (M15) later is still the right shape for one person
  learning iOS.
- **Baseline:** no. M7 can't start on a prototype whose start page throws and
  whose tokens predate the current brand. A re-baseline milestone comes first.
- **Minimum version (§7):** revisit. iOS 18.4 is the lowest floor worth
  having (WKWebExtension); iOS 26 is defensible given adoption and SwiftUI
  `WebView`.
- **Blocking (§5.2–5.4, D13, D14):** the decisions stand. Two refinements are
  worth adding to the M15 spec when it is written: Brave-style cosmetic
  filtering through `WKUserScript` as a deliberate widening of D14, and
  WKWebExtension DNR as an alternative or complement to rule lists. Both need
  measurement before any claim, under `docs/marketing-claims.md`.
- **Scope:** the parity target is now about twice as large as in July. Many new
  desktop features are rightly N/A on a phone (windows, profiles, Glance, Split
  View, 1Password, wallpapers), but Spaces, groups with colors, Quiet Tabs
  semantics, Bangs, Interface language and Tab Sync all land on mobile.
- **Monetization (§5.5, M13):** the premise changed. Patron unlocks nothing,
  so a StoreKit purchase would be support, not an unlock, and the D5
  cross-honor mechanism matters much less.

### If work resumes: a re-baseline milestone (call it M6.5)

1. Raise the deployment target to the chosen floor.
2. Replace the stale `Tokens.swift`/`BlancSettings.swift` copies with references
   to the generated files, as `SlashCommands.strings` already is, so
   `substrate:check` guards iOS too.
3. Serve `strings.js` from the scheme handler as desktop does (the active
   catalog plus formatting locale), and add an iOS case to the pages that throw
   on missing bridge methods, or stub every method in `bridges.json`.
4. Add a macOS CI job that builds the app and runs the XCTests.
5. Request the default-browser entitlement, since its lead time is outside the
   project's control.
6. Bring the `spec/` iOS column back to the truth (see decision 3).
7. Then make the first real TestFlight upload, which M6 only prepared.

## 5. Decisions for the owner

1. **Resume, pause, or retire the iOS track.** Desktop releases weekly with one
   maintainer, the same constraint that decided the October 5 platform question.
   A paused track should say so: mark the July roadmap paused and keep `ios/`
   as reference, so it is not mistaken for something in progress.
2. **Minimum iOS version** if resumed: 18.4 or 26 (both are reasonable; 17 isn't).
3. **What the iOS column in `spec/` means.** Recommended: reserve `SHIPPED` for
   a released app and record prototype work as `PARTIAL` or `PLANNED` with a
   note, then add the missing F25, F26 and F39 rows and replace each `—` with a
   status. Whichever is chosen, `spec/README.md`'s "every mobile cell is
   PLANNED" line should match it.
4. **Separately, regardless of iOS:** bring the blocking spec and D5 up to date
   with desktop (Blanc Blocker, optional uBO, Patron unlocking nothing). That
   is desktop contract hygiene and is worth doing even if the iOS track is
   retired.

## 6. Decision and updated plan (2026-10-21)

**Decision (owner, 2026-10-21): resume.** Blanc moves forward with an iOS
product. The market audit done the same day,
[`docs/research/2026-10-21-mobile-browser-market-audit.md`](../../research/2026-10-21-mobile-browser-market-audit.md),
sets its positioning and its tests. Its figures came partly from search
extracts and must be re-checked before any public use under
`docs/marketing-claims.md`.

**Minimum iOS version: 18.4.** It keeps the prototype's UIKit-hosted
`WKWebView` and makes `WKWebExtension` available for the M15 blocking work.
iOS 26 stays open as a later raise if SwiftUI `WebView` earns it.

### Positioning: a companion, not a challenger

The audit's conclusion: a standalone iPhone browser has no ROI case, because
every iOS browser blocks through the same `WKContentRuleList` and Chrome and
Safari hold about 92% of mobile use. What no one offers is an open-source,
AI-free, design-led iPhone browser that arrives already holding your desktop
Blanc's tabs, Favorites and groups over end-to-end-encrypted sync. Quiche
refuses sync and has no desktop app; Orion is closed source.

So the iOS product is **"your Blanc, in your pocket"**: pair the phone, see the
desktop's open tabs, send a tab back, and use the bottom Island with the Quick
Switcher, slash commands and Bangs. Blocking ships on by default but is not the
pitch: Blanc never claims to block better than Brave or DuckDuckGo on iOS.

### The revised ladder

The July sequencing stands; what changes is the order after M6, so the first
TestFlight build is the companion, not a generic browser.

| M | Delivers | spec | Status |
|---|---|---|---|
| M0–M6 | Prototype: tabs, palette, `blanc://` pages, one rule list, theming, settings-lite, session restore | F1, F2, F5–F7, F12, F14–F16, F18 | Built July 2026, unreleased |
| **M6.5** | Re-baseline (below) | — | This PR |
| **Duo-1** | iPhone Duo foundation: iOS 27.1 SDK build, edge to edge on both displays, the regular-width pill and in-place palette, fold continuity, CI on the Duo simulator ([design](2026-10-21-ios-iphone-duo-design.md)) | F1, F6, D30 | After M6.5 |
| **M7** | Profile Sync on iOS: pairing code, Favorites and settings, Other devices (desktop open tabs), send a tab to a device ([design](2026-10-23-ios-m7-profile-sync-design.md); M7a [plan](../plans/2026-10-23-ios-m7a-sync-foundation.md), M7b [design](2026-10-24-ios-m7b-send-to-device-design.md) and [plan](../plans/2026-10-24-ios-m7b-send-to-device.md)) | F27, F9 (read) | M7a merged (#1068), unreleased; packaged-desktop pairing passed, real-iPhone check is a gate before TestFlight. M7b designed and planned; needs a Worker deploy before any client release offers it. |
| **M8** | Favorites and History, live on the `blanc://` pages | F9, F10 | |
| **M9** | Private tabs | F4 | |
| **M10** | Groups and Spaces from sync, shown read-only on the phone; Bangs; the full shared slash-command set; Find in page | F3, F41 (read), F47, F7, F8 | |
| **Duo-2** | Two-pane Split View and floating Glance at regular width (the Duo's inner display) | F53, F34, D30 | With M10 |
| **M11** | Tab gestures: swipe the pill sideways to switch tabs, flick a tab up to close it ([feedback plan §7](2026-10-23-ios-user-feedback-plan.md)) | F56 | Added 2026-10-24 from Arc users' requests; switcher layout is the owner's choice |
| **Beta** | First TestFlight upload, with the default-browser entitlement | D4 | Cut line |
| Later | Editing groups and Spaces on the phone, downloads, permissions, passkeys, Quiet Tabs semantics, interface language (D27), the full filter pipeline (M15, now including `WKWebExtension` DNR and user-script cosmetics as options) | F3, F11, F13, F24, F31, F44, F12 | After the beta |
| Later (Duo-3) | The side list from synced groups and Spaces, tabletop video, multiple windows | F28, F32, D30 | After the beta |
| Out | iPad-specific work (an iPad gets the regular layout for free), Android, an in-app Patron purchase | D7, D11, F17 | Until the indicators below are met |

**User feedback (2026-10-23).** A mobile user's wish list was mapped onto this
ladder ([plan](2026-10-23-ios-user-feedback-plan.md)): Tab Sync on iPhone and
an explicit Send to device stay in M7; M10's Spaces need a desktop Spaces sync
step first (opt-in, end-to-end encrypted, reversing F41's "never sync"); a
Pill position Bottom/Top setting joins *Later*; AI summaries are declined.
On 2026-10-24 Arc users' two tab gestures (swipe the bottom bar to switch tabs,
swipe up to close one) became F56 in a new milestone, **M11**, before the
beta.

### M6.5: the re-baseline

Done in this PR:

1. Deployment target raised to iOS 18.4.
2. `ios/Blanc/Tokens.swift` and `BlancSettings.swift` are now symlinks to the
   generated files, so `substrate:check` guards what the app compiles.
   Generating them exposed a real bug: the Swift app-icon cases used the case
   name as the raw value (`sunriseDark`, not the stored `sunrise-dark`).
   `settings-schema/build.mjs` now emits explicit raw values.
3. The scheme handler answers the virtual `strings.js` with the catalog desktop
   would pick for the same system languages, plus the formatting locale, and
   serves Mahjong, fonts and WebP.
4. `window.bowserPages` is built from the bundled `browser-api/bridges.json`,
   filtered per host exactly as `tab-preload.js` does, so every member desktop
   pages call exists. Methods iOS doesn't answer yet reject instead of being
   missing; events return an unsubscribe. Args are now positional, as on
   desktop.
5. Kagi search; a stored `custom` engine falls back to DuckDuckGo until iOS
   offers the template field. Settings gets the flat icon list and
   `patronActive`.
6. CI: `.github/workflows/ios.yml` builds the app and runs the XCTests on a
   simulator whenever the app or one of its bundled inputs changes, and
   `test/unit/ios-pages-bridge.test.js` holds the Swift side to the desktop
   sources from the Linux unit suite.

Owner actions, outside the code:

- Request the default-browser entitlement (`com.apple.developer.web-browser`)
  now; its review time is outside the project's control.
- Decide what `SHIPPED` means in the iOS column (decision 3 above). Until
  then, read every iOS `SHIPPED`/`PARTIAL` as "in the unreleased prototype".

### Indicators and kill criteria

Set before launch so a slow fade can't happen by default. Thresholds are the
audit's proposals for the owner to confirm; no benchmark exists for them.

| Signal | Healthy | Trigger |
|---|---|---|
| Desktop waitlist (before M7 ends) | ≥100 sign-ups or 10% of Mac actives in six weeks | <25 |
| TestFlight seven-day return | ≥30% | <15% |
| Desktop Sync users who pair an iPhone within 60 days | ≥15% | <5% |
| 30-day retention | ≥15% | <8% for two monthly cohorts |
| iPhone monthly actives six months after launch | ≥750 | <200 |
| Maintainer time on iOS | ≤25% | >35% for two quarters |

If two triggers fire at the six-month review, iOS moves to maintenance only or
an announced sunset, never a quiet stall. The biggest risk is not too few users
but a second platform eating the one maintainer's time, as it did for Orion on
Windows and Linux.

The money case is weak and stays honest: the base case earns a few hundred
dollars a year. The return is strategic (completing the product people ask for,
desktop retention, grant eligibility), and the desktop numbers it rests on
(43 monthly actives at the last recorded count, August 20) need refreshing from
the `blanc-ping` Worker and Polar before the waitlist test.

