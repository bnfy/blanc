# Blanc for iPhone 1.0: the companion release

**Date:** 2026-10-24
**Status:** Design for the owner's review. Nothing in it is built beyond what the
ladder below marks done.
**Supersedes, for the question "what is 1.0":** the beta cut line in
[`2026-10-21-ios-port-revisit.md`](2026-10-21-ios-port-revisit.md) §6. The
revisit's positioning, minimum version and kill criteria stand and are not
repeated here.
**Owner decisions, 2026-10-24:** 1.0 is the companion (pair with desktop Blanc
and sync); the phone shows the desktop's tabs **organized by groups and
Spaces**; desktop and phone **stay in perfect sync when the person turns it
on**, in both directions; a tab closed on one device leaves the shared Space
everywhere, and **Recently closed is synced** so the page can be found from any
device; Bring Your Tabs (F40) is the model for bringing a Space onto the phone.
**Audited against:** desktop **v1.43.1** (the public baseline of 2026-10-24),
`spec/features.md` F1–F56 and `spec/parity-matrix.md` on `main`.

---

## 1. Intent

Blanc has never shipped a mobile app. The prototype in `ios/` has tabs, a
palette, the `blanc://` pages, one blocking rule list, theming, session restore
and, since M7a, Profile Sync (join an existing sync, read every device's open
tabs, publish the phone's own). What's missing is a definition of the first
release: which of desktop's 56 features belong on a phone, which belong in the
first version, and what the first minute looks like.

**1.0 is "your Blanc, in your pocket."** Someone who already uses Blanc on a
computer installs it on their iPhone, pairs it with a code from their desktop's
Settings → Sync, and within a minute sees their desktop's open tabs, groups,
Spaces and Favorites. They browse with the bottom Island, open a desktop tab on
the phone, send a page back to the desktop, and, if they turn it on, work in
the same Spaces from both. Ad blocking is on by default but is not the pitch.
There is no AI. It is open source.

A phone with no desktop Blanc still works as a browser. It is not the audience
for 1.0, and nothing in 1.0 is built to win it.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Pairing is the first thing the app offers, and it works in under a minute
   with a code shown on the desktop.
2. The phone shows the desktop's open tabs under their group headers and
   Spaces, not as a flat list.
3. With the per-device switch on, groups and Spaces are one shared set across
   every device of the sync account, edited from any of them.
4. A tab closed anywhere leaves the shared Space everywhere, and the person
   can always find it again in Recently closed, on any device.
5. Send to device works both ways (F55, in flight).
6. Everything the phone can edit (Favorites, settings, device names, Spaces,
   groups) reaches the desktop, and the reverse.
7. The App Store listing makes no claim a release doesn't back
   (`docs/marketing-claims.md`).

**Non-goals for 1.0**

- Beating Brave or DuckDuckGo at blocking on iOS. One shared rule list, a
  binary shield, per-site allow. The full pipeline (M15) is after 1.0.
- Android, iPad-specific layout (an iPad gets the regular layout for free),
  the iPhone Duo's inner-display features beyond not letterboxing (§7).
- A Patron purchase in the app. Patron unlocks nothing; a StoreKit tip can
  come later.
- Downloads, Blanc's own permission prompts, encrypted DNS, WebRTC controls,
  Dark websites, Tab Archive, custom tab names, Start Page wallpapers, Split
  View and Glance. See the audit (§6) for each one's reason.

**Anti-goals** (1.0 has failed even if it works)

- A phone that looks like a generic WebKit browser with sync as a setting.
- Any AI feature, or any copy that reads as one.
- Sync that silently loses a page: a tab closed on one device must either
  still be open somewhere or be in Recently closed.
- A release whose sync server, desktop app or Worker route isn't deployed
  before the client that needs it (the M7b lesson).
- Marketing or App Store copy that claims something only a design or a draft
  PR has.

## 3. The first minute

A fresh install opens on a short walkthrough over the start page (desktop's
F36, rewritten for the phone):

1. **Welcome.** One screen: "Your Blanc, in your pocket." Two actions:
   **Pair with your Blanc** (leads) and **Browse without pairing** (quiet).
2. **Pair.** Enter the eight-character code from desktop Settings → Sync →
   Add another device. The code field is the one M7a shipped; a camera QR
   scan of the same code may be added here and is a builder's call. On
   success, the next screen lists what arrived: "N open tabs on MacBook Pro ·
   M Favorites · your settings," and, once the desktop has agreed (below),
   its Spaces. The recovery-code and name-and-passphrase paths stay
   available behind "Other ways to join."

   **Pairing asks the desktop to share its Spaces** (owner, 2026-10-24). The
   desktop that showed the code learns the phone joined (its code was taken)
   and asks, there and then: "Your iPhone joined. Keep Spaces and groups in
   sync with it?" with **Turn on** and **Not now**. Turn on flips that
   desktop's own switch (§4.2), so the phone's first minute shows the
   desktop's Spaces; Not now leaves it off, and the phone's "what arrived"
   screen says where to turn it on later. The desktop never turns it on
   without that answer. A phone joined by recovery code or passphrase, with
   no desktop watching, gets the "where to turn it on" line instead.
3. **Share back.** Two switches, both off by default, with one line each:
   **Share this iPhone's open tabs** (F27's consent) and **Keep Spaces and
   groups in sync on this iPhone** (§4). Turning the second on is what makes
   the phone's Spaces the shared ones.
4. **Privacy choices.** Usage measurement (on by default, one launch ping,
   §6 F21) and search suggestions. Nothing those govern starts before this is
   saved; skipping records the values on screen (F36's rule).
5. **Default browser.** iOS 18.3+ can open the default-apps setting from an
   app; the screen explains and offers it, and reads as done when Blanc is
   already the default. It needs the `com.apple.developer.web-browser`
   entitlement, which the owner requests from Apple (lead time outside the
   project; §8).
6. **Done.** Lands on the start page showing the desktop's Spaces and
   devices.

"Browse without pairing" skips 2 and 3 and goes to 4. Settings → Sync offers
pairing later, as today. The walkthrough shows once and can be replayed from
Settings.

## 4. Shared Spaces and groups

This is the heart of 1.0 and the biggest piece of new work, on desktop as much
as on the phone. It gets its own design document before it is planned
(`2026-10-2x-shared-spaces-sync-design.md`); this section fixes the contract
that design must meet.

**4.1 What is shared.** With the per-device switch on, a device's Spaces join
the account's one shared library. A Space is what F41 says it is (name, color,
symbol, order, its tabs and groups, each tab's pinned state and group), and in
1.0 it is the **same set of tabs on every device that has it open**. Groups
live inside Spaces and are shared with them. A window or phone in no Space
keeps device-local tabs and groups; those still appear on other devices
read-only through tab sync (F27), as today.

A device's tabs that sit in a shared Space the receiver can see are shown once,
under that Space, not again under the device in Other devices. The protocol
design chooses the mechanism (a sidecar beside the F27 snapshot, as icons are;
never a new field in the F27 entry, whose shape is frozen for mixed-version
accounts). A device whose Spaces switch is off has no shared Spaces, so its
tabs show under the device as today.

**4.2 Opt-in, per device, off by default.** The switch is "Keep Spaces and
groups in sync on this device," beside the existing "Share this device's open
tabs." With it off, a device's Spaces are local, as every desktop's are today.
Turning it on uploads the device's Spaces into the library; two devices that
each had a Space named "Work" end up with two Spaces named "Work," never a
silent merge. Turning it off keeps the device's current copies as local Spaces
and publishes nothing further; it does not delete anything anywhere.

The switch is its own consent. Tab sync's rule (a device's tabs never upload
without an explicit act for that) is met by the switch's one line: "Tabs in
your shared Spaces are synced from this device." It does not require "Share
this device's open tabs" to be on; the two are independent, and the privacy
label says both.

**4.3 Edits merge per item, never per Space.** Each Space, each group and each
tab is its own record with a clock and, when removed, a tombstone, in the shape
Favorites already use. So closing a tab on the phone and opening one on the Mac
in the same minute keeps both changes. Order is a position value per item, not
an array, so two reorders don't fight. Tombstones are kept 30 days.

A navigation is an edit, not a close: following a link in a shared tab updates
that tab record's address and title, so the Space is current everywhere, and
Recently closed stays quiet. A device that has that tab live keeps the page in
front of the person; the new address applies when they next come to the tab
(it reloads to it), under §4.6's rule. The
protocol design decides the exact record shapes, budgets (the Worker caps a
blob at 512 KiB; a profile has at most 25 Spaces and a Space at most 500 tabs,
the tab-sync bound) and what happens over budget, which must never be silent.

**4.4 Removals apply everywhere, through Recently closed.** A tab closed on one
device leaves the Space on every device at its next sync, with no prompt. On
the receiving device the tab is closed the way a local close is: into that
device's Recently closed, which is also synced (§5). Desktop's dirty-form
probe does not block a remote close; the page is recoverable from Recently
closed, and a page the person is typing into is the active tab, which §4.6
covers.

**4.5 Which device has a Space open is local.** Desktop's "a Space is in at
most one window at a time" stays a per-device rule. The same Space may be open
on the Mac and the phone at once; that is the point.

**4.6 The active page is protected.** A remote removal or navigation of the tab
the person is looking at right now, on either platform, is applied only after
the person leaves it or at the next cold start, whichever comes first, so a
page under their fingers never changes. On the phone a return from the
background is not a cold start. Everything else applies at once.

**4.7 Desktop gains Spaces sync too, and ships it first.** Two desktops with
the switch on share Spaces the same way. F41's "Spaces never sync" is retired
when this ships, as the October 23 plan anticipated. Owner, 2026-10-24: M16
ships as a **public desktop feature release** (its own What's New page, the
feature-release gates in CLAUDE.md) before the phone ships, so the protocol
gets real use first. A desktop Spaces session already in progress (Move to
Space, #1097 and its follow-ups in #1098) is where M16 is built; its design
document is the hand-off.

**4.8 What the phone can do with Spaces.** Open one (its tabs become the
phone's open tabs, loaded lazily, the active one first), switch between them,
create, rename, recolor, reorder and delete (with Undo, as desktop), move a tab
to a Space, make and rename groups, and see every device's Spaces in the
palette whether or not the phone has the switch on (read-only when off).

## 5. Recently closed, synced

Desktop's Recently closed band (F2) is per window, keeps entries for one hour
(25 at most), and holds page state that never leaves the main process. 1.0
adds a synced layer beside it, not in place of it:

- Each device publishes its own entry in a small new store, in the shape Send
  to device uses (one writer per entry, so no conflicts): `{id, url, title,
  closedAt, spaceId?}` for tabs it closed, http(s) only, title and address
  only, never page state, never private tabs. **24 hours and 25 entries per
  device** (my call; desktop's local hour stays as it is).
- Every device shows one merged Recently closed list, newest first, each row
  saying which device closed it. Reopening a row opens the page as a local tab
  (desktop's live-view and snapshot tiers still apply to its own entries).
  Forget removes a row on that device only; Clear all clears the device's own
  entry.
- The phone's palette shows the band where desktop does, among the groups.

## 6. The audit: desktop 1.43.1 feature by feature

Every row of `spec/features.md` as of `main` today, plus F55 (Send to device,
in flight in #1088/#1096). **1.0** ships in the release; **after** is planned
for a later release and stays `PLANNED` in the matrix; **N/A** doesn't belong
on a phone and gets `N/A`. "Exists" means the prototype already has it.

| F | Feature | 1.0? | Reason, and what 1.0 includes |
|---|---|---|---|
| F1 | Island chrome | **1.0** | Exists as the bottom pill. 1.0 adds the Space mark at the leading edge and the shield chip. Back/forward stay page-edge swipes (D7). |
| F2 | Tabs | **1.0** | Create, close, switch, reopen (through Recently closed), duplicate, pin. **Mute: after** — `WKWebView` has no public per-view mute; verify before promising. |
| F3 | Tab groups | **1.0** | Shared through Spaces (§4). Name, optional color, create/rename/ungroup, drag within the switcher strip (F56). |
| F4 | Private tabs | **1.0** | M9: a non-persistent `WKWebsiteDataStore`, private theme, never in history, session, sync or Recently closed. |
| F5 | Address input & search | **1.0** | Exists (`AddressNormalizer`, Kagi added in M6.5). 1.0 adds the custom search template field. |
| F6 | Palette & Quick Switcher | **1.0** | Exists. 1.0 ranks groups and Spaces above tabs as desktop does, and adds the card strip (F56). |
| F7 | Slash commands | **1.0** | The shared set: `/new`, `/close`, `/favorites`, `/history`, `/settings`, `/sync`, `/private`, `/group`, `/ungroup`, `/close-group`, `/find`, `/block-ads`, `/allow-ads`, `/theme`, `/space`, `/send`, `/sleep` (as "quiet"), `/bangs`. Desktop-only ones (`/1password`, `/glance`, `/archive`, `/dark-site`, `/rename`) stay off the phone, recorded in the substrate's platform lists. |
| F8 | Find in page | **1.0** | `WKWebView.find(_:configuration:)` (iOS 16+) behind a capsule over the page. Small. |
| F9 | Favorites | **1.0** | M8: editable on the phone (heart on the pill, the Favorites page's edit controls), syncing both ways; today read-only. |
| F10 | History | **1.0** | M8: local, capped 5000, clearable, never private; the History page live. |
| F11 | Downloads | after | D3: needs the Files integration and a downloads list; not what the companion is for. The Downloads page stays hidden. |
| F12 | Blocking | **1.0** as is | Exists: one `WKContentRuleList` from the shared lists, on by default. 1.0 adds the shield chip with the binary state (D13), per-site allow and re-block (D2: recompile and reattach), and the global switch. The full pipeline, cosmetic filtering and `WKWebExtension` DNR are M15, after. |
| F13 | Permissions | after | WebKit's own camera/microphone/location prompts serve 1.0; Blanc's own policy and remembered decisions come later. |
| F14 | Settings | **1.0** | Exists as the shared page. Every shared key with desktop's defaults and validation; the two new per-device sync switches (§3 step 3). |
| F15 | Theming | **1.0** | Exists. |
| F16 | Internal pages | **1.0** | newtab, favorites, history, settings, shortcuts, error, mahjong served from the bundle; downloads hidden. Each checked at phone width in all six languages. |
| F17 | Patron & app icons | after | No purchase in 1.0. Alternate icons are cheap on iOS (`setAlternateIconName`) and may ship when the Settings page offers them; Patron stays out. |
| F18 | Session persistence | **1.0** | Exists; 1.0 adds groups, Spaces and the active Space to the saved session. |
| F19 | Context menu | **1.0**, minimal | Link long-press: Open in New Tab, Open in Background, Copy Link, Share. OS hand-off (D4) honored. |
| F20 | HTTP auth policy | **1.0** | Cancel the challenge in `WKNavigationDelegate`, show the error page; no credentials dialog. Tiny. |
| F21 | Telemetry | **1.0**, launch ping only | One `/ping` per app session, behind the privacy step's consent; no product events and no first-day signals (those are desktop's, keyed to desktop versions). Needed for the kill criteria's retention figures. The ping Worker allows only `darwin`, `win32` and `linux` today (`ALLOWED_PLATFORMS`), so M18 adds `ios` with its own version namespace (the app's own version, starting at 1.0.0, counted apart from desktop's); a Worker change the owner deploys, like `sends`. `installId` is a per-install UUID in the app container, reset by a reinstall, as on desktop. |
| F22 | Distribution & updates | **1.0** | The App Store (D9); TestFlight for the beta. |
| F23 | Zoom | **1.0** | Native pinch and reflow (D10); nothing to build. |
| F24 | AutoFill & passkeys | **1.0**, verify | WebKit provides password AutoFill and, with the passkey browser entitlement, passkeys for any site inside `WKWebView`. Apple assigned that entitlement to the account on 2026-09-22 (associated app ID `me.bnfy.bowser`; the iOS App ID `me.bnfy.blanc` needs the capability enabled in the portal). 1.0 verifies both on a real iPhone and claims only what passes. No Blanc code expected. |
| F25 | Encrypted DNS | after | D17: a per-app DNS setting isn't available to a `WKWebView` app; the system setting applies. |
| F26 | WebRTC privacy | after | D18. |
| F27 | Tab Sync | **1.0** | M7a shipped it; 1.0 shows other devices' tabs under their groups (the snapshot already carries them) and their Spaces (§4). |
| F28 | Vertical tabs | N/A | D19; the Duo's inner display is a later milestone. |
| F30 | Favorites migration | after | Safari's bookmarks can't be read on iOS; an HTML file import can come later. |
| F31 | Quiet Tabs | **1.0** | D8: the OS evicts; 1.0 proves an evicted tab comes back with its title, address and back history. |
| F32 | Independent windows | N/A | |
| F33 | Local profiles | N/A | D25. |
| F34 | Glance | after | Duo-2 (regular width only). |
| F35 | Start page layouts | **1.0** | The shared page renders all four; the synced `newtabLayout` picks one. 1.0 checks each at phone width and hides Customize's desktop-only parts (wallpaper). |
| F36 | Onboarding | **1.0** | §3, pairing first. |
| F37 | Blank tab affordance | **1.0** | The pill reads as a field on a blank tab. |
| F38 | 1Password fill | N/A | D26. |
| F39 | Certificate safety | **1.0**, minimal | A failed TLS load shows the error page; no "continue unsafe" in 1.0. |
| F40 | Bring Your Tabs | **1.0**, reinterpreted | The Chrome-profile import is N/A on iOS. What ships is **Bring a Space**: in the palette, pick any device's Space, review its tabs, and bring them onto the phone as that Space, lazily loaded, in one operation. With the Spaces switch on this is just "open the shared Space"; with it off it copies the Space locally. |
| F41 | Blanc Spaces | **1.0**, shared | §4. The desktop sync protocol is a separate design and is built first. |
| F42 | Dark websites | after | Dark Reader through a `WKUserScript` is plausible; after 1.0. |
| F44 | Interface language | **1.0** | The catalog is already served to the pages; 1.0 moves the few native strings (the pill placeholder, "Done," "New Tab") into it and follows the iOS per-app language setting (D27). Six languages, launched together as desktop did. |
| F45 | Arc Spaces import | N/A | |
| F46 | Custom tab names | after | Shown if a shared Space carries one; not editable on the phone in 1.0. |
| F47 | Bangs | **1.0** | M10: the hint row and `!` picker in the palette, the synced setting. |
| F48 | Pinned homes | N/A | |
| F49 | Wallpaper image | N/A | Device-local by design. |
| F50 | Color wallpaper | after | Synced; the shared page renders it, so it may simply work. Checked, not promised. |
| F51 | What's New page | after | App Store release notes serve 1.0. |
| F52 | Tab Archive | after | |
| F53 | Split View | after | Duo-2. |
| F54 | Billboard clock | after | Renders from the shared page and synced settings; checked, not promised. |
| F55 | Send to device | **1.0** | #1088 and #1096, held in draft until the Worker serves `sends`. |
| F56 | Tab gestures | **1.0** | M11: pill swipe to switch, the card strip, flick up to close. |

**Phone needs the desktop spec doesn't list**, all 1.0:

- **Default browser** (D4): the entitlement, http(s) URL handling from other
  apps, and the onboarding step.
- **Receiving a shared link**: an "Open in Blanc" share-sheet action, so a
  link from Messages or Safari opens in Blanc. (Sending *to* another device
  from the share sheet while in another app is after 1.0.)
- **App Store presence**: listing, screenshots from the real app, privacy
  labels (sync ciphertext, launch ping), a support address, release notes.
- **Background refresh**: the sync pass runs on foreground and at most once a
  minute; 1.0 adds iOS Background App Refresh so a phone picked up in the
  evening already has the day's changes (best effort; the OS decides).

## 7. The ladder to 1.0

The October ladder, re-cut. Done or in flight is marked; everything else is
new work in this order. Numbers continue from the existing ones so the old
documents stay correct.

| M | Delivers | Status |
|---|---|---|
| M6.5 | Re-baseline | Done (#1030) |
| M7a | Join a sync, read devices' tabs, publish own | Merged (#1068); real-iPhone check is a gate before TestFlight |
| M7b | Send to device | Desktop and iOS in draft (#1088, #1096); Worker deploy pending |
| M8 | Favorites editable, History live | |
| M9 | Private tabs | |
| **M16** | **Shared Spaces, groups and Recently closed: the desktop protocol** (its own design; Worker stores; desktop UI for the switch, merges, remote closes; desktop-to-desktop Spaces sync). Ships as a public desktop feature release first (§4.7). | New; built in the parallel desktop Spaces session |
| **M17** | **Shared Spaces on iPhone**: the Space mark and menu, groups in the switcher, Bring a Space, the Recently closed band, the per-device switch | New |
| M10 | Bangs, the full shared slash-command set, Find in page, the shield chip and per-site allow | |
| M11 | Tab gestures and the card strip (F56) | |
| Duo-1 | Edge to edge on both Duo displays, the regular-width pill and palette, fold continuity, CI on the Duo simulator | Only "no letterboxing" and the regular-width pill are in 1.0; the rest of the Duo design (Duo-2, Duo-3) is after |
| **M18** | **First minute and release readiness**: the walkthrough (§3), default browser, share-sheet target, Background App Refresh, six languages, App Store listing | New |
| Beta | TestFlight, the real-iPhone gate, kill criteria armed | |
| **1.0** | App Store | |

Order rationale: M8 and M9 are small and make the phone a real browser for
testers early; M16 is desktop work and can run while M9 does; M17 needs M16
deployed; M10 and M11 are polish that benefits from the Spaces model being
settled; M18 is last because it depends on everything it introduces.

## 8. Constraints

- **Platform:** iOS 18.4 minimum, SwiftUI with `WKWebView`, the existing
  `ios/Blanc` project, no SPM packages (the M7a rule). The `spec/` contract,
  `tokens/`, `settings-schema/` and `copy/` substrates generate or guard the
  phone as they do desktop.
- **Sync:** the v1 Worker as it is (ciphertext only, 512 KiB per blob, 30
  GETs a minute per account), new stores added the way `sends` was. No new
  host. Every protocol change gets a security review against
  `docs/security-assessment.md` (R3, R5 carry over). Deploy the Worker before
  any client that needs it.
- **Gates that already exist and stay:** the real-iPhone pairing check before
  TestFlight; CI on a simulator for every iOS change; `copy:check` with all
  six languages in the same PR; `browser-api:check` for the pages bridge;
  marketing claims release-backed.
- **One maintainer.** Desktop still releases weekly. The revisit's kill
  criteria (waitlist, TestFlight seven-day return, pairing rate, 30-day
  retention) are armed at the beta and decide whether 1.0 ships at all.
- **Owner actions outside the code:** the default-browser entitlement
  (`com.apple.developer.web-browser`) is **not yet requested** (owner,
  2026-10-24; the September 22 grant was the passkey entitlement). The owner
  files it now, and **1.0 does not ship until Apple grants it**. The project
  carries neither entitlement yet: no entitlements file, no signing
  entitlement setting, and no Blanc provisioning profile on the build Mac.
  M18 adds `Blanc.entitlements` with both and a profile that includes them;
  the first signed build is the proof.

  **Filing the default-browser request** (Apple's page "Preparing your app to
  be the default web browser," read 2026-10-24): the form is
  `https://developer.apple.com/contact/request/default-browser-entitlement/`
  (behind an Apple Developer sign-in; it can also request
  `com.apple.developer.browser.app-installation` in the same submission).
  Apple's requirements, and where the project stands:
  - declares the HTTP and HTTPS schemes in `Info.plist` — **not yet**; the
    project generates its Info.plist, so M18 adds `CFBundleURLTypes` for
    `http` and `https` (a custom Info.plist or the build setting);
  - no `UIWebView` — met (`WKWebView` only);
  - on launch, a field for a URL, search, or bookmarks — met (the pill);
  - opens an http(s) URL at the destination and renders it as served — met
    (the blocker removes ads and trackers, which Apple's text allows as
    "Safe Browsing or other warning" does not cover; state plainly in the
    request that content blocking uses `WKContentRuleList`, the mechanism
    Safari's own content blockers use);
  - none of the banned privacy keys (`NSPhotoLibraryUsageDescription`,
    always-on location, HomeKit, always-on Bluetooth, Health) — met; the
    app declares none.
  With the entitlement, the app may not claim Universal Links for specific
  domains, and managed entitlements need manual signing in Xcode (Apple's
  forum guidance), which the release build setup in M18 accounts for. The passkey browser
  entitlement (`com.apple.developer.web-browser.public-key-credential`) was
  assigned to the account on 2026-09-22 (Apple's email; associated app ID
  `me.bnfy.bowser`): enable the capability on the iOS App ID `me.bnfy.blanc`
  in the portal, and M18 adds it to `Blanc.entitlements`. The Worker deploys (sync stores and the ping Worker's
  `ios`). The App Store account, listing and screenshots sign-off.

## 9. Left to the builder

- The shared Spaces protocol design (§4): record shapes, position values,
  budgets and the over-budget behavior, how a remote close reaches a desktop
  window mid-session, the migration of a device's local Spaces into the
  library, the acceptance scenarios on both platforms.
- Bring a Space's review screen and lazy loading on the phone.
- The card strip's layout and the pill swipe's physics (F56 contract).
- Whether pairing offers a QR scan beside the code field.
- The share-sheet action's exact form (an action extension vs. a URL scheme).
- Which native strings exist and how they reach the catalog.
- Screenshot and listing production for the App Store, under the
  marketing-claims rule.

## 10. Calls made here, for the owner to check

1. Recently closed syncs 24 hours and 25 entries per device (§5).
2. The active page is never closed under the person's fingers; the remote
   close waits until they leave it (§4.6).
3. Keep means keep everywhere is moot: there is no prompt, removals apply, and
   Recently closed is the safety net (owner, 2026-10-24).
4. Telemetry in 1.0 is the launch ping only, behind consent (§6 F21).
5. Only the Duo's "no letterboxing" and regular-width pill are in 1.0; Split
   View and Glance on the inner display are after.
6. Tab mute, downloads, permissions, Dark websites and Tab Archive are after
   1.0 (§6, each with its reason).
7. Background App Refresh is in 1.0 as best effort.
8. A device's tabs in a shared Space show once, under the Space (§4.1); the
   mechanism is a sidecar, never a change to the frozen F27 entry.
9. The Spaces switch is its own consent, independent of tab sharing (§4.2).
10. A navigation in a shared tab is an edit of the record, applied on another
    device when the person next comes to that tab (§4.3, §4.6).
11. iOS telemetry is the launch ping in its own version namespace, after a
    ping Worker change; no first-day signals (§6 F21).
12. Passkeys are in 1.0, verified on a real iPhone, since the entitlement is
    granted (§6 F24).

## 11. Open questions for the owner

From the builder check of 2026-10-24. Answers go into the sections named.

1. ~~The first minute when the desktop's Spaces switch is off.~~ Answered
   (owner, 2026-10-24): pairing asks the desktop, with consent, to turn its
   switch on (§3 step 2).
2. ~~If the default-browser entitlement isn't granted in time.~~ Answered
   (owner, 2026-10-24): **wait**. The request is filed now and 1.0 ships only
   once it is granted (§8).
3. ~~M16 on desktop.~~ Answered (owner, 2026-10-24): ship it publicly on
   desktop before the phone, built in the parallel desktop Spaces session
   (§4.7).

All three are answered; the document is ready for the owner's approval.
