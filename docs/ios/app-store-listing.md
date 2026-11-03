# Blanc for iPhone: App Store listing (draft)

**Status:** draft for the owner's sign-off (M18 design §10, plan Task 17).
The fields below are a draft; the screenshots and app preview are the set
made for version 1.0 (see Screenshots), uploaded only with the owner's yes.

**Release boundary.** Blanc for iPhone 1.0 isn't built yet. Every claim below
is checked against TestFlight build **0.1.0 (202610292048)**, uploaded from
`38d17cc61`, unless it says otherwise. Claims marked **1.0 only** come from M18
work merged after that build (or still in review) and must be checked again
in the 1.0 build before this text goes live. Follow
[`docs/marketing-claims.md`](../marketing-claims.md): no AI wording, blocking
isn't the pitch, and nothing about default browser or passkeys until Apple
grants the entitlement (request `P2X5BCD4C9`) and both are verified on a real
iPhone.

## Fields

**Name** (set): Blanc: Web Browser

**Subtitle** (30 max, 30 used):

> Your Blanc tabs, on iPhone too

**Promotional text** (170 max, 151 used):

> Pair Blanc for iPhone with Blanc on your Mac or PC by scanning a code. Your
> computer's tabs and the Spaces you share come along, kept the same on both.

**Description:**

> Blanc for iPhone is the companion to Blanc, the minimal browser for Mac,
> Windows and Linux. Pair it with Blanc on your computer, and your browsing
> comes with you.
>
> PAIR IN A FEW SECONDS
> On your computer, open Blanc's Settings → Sync → Connect your iPhone. In
> Blanc for iPhone, tap Pair with your Blanc and scan the code. You can also
> type a code or use a sync name and passphrase. Sync is end-to-end
> encrypted: Blanc stores only data it can't read.
>
> YOUR COMPUTER'S TABS, ON YOUR PHONE
> See the tabs open on each of your Blanc devices, under their groups, and
> open any of them on your iPhone.
>
> SHARED SPACES
> A Space is a set of tabs you name, like Work or Trip. Turn on Shared Spaces
> and the Spaces you choose stay the same on your computer and your iPhone:
> open, close or move a tab on one, and the other follows. It's off until you
> turn it on, and works with Blanc 1.45 or later on your computer.
>
> SEND A TAB
> Send the page you're reading to another of your Blanc devices, and find
> pages sent to you waiting on your iPhone.
>
> ONE BAR, THE ISLAND
> The Island at the bottom of the screen holds the page's address and your
> tabs. Swipe it to switch tabs, or open the palette to search your tabs,
> Favorites and History, or type a slash command such as /private or /find.
>
> BROWSING, THE WAY YOU EXPECT
> Private tabs that keep no history, Favorites, History, Recently closed,
> Reader Mode, Find in page, and tab groups you name. Ads and trackers are
> blocked by default with the EasyList and EasyPrivacy lists, and you can
> allow a site from the shield in one tap.
>
> OPEN SOURCE
> Blanc is open source under the MIT License. The Blanc name and logo stay
> Bananify Creative's.

**Keywords** (100 max, 97 used):

> browser,tabs,sync,private,ad blocker,minimal,desktop,companion,spaces,reader,send tab,open source

**Support URL:** https://blanc.day/support

**Marketing URL:** https://blanc.day

**What's New in 1.0** (release notes):

> The first release of Blanc for iPhone: pair with Blanc on your computer,
> see its tabs, share Spaces, send tabs, and browse with the Island.

## Claims and their evidence

| Claim (as worded above) | Kind | Evidence | Qualification that travels | Verdict |
|---|---|---|---|---|
| Pair by scanning a code from Settings → Sync → Connect your iPhone | Blanc | `PairScanner.swift`, `SyncSettingsView.swift` at `38d17cc61`; desktop Connect your iPhone since v1.45.0 (`docs/marketing-claims.md`, Connect your iPhone); #1235 | Needs Blanc 1.45 or later on the computer for the QR; typing a code works with earlier versions | verified |
| Type a code or use a sync name and passphrase | Blanc | `SyncSettingsView.swift` (`settings.syncCode`, `settings.syncHandle`) at `38d17cc61` | none | verified |
| Sync is end-to-end encrypted; Blanc stores only data it can't read | Blanc | `ios/Blanc/Blanc/Sync/SyncCrypto.swift` (AES-GCM, CryptoKit); the v1 Worker stores ciphertext only (`cloudflare/sync-worker/README.md`); App Privacy item 16 in `app-store-connect.md` | Don't say Blanc can recover a lost sync | verified |
| See the tabs open on each device, under their groups | Blanc | M7a (#1068) tab sync; groups in the snapshot; `TabsManager` remote devices at `38d17cc61` | Only devices with Blanc Sync on and tab sharing on | verified |
| Shared Spaces: chosen Spaces stay the same; off until turned on; Blanc 1.45+ | Blanc | #1247 (M17c) in build 202610292048; desktop Shared Spaces shipped in v1.45.0 (`docs/release-incidents/2026-10-29-v1.45.0.md`); `SharedSpacesSheet.swift` | Desktop: Personal profile only, up to 25 Spaces. Two-device check passed 2026-10-29 | qualified |
| Send the page to another Blanc device; pages sent to you wait on the iPhone | Blanc | `/send` in `SlashCommand.swift`; "Sent to this device" (`copy/messages/en.json`); M7b (#1096, #1088) | Only between devices in the same Sync | verified |
| The Island holds the address and tabs; swipe it to switch tabs | Blanc | `IslandSwipe.swift`, M11 (#1131) | none | verified |
| Palette searches tabs, Favorites and History; slash commands such as /private and /find | Blanc | `QuickSwitcher.swift`, `SlashCommand.swift` at `38d17cc61`; M10 (#1221) | none | verified |
| Private tabs keep no history | Blanc | M9 (#1110): non-persistent `WKWebsiteDataStore`, never in history, session, sync or Recently closed | none | verified |
| Favorites, History, Recently closed, Reader Mode, Find in page, named tab groups | Blanc | `HistoryStore.swift`, `RecentlyClosedStore.swift`, `ReaderMode.swift`, `findInteraction` in `ContentView.swift`, `GroupNameSheet.swift` at `38d17cc61` | none | verified |
| Ads and trackers blocked by default with EasyList and EasyPrivacy; allow a site from the shield | Blanc | `ContentBlocker.swift` (`WKContentRuleList` from `adblock/generated/`), `AdblockExceptions.swift`, the shield chip (M10) | It's a content-rule list with Apple's rule cap (divergence D1–D14 in `spec/`), not desktop's engine; don't compare blocking strength | qualified |
| Open source under MIT; the name and logo stay Bananify Creative's | Blanc | `LICENSE`, `ASSET-LICENSE.md` | Never describe the whole repository as blanket MIT | verified |
| Companion to Blanc for Mac, Windows and Linux | Blanc | Current public desktop release v1.45.0 on all three | none | verified |

**Left out on purpose:** the default browser and passkeys (waiting on Apple),
the walkthrough, six languages, Background App Refresh and the share sheet
(M18, merged or in review after build 202610292048: add them only once the
1.0 build has them and they're checked), memory or speed claims, and any
comparison with another browser.

## Screenshots

Six screenshots, designed on the Claude Design canvas **Blanc for iPhone App
Store Screenshots** (<https://claude.ai/artifact/Axk4cZzuRm1ywRbrnxUbhk>,
private) in direction C, "dawn to day", which the owner chose on November 2,
2026: each shot is a step later in one sunrise, headlines in Blubird Display,
the real app in a plain dark frame. The canvas's files are copied in
`docs/ios/app-store/design/` (see its README for changing them).

`npm run ios:app-store-screenshots` captures every phone screen from the real
app (`AppStoreScreenshotsUITests`, from the `-BlancUITestAppStore` seed) on an
iPhone 17 Pro Max simulator, iOS 26.5, light, English, then composes the set
(`scripts/ios-app-store-compose.mjs`) at Apple's 6.9" size, 1320 × 2868, in
`docs/ios/app-store/6.9/`, and the same design at 6.3", 1206 × 2622, in
`docs/ios/app-store/6.3/`. The captures are in `docs/ios/app-store/captures/`.

| # | Headline | Subtitle | The capture |
|---|---|---|---|
| 1 | A little less browser. | Blanc for iPhone keeps your address and tabs in one bar at the bottom of the screen: the Island. | The Start Page (the time over a sunrise) with the Island |
| 2 | Your computer’s tabs, on your iPhone | Pair with Blanc on your Mac or PC to open its tabs here and get the pages it sends you. | The palette: two pages a MacBook Pro sent, and the MacBook Pro's open tabs |
| 3 | A Space for each part of your day | Keep Work and Trip tabs apart, and share a Space to keep it the same on your computer. | The Spaces menu over a Van Gogh: This iPhone, Work, and Trip shared |
| 4 | Slash commands in the Island | Type / for commands like /private and /history, or type anything to search your tabs, Favorites and History. | The palette listing slash commands |
| 5 | Every tab at a glance, in named groups | See your tabs as cards, and keep the ones that belong together in a group, like Museum day. | The tab grid: paintings from The Met, three in a "Museum day" group |
| 6 | Private tabs keep no history | And ads and trackers are blocked by default, in private tabs too. | A private tab on Van Gogh's Sunflowers, the Island's menu showing Ad & tracker blocking on |

**Pages in the shots:** public-domain paintings from The Met's open-access
collection (metmuseum.org, the owner's choice on November 2, 2026, as for
the desktop Media page) and blanc.day. Never Wikipedia (owner, November 2,
2026). The seeded MacBook Pro, its tabs and sent pages, and the Spaces are
test data in the app's own UI; no sync account or person's data appears.

### Caption claims

Checked against the 1.0 build (`84f861dfc`, TestFlight 1.0 (202611030404)),
under [`docs/marketing-claims.md`](../marketing-claims.md). None mentions the
default browser, website passkeys, or Blanc for iPhone being on the App Store.

| Claim | Evidence | Qualification that travels | Verdict |
|---|---|---|---|
| “A little less browser.” | The approved tagline (`docs/marketing-claims.md`) | none | verified |
| The Island holds the address and tabs, at the bottom | `ContentView.swift` Island (`pill.palette`, `pill.tabs`), `IslandSwipe.swift` | none | verified |
| Pair with Blanc on a Mac or PC; open its tabs; get the pages it sends | Table above: pairing, other devices' tabs, Send a tab | The computer needs Blanc 1.45+ for the QR code and its tab sharing on | qualified |
| Keep Work and Trip apart; share a Space so it stays the same on the computer | Spaces (M17), Shared Spaces (#1247, desktop v1.45.0) | Shared Spaces is off until turned on; Blanc 1.45+ on the computer | qualified |
| Type / for commands like /private and /history; search tabs, Favorites and History | `SlashCommand.swift`, `QuickSwitcher.swift` | none | verified |
| Tabs as cards; named groups | `TabGridView.swift`, `GroupNameSheet.swift` | none | verified |
| Private tabs keep no history | M9 (#1110) | none | verified |
| Ads and trackers blocked by default, in private tabs too | `BlancSettings.adblockEnabled = true`; `TabsManager.createTab` adds the rule list to private tabs too | EasyList and EasyPrivacy as a content-rule list (Apple's rule cap); don't compare blocking strength | qualified |
| Pull down to reload (preview) | F56, #1321 (`TabModel.swift` refresh control), in `84f861dfc` | none | verified |

## App preview

One 6.9" app preview, `docs/ios/app-store/preview/blanc-preview.mp4`
(886 × 1920, 30 fps, H.264 about 11 Mbps, silent stereo AAC, 15 to 30 s), made
by `npm run ios:app-store-preview`: `AppStorePreviewUITests` plays a tour of
the real app on the same simulator while `simctl` records it, and
`scripts/ios-app-store-preview-cut.mjs` cuts it, speeding it up evenly only
if it runs past 29 s, and sets the captions in
`docs/ios/app-store/preview/captions.json` over it in Blubird. The tour: the
Island on a Van Gogh, swiping it between tabs, pull to refresh, the tab
grid, switching to the Trip Space, the MacBook Pro's tabs and sent pages, and
the Start Page. Its poster frame is `blanc-preview-poster.png`.

## iPhone Duo screenshots

Apple's `APP_IPHONE_DUO` set holds both Duo displays, ten shots at most:
five unfolded (inner display, landscape, 2853 × 2007: the Start Page,
Spaces, slash commands, the tab grid, private tabs) and five folded (outer
display, 1398 × 2034: the Start Page, your computer's tabs, Spaces, the tab
grid, private tabs). They're artboards on the canvas's "iPhone Duo"
page (`docs/ios/app-store/design/project/Duo*.dc.html`), with the iPhone
shots' captions and skies, and `scripts/ios-app-store-compose.mjs` renders
them with the rest, sorting each artboard into a set by its size. The captures are in
`docs/ios/app-store/captures/duo-closed/` (from `AppStoreScreenshotsUITests`
on an iPhone Duo simulator) and `duo-open/`. XCUITest screenshots of the
unfolded inner display come out black, so those were taken with Device Hub's
Screenshot button while the test waited (`BLANC_SHOTS_BY_HAND=1`). The
unfolded "your computer's tabs" shot is left out: the test can't yet scroll
the unfolded palette panel to the MacBook Pro's tabs.

The App Store header and search-results art (`blanc-app-store-header-5244x2950.png`)
was removed from the listing on November 3, 2026, at the owner's request.

## Custom product pages

Three custom product pages, each for a place that sends people to the App
Store, so the first screenshots they see answer what brought them. Each page
keeps the default page's design (dawn to day, Blubird captions, the real app
in a plain dark frame) and the same captures, in a different order with
captions for that audience. They're on the screenshots canvas, one canvas
page each ("Custom page · …"), and render into
[`app-store/custom-pages/`](app-store/custom-pages/) (its README says how).
Drafted and approved by the owner on November 3, 2026, and uploaded to App
Store Connect the same day as drafts (not submitted):

| Page | Page id | State on November 3, 2026 |
|---|---|---|
| Blanc on your computer | `de631766-0439-4f00-afe3-8d95512942f0` | Prepare for Submission |
| Spaces and groups | `b6d854a6-9fbd-4cbf-ab4e-08feb5af8019` | Prepare for Submission |
| Private browsing | `ade1d24b-9477-4ac3-8a64-d425d35177f0` | Prepare for Submission |

Each link is `https://apps.apple.com/us/app/blanc-web-browser/id6828027794?ppid=<page id>`,
which works only once the page is approved and 1.0 is released.

| Page (reference name) | For | Promotional text (170 max) |
|---|---|---|
| Blanc on your computer | People who already use Blanc on a Mac or PC: blanc.day's iPhone links, the desktop app's Connect your iPhone, What's New pages, the newsletter, r/blancbrowser | Use Blanc on your Mac or PC? Scan the code in its Settings → Sync, and your computer’s tabs, the pages it sends and the Spaces you share are on your iPhone too. (160) |
| Spaces and groups | People who keep a lot of tabs: blanc.day's Spaces and Arc alternative pages, posts about organizing tabs | Give each part of your day a Space, like Work or Trip. Keep tabs that belong together in named groups, and share a Space to keep it the same on your computer. (158) |
| Private browsing | People looking for a private browser: blanc.day's private tabs and privacy pages, privacy-minded communities | Private tabs keep no history, and their cookies and site data go when the last one closes. Ads and trackers are blocked by default, and Sync is end-to-end encrypted. (165) |

**Shot order.** Headlines in order; the captures are the default page's.

| # | Blanc on your computer | Spaces and groups | Private browsing |
|---|---|---|---|
| 1 | Pair with Blanc on your computer (desktop Connect your iPhone + your computer's tabs) | A Space for each part of your day (Spaces) | Private tabs keep no history (private tab) |
| 2 | Share a Space with your computer (Spaces) | Tabs that belong together, in a group (tab grid) | A little less browser. (Start Page) |
| 3 | A little less browser. (Start Page) | Your computer’s tabs, on your iPhone | A private tab is a /private away (slash commands) |
| 4 | Slash commands in the Island | Slash commands in the Island | Every tab at a glance, in named groups |
| 5 | Every tab at a glance, in named groups | A little less browser. | A Space for each part of your day |
| 6 | Private tabs keep no history | Private tabs keep no history | Sync that Blanc can’t read (your computer's tabs) |

The first shot of "Blanc on your computer" sets the desktop's own capture of
Connect your iPhone (`site/public/feature-captures/connect-your-iphone-v1.45.0.png`,
Blanc 1.45.0 on a Mac) behind the iPhone's palette with the MacBook Pro's
tabs. Captions repeated from the default page keep its evidence (Caption
claims, above).

### Custom page claims

The claims that are new on these pages, checked against the 1.0 build
(`84f861dfc`) and `docs/marketing-claims.md`. None mentions the default
browser, website passkeys, or the App Store.

| Claim | Evidence | Qualification that travels | Verdict |
|---|---|---|---|
| Scan the code in Blanc's Settings → Sync on a Mac or PC | Connect your iPhone, desktop v1.45.0 (`docs/marketing-claims.md`); `PairScanner.swift` | Blanc 1.45 or later on the computer | qualified |
| Then the computer's tabs, the pages it sends and the Spaces you share are on the iPhone | Claims table above: other devices' tabs, Send a tab, Shared Spaces | Tab sharing on; Shared Spaces off until turned on | qualified |
| Choose the Spaces to share; open, close or move a tab on one device and the other follows | `SharedSpacesSheet.swift`, #1247; desktop Shared Spaces v1.45.0 | Never "instantly" or "in real time": the computer checks every 15 seconds while a window is in front (v1.46.0) | qualified |
| Switch between Spaces from the Island | `SpaceMarkButton` in the Island (`ContentView.swift`), the Spaces menu | none | verified |
| Name a group, like Museum day, and see every tab as a card | `GroupNameSheet.swift`, `TabGridView.swift` | none | verified |
| Private tabs' cookies and site data go when the last one closes | `TabsManager.privateDataStore`: one `WKWebsiteDataStore.nonPersistent()` for every private tab, dropped when the last private tab closes and when Blanc quits | none | verified |
| A private tab is a /private away; type it in the Island | `/private` in `SlashCommand.swift`, the palette | none | verified |
| Sync is end-to-end encrypted, so Blanc stores only data it can't read | Claims table above (SyncCrypto, the v1 Worker) | Never say Blanc can recover a lost sync | verified |
| Ads and trackers are blocked by default (private promotional text) | Claims table above | Content-rule list with Apple's rule cap; don't compare blocking strength | qualified |

### Putting them in App Store Connect

Only with the owner's yes, and they can't be seen until 1.0 is released.
Steps 1 and 2 were done through the API on November 3, 2026; step 4's
submission waits for the owner.

1. For each page, Create Custom Product Page from blank, with its reference
   name above, English (U.S.) only.
2. Promotional text from the table; the 6.9" set from
   `custom-pages/<page>/6.9/` and the 6.3" set from `custom-pages/<page>/6.3/`,
   in file order. iPhone Duo gets the default page's Duo sets unchanged
   (`duo-closed/`, `duo-open/`), as no page-specific Duo shots exist yet. No
   app preview for now (my call): the default page's preview opens on the
   Island, not on each page's subject.
3. No deep link: Blanc for iPhone has no link that opens pairing or a
   Space, so Open lands on the app as usual.
4. Submit the three for review together. Once approved, each has a link
   (`https://apps.apple.com/app/id6828027794?ppid=<page id>`); add a
   campaign token (`&ct=<channel>`) per place it's posted, so App Analytics
   can tell blanc.day, the desktop app and Reddit apart.
