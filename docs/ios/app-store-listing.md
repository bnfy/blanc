# Blanc for iPhone: App Store listing (draft)

**Status:** draft for the owner's sign-off (M18 design §10, plan Task 17).
Nothing here is entered in App Store Connect yet; doing that is a separate yes.

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

Captured from the real app by `npm run ios:app-store-screenshots`
(`scripts/ios-app-store-screenshots.sh`, which runs
`AppStoreScreenshotsUITests` from the `-BlancUITestAppStore` seed) on an
iPhone 17 Pro Max simulator, iOS 26.5, light, English: Apple's 6.9" size,
1320 × 2868. Apple accepts the 6.9" set alone, so there's no 6.5" set.
Committed in `docs/ios/app-store/`:

1. `1-island.png`: blanc.day with the Island at the bottom.
2. `2-palette.png`: the palette, with open tabs, a tab group and two pages
   sent from a MacBook Pro.
3. `3-send.png`: Send to Device in the Island's menu.
4. `4-spaces.png`: the Spaces menu (This iPhone and a "Work" Space).
5. `5-start.png`: the Start Page (Billboard).

**For the owner to judge:** shots 1, 3 and 4 show blanc.day's home page,
whose hero image is a screenshot of The Met's website. Everything shown is
Blanc's own UI and pages, and every page is blanc.day; no sync account or
person's data appears.
