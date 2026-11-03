# Blanc for Android 1.0: the companion release on Blanc's Chromium fork

**Date:** 2026-11-03
**Status:** Design for the owner's review. Nothing in it is built.
**Owner decisions, 2026-11-03:**
1. Android 1.0 is the **companion**, the same release as Blanc for iPhone 1.0:
   pair with desktop Blanc and sync tabs, groups, Spaces and Favorites.
2. It is built on **an Android build of Blanc's Chromium fork**, not the system
   WebView, GeckoView or a shared Kotlin Multiplatform core.
3. Work runs **in full parallel** with the desktop fork, starting now, in the
   same `chromium/` tree.
4. Builds run on a **rented dedicated Linux server**.
5. Testing uses **one Pixel** (the reference phone) plus **emulators** on that
   server.
6. Distribution is **Google Play first**; a signed APK on GitHub Releases comes
   later, once the update rhythm is proven.
7. **Claude builds it**, in a session on the Linux server, from committed spec
   and plan files with small PRs. Codex keeps the desktop fork.
8. Android **follows Chrome stable on its own schedule**. The desktop fork
   joins that milestone when it's ready (§7.1).
9. Google Play services may be used **for OS features only** (passkeys and
   password autofill through Credential Manager, the QR code scanner), never
   for Google browsing services (§2, §4).
10. When the two lanes compete for the owner's time or the shared tree, the
    **desktop fork goes first**. Android adds temporary Android-only pieces
    rather than waiting (§7).

**Product reference:** Blanc for iPhone as it stands on `main` at 223e40d2d
(2026-11-03): the 1.0 feature set of the
[companion design](2026-10-24-ios-v1-companion-release-design.md) §6, plus the
floating Island (#1328) and glass Island (#1329) that merged after the 1.0
build was submitted. iPhone changes made after this commit join Android only
when the plan is revised to include them (*my call*). Desktop **v1.46.0** is
the reference for anything the phone mirrors from desktop.
**Fork reference:** the desktop replacement
[spec](../../chromium-replacement/2026-10-30-desktop-replacement-spec.md) and
[plan](../../chromium-replacement/2026-10-30-desktop-replacement-plan.md) on
`chromium/migration` (PR #1304). Those documents put Android out of scope for
the *desktop replacement*. This design adds Android as a separate lane in the
same tree. It changes nothing in the desktop contract.

---

## 1. Intent

Blanc has an iPhone app and no Android app. Android is most of the world's
phones, and many desktop Blanc users on Windows and Linux carry one. Today they
have no way to take their tabs, groups and Spaces with them.

**Android 1.0 is "your Blanc, in your pocket," on Android.** Someone who
already uses Blanc on a computer installs it from Google Play and pairs it with
a code from desktop Settings → Sync. Within a minute they see their desktop's
open tabs, groups, Spaces and Favorites. They browse with the Island, open a
desktop tab on the phone, send a page back, and, if they turn it on, work in
the same Spaces from both. Blocking is on by default but is not the pitch.
There is no AI. It is open source.

**Why a Chromium fork rather than the system WebView (owner's choice).**
The fork gives Blanc the engine itself, not a view rented from the OS:
- blocking at the network layer with the same pinned engine as desktop, not
  per-request interception with no cosmetic filtering;
- one Chromium version and patch set shared with the desktop fork;
- room for real extensions later (not in 1.0).

The cost is accepted with it: a large app, a Linux build machine, and a Play
update for every Chromium security release.

**Why in parallel now (owner's choice).** Android should not wait for the
desktop cutover. The two lanes share a tree and a rebase stream, so the rules
in §7 stop them breaking each other.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Feature parity with Blanc for iPhone 1.0 as shipped (§5), with Android's
   own platform needs (§5.2). The two phone apps behave alike (D7: "iOS and
   Android touch affordances should match each other").
2. Pairing is the first thing the app offers and works in under a minute.
3. Wire-compatible with the v1 sync Worker, desktop Blanc and Blanc for iPhone:
   Profile Sync, Tab Sync, Shared Spaces, Recently closed, Send to device.
4. Built from the shared `chromium/` tree, with Android-only code in its own
   folder, on Chrome stable (§7.1).
5. A Chromium security fix reaches Play users on a defined clock (§8.3).
6. Chromium's own data flows to Google are off (desktop spec non-negotiable 3
   applies to Android too).
7. The Play listing makes no claim a release doesn't back
   (`docs/marketing-claims.md`).

**Non-goals for 1.0**

- Extensions. The fork makes them possible; 1.0 doesn't ship them.
- Anything the iPhone 1.0 audit marked *after* or *N/A* (downloads list, Blanc
  permission prompts, Dark websites, Tab Archive, Split View, Glance, Bangs,
  Patron purchase), unless Chromium already provides it for free *and* it
  passes its own check. "Free" features still need a check before anyone
  claims them.
- Tablets, foldables, ChromeOS, Android TV, Android Auto and Wear OS. A tablet
  gets the phone layout.
- A GitHub APK, F-Droid or any other store in 1.0.
- A self-updater (D9 / spec "store-managed").
- Protected-media (Widevine) claims. See §9, known unknown K1.

**Anti-goals** (1.0 has failed even if it works)

- Looking like re-skinned Chrome: a Chrome toolbar, a Chrome tab switcher,
  Chrome's New Tab page, Discover, or any Google sign-in prompt.
- Any request to a Google service that desktop Blanc doesn't make (sign-in,
  Chrome Sync, Safe Browsing pings, field trials, crash upload, Discover feeds,
  Play-services "usage and diagnostics" from the browser). The exception is
  the OS features in owner decision 9: Credential Manager, autofill and the
  code scanner, used only when the person invokes them. The privacy gate
  (§8.1) has an allowlist for exactly those flows.
- Sync that silently loses a page. A closed tab is still open somewhere or is
  in Recently closed.
- A Chromium security release that sits unshipped past the clock in §8.3.
- The Android lane breaking the desktop fork's build, or the reverse, without
  either side noticing before merge.
- Any AI feature or copy that reads as one.

## 3. Constraints

- **Build host.** Chromium for Android builds only on x86-64 Linux. The Mac
  mini can't build it. Builds run on a rented dedicated Linux server: 16 or
  more cores, 128 GB RAM, 1 TB or more NVMe, Ubuntu LTS, reachable over SSH.
  A Hetzner AX-class machine is the reference. The owner rents it and holds the
  account. It serves the Android lane. It may build desktop Linux
  incrementally to check a shared patch, with the owner's approval. Whether it
  becomes the desktop's Linux build host is desktop decision D4, not this
  design's (*my call*). Like the Mac mini, it keeps checkouts, outputs, caches, signing-free
  test builds and raw evidence. None of that goes in Git.
- **Signing.** The Play app-signing key is managed by Play App Signing. The
  upload key and the Play Developer API service-account credential live in
  1Password (vault **Dev**). Neither ever reaches the repo or the Linux server.
  The server builds an unsigned release bundle. The release script on the
  owner's Mac downloads it, verifies its checksum against the build record,
  signs it with the upload key through `op run`, and uploads it through the
  Play Developer API. That follows desktop's pattern of `release.sh` with
  `op run` (*my call*). Day-to-day builds on the server use a debug key.
- **Identity.** The Android application ID is permanent once published.
  *Proposed:* `me.bnfy.blanc`, matching iOS (calls list, §11). Display name
  "Blanc". The data directory is the app's own, so nothing is shared with any
  installed Chrome.
- **Minimum Android version** follows the pinned Chromium's `minSdkVersion`
  for its Chrome-public target (Android 10 / API 29 in recent milestones; the
  builder confirms it from source at the pinned milestone). Architectures:
  arm64-v8a, plus x86_64 for emulators. No 32-bit ARM.
- **Play developer account** as an **organization** (Bananify Creative, needs
  a D-U-N-S number). A new personal account would have to run a closed test
  with 12 testers for 14 days before production. Registration is the owner's
  click.
- **Licensing.** Chromium's BSD license and its third-party notices ship in the
  app (`chrome://credits` equivalent, reachable from Blanc's About). Blanc's MIT
  grant and reserved identity assets (`ASSET-LICENSE.md`) apply as on desktop.
  The fork's `THIRD_PARTY_NOTICES.md` covers Android additions.
- **Privacy.** Same telemetry as iPhone: one launch `/ping` per app session,
  behind the privacy step's consent, no product events. Sync stays end-to-end
  encrypted. Private tabs never reach history, session, sync or Recently
  closed.
- **Public repository.** Nothing covered by the castLabs NDA goes in this repo.
- **Strings.** Every Blanc-authored string comes from `copy/messages/` in all
  six languages. The substrates already generate `copy/generated/android/`,
  `tokens/generated/Tokens.kt` and `settings-schema/generated/BlancSettings.kt`.
  The builder decides how the Chromium build consumes them (Android resources
  versus GRD). The source of truth stays the JSON, and `substrate:check` guards
  it.

## 4. Architecture

**Rule (from the desktop spec §4, unchanged): use Chromium's models and
machinery; draw Blanc's UI.** Custom native code only where Chromium lacks the
behavior or contradicts a Blanc contract.

**Base.** Chromium's own Android browser (`//chrome/android`, the
`chrome_public` / Trichrome-style targets) with Blanc patches on top, the way
Brave, Vivaldi and Cromite are built. Chromium removed WebLayer in 2023, so
there is no slimmer supported embedding. `content_shell` is a test harness,
not a product base.

**Where the code lives** (in the existing `chromium/` tree):

| Path | Holds |
|---|---|
| `chromium/patches/` | Shared patches, unchanged in meaning. A patch that applies on both platforms stays here. |
| `chromium/patches/android/` | Patches only Android needs (hiding Chrome's toolbar and tab switcher, removing Google services UI). |
| `chromium/blanc/android/` | Blanc's Android code: the Island, sheets, pairing, Settings sections. |
| `chromium/blanc/` (shared) | The blocker host, the sync runner, policies that both platforms use. |
| `chromium/tracker.json` | Gains an `android` platform column. Desktop rows aren't changed by the Android lane. |
| `chromium/STATUS.md` | Gains an **Android** section, overwritten in place like the rest. |

**Subsystem decisions**

| Area | Decision | Notes |
|---|---|---|
| Island, palette, Quick Switcher, tab card strip | **Custom native Android UI** matching Blanc for iPhone's Island (bottom by default, top/bottom setting, floating and tucks on scroll as in #1328, swipe to switch tabs, flick up to close). Chrome's toolbar, omnibox UI and tab switcher are hidden. | The desktop fork's Island is WebUI. On Android the builder decides whether the Island is native views or a WebUI view; the deciding test is touch feel and accessibility at phone width. *My call:* native views, because Android's gesture and IME handling for a bottom bar is easier there. |
| Tabs, groups, pins, reopen | **Adapt native** tab model and `TabGroupModel`, with Blanc's ordering rules as a thin layer (the same rules as `src/main/tab-sections.js` and iOS `TabSections.swift`). | Group names without colors, optional preset color, case-insensitive matching. |
| Private tabs | **Adapt native** incognito profile, shown in Blanc's private theme. | Same contract as F4. Whether private tabs mix with normal ones in the switcher follows the iPhone app. |
| Address input, search | **Adapt native** `TemplateURLService`, with Blanc's input heuristic and engine list (DuckDuckGo default, custom `%s`). | No Google suggest endpoints. |
| Favorites, history | **Adapt native** `BookmarkModel` and `HistoryService`, drawn by Blanc's pages or sheets. History keeps the 5,000-entry cap unless desktop's V2 decision changes it, in which case Android follows desktop. | |
| Internal pages | `blanc://` newtab, favorites, history, settings, shortcuts, error and mahjong are served from the bundle, the same files as desktop and iPhone. | Each is checked at phone width in all six languages. |
| Settings | **Native `chrome://settings` re-scoped** (desktop V1 applies): Google, Chrome Sync and Safety-check sections removed, Blanc's sections added (Sync, pairing, blocking, Island position, appearance, language). | |
| Blocking | **Shared with desktop:** the pinned Ghostery engine in a sandboxed utility with URLLoader interception, cosmetic CSS and scriptlets. One shield chip with an exact count, per-site allow and re-block. | This is better than iPhone's single rule list, and the design says so honestly (§6). |
| Sync family | **Shared with desktop:** the desktop fork's sandboxed V8 runner of shipping sync JavaScript (models and crypto), with native code only for keys (Android Keystore), network and storage. | Wire-compatible by construction. If the desktop runner isn't ready when Android needs it, the Android lane builds it in `chromium/blanc/` for both, rather than an Android-only port. |
| Pairing | QR scan of the desktop pairing code with the Play services code scanner, falling back to a CameraX scanner on phones without Play services, plus a typed code. | Same codes as iPhone. |
| Send to device, receive shared links | A share-sheet target ("Open in Blanc") and Blanc's Send to device. | |
| Default browser | `RoleManager.ROLE_BROWSER` prompt in onboarding; intent filters for http/https. | No entitlement needed, unlike iOS. |
| Passwords, passkeys | **Native** Android Autofill framework and Credential Manager through Chromium's own integration, which uses Play services (owner decision 9). Blanc never signs the person in to Google. Phones without Play services browse normally but get only what their OS offers. | Claimed only after a real-Pixel check passes. |
| Downloads | Chromium's native download handling to the Downloads directory works, and an opened file goes to the system. A Blanc downloads list is *after* (iPhone parity). | |
| Updates | Google Play only. | |
| Telemetry | Launch `/ping` with `platform: 'android'`. The ping Worker's `ALLOWED_PLATFORMS` gains `android`, with its own version namespace. The owner deploys the Worker change before the app that needs it ships. | |
| Crash reporting | Off (Chromium crash upload disabled). Play Console's Android vitals are the only crash signal, and the privacy label says so. | |

## 5. What 1.0 includes

### 5.1 Parity with Blanc for iPhone 1.0

Android 1.0 ships every row the iPhone audit (companion design §6) marked
**1.0**, as the iPhone actually shipped it. The rows where Android's answer
differs:

| F | Feature | Android 1.0 |
|---|---|---|
| F2 | Tabs | Includes **mute** (Chromium has per-tab audio muting; iPhone deferred it). |
| F8 | Find in page | Native `FindTabHelper` behind Blanc's capsule. |
| F12 | Blocking | The full desktop pipeline (network, cosmetic, scriptlets) with an exact shield count. Divergence D1/D13 entries are updated: Android matches desktop, not iPhone. |
| F13 | Permissions | Chromium's Android prompts with Blanc's default-deny policy where the desktop fork has implemented it; otherwise Chromium's prompts. Blanc's own prompt UI is *after*, as on iPhone. |
| F20 | HTTP auth | Same as iPhone: cancel and show the error page. |
| F23 | Zoom | Native pinch and text scaling. |
| F24 | AutoFill and passkeys | Android Autofill and Credential Manager (§4). |
| F25 | Encrypted DNS | Chromium's own secure DNS is available. Whether 1.0 exposes it follows desktop's setting. Claimed only if checked. |
| F31 | Quiet Tabs | Native tab discarding with Blanc's eligibility rules; an evicted tab returns with its title, address and back history. |
| F39 | Certificate safety | Chromium's interstitial (desktop V8 applies). |
| F17 | App icons | The Sunrise icon only. Alternate icons on Android need `activity-alias` swapping (D11) and are *after*. |

### 5.2 Android's own needs (all 1.0)

- **Default browser** role prompt in onboarding and http/https intent handling.
- **"Open in Blanc"** share target, matching the iPhone share extension.
- **System back:** Android's back gesture navigates back in the page, then
  closes the palette or sheet, then exits. It never closes a tab silently.
  Predictive back is supported where the platform offers it.
- **Edge-to-edge** layout with correct insets for gesture and three-button
  navigation, display cutouts and the IME.
- **Dark theme** follows the system, and `/theme` works as on iPhone.
- **Per-app language** (Android 13+) maps to `uiLanguage`, the Android
  counterpart of iPhone's D27.
- **Background sync:** WorkManager runs a best-effort periodic sync, like iOS
  Background App Refresh. The OS decides when it runs.
- **Play presence:** listing, screenshots from the real app (not of Wikipedia),
  the Data safety form, a support address, release notes.

## 6. Honesty about the two phone apps

The two phone apps match in what a person does. They differ in how well they
block, because the engines differ. Android blocks like desktop; iPhone uses one
rule list. Copy never claims the iPhone blocks like Android does, or the
reverse. The parity matrix records Android's column truthfully, and the
divergence register gains rows where Android's answer is new (§10).

## 7. Running two lanes in one tree

The desktop fork's working rules (`chromium/README.md`) apply to Android, with
these additions:

1. **Android follows Chrome stable (owner decision 8).** Android rebases onto
   each Chrome stable milestone and its security respins. Desktop is pinned to
   a 158 preview and may choose Extended Stable (desktop D6), which Android
   doesn't have. So the lanes may sit on different milestones. Shared patches
   keep one source and carry milestone-specific variants only while the lanes
   differ, each variant recorded in the rebase ledger. When desktop moves to a
   stable branch, it moves to Android's milestone where it can, so the
   variants go away.
2. **Shared patches have one owner per change.** A change to a shared patch
   or to `chromium/blanc/` (shared) needs `check-patches.py` to pass for both
   lanes' pinned milestones. The author builds their own platform and states
   in the PR which build they haven't run. The other lane's agent confirms
   before merge. **Exception:** a security rebase under the §8.3 clock doesn't
   wait for that. It lands on Android, and desktop confirms afterwards.
3. **Desktop first on ties (owner decision 10).** When both lanes need the
   owner or the same shared change, desktop goes first. Rather than wait,
   Android may add a temporary Android-only version under
   `chromium/blanc/android/`, marked in `STATUS.md` with the shared piece it
   stands in for. It merges into the shared version once desktop's lands.
4. **One current candidate per platform**, with at most two features in
   progress on Android, as on desktop.
5. **Small PRs into `chromium/migration`**, one branch per piece of work. The
   Android lane never pushes to the desktop lane's branches.
6. **Separate evidence.** Android reports go to `chromium/reports/android-*.json`.
   Raw evidence stays on the Linux server.
7. **Authorization mirrors desktop.** Cold builds, new machines, and anything
   that spends money or publishes need the owner's explicit approval, scoped
   per item.

## 8. Testing, release and updates

### 8.1 Testing

- **Unit and browser tests** in Chromium's harness for Blanc's Android code
  (`chrome_public_test_apk`-style targets, plus Robolectric where Chromium uses
  it).
- **Acceptance:** the shared `spec/acceptance/*.feature` scenarios that the
  iPhone runs are bound to Android steps (UI Automator or Espresso, driven
  from the server's emulators). Every scenario maps to a feature row, and the
  report says pass, fail or undefined, never a silent skip.
- **Wire compatibility:** sync runs against a staging Worker with a desktop
  fixture profile and an iPhone fixture, both ways.
- **Privacy gate:** an outbound-request capture over a scripted session finds
  no request to a Google service desktop doesn't make (§2 anti-goals). This
  gate blocks release.
- **The Pixel** is the reference for hands-on gates: pairing in under a
  minute, gestures, back behavior, default browser, passkeys, the share
  target, battery and memory over a day of use. Checks Claude can automate,
  it automates, and the owner does only what needs hands.

### 8.2 Release

- Play's **internal** track first, then **closed** (owner plus invited
  testers), then **open** beta, then **production** with staged rollout.
- A release workflow builds the release-signed Android App Bundle from a
  clean, tagged commit of the tree on the Linux server or a runner there. It
  emits an SBOM and checksums, signs those with Sigstore as desktop does, and
  uploads to Play through the Play Developer API.
- Version code and version name are independent of desktop's, as on iPhone.

### 8.3 Security update clock (*my call*, calls list §11)

- A Chromium **stable security release** reaches Play's production track
  within **7 days**.
- A fix for a vulnerability **exploited in the wild** reaches it within
  **72 hours**.
- Every rebase passes the privacy gate and the acceptance subset marked
  `@android-smoke` before upload.
- A missed clock goes in `STATUS.md` with its reason. Two misses in a quarter
  trigger the kill-criteria review (§8.4).

### 8.4 Indicators and kill criteria

Mirroring the iPhone's, set before launch:

| Signal | Healthy | Trigger |
|---|---|---|
| Desktop Sync users who pair an Android phone within 60 days | ≥10% | <3% |
| 30-day retention | ≥15% | <8% for two monthly cohorts |
| Android monthly actives six months after launch | ≥750 | <200 |
| Security clock met | every release | two misses in a quarter |
| Maintainer and agent time on Android | ≤25% | >35% for two quarters |

A trigger opens a review with the owner. It does not end the app
automatically.

## 9. Known unknowns

- **K1. Widevine on Android.** On Android, Chromium plays protected media
  through the OS's MediaDrm, so the desktop VMP question may not apply. That
  is unconfirmed. Before 1.0 the builder checks it on the Pixel (does a
  Widevine test stream play?), and the owner confirms the licensing position
  with the right party. Nothing NDA-covered goes in this repo. Until then, no
  public claim is made about protected playback, and a failing EME request
  shows Chromium's own error.
- **K2. Desktop runner readiness.** The sync runner and blocker host are
  desktop work in progress, partly as drafts that exist only on the Mac mini.
  The Android lane reads those drafts through the existing read-only SSH
  access to the Mac mini and never edits there. The shared version is owned
  by the lane that first integrates it into the canonical tree. Until then,
  §7.3's temporary Android-only versions apply (*my call*).
- **K3. App size.** A Chromium APK is large (tens of MB per ABI after Play's
  splits). The builder measures the download size and records it. No target
  is set.
- **K4. Rebase cost on Android.** Hiding Chrome's Android UI touches many
  upstream files. The first two rebases measure the cost and record it in the
  ledger.
- **K5. Play review of a Chromium fork.** Play accepts Chromium-based browsers,
  but the Data safety form and any "browser" policy need care. The first
  internal-track upload surfaces this early.

## 10. Spec and repository changes that come with it

- `spec/parity-matrix.md`: the Android column gets real states as rows land.
- `spec/divergence-register.md`: D1 (blocking) records that Android uses the
  shared fork engine. D11 (icons) keeps "after". New rows as needed for system
  back, edge-to-edge and the background sync model.
- `spec/README.md`: "Android is not built yet" becomes the lane's status.
- `copy/`: Android-only strings (role prompt, share target) join `en.json` and
  all languages in the same PR.
- `cloudflare/ping-worker`: `android` added to `ALLOWED_PLATFORMS`, deployed
  by the owner before the first public build.
- `docs/android/`: a Play Console checklist like `docs/ios/app-store-connect.md`.
- `CLAUDE.md` / `AGENTS.md`: one short paragraph naming the Android lane and
  where its spec and plan live.

## 11. Calls made here, for the owner to check

1. Application ID `me.bnfy.blanc` (permanent once published).
2. The Island as native Android views rather than WebUI (the builder may
   reverse this with evidence).
3. History keeps the 5,000 cap, following desktop's V2 decision whenever it
   comes.
4. Mute ships in 1.0 on Android although the iPhone deferred it.
5. Security clock: 7 days for stable security releases, 72 hours for
   exploited-in-the-wild fixes.
6. Kill-criteria thresholds in §8.4 (pairing ≥10% healthy, lower than the
   iPhone's 15%, because fewer Android users have a desktop Blanc today. This
   is a guess).
7. Organization Play account (needs a D-U-N-S number).
8. No crash upload; Play's Android vitals only.
9. The parity target is iPhone `main` at 223e40d2d. Later iPhone changes join
   Android only through plan revisions.
10. Release signing and upload run from the owner's Mac. The Linux server
    never holds the upload key or the Play credential.
11. The Linux server is Android's. Making it the desktop's Linux host is
    desktop D4.
12. Android reads desktop drafts read-only from the Mac mini. Whichever lane
    integrates a shared piece first owns it.

## 12. Left to the builder

- Native views versus WebUI for the Island, backed by a spike at phone width.
- How substrates feed the Chromium build (Android resources versus GRD).
- The test harness binding for shared Gherkin scenarios.
- Exact server spec within §3's floor, and the emulator images.
- The order of milestones in the plan, inside the rules of §7.
