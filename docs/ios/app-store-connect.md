# Blanc for iPhone: App Store Connect and TestFlight

What the App Store path needs for `ios/Blanc` (bundle `me.bnfy.blanc`, team
`XYGUCY4498`), checked against the live portal and App Store Connect on
2026-10-28. The 1.0 plan is
[2026-10-24-ios-v1-companion-release-design.md](../superpowers/specs/2026-10-24-ios-v1-companion-release-design.md)
(§7 ladder, §8 constraints).

**Status:** done · **missing** (work in this repo) · **owner** (the owner's
account or decision; the exact next step is given).

## Checklist

| # | Item | Status | Where it stands |
|---|---|---|---|
| 1 | Apple Developer Program membership | done | Team `XYGUCY4498` (Anthony Loria), active. The updated Program License Agreement (deadline 2026-10-28) was accepted by the owner on 2026-10-28. |
| 2 | Paid Applications Schedule | done | The Paid Apps Agreement is Active (accepted 2026-10-28, through 2027-04-20), with the bank account, U.S. Form W-9 and EU Digital Services Act compliance all Active under Business. |
| 3 | Explicit App ID | done | `me.bnfy.blanc`, description "Blanc", registered 2026-10-28 (portal id `AH26QN742H`). Only the default In-App Purchase capability is on. Development builds still use Xcode's wildcard team profile; App Store builds use the explicit ID. |
| 4 | Default-browser entitlement (`com.apple.developer.web-browser`) | **owner** (waiting on Apple) | First request (`8P7TL5BJK4`, 2026-10-28) was declined the same day only because Apple had no way to install the app (no TestFlight link, App Store binary or IPA). Refiled 2026-10-28 after the beta was approved, as Request ID `P2X5BCD4C9`, with the public TestFlight link and the text below. 1.0 ships only once Apple grants it (§8). When granted: turn on Default Web Browser for `me.bnfy.blanc` in the portal and add the key to `ios/Blanc/Blanc.entitlements` in the same change. |
| 5 | Passkeys | done (correction) | The entitlement Apple assigned on 2026-09-22 is **Web Browser Public Key Credential Requests** (`com.apple.developer.web-browser.public-key-credential`). The portal lists it as **macOS only**, enabled on `me.bnfy.bowser`, the desktop app's ID. It doesn't apply to the iPhone app and can't be enabled on `me.bnfy.blanc`. On iOS, passkeys for any site inside `WKWebView` come with the default-browser entitlement (item 4), so F24 depends on that grant. Verify on a real iPhone once it's granted. |
| 6 | Entitlements file | done | `ios/Blanc/Blanc.entitlements`, wired as `CODE_SIGN_ENTITLEMENTS` for Debug and Release. Empty until item 4 is granted: a managed entitlement that the App ID doesn't carry makes signing fail. |
| 7 | Distribution certificate | done | Signing uses Apple's cloud-managed **Apple Distribution** certificate (exists on the team, expires 2027-06-07); nothing is installed on this Mac. The two older "iOS Distribution" certificates belong to Expo builds of other apps; leave them. |
| 8 | App Store provisioning profile | done | xcodebuild created "iOS Team Store Provisioning Profile: me.bnfy.blanc" through the API key on 2026-10-28 and renews it itself. Once item 4 is enabled on the App ID, automatic signing should pick it up. If it refuses a managed entitlement, create a manual App Store profile in the portal and set `signingStyle` to `manual` with that profile in `ios/Blanc/ExportOptions-AppStore.plist`. |
| 9 | App Store Connect app record | done | **Blanc: Web Browser** (owner's choice of name), Apple ID `6828027794`, SKU `blanc-ios` (permanent), primary language English (U.S.), bundle `me.bnfy.blanc`, all users have access. Created 2026-10-28. The home-screen name stays **Blanc** (the bundle name). |
| 9a | Content Rights, price and availability | done | Content Rights: "uses third-party content, with the necessary rights" (a browser loads sites on request and redistributes nothing), answered by the owner 2026-10-28. Price: free. Availability: 174 countries and regions, all but China mainland, which requires an ICP filing number Blanc doesn't have. |
| 10 | Category | done | Primary Utilities, secondary Productivity (owner, 2026-10-28). |
| 11 | App Store Connect API key | done | Team key **Blanc iOS**, key ID `GPW3TM234K`, Admin (cloud signing needs Admin), issuer `95d93431-9f13-4516-bb7c-7a4b916e6396`. The private key is the document item **App Store Connect API key - Blanc iOS** in 1Password vault Dev; `ios/.env.1password` references it. Apple won't offer the key file again. |
| 12 | Archive and upload, local | done | `npm run ios:testflight` (`scripts/ios-testflight.sh`): archives Release, signs through the API key, uploads to App Store Connect. `-- --export` stops at a signed `.ipa` in `dist/ios/<build>/export`. The build number is UTC minutes (`202610281600`), so every upload is new. It refuses uncommitted changes under `ios/` unless `BLANC_IOS_ALLOW_DIRTY=1`, and never submits for review. First upload: 0.1.0 (202610281506) from `d68bf184d`, 2026-10-28. Second: 0.1.0 (202610281624) from `a574ff067`, 2026-10-28, the first with the `http`/`https` schemes and link handling (#1224). Third: 0.1.0 (202610281838) from `def9e5741`, 2026-10-28, the first with phone pages for History and Favorites and one History visit per page (#1234). Latest: 0.1.0 (202610282331) from `7e6b98fb6`, 2026-10-28, the first with Clear cookies, cache & site data in Settings → Privacy (#1250). |
| 13 | Archive and upload, CI | **missing** | Later: a `workflow_dispatch` job on a macOS runner with the key in a GitHub environment secret, running the same script. |
| 14 | Export compliance | done, owner to confirm | `ITSAppUsesNonExemptEncryption = NO`, so TestFlight doesn't ask per build. Reason: every cipher the app uses is Apple's own. Sync's AES-GCM and HKDF are CryptoKit, scrypt's PBKDF2 is CommonCrypto, and HTTPS is the system's. Apple exempts encryption used only through the operating system from export documentation. Revisit if the app ever ships its own cipher implementation. |
| 15 | Privacy policy URL | done | <https://blanc.day/privacy> covers the iPhone beta (#1227, deployed 2026-10-28 as `3898c40`). It is set as the app's privacy policy URL and in TestFlight's test information. Support URL: <https://blanc.day/support>. |
| 16 | App Privacy labels | done | **Data Not Collected**, published 2026-10-28. Sync uploads only end-to-end-encrypted ciphertext that Blanc can't read, and Apple counts data as collected only when the developer can access it. When M18 adds the launch ping (a random per-install ID plus version and platform), update the label first: Identifiers → Device ID and Usage Data, both for Analytics, not linked to the person, no tracking. |
| 17 | Age rating | done | Saved 2026-10-28 with the owner's approval: **Yes** to Unrestricted Web Access, No or None to everything else, no override. Apple's result: 16+ (173 regions), 15+ in Brazil and Korea, 17+ on iOS before 26. |
| 18 | TestFlight internal testers | done | Internal group **Blanc team** with automatic distribution, its one tester the owner (Account Holder), created 2026-10-28. Internal testing needs no Beta App Review; only App Store Connect team users can join it. |
| 18a | TestFlight external testers | done | Public group **Public beta**, link <https://testflight.apple.com/join/AfczdZne> (limit 1,000), live since Beta App Review approved build 0.1.0 (202610281624) on 2026-10-28; blanc.day/download links to it (#1233). Build 202610281838 (phone History and Favorites pages) is in the group and was submitted for beta review the same day. Build 0.1.0 (202610282005), which adds Pair with your Blanc (#1235), was uploaded on 2026-10-28, added to the Public beta group and approved by Beta App Review on 2026-10-28 (APPROVED). Build 0.1.0 (202610282331), which adds Clear cookies, cache & site data (#1250), was added to the group and approved for beta testing on 2026-10-28, with the What to Test note "Everyday browsing, the Island and tab list, ad blocking, joining a desktop Sync with a code, naming tab groups, and clearing cookies, cache and site data in Settings → Privacy." |
| 19 | App icon | done, watch | Since 2026-10-29 the icon is an Icon Composer package, `ios/Blanc/Blanc/AppIcons/AppIcon.icon` (Sunrise Dawn), with five alternates beside it, all generated by `npm run brand:build`. Xcode renders the App Store icon and the flat icons for iOS 18–25 from the package. The first upload with it is the test. Before that, `AppIcon` was one 1024 px PNG (accepted on the 2026-10-28 upload). |
| 20 | Screenshots, description, keywords, release notes | **missing** (M18) | Produced in M18 from the real app, under `docs/marketing-claims.md`. |

## Real-iPhone pairing check (M7a gate), 2026-10-28

On the owner's iPhone Air with TestFlight build 0.1.0 (202610281506), against
the public desktop Blanc 1.44.1 on a temporary profile with a throwaway sync
(deleted afterwards):

- joined the sync with a code from Add another device; passed
- the Mac's tabs showed in the phone's tab list; passed
- with Share this device's tabs on, the Mac listed the phone as iPhone; passed
- the theme set on the Mac reached the phone; passed after **Sync now**, since
  the foreground pass runs at most once a minute and the owner had brought
  Blanc forward within that minute
- after a force-quit and relaunch the phone was still in the sync, its key read
  from the Keychain; passed
- Disconnect on the phone removed it from the Mac's Other devices; passed

Not checked on the phone: rename from desktop, theme from phone to Mac, and
joining by recovery code or by name and passphrase (those two passed on the
simulator at `3529b56`). Wording noticed: the phone says **Disconnect** and
**Switch account** where desktop says **Turn off** and **Connect to a
different sync with a code**.

## Default-browser request: what to enter

Apple's form at <https://developer.apple.com/contact/request/default-browser-entitlement/>,
read on 2026-10-28 (it needs the latest Program License Agreement accepted,
which it now is). Filed on 2026-10-28 with exactly these answers (Request ID
`8P7TL5BJK4`).

- **Requirement checkboxes:** all true at that point. No `UIWebView`
  (`WKWebView` only). The Island's address and search field is there at
  launch. The app doesn't claim Universal Links. It declares none of the
  listed privacy keys. It opens an http(s) link at its destination and renders
  it as served.
- **App Name:** Blanc · **Bundle ID:** `me.bnfy.blanc`
- **Built for iOS, iPadOS, or visionOS:** I confirm
- **Website:** <https://blanc.day> (name, email and team come prefilled from
  the account)
- **Already available in the App Store or elsewhere:** No (TestFlight only)
- **Available on TestFlight with a public link:** No (it then asks; only the
  internal group exists)
- **Browser App Installation (EU):** No
- **Other details:**

  > Blanc is an independent web browser from Bananify Creative, released on
  > macOS, Windows and Linux (https://blanc.day). Blanc for iPhone is a
  > WKWebView browser: it opens with an address and search field and the
  > person's Favorites, and opens http and https links at their destination.
  > It blocks ads and trackers with WKContentRuleList, the mechanism Safari
  > content blockers use, built from the EasyList and EasyPrivacy lists; it
  > never redirects a page or injects content. It declares none of the
  > restricted privacy keys. It is in TestFlight testing and not yet on the
  > App Store; we can add a reviewer as a TestFlight tester.

## Running an upload

```bash
npm run ios:testflight
```

It needs `op` (1Password desktop integration) and Xcode. The build appears
under TestFlight in App Store Connect after Apple processes it (usually 5–30
minutes). Builds from Debug, the simulator or `--export` are never uploaded.
