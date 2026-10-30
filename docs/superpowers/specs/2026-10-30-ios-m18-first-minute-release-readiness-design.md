# iOS M18: the first minute and release readiness

**Date:** 2026-10-30
**Status:** Design for the owner's review.
**Parent:** [`2026-10-24-ios-v1-companion-release-design.md`](2026-10-24-ios-v1-companion-release-design.md)
(the 1.0 contract): §3 (the first minute), §6 (the audit, F21 and the phone-only
needs), §7 (the ladder), §8 (constraints). This document does not repeat them.
**Builds on:** [`2026-10-28-easy-iphone-pairing-design.md`](2026-10-28-easy-iphone-pairing-design.md)
§7 (Pair with your Blanc, the scanner, the pair link; #1235) and the
`http`/`https` link handling of #1224. M18 reuses both and rebuilds neither.
**Owner decisions, 2026-10-30:**
1. Scope is the 1.0 design's M18 as written: the walkthrough, the parts of
   default browser that don't need Apple's grant, a share-sheet target,
   Background App Refresh, the native strings in six languages, the launch
   ping, and the App Store listing.
2. Order is groundwork first (§9): native strings and Background App Refresh,
   then the walkthrough, then the ping, then the share sheet, then the
   listing.
3. The walkthrough is a **card over the start page** (direction B of three
   shown: a sheet rising over the real start page and the Island, each step
   swapping the card's content). The full-screen setup pages and the
   Finish setup checklist were not chosen.
4. The share-sheet target is a **share extension**: Blanc's icon in the
   sheet's row of apps, as Chrome and Firefox do. Not an action row.

---

## 1. Why

Everything M18 adds is what stands between the TestFlight beta and the App
Store: a first launch that leads with pairing, the ways a link reaches Blanc
from the rest of the phone, a phone that is already in sync when it's picked up,
an app that speaks the person's language end to end, the one number the kill
criteria need (seven-day and 30-day return), and a listing whose every claim a
release backs.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A fresh install opens on the walkthrough; pairing is its first action and
   takes under a minute with the desktop's QR or code.
2. After pairing, the person sees what arrived, in numbers, before they leave
   the card.
3. A link shared from any app, or opened from any app once Blanc is the default
   browser, opens in a new Blanc tab.
4. A phone picked up after an hour in a pocket shows the desktop's changes
   without waiting for a pass (best effort; iOS decides when).
5. Every word the app draws natively is in the catalog, in English, German,
   Spanish, French, Brazilian Portuguese and Italian, and follows the iOS
   per-app language setting.
6. One launch ping per app session, only after the person has seen and saved
   the privacy choice, counted apart from desktop.
7. A listing (description, keywords, screenshots, release notes) the owner
   signs off, with every claim traceable to the release it ships in.

**Non-goals**

- A walkthrough step for anything the 1.0 design puts after 1.0 (search
  suggestions don't exist on the phone; Bangs, Patron, wallpapers).
- Sending a page *to another device* from the share sheet while in another
  app (1.0 design §6: after 1.0).
- Product events or first-day signals from the phone (F21: launch ping only).
- Turning on the default-browser entitlement. Apple has not granted it
  (request `P2X5BCD4C9`); `Blanc.entitlements` stays empty until it does, and
  that change is its own PR made together with the portal switch
  (`docs/ios/app-store-connect.md` item 4).
- Uploading to TestFlight, submitting for review or changing App Store
  Connect. Each needs the owner's explicit yes, every time.

**Anti-goals** (failure even if it works)

- A walkthrough that blocks the browser: it can always be closed, and closing
  it never loses a choice already made.
- Any network request governed by the privacy choice before it is saved.
- A share extension that loads the page itself, keeps what it was given, or
  reaches the network.
- A background pass that creates a `WKWebView`, changes the open tabs or
  closes the page the person was on (1.0 design §4.6).
- English left in a guarded Swift file, or a translation shipped stale.
- A listing claim that only a design, plan or draft PR backs.

## 3. The walkthrough

### 3.1 Form

A sheet over `ContentView` on the start page, presented on the first launch
after install (and on replay). It uses the app's existing sheet conventions:
`.presentationDetents` sized to the card's content (no full-screen cover), the
grabber, the start page and Island visible above it. Each step replaces the
card's content with a short cross-fade; there are no page dots. From step 2 on
the card has a close button (✕). The Sunrise mark heads the Welcome card only.

Text is first-draft in the mockups; the copy below is the proposal for review,
all of it new catalog keys under `ios.welcome.*`.

### 3.2 Steps

1. **Welcome.** "Your Blanc, in your pocket." / "Bring the tabs, Spaces and
   Favorites from Blanc on your computer." Primary **Pair with your Blanc**;
   quiet **Browse without pairing**. No ✕ here: one of the two answers is the
   way on. Swiping the sheet down counts as Browse without pairing.
2. **Pair.** The card hosts the existing pairing flow (the pairing design's
   §7.1 form: the scanner first, the code field, Other ways to join). Today
   that flow is inline in `SyncSettingsView` (with `PairScannerSheet`); PR 3
   first extracts it into a `PairWithBlancView` that Settings → Sync and the
   walkthrough both use, unchanged in behavior. The walkthrough only replaces
   "what happens after success."
3. **What arrived.** "Connected to “{sync}”" over "Here's what arrived": rows
   for open tabs per device ("Open tabs on {device}", the count), Favorites
   (count), Your settings (✓), and Spaces (count) when the desktop shares
   them. The counts come from the first sync pass after joining; while it
   runs, the rows show a progress state and the button reads Continue anyway
   (it never waits on the network). When no Spaces arrived, the last row is
   the pairing design's "where to turn it on" line instead of a count
   (Settings → Sync on the computer). **Continue**.
4. **Share back.** The two switches, both off by default, each with its one
   line: **Share this iPhone's open tabs** (F27 consent, today's
   `shareTabs` setting) and **Keep Spaces and groups in sync on this iPhone**
   (the M17 per-device switch). The card writes the same settings Settings →
   Sync writes; it holds no state of its own. Turning the Spaces switch on does
   what it does in Settings: it opens the same Spaces chooser
   (`SyncSettingsView`'s sheet) over the card, and the card continues when the
   chooser closes. *My call:* one behavior for one switch. **Continue**.
5. **Privacy.** One switch, **Measure usage** (the copy names the one launch
   ping and links to blanc.day/privacy), on by default (F21). **Continue**
   saves it. Closing the card at this step or any earlier one saves the value
   on screen (or the default if the step was never shown), as desktop F36
   does: the ping (§7) waits for a saved choice, never for the walkthrough.
6. **Default browser.** Shown only when `UIApplication.shared.isDefault(.webBrowser)`
   answers false or throws (§5). "Open links in Blanc" / "Make Blanc your
   default browser so links from Messages, Mail and other apps open here."
   **Open Settings** (opens `UIApplication.openDefaultApplicationsSettingsURLString`)
   and **Not now**. Coming back from Settings re-checks once; when Blanc is
   now the default the card reads "Blanc is your default browser" with
   **Done** for a moment, then closes.
7. **Done.** The card closes onto the start page, which already shows the
   desktop's Spaces and devices.

**Browse without pairing** goes 1 → 5 → 6 → done. A person who closes the card
gets no more of it; Settings gains **Show the welcome again** (§3.3).

### 3.3 State and replay

- `walkthroughCompletedVersion` (an integer, today 1) in the app's own
  settings, device-local, never synced. Set when the card closes by any path.
  A later walkthrough version re-shows only the new steps; M18 ships version 1.
- The privacy choice is the device-local `usagePing` (desktop's name), written
  only when the person saves or skips step 5. The shared default
  (`BlancSettingsDefaults.usagePing = true`) is what the switch *shows*; the
  ping reads whether a value was **saved** (a stored key, not the default), and
  an unsaved choice means "don't ping." *My call:* the default stays true as
  the schema says, so the switch and Settings show desktop's default.
- Existing TestFlight installs (already paired or not) see the walkthrough
  once after updating, starting at Welcome if not paired, or at step 4 if
  already paired (pairing and What arrived make no sense twice). *My call:*
  testers need to make the privacy choice like everyone else; a paired tester
  shouldn't be told to pair.
- **Show the welcome again** in Settings (About section) replays from Welcome
  for an unpaired phone and from step 4 for a paired one.
- A pairing link from the Camera app (`PairLinkRequest`) that arrives during
  the walkthrough goes through the existing confirmation and, on success,
  lands the walkthrough on step 3. It never joins without the confirmation.
- The card isn't shown in a private tab's theme: if the app restores into a
  private tab on first launch (it can't, but a replay can be asked from one),
  the card still draws in the ordinary theme.

### 3.4 Tests

Unit: the step machine (each path, close at every step, already-paired entry,
the pair-link entry). UI: fresh install shows Welcome; Browse without pairing
reaches Privacy and Default browser; closing at Welcome saves the default and
never shows the card again; Settings replay. The default-browser step is
driven through a seam over `isDefault`, since the simulator can't change the
default browser.

## 4. Native strings in six languages (F44, D27)

- **What moves.** Every user-visible string Swift draws: `Text`, `Button`,
  `Label`, `TextField` prompts, navigation titles, accessibility labels and
  hints, alert and confirmation text, menu items. A first count found about 40
  literals left, mainly in `ContentView`, `PaletteSheet`, `TabGridView`,
  `TabsManager`, `PagesBridge` and the Island; the PR audits every file, not
  the count. Strings already in the catalog (`ios.*`, `SettingsCopy`) stay.
  `UITestSeed.swift` is test data and stays English.
- **Slash-command hints** are the one string system outside the catalog
  today (`SlashCommand.swift` reads the English-only, generated
  `SlashCommands.strings` through `NSLocalizedString`). They move to the
  catalog and `SyncCopy`, and `copy/build.mjs` stops generating that file.
  *My call:* one string system, not per-locale `.lproj` copies.
- **How.** Through the existing path: keys in `copy/messages/en.json`
  (reusing desktop's key where the words are the same, an `ios.*` key where
  they aren't), read at runtime by `SyncCopy.text` from the bundled
  `strings.<locale>.js`. No second string system and no `Localizable.strings`
  in the app.
- **Translations** for de, es, fr, pt-BR and it land in the same PR with
  `copy:ack`, as every desktop string does.
- **Per-app language.** The project declares the six localizations
  (`knownRegions`, today only `en` and `Base`, and `CFBundleLocalizations`) so iOS shows Settings → Apps →
  Blanc → Language, and `BlancPageResolver.resolvedLocale` already reads
  `Locale.preferredLanguages`, which that setting changes.
- **Guard.** A unit test (Node, beside `ios-camera-usage.test.js`) fails on a
  string literal passed to a SwiftUI text-drawing API or accessibility modifier
  in `ios/Blanc/Blanc/**` outside an allowlist (SF Symbol names, identifiers,
  `UITestSeed.swift`). The builder shapes the pattern; it has to catch the
  forms the audit found.
- **Check.** A screenshot pass on the simulator in German (the longest) over
  the Island, palette, tab grid, Settings, the walkthrough and the share
  extension, at iPhone width; nothing truncates mid-word or overlaps.

## 5. Default browser, without the grant

Already done (#1224): `http`/`https` in `CFBundleURLTypes`, `IncomingLinks`
queuing a link that arrives before `TabsManager` exists, pair links routed to
the confirmation.

M18 adds:

- **The check.** `DefaultBrowserStatus`, one place that calls
  `UIApplication.shared.isDefault(.webBrowser)` (iOS 18.2+). Apple rate-limits
  the call without saying how far, so it is called only when a screen that
  shows the answer appears or the app returns from the default-apps setting,
  and its last answer is cached in memory for the session. A thrown error
  reads as "unknown," which shows the offer (never "done").
- **The offer**, in two places: the walkthrough's step 6 and a Settings row
  under Browsing: "Default browser" with the status ("Blanc" / "Not Blanc")
  and **Open Settings**.
- **Before the grant**, iOS won't list Blanc under Default Browser App, so the
  offer leads nowhere useful. Until the entitlement lands, step 6 and the
  Settings row are behind one build-time switch, `DefaultBrowserOffer.enabled`,
  false in M18. The entitlement PR flips it in the same change. The code, its
  copy and its tests all ship in M18 so that PR is one line plus the
  entitlement. *My call:* showing an offer that can't work would look broken
  to testers and to Apple's reviewer.

## 6. Background App Refresh

- **Mechanism.** SwiftUI's `.backgroundTask(.appRefresh("me.bnfy.blanc.sync"))`
  on the scene, `BGTaskSchedulerPermittedIdentifiers` with that one id, and
  `UIBackgroundModes` `fetch`. A request is scheduled for 15 minutes ahead
  (`earliestBeginDate`) whenever the app goes to the background and the phone
  syncs; iOS decides the real time.
- **What a background pass does.** Fetch-only: pull the stores the
  foreground pass pulls (settings, Favorites, devices' tabs, sends, Shared
  Spaces, Recently closed) through the existing `SyncEngine` and rate limiter
  (`SyncScheduler`'s 10 requests a minute), keep what arrived on disk as
  fetched, and stop. It never creates or loads a `WKWebView` (the iOS 26
  touch-delivery crash in `BlancApp`'s note), never builds a `TabsManager`,
  never applies anything to the live settings store or tab sets, and never
  publishes; this phone's own pending changes wait for the foreground.
  The next foreground pass applies what was kept, under §4.6's rule, without
  fetching it again. Today the engine lives in `TabsManager` and applies
  settings through `settingsSink` as they arrive, so the builder splits a
  fetch-and-keep half that runs without a manager. *My call:* when the app is
  only suspended (manager alive), the background pass still only fetches and
  keeps; one path, not two.
- **As built (PR 2):** the background pass reads the fixed stores only
  (settings, Favorites, devices' tabs, icons, sent pages, and Recently closed
  with the Spaces switch on) into `sync-inbox.json`. The shared sidecar and
  the Space blobs wait for the foreground pass, because their sync path writes
  while it merges. The foreground applies the inbox first and then runs its
  usual pass in full; it doesn't skip fresh fetches.
- **Budget.** iOS grants about 30 seconds. The pass checks the task's
  expiration and saves what it has; a half-finished pass is the same as one the
  network cut short.
- **Nothing when off.** No sync account, or Background App Refresh off for
  Blanc in iOS Settings: nothing is scheduled. The Settings → Sync footer says
  when Background App Refresh is off for Blanc (`backgroundRefreshStatus`).
- **Tests.** Unit: scheduling on background, no schedule without an account,
  the pass refusing to touch tabs. Real-device check with Xcode's
  `_simulateLaunchForTaskWithIdentifier` on the owner's iPhone Air.

## 7. The launch ping (F21)

### 7.1 The phone

- One `POST` to desktop's `PING_ENDPOINT` (`https://blanc-ping.bnfy-441.workers.dev/ping`) per app session, when
  the app first becomes active, only if `usagePing` is saved and true. No
  retries; failure is silent, as desktop.
- Body, in desktop's shape: `{installId, sessionId, version, platform: "ios",
  arch: "arm64", osVersion}`. `installId` is a random UUID minted on the first
  ping and kept in the app container (reset by a reinstall; not the Keychain,
  which survives one). `sessionId` is a random positive 31-bit integer per
  launch. `version` is `CFBundleShortVersionString`. `osVersion` is the iOS
  major only.
- Never in a private tab's terms: the ping is app-level, carries no page data,
  and private browsing doesn't change it (as desktop).
- Turning the switch off (walkthrough or Settings → Privacy) stops future
  pings at once; nothing else is stored to delete.

### 7.2 The Worker (the owner deploys)

`cloudflare/ping-worker/src/index.js`:

- `ALLOWED_PLATFORMS` gains `ios`; `ALLOWED_ARCHES` already has `arm64`.
- **Its own namespace, entirely.** Every counter and marker an iOS ping
  touches carries an `ios:` key prefix: `ios:total`, `ios:day:*`,
  `ios:version:{version}`, `ios:os:{major}`, the active (day, week, month),
  first-seen, next-day and week-two markers. iPhone 1.0.0 never adds to
  desktop 1.0.0, and desktop's launch and active-user figures stay exactly
  what they are today. `platform:ios` is the one shared key. *My call:* a
  phone launch is not a desktop launch, and mixing them would move every
  desktop chart the day the phone ships.
- **The kill criteria's two retention figures** (port revisit, "Indicators
  and kill criteria"): *TestFlight seven-day return* is the existing week-two
  window (first launch again on day 7–13) under `ios:`; *30-day retention*
  gets a new marker for iOS only, a first launch again on day 28–34 after the
  first-seen day (`ios:return:m1:{day}`), shaped like week two. *My call:* the
  same windowed shape the Worker already uses.
- **Day-one signals** are never counted for iOS: `sendsDayOneSignals` checks
  the version only, so it gains an explicit platform check (an iOS 1.31 would
  otherwise qualify).
- **No GA mirror for iOS.** The forward is queued before any per-platform
  logic today, so the skip goes at that call. *My call:* the phone's privacy
  label and policy stay simpler with no third party receiving its pings; the
  kill criteria need only the Worker's own counts.
- **`/stats`** gains an `ios` object holding the same fields desktop's top
  level has, plus `return:m1`; desktop's fields are unchanged, so the
  digests that read them keep working.
- Tests in `test/unit/ping-worker*.test.js` cover the platform, the
  namespace, the 30-day marker, the day-one platform check, the GA skip and
  the `/stats` shape.

### 7.3 Order

The Worker change merges and **the owner deploys it** before any build with
the ping goes to TestFlight (1.0 design anti-goal: no client before its
server). Before that build is uploaded, the owner updates the App Privacy
label (checklist item 16: Identifiers → Device ID and Usage Data, both for
Analytics, not linked, no tracking) and blanc.day/privacy says the phone
sends the same launch ping as desktop.

## 8. The share extension

- **Form** (owner): a share extension target, `BlancShare`, display name
  "Blanc", so Blanc's icon sits in the share sheet's row of apps.
- **Activation:** `NSExtensionActivationSupportsWebURLWithMaxCount = 1` (and
  text that is exactly one http(s) URL, through
  `NSExtensionActivationSupportsText` with a predicate or the builder's
  equivalent). Nothing else: no images, files or web pages' content.
- **What it does.** Reads the one http(s) URL, then opens it in Blanc through
  the same path an incoming link takes, and finishes. There is no
  compose UI; tapping the icon hands off and the sheet closes.
- **How it reaches the app.** iOS doesn't let a share extension open its host
  app by API. The builder picks between (a) an App Group queue the app drains
  when it becomes active, with the extension ending in a short "Opens in Blanc"
  confirmation, and (b) opening a `blanc-share:` URL from the extension through
  the responder chain, which works today but is not public API. The design's
  requirement is the outcome: the link opens in a new ordinary tab, the person
  ends up in Blanc or is told it's waiting there, and no private API that App
  Review rejects. A custom scheme that carries the URL must accept only
  http(s) payloads and route them through `IncomingLinks`, so a pair link
  still asks first.
- **Privacy.** The extension doesn't fetch, render or keep the page; the App
  Group (if used) holds only pending URLs, removed once opened.
- **Build.** A second target in `Blanc.xcodeproj`, its own bundle id
  `me.bnfy.blanc.share`, signed with the same team. Registering that bundle id
  (and an App Group, if used) in the developer portal is an owner step before
  the first TestFlight upload with it; local Debug builds don't need it.
  `scripts/ios-testflight.sh` and `ExportOptions-AppStore.plist` learn the
  second target.
- **Strings:** the extension's display name and any text it shows are in the
  catalog in six languages.

## 9. Order and PRs

Each PR passes the iOS `xctest` CI job (iPhone 17, iOS 26.5, Xcode 26.6,
45 minutes) and is installed as a Debug build on the owner's iPhone Air
(`00008150-001C2CE83EF0401C`) after it builds. None merges without the
owner's yes.

| PR | Contents |
|---|---|
| 0 | This design, its plan, and the 1.0 design's ladder brought up to date (docs only). |
| 1 | Native strings in six languages, the per-app language setting, the guard test (§4). |
| 2 | Background App Refresh (§6). |
| 3 | The walkthrough (§3) with `usagePing` saved, the default-browser status and offer behind `DefaultBrowserOffer.enabled = false` (§5). |
| 4 | The launch ping: Worker change first (owner deploys), then the phone (§7). |
| 5 | The share extension (§8). |
| 6 | The App Store listing (§10). |
| — | When Apple grants it: the entitlement, the portal switch and `DefaultBrowserOffer.enabled = true`, one change. |

PRs 1 and 2 don't depend on each other. PR 3's walkthrough strings land in
six languages, and the walkthrough itself has nothing to measure until PR 4.

## 10. The App Store listing

- **What.** Name ("Blanc: Web Browser", already set), subtitle, promotional
  text, description, keywords, support and marketing URLs, release notes for
  1.0, and screenshots for the 6.9" and 6.5" iPhone sizes Apple requires (iPad
  is not offered).
- **Where it lives.** `docs/ios/app-store-listing.md`, every claim beside the
  release (the TestFlight build or the 1.0 tag) and the code that backs it, per
  `docs/marketing-claims.md`. Screenshots are captured from the real app on
  the simulator by a script (the start page, the Island and palette, a
  desktop's tabs under its Spaces, Send to device, the shield), never mocked,
  and committed under `docs/ios/app-store/`.
- **Rules from the claims doc that bite here:** no AI wording; blocking is on
  by default but isn't the pitch; "open source" and MIT with the trademark
  carve-out; nothing about default browser or passkeys until the entitlement
  is granted and verified on a real iPhone; Shared Spaces only as shipped in
  desktop v1.45.
- **The owner** signs off the final text and screenshots and enters them in
  App Store Connect (or approves Claude doing it, each time).

## 11. Constraints

- iOS 18.4 minimum, SwiftUI and `WKWebView`, no SPM packages. The extension
  target follows the same rules.
- Copy rules: plain language, US spellings, the iOS bar is "the Island."
- `copy:check`, `browser-api:check` (if a pages bridge channel changes) and the
  unit suite run on every PR, as today.
- Nothing in M18 changes the sync protocol or the Sync Worker.

## 12. Calls made here, for the owner to check

1. iPhone pings are counted entirely apart from desktop (every counter under
   `ios:`), never sent to Google Analytics, and gain a 30-day return marker;
   the existing week-two window stands for the seven-day return (§7.2).
2. Existing TestFlight installs see the walkthrough once; a paired one starts
   at Share back (§3.3).
3. The walkthrough has no page dots, and Welcome has no ✕; swiping it away
   means Browse without pairing (§3.1, §3.2).
4. The walkthrough's Spaces switch opens the same Spaces chooser as Settings
   (§3.2).
5. The privacy step is a single switch: the phone has no search suggestions to
   ask about (§3.2).
6. The default-browser offer is built but hidden until Apple grants the
   entitlement (§5).
7. Slash-command hints move into the catalog, so the app has one string
   system (§4).
8. The background pass only fetches and keeps; what it brings is applied the
   next time the app is in front (§6).
9. The share extension's hand-off mechanism is the builder's choice, within
   §8's rules.
10. Screenshots for iPhone only, captured by a script from the real app (§10).

## 13. Left to the builder

- The walkthrough's exact spacing, transitions and detent heights, inside
  direction B and the app's sheet conventions.
- The guard test's pattern and allowlist.
- Whether the background pass needs a fetch-only split of `SyncEngine`.
- The share extension's hand-off (§8 (a) or (b)) and its activation rule's
  exact form.
- The screenshot script and the listing's draft copy, for the owner's review.
