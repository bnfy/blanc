# Connect your iPhone: pairing in under a minute

**Date:** 2026-10-28
**Status:** draft for the owner's approval. The owner made the seven decisions marked *(owner)* on 2026-10-28 (four before the draft, three after its builder check); everything marked *(call)* is the author's, listed in §12 for checking.
**Builds on:** [2026-10-16-sync-device-pairing-design.md](2026-10-16-sync-device-pairing-design.md) (the pairing code, the Worker's `/v1/pair` route, the recovery code), [2026-10-24-ios-v1-companion-release-design.md](2026-10-24-ios-v1-companion-release-design.md) (the iOS 1.0 contract: §3 the first minute, §8 the constraints), [2026-10-25-shared-spaces-sync-design.md](2026-10-25-shared-spaces-sync-design.md) §4.7 (the desktop's Spaces question after a device joins).
**Replaces:** the iOS contract's "a camera QR scan of the same code may be added here and is a builder's call" (§3 step 2, §9). This document makes that call.

## 1. Why

The iOS contract's promise is "your Blanc, in your pocket," and its measure is that pairing works in under a minute. Today it takes about a dozen steps, and two of them can stop a person cold:

1. The desktop must already sync. If it doesn't, the person first has to invent a sync name and a passphrase. That's the exact step that forked the owner's account on 2026-10-16, and the one people forget months later.
2. They find Settings → Sync → Add device, read an eight-character code, pick up the phone, find Settings → Sync there, and type the code before ten minutes run out.

Nothing in this flow needs to be hard. The code already carries everything the phone needs, and a passphrase is only one way to make an account, not a requirement of the protocol. This design removes the invented secret, puts the code into a QR the phone reads in one glance, and has the desktop confirm when the phone has arrived.

**The experience in one paragraph.** On the Mac, the person chooses **Connect your iPhone**, from the start page's Finish setup list or from Settings → Sync. If Sync is off, the sheet says it will turn Sync on, with no name or passphrase, and one press of **Continue** does it. The sheet then shows a QR code and the same code as text. On the iPhone, in Blanc, they choose **Pair with your Blanc**; the camera is already live, they point it at the screen, the phone gives a tap of haptic feedback, and the sheet on the Mac turns into "iPhone joined.", with the Spaces question right there. Hands on the phone for a few seconds; no typing.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A person with Blanc on a Mac and Blanc on an iPhone pairs them without typing anything and without inventing or remembering a secret.
2. Sync can start on any first computer without choosing a name or passphrase *(owner)*. The iPhone stays join-only (§7.1) *(owner)*.
3. The pairing secret's exposure does not grow: the QR carries exactly the code the sheet already shows; no server ever sees the code; the ten-minute, one-use window is unchanged.
4. The desktop knows when the new device has arrived and says so, and the M16 §4.7 Spaces question appears at that moment, in the sheet the person is looking at.
5. The typed code, the recovery code and the name-and-passphrase path all keep working, one level deeper.
6. No Worker code change. One Worker configuration change, raising the new-account daily budget, which the owner deploys before the release (§5.1) *(owner)*.

**Non-goals**

- The M18 walkthrough itself (welcome, privacy choices, default browser, "what arrived"). This design delivers the pairing step M18 embeds (§7.4) and nothing else of M18.
- Scanning on the desktop. Desktops show codes; phones scan them.
- Device lists with remote sign-out, or revoking a device (still the v2 protocol's job).
- A non-consuming "was my code claimed?" Worker route. The desktop learns of the join from the device's own presence entry instead (§6.3).
- Moving an existing passphrase account to a generated one. Existing syncs keep working exactly as they do.
- Android.

**Anti-goals (a failure even if it works)**

- Any path where the code reaches a server, a log, analytics, a crash report or a page script.
- A link that other apps or web pages can use to make a phone join someone else's sync without the person's explicit confirmation.
- A generated account a person can lose silently: if they lose every device, the recovery code must have been offered clearly enough that losing it was their informed choice.
- iPhone wording in a public desktop build before Blanc for iPhone is publicly available *(owner, §9)*.
- A slower first device. Starting Sync must get shorter, never longer.

## 3. Constraints

- **Desktop:** official ECS Electron as shipped; sandboxed renderers; every new `pages:settings:*` channel guarded in `pages.js`, exposed in `tab-preload.js`, recorded in `browser-api/bridges.json` (`npm run browser-api:build`). Boundary files need `npm run audit-inventory:write`. Personal profile only, like all of Sync.
- **iOS:** iOS 18.4 minimum, SwiftUI, no SPM packages (M7a's rule). The default-browser entitlement rules out Universal Links for specific domains (contract §8), so no link may depend on one. The camera permission string (`NSCameraUsageDescription`) is allowed: Apple's banned keys for the default-browser entitlement are photo library, always-on location, HomeKit, always-on Bluetooth and Health (contract §8), and camera isn't one of them.
- **Files other sessions own:** this work doesn't touch `ios/Blanc/Blanc/SlashCommand.swift` (M10), `TabsManager.swift`, `TabSets.swift` or any `Spaces*` view (M17). `project.pbxproj` will see both this work and M17's; rebase on M17 before merging.
- **Sync Worker:** no code change; the v1 routes as deployed. The new-account daily budget (`NEW_ACCOUNT_DAILY_LIMIT` in `cloudflare/sync-worker/wrangler.toml`, 10 today, set 2026-10-25) applies to generated accounts as it does to passphrase accounts, and rises to 100 (§5.1).
- **The desktop's own request window:** at most 10 GETs in any trailing 60 s for every reason, shared round-robin across the request classes (`sync-scheduler.js`; M16 §6.2). Anything new that reads the Worker spends from that window.
- **Copy:** every new string in `copy/messages/en.json` and the five translations (de, es, fr, it, pt-BR) in the same PR; `npm run copy:build`, `copy:check`. iOS native strings use the `ios.*` keys, as the existing Sync screen does.
- **Marketing claims:** release-backed (`docs/marketing-claims.md`). The website's Sync and iPhone pages change only when the releases that ship this are public.
- US spellings.

## 4. Design principles (Apple's *Designing Fluid Interfaces* and *Principles of Great Design*, applied)

These set the feel. Each rule below in §5–§7 traces to one of them.

- **Respond on the first touch.** **Pair with your Blanc** opens a live camera, not a form with a camera button inside it. The desktop sheet shows the QR the moment it opens; the code is fetched first and the sheet appears with it (no empty QR frame that fills in later).
- **Simplicity, not minimalism.** The common path is one action on each device. Every other way (typing the code, a recovery code, a name and passphrase) is one level deeper behind **Other ways to join**, never deleted.
- **Feedback with causality and harmony.** The phone's success haptic (`UINotificationFeedbackGenerator`, `.success`), the scanner's highlight locking onto the code, and the move to "Connecting…" happen on the same frame, caused by the recognition itself. The desktop's "joined" state is completion feedback for the whole task; it's why the sheet watches (§6.3).
- **Spatial consistency.** The desktop sheet stays the same sheet through its states (code → joined → Spaces question → done) and changes content in place; it doesn't close and reopen. On iOS the scanner is a sheet that rises from the button that opened it and dismisses down the same way.
- **Agency and forgiveness.** Nothing the phone receives from outside the app (a link from another app, a page) joins a sync without an explicit confirmation naming the sync. Leaving or switching a sync keeps its existing confirmation.
- **Reduced motion.** Under Reduce Motion (iOS) and `prefers-reduced-motion` (desktop), state changes cross-fade; nothing slides or scales. The haptic stays: it isn't motion.

## 5. Desktop: Sync without a passphrase

### 5.1 Generated accounts *(owner: every first device)*

A sync account is three values: a handle (a display name, and the salt for passphrase derivation), a 64-hex `accountId` (what the Worker sees), and a 32-byte content key. The passphrase is just one way to *derive* the last two (`sync-crypto.js` `deriveKeys`). Everything after setup (`adoptCredentials`, the pairing payload, the recovery code, iOS's `PairPayload`) handles the three values directly and never re-derives. So a generated account is:

```
accountId = hex(crypto.randomBytes(32))
key       = crypto.randomBytes(32)
handle    = the localized default sync name (§5.3)
```

then `adoptCredentials({ handle, accountId, key })` and `syncNow()`, the same tail `enable()` runs. The key is zero-filled after protection, as today.

- **Key derivation (`sync-crypto.js`):** unchanged. `deriveKeys` stays for the passphrase path. Nothing derives a generated account, so nothing derives one wrongly.
- **Recovery code:** unchanged format (`blanc-sync:1:` + base64url of `{v, handle, accountId, key}`). For a generated account it's the only way back in once every device is gone. §5.4 makes sure the person was offered it.
- **Pairing payload:** unchanged, exactly the four fields. Nothing marks an account as generated on the wire; devices that join it don't need to know.
- **Worker:** no code change. It sees a 64-hex id, as always; a random id is indistinguishable from a derived one. The first PUT creates the account under the daily new-account budget. One-click setup makes new accounts more frequent than the 10-a-day global budget set on 2026-10-25 allows on a busy day, so the desktop PR raises `NEW_ACCOUNT_DAILY_LIMIT` to `100` in `wrangler.toml`, and the owner deploys that before the release ships *(owner)*. It stays an order-of-magnitude flood guard, as its comment says. A `503 busy` refusal surfaces as today's message, and the device keeps its credentials and retries on the normal schedule, exactly as `enable()` does when the first PUT fails.
- **No code before the account exists.** `beginPairing()` refuses (`error: 'not-ready'`) until this device has completed one successful sync pass on the current account, so a phone can't consume a code for an account the Worker doesn't hold yet. That covers a `503 busy`, being offline, and the seconds after creation. `startNew()` returns only after its first pass; when that pass fails, Sync stays on (credentials adopted, as above), the sheet doesn't show a code, and it says "Sync is on, but couldn't reach the server yet. Blanc will keep trying." with **Try again**. The sheet moves on to the code as soon as a pass succeeds.
- **Security:** a random 256-bit locator removes R5's "weak passphrases" residual for these accounts; R3 (the locator is a bearer capability) is unchanged in kind and the locator is now unguessable rather than passphrase-strength. §8.

`sync.js` gains `startNew()` → `{ ok, synced, status } | { ok: false, error }` (`synced` says whether the first pass reached the Worker), Personal-only through `withLocalProfile` like `enable`, refusing with `sync-on` when already enabled and `SERVICE_UNAVAILABLE` when `bananifyServiceAllowed()` is false. Locally the sync store records `origin: 'generated'` (device-local, never synced) so this device can show §5.4's prompt.

### 5.2 The off-state card

The Sync page's off state becomes:

> **Sync your Blanc**
> Favorites, settings and, if you choose, open tabs, end-to-end encrypted.
>
> **[Turn on Sync]**  ← primary
> *Already sync on another device?* **Add this device with a code**
>
> Other ways ▸ (disclosure: *Use a sync name and passphrase* · *Start with a name and passphrase*)

- **Turn on Sync** calls `startNew()`. On success the page shows the on state with the toast "Sync is on. Add your other devices from here." and, when iPhone pairing is offered (§9), the on state's **Connect your iPhone** action is highlighted as the next step.
- **Add this device with a code** is today's code path (`syncCodeForm`), unchanged.
- **Other ways** holds the two passphrase paths as they are today: joining with a name and passphrase (preflight, not-found choice and all), and starting a new sync with a chosen name and passphrase. The latter keeps its "Only for your first device…" hint.
- The 2026-10-16 guard against forking by accident still applies, more strongly: the primary action now names Sync itself, and the code path sits directly under it with the question people actually need to answer ("Already sync on another device?").

### 5.3 The default sync name *(call)*

A generated account's handle is the localized string **My Blanc** (`settings.sync.defaultName`), in the language the creating device is using. It's a label: it shows in the on state's hero and in "Connect to a different sync" confirmations, and it's never used to derive anything. Two generated accounts may both be called "My Blanc"; their ids differ, and the only place two syncs meet (switching) names the one being left, which is enough. Renaming a sync is out of scope.

### 5.4 The recovery-code prompt

On the device that started a generated sync (`origin: 'generated'`), the on state shows a quiet card above **More options** until the code is copied or the card is dismissed:

> **Keep a way back in**
> This sync has no passphrase. If you ever lose all your devices, its recovery code is the only way to reach your synced data. Save it in your password manager.
> **[Copy recovery code]** · Not now

**Copy recovery code** is today's renderer-free flow (native confirmation, main writes the clipboard, `{ ok }` back). **Not now** hides the card for this device for good (`recoveryPromptDismissed`, device-local). The card also appears in the sheet's done state (§6.4) as one line with the same button, because that's when the person is paying attention to Sync. It never blocks anything. *(call: a nudge, not a gate; local data stays on every device even if the sync is lost.)*

## 6. Desktop: the Add device sheet

### 6.1 Entry points *(owner)*

When iPhone pairing is offered (§9):

- **Settings → Sync, off state:** **Connect your iPhone** appears as a second primary-weight action beside **Turn on Sync**. It opens the sheet in its *start* state (§6.2), which creates nothing until **Continue**.
- **Settings → Sync, on state:** the Devices card's **Add device** button opens the sheet. Its label stays device-neutral, because desktops pair the same way.
- **Start page, Finish setup:** a new checklist task **Connect your iPhone** (`newtab.checklist.iphone`). Choosing it opens Settings → Sync with the sheet already open (via `openSettings('sync', { pair: true })`), in its start state if Sync is off. The task is done once a device with `platform: 'ios'` has been seen in this sync. It follows `migration-checklist.js`'s introduction pattern: a one-time `iphoneChecklistIntroduced` patch keeps an already-retired checklist retired, and the task joins the count only where pairing is offered. The existing **Set up Sync** task stays; connecting the iPhone completes both.

While pairing isn't offered, today's surfaces are unchanged except §5 and the joined confirmation (§6.3), which are device-neutral and ship first.

### 6.2 The sheet

The existing `syncPairingDialog`, rebuilt.

**Start state** (only when Sync is off) *(owner: the fork guard is one line in the sheet)*:

> **Connect your iPhone**
> This turns on Sync for this Mac. You won't need a name or passphrase.
> **[Continue]** · Cancel
> *Already sync on another computer?* **Add this Mac with a code first**

**Continue** runs `startNew()` and, once its first pass has succeeded (§5.1), changes in place to the code state. **Add this Mac with a code first** closes the sheet and opens the off state's code path, focused. Nothing is created until **Continue**.

**Code state:**

> **Connect your iPhone** *(or **Add a device** when not offered)*
>
> [QR code, about 168 × 168 px]
>
> **On your iPhone, open Blanc and choose Pair with your Blanc. Point it at this code.**
> Or type it in Settings → Sync: `K7MR-4PX2` · Copy
> Expires in 9:48 · Cancel

- The QR encodes `https://blanc.day/pair#K7MR4PX2` *(owner)*: the code in the fragment, unhyphenated, uppercase. Browsers never send a fragment to a server: the URL standard leaves it out of the request. Why a link and not a bare string: §7.3.
- The QR is drawn as an inline SVG of square modules in the theme's ink on the sheet's surface, with a four-module quiet zone, byte mode, error correction level M (version 3, 29 × 29 modules for this 31-byte string). It's re-drawn when the code changes and removed from the DOM when the sheet closes or the code expires; it's never a raster, cached or written anywhere.
- The QR encoder is a small first-party module, `src/renderer/pages/qr-code.js` (pure, no DOM, testable under `node --test`), limited to byte mode and level M, which is all this needs. *(call: a first-party encoder over a vendored library, to keep the pairing path free of new third-party code; a pinned MIT encoder recorded in `THIRD-PARTY-NOTICES.md` is the fallback if the first-party one proves fiddly.)* Its tests check generated matrices against fixtures produced once by a reference encoder and committed, plus a decode round trip on iOS (§10).
- **Best effort: the window asks to be left out of screen capture while a live code is showing.** Main calls `BrowserWindow.setContentProtection(true)` when the sheet shows a code and `false` when the sheet closes, the code expires or the window is torn down. Windows honors it for ordinary capture. On macOS 15 and later, ScreenCaptureKit-based capture may ignore the window sharing setting, and Linux has no equivalent. So this is a courtesy, not a control: it stays out of §8's table and out of every claim until it has been checked on the shipping macOS and Windows with the common share tools, and the result is recorded in the desktop PR. *(call)*
- When pairing isn't offered, the sheet shows the typed code only, as today, with the new copy.
- The countdown, Copy and Cancel behave exactly as today (2026-10-16 §4.1). On expiry the sheet shows "That code expired." with **Make a new code**, in place.

### 6.3 Knowing the device joined

The phone announces itself after joining: iOS publishes a presence entry in the `session` store even with tab sharing off (`SyncEngine` `announcesPresence`), and desktops publish theirs on their first sync. So while the sheet shows a live code, the desktop watches for a device it hasn't seen:

- `beginPairing()` records a baseline in memory beside the code: the device ids `sync.pairingDevices()` returns now (the `sends` and `session` presence list that Send to device and M16's `armPairing` already use). Not `listRemoteDevices()`: that list drops devices with no shared tabs (`tabsync-model.js` `displayDevices`), which is every iPhone by default.
- While the sheet is open, the code is live and the window is focused, the sync scheduler gets a due `session` read every 20 seconds, at most 30 per code. That spends at most 3 of the desktop's 10 GETs a minute (§3), leaving the other request classes their share, and the scheduler still decides the order. *(call: the interval; "joined" shows within about 20 s of the phone's first sync, which runs right after it joins.)* The ordinary schedule continues as well; whichever pull sees the new device first wins.
- A device id that's absent from the baseline marks the code claimed. Main clears the pairing (no DELETE is needed: the claim already consumed the Worker entry; it sends one anyway, harmlessly, in case of a stale read), stops the watch, sets `setContentProtection(false)`, and emits `pages:settings:sync-pair-joined` with `{ name, platform }`: the name as `listSendTargets()` resolves it (a name chosen in Rename Device… wins), and the platform the device published. Nothing secret crosses.
- If the code expires or is cancelled first, the watch stops; a device that arrives later is still a normal new device, and M16's own baseline (`armPairing`) still lets §4.7's question fire then.

### 6.4 The joined state and the Spaces question

The sheet changes in place, cross-fading content while the frame stays put:

> ✓ **iPhone joined.**
> Your favorites and settings are on it now. Its open tabs stay private to it until you choose to share them there.

Then, only when M16 §4.7 would ask (this desktop's Spaces switch is off, Shared Spaces is offered, and `sharedSharing.question()` returns this device):

> **Keep Spaces and groups in sync with it?**
> This shares your Spaces with every device in this sync that has the switch on.
> **[Turn on]** · Not now

- **Turn on** opens §4.6's confirmation sheet exactly as the Settings notice's button does; **Not now** acknowledges. Both call `sharedSharing.acknowledge(deviceId)`, so the question is asked once per device, as D9 requires, and the Settings and start-page notices don't repeat it. Closing the sheet without answering leaves the question pending, and those notices show it as they do today.
- When §4.7 wouldn't ask (switch already on, Spaces not offered), the sheet shows only the joined line and **Done**.
- On a generated sync whose recovery code hasn't been saved, a final line: "Keep a way back in: **Copy recovery code**" (§5.4).
- Wording uses the resolved name. Today an iPhone always publishes the literal name "iPhone" (M7 decision 3), so that's what the sheet shows unless it has been renamed. When the name is missing (desktop's `'unknown device'` placeholder in `sends-model.js`), the sheet says "Your iPhone" for `ios` and "Your new device" otherwise.

### 6.5 Settings renderer and IPC

- `settings-sync-pairing-model.js` gains states `joined` (`{ name, platform }`), `asking` (the Spaces question) and events `joined`, `spaces-answer`, `done`. Effects stay one-shot, `view()` pure, per the 2026-09-17 discipline. The QR's SVG path is part of `view()` output, computed by `qr-code.js` from the code.
- `settings-sync-setup-model.js` gains the `start-new` effect and the `iphone` entry (open the sheet in its start state). The pairing model gains the `start` state with `continue`, `started` (`synced` true or false) and `retry`.
- New IPC: `pages:settings:sync-start-new` (invoke), `pages:settings:sync-pair-joined` (event), `pages:settings:sync-recovery-prompt-dismiss` (invoke). All `settings`-host-guarded in `pages.js`, exposed in `tab-preload.js`, recorded in `bridges.json`. `sync-start-new` sets `syncMigrationCompleted` like `sync-enable` does.
- `pairingState()` (reopened Settings page) also returns whether the watch has seen a join, so a reopened page lands in the joined state rather than a dead code.

## 7. iPhone

### 7.1 Settings → Sync, off state

Rebuilt around one action (`SyncSettingsView.swift`):

> **Sync with your Blanc**
> Bring your favorites, settings and open tabs from your computer.
>
> **[Pair with your Blanc]**  ← prominent, `.borderedProminent`, full width
>
> Other ways to join ▸
> · Enter a pairing code
> · Use a recovery code
> · Use a sync name and passphrase

- **Pair with your Blanc** presents the scanner (§7.2). On a device that can't scan (`DataScannerViewController.isSupported == false`), the same button goes straight to the code field with "Type the code shown on your computer." Camera permission is handled inside the scanner (§7.2), never by skipping it.
- **Enter a pairing code** and **Use a recovery code** are today's single field (it accepts both, as now), reached with a label that says which is which.
- **Use a sync name and passphrase** is today's section, unchanged.
- **The iPhone stays join-only** *(owner)*. M7's decision 1 ("The phone joins only") holds: the engine refuses to create a sync (`createOnComputer`) and reads a missing settings store as a deleted sync. So generated accounts are desktop-only, and the phone never offers to start a sync. The footer keeps today's line pointing to the computer. Revisit after 1.0.
- The on state is unchanged except its pairing screen (`PairDeviceSettingsView`), which now also shows the QR (CoreImage's `CIQRCodeGenerator`, same string and level as §6.2) so an iPhone that syncs can pair another phone. *(call)*

### 7.2 The scanner

`PairScannerView`, a `UIViewControllerRepresentable` around VisionKit's `DataScannerViewController`:

- `recognizedDataTypes: [.barcode(symbologies: [.qr])]`, `qualityLevel: .balanced`, `isHighlightingEnabled: true`, `recognizesMultipleItems: false`. Presented as a sheet (`.presentationDetents([.large])`) with a title "Point at the code on your computer", a **Type the code instead** button, and Cancel.
- Before presenting, the view checks `AVCaptureDevice.authorizationStatus(for: .video)`. When it's `.notDetermined`, the view asks with `requestAccess` and only then reads `DataScannerViewController.isAvailable`, which is false until access is granted, so reading it first would skip the prompt. `.denied` or `.restricted` shows the denied state below; `isSupported == false` (no capable camera) goes to the code field.
- On first use, iOS asks for the camera. `NSCameraUsageDescription`: "Blanc uses the camera only to scan the pairing code on your computer." in all six languages (`InfoPlist.xcstrings` or the generated-Info.plist key plus a localized strings file; the builder picks the mechanism the project's generated Info.plist supports). If access is denied, the sheet says "Camera access is off for Blanc." with **Open Settings** and **Type the code instead**.
- A recognized payload goes through `PairLink.code(from:)` (§7.3). On a match: the success haptic, the highlight, and a swap to "Connecting…" on the same frame; scanning stops; `joinWithCode(code)` runs (`switchWithCode` behind today's confirmation if this iPhone already syncs). On a non-match the scanner keeps running and shows, for two seconds, "That's not a Blanc pairing code." Nothing else about an unrelated QR is acted on, shown or kept.
- Frames never leave the device and nothing is stored: the scanner keeps no images, and the matched string lives only until the join call takes it.
- Outcomes after the join are today's: success → "Connected to “{name}”." (and, once M18 exists, its "what arrived" screen); not found or expired → "That code isn't valid any more. Make a new one on your computer." with **Scan again**; offline, rate-limited and unavailable as today.

### 7.3 The pair link and how each scanner treats it

`https://blanc.day/pair#K7MR4PX2` *(owner)*. A custom `blanc://` scheme was rejected: any app can register the same scheme and would receive the code, which is the whole sync key, and it does nothing when Blanc isn't installed. A bare non-link string was the alternative; it's safe but makes the iPhone's Camera app useless. The https link is safe in every path below:

| Who reads the QR | What happens |
|---|---|
| Blanc's scanner (the designed path) | `PairLink.code(from:)` extracts the code locally. Nothing is loaded; the URL is never navigated, fetched or recorded. |
| The Camera app, Blanc is the default browser | iOS hands the URL to Blanc (`onOpenURL`, once M18 registers `http`/`https`, contract §8). Blanc checks `PairLink` *before* any navigation and asks *before fetching anything*, because reading a code uses it up: "Pair with the Blanc on your computer? Continue only if you just scanned a code on your own computer." **Pair** joins and the success screen names the sync; **Cancel** touches nothing, and the code stays usable on the desktop. Never loaded, never in history. |
| The Camera app, another browser is the default | The browser loads `https://blanc.day/pair`. The server receives `/pair` only, never the fragment. The page is static, ships with **no scripts at all**, and its `_headers` entry sets `script-src 'none'` (the site-wide policy allows Google Analytics, Cloudflare Insights and Crisp, any of which could read `location.hash`). It says: "Open Blanc on your iPhone, choose Pair with your Blanc in Settings → Sync, and point it at your computer," with the App Store link once Blanc for iPhone is public. The code stays in that browser's local history until it expires or is used, then it's worthless (in Safari, history syncs end-to-end encrypted through iCloud). *Accepted residual.* |
| A web page or another app opens the link in Blanc | Treated as the second row: never joins without the confirmation, which names the sync. A page inside Blanc that navigates to the link loads the static page normally; it isn't intercepted, because a page shouldn't be able to start a join. |

**`PairLink.code(from:)`** accepts only: scheme `https`, host exactly `blanc.day`, no port, no user info, path exactly `/pair`, no query, and a fragment that `SyncPairing.normalize` accepts (hyphen optional). Everything else is `nil`. The same rules, as `pairLinkCode()` in `sync-pairing.js`, guard the desktop side (generation and history). Both platforms strip the fragment from any `blanc.day/pair` URL before writing history *(call)*.

**Phishing.** A QR planted in the world could make a person's phone join an attacker's sync, which would then receive the phone's favorites and settings. A sync's name can't defend against that: an attacker chooses any name, and generated syncs are all "My Blanc". The controls are where the code came from and when: the in-app scanner is a deliberate act of pointing at a code the person expects, and links from outside Blanc ask first, saying where the code must come from, before anything is fetched. That's the same exposure the typed code already has (someone reading out a code), not a new one.

### 7.4 Coordination with M18

M18's walkthrough step 2 (contract §3) is this design's pairing view: M18 embeds `PairWithBlancView` (the §7.1 action, the §7.2 scanner, **Other ways to join**) and supplies what comes after success ("what arrived"). This design doesn't build the walkthrough, and M18 doesn't rebuild pairing. M18 also owns registering `http`/`https` URL types and `onOpenURL`; when it does, it must route `PairLink` matches to §7.3's confirmation before anything else sees the URL. That rule and its test are written down here so M18's design picks them up.

## 8. Security (against `docs/security-assessment.md`)

| Concern | Control |
|---|---|
| The code reaching a server | The QR's link puts the code in the fragment; the static page has no scripts and a `script-src 'none'` policy; Blanc never loads the link itself. The Worker still sees only `pairId` (scrypt + HKDF of the code). |
| A wider audience for the code | The QR shows only where the typed code already shows, and only while it's live. One use, ten minutes, unchanged. (Screen-capture exclusion is a best-effort courtesy, not a control, §6.2.) |
| Scheme hijacking | No custom URL scheme. Universal Links aren't available to a default browser and aren't used. |
| Unwanted joins | Links from outside Blanc ask before anything is fetched, saying the code must come from the person's own computer; the in-app scanner is a deliberate act; the success screen names the sync; switching an existing sync keeps its confirmation. |
| R3 (the locator is a bearer capability) | Unchanged in kind. For generated accounts the locator is 256 random bits instead of passphrase-strength. |
| R5 (weak passphrases) | Doesn't apply to generated accounts. The passphrase paths remain, with today's strength check. |
| A code for an account the server doesn't hold | No code is issued until this device's first sync pass on the account has succeeded (§5.1). |
| Losing a generated account | The recovery code is offered on the creating device until saved or dismissed, and in the sheet's done state. Local data never depends on the sync. |
| Camera | Permission asked on first scan only, single purpose, no frames stored or sent. |
| Telemetry | No new events. Pairing remains unmeasured. |

The desktop PR updates the Profile Sync row of the threat table: generated accounts don't carry the weak-passphrase residual; the QR and the static pair page join the controls; R3/R5 stay open.

## 9. When the iPhone wording ships *(owner)*

Build it now, keep it hidden in packaged builds, turn it on in the desktop release that ships with Blanc for iPhone's public beta or 1.0. `isIphonePairingOffered()` in `main.js` follows `isSharedSpacesOffered()`'s shape: true when unpackaged (so development and the acceptance suite see it), and in packaged builds only from a version constant, `IPHONE_PAIRING_FROM`, which stays `null` (never offered packaged) until the prep PR of the release that ships with Blanc for iPhone sets it. `site/src/data/releases.json` lists desktop releases only, so no file in the repo records the iPhone app's availability today; the guard is the `null` itself, plus a unit test that fails if `IPHONE_PAIRING_FROM` is set while `site/src/data/ios-availability.json` (added by that prep PR, `{ "public": true, "since": "…" }`) is missing or says otherwise *(call)*.

Hidden while not offered: **Connect your iPhone** (both entry points), the checklist task, the QR, and every string that says iPhone. Shipping immediately (device-neutral): generated accounts (§5), the recovery prompt, the reworked off state, the sheet's joined state and Spaces question (§6.3–§6.4), and the best-effort capture exclusion.

The `blanc.day/pair` page and the Sync page's description of the QR deploy with the release that turns the wording on, in a website-only PR.

## 10. Copy

New and changed keys. Desktop keys live under `settings.sync.*` and `newtab.checklist.*`; iOS keys under `ios.settings.*` and `ios.pair.*`. "Mac" strings have a *Generic* twin ("computer") that Windows and Linux use. Translations follow each language's existing Sync vocabulary and register (de *du*, fr *vous*, es *tú*, it *tu*, pt-BR *você*); "Blanc" and the code are never translated.

| Key | en | de | es | fr | it | pt-BR |
|---|---|---|---|---|---|---|
| `settings.sync.off.title` | Sync your Blanc | Synchronisiere dein Blanc | Sincroniza tu Blanc | Synchronisez votre Blanc | Sincronizza il tuo Blanc | Sincronize seu Blanc |
| `settings.sync.off.body` | Favorites, settings and, if you choose, open tabs, end-to-end encrypted. | Favoriten, Einstellungen und auf Wunsch offene Tabs, Ende-zu-Ende-verschlüsselt. | Favoritos, ajustes y, si quieres, pestañas abiertas, con cifrado de extremo a extremo. | Favoris, réglages et, si vous le souhaitez, onglets ouverts, chiffrés de bout en bout. | Preferiti, impostazioni e, se vuoi, schede aperte, con crittografia end-to-end. | Favoritos, ajustes e, se você quiser, abas abertas, com criptografia de ponta a ponta. |
| `settings.sync.off.turnOn` | Turn on Sync | Synchronisierung aktivieren | Activar la sincronización | Activer la synchronisation | Attiva la sincronizzazione | Ativar a sincronização |
| `settings.sync.off.haveCode` | Already sync on another device? | Synchronisierst du schon auf einem anderen Gerät? | ¿Ya sincronizas en otro dispositivo? | Vous synchronisez déjà un autre appareil ? | Sincronizzi già su un altro dispositivo? | Já sincroniza em outro dispositivo? |
| `settings.sync.off.addWithCode` | Add this device with a code | Dieses Gerät mit einem Code hinzufügen | Añadir este dispositivo con un código | Ajouter cet appareil avec un code | Aggiungi questo dispositivo con un codice | Adicionar este dispositivo com um código |
| `settings.sync.off.otherWays` | Other ways | Andere Möglichkeiten | Otras formas | Autres méthodes | Altri modi | Outras formas |
| `settings.sync.off.startWithPassphrase` | Start with a name and passphrase | Mit Name und Passphrase beginnen | Empezar con un nombre y una frase de contraseña | Commencer avec un nom et une phrase secrète | Inizia con un nome e una passphrase | Começar com um nome e uma frase secreta |
| `settings.sync.connectIphone` | Connect your iPhone | iPhone verbinden | Conectar tu iPhone | Connecter votre iPhone | Collega il tuo iPhone | Conectar seu iPhone |
| `settings.sync.sheet.startBody` | This turns on Sync for this Mac. You won't need a name or passphrase. | Damit wird die Synchronisierung auf diesem Mac aktiviert. Du brauchst keinen Namen und keine Passphrase. | Esto activa la sincronización en este Mac. No necesitarás nombre ni frase de contraseña. | Cela active la synchronisation sur ce Mac. Aucun nom ni phrase secrète n’est nécessaire. | Così attivi la sincronizzazione su questo Mac. Non servono nome né passphrase. | Isso ativa a sincronização neste Mac. Você não vai precisar de nome nem frase secreta. |
| `settings.sync.sheet.startBodyGeneric` | This turns on Sync for this computer. You won't need a name or passphrase. | Damit wird die Synchronisierung auf diesem Computer aktiviert. Du brauchst keinen Namen und keine Passphrase. | Esto activa la sincronización en este ordenador. No necesitarás nombre ni frase de contraseña. | Cela active la synchronisation sur cet ordinateur. Aucun nom ni phrase secrète n’est nécessaire. | Così attivi la sincronizzazione su questo computer. Non servono nome né passphrase. | Isso ativa a sincronização neste computador. Você não vai precisar de nome nem frase secreta. |
| `settings.sync.sheet.continue` | Continue | Weiter | Continuar | Continuer | Continua | Continuar |
| `settings.sync.sheet.alreadySync` | Already sync on another computer? | Synchronisierst du schon auf einem anderen Computer? | ¿Ya sincronizas en otro ordenador? | Vous synchronisez déjà un autre ordinateur ? | Sincronizzi già su un altro computer? | Já sincroniza em outro computador? |
| `settings.sync.sheet.addThisFirst` | Add this Mac with a code first | Diesen Mac zuerst mit einem Code hinzufügen | Añade primero este Mac con un código | Ajoutez d’abord ce Mac avec un code | Aggiungi prima questo Mac con un codice | Adicione primeiro este Mac com um código |
| `settings.sync.sheet.addThisFirstGeneric` | Add this computer with a code first | Diesen Computer zuerst mit einem Code hinzufügen | Añade primero este ordenador con un código | Ajoutez d’abord cet ordinateur avec un code | Aggiungi prima questo computer con un codice | Adicione primeiro este computador com um código |
| `settings.sync.sheet.notReady` | Sync is on, but couldn't reach the server yet. Blanc will keep trying. | Die Synchronisierung ist aktiv, aber der Server war noch nicht erreichbar. Blanc versucht es weiter. | La sincronización está activada, pero aún no se ha podido conectar con el servidor. Blanc seguirá intentándolo. | La synchronisation est activée, mais le serveur n’a pas encore pu être joint. Blanc continuera d’essayer. | La sincronizzazione è attiva, ma il server non è ancora raggiungibile. Blanc continuerà a provare. | A sincronização está ativada, mas ainda não deu para alcançar o servidor. O Blanc vai continuar tentando. |
| `settings.sync.sheet.tryAgain` | Try again | Erneut versuchen | Reintentar | Réessayer | Riprova | Tentar de novo |
| `settings.sync.defaultName` | My Blanc | Mein Blanc | Mi Blanc | Mon Blanc | Il mio Blanc | Meu Blanc |
| `settings.sync.startedToast` | Sync is on. Add your other devices from here. | Die Synchronisierung ist aktiv. Füge hier deine anderen Geräte hinzu. | La sincronización está activada. Añade aquí tus otros dispositivos. | La synchronisation est activée. Ajoutez vos autres appareils ici. | La sincronizzazione è attiva. Aggiungi qui gli altri dispositivi. | A sincronização está ativada. Adicione seus outros dispositivos aqui. |
| `settings.sync.sheet.addDevice` | Add a device | Gerät hinzufügen | Añadir un dispositivo | Ajouter un appareil | Aggiungi un dispositivo | Adicionar um dispositivo |
| `settings.sync.sheet.scanIphone` | On your iPhone, open Blanc and choose Pair with your Blanc. Point it at this code. | Öffne Blanc auf deinem iPhone und wähle „Mit deinem Blanc koppeln“. Richte es auf diesen Code. | En tu iPhone, abre Blanc y elige «Vincular con tu Blanc». Apunta a este código. | Sur votre iPhone, ouvrez Blanc et choisissez « Jumeler avec votre Blanc ». Visez ce code. | Sull’iPhone apri Blanc e scegli “Abbina al tuo Blanc”. Inquadra questo codice. | No seu iPhone, abra o Blanc e escolha “Parear com seu Blanc”. Aponte para este código. |
| `settings.sync.sheet.orType` | Or type it in Settings → Sync: | Oder gib ihn unter Einstellungen → Synchronisierung ein: | O escríbelo en Ajustes → Sincronización: | Ou saisissez-le dans Réglages → Synchronisation : | Oppure inseriscilo in Impostazioni → Sincronizzazione: | Ou digite em Ajustes → Sincronização: |
| `settings.sync.sheet.newCode` | Make a new code | Neuen Code erstellen | Crear un código nuevo | Créer un nouveau code | Crea un nuovo codice | Criar um novo código |
| `settings.sync.sheet.joined` | {device} joined. | {device} ist dabei. | {device} se ha unido. | {device} a rejoint la synchronisation. | {device} si è aggiunto. | {device} entrou. |
| `settings.sync.sheet.joinedBody` | Your favorites and settings are on it now. Its open tabs stay private to it until you choose to share them there. | Deine Favoriten und Einstellungen sind jetzt dort. Seine offenen Tabs bleiben privat, bis du sie dort teilst. | Tus favoritos y ajustes ya están en él. Sus pestañas abiertas siguen siendo privadas hasta que decidas compartirlas desde allí. | Vos favoris et réglages y sont maintenant. Ses onglets ouverts restent privés tant que vous ne choisissez pas de les partager depuis cet appareil. | Preferiti e impostazioni ora sono lì. Le sue schede aperte restano private finché non scegli di condividerle da lì. | Seus favoritos e ajustes já estão nele. As abas abertas dele continuam privadas até você escolher compartilhá-las por lá. |
| `settings.sync.sheet.yourIphone` | Your iPhone | Dein iPhone | Tu iPhone | Votre iPhone | Il tuo iPhone | Seu iPhone |
| `settings.sync.sheet.yourDevice` | Your new device | Dein neues Gerät | Tu nuevo dispositivo | Votre nouvel appareil | Il tuo nuovo dispositivo | Seu novo dispositivo |
| `settings.sync.sheet.done` | Done | Fertig | Listo | Terminé | Fine | OK |
| `settings.sync.recoveryPrompt.title` | Keep a way back in | Behalte einen Weg zurück | Guarda una forma de volver a entrar | Gardez un moyen de revenir | Tieni una via per rientrare | Guarde um jeito de voltar |
| `settings.sync.recoveryPrompt.body` | This sync has no passphrase. If you ever lose all your devices, its recovery code is the only way to reach your synced data. Save it in your password manager. | Diese Synchronisierung hat keine Passphrase. Wenn du alle deine Geräte verlierst, kommst du nur mit ihrem Wiederherstellungscode an deine synchronisierten Daten. Speichere ihn in deinem Passwortmanager. | Esta sincronización no tiene frase de contraseña. Si alguna vez pierdes todos tus dispositivos, su código de recuperación es la única forma de llegar a tus datos sincronizados. Guárdalo en tu gestor de contraseñas. | Cette synchronisation n’a pas de phrase secrète. Si vous perdez un jour tous vos appareils, son code de récupération sera le seul moyen d’accéder à vos données synchronisées. Enregistrez-le dans votre gestionnaire de mots de passe. | Questa sincronizzazione non ha una passphrase. Se perdi tutti i dispositivi, il suo codice di recupero è l’unico modo per raggiungere i dati sincronizzati. Salvalo nel tuo gestore di password. | Esta sincronização não tem frase secreta. Se você perder todos os seus dispositivos, o código de recuperação é o único jeito de acessar seus dados sincronizados. Guarde-o no seu gerenciador de senhas. |
| `settings.sync.recoveryPrompt.copy` | Copy recovery code | Wiederherstellungscode kopieren | Copiar código de recuperación | Copier le code de récupération | Copia codice di recupero | Copiar código de recuperação |
| `settings.sync.recoveryPrompt.notNow` | Not now | Nicht jetzt | Ahora no | Pas maintenant | Non ora | Agora não |
| `newtab.checklist.iphone` | Connect your iPhone | iPhone verbinden | Conectar tu iPhone | Connecter votre iPhone | Collega il tuo iPhone | Conectar seu iPhone |
| `ios.settings.syncOffTitle` | Sync with your Blanc | Mit deinem Blanc synchronisieren | Sincronizar con tu Blanc | Synchroniser avec votre Blanc | Sincronizza con il tuo Blanc | Sincronizar com seu Blanc |
| `ios.settings.syncOffBody` | Bring your favorites, settings and open tabs from your computer. | Hol dir deine Favoriten, Einstellungen und offenen Tabs von deinem Computer. | Trae tus favoritos, ajustes y pestañas abiertas desde tu ordenador. | Récupérez vos favoris, réglages et onglets ouverts depuis votre ordinateur. | Porta qui preferiti, impostazioni e schede aperte dal computer. | Traga seus favoritos, ajustes e abas abertas do seu computador. |
| `ios.settings.pairWithBlanc` | Pair with your Blanc | Mit deinem Blanc koppeln | Vincular con tu Blanc | Jumeler avec votre Blanc | Abbina al tuo Blanc | Parear com seu Blanc |
| `ios.settings.otherWays` | Other ways to join | Andere Wege zum Beitreten | Otras formas de unirte | Autres façons de rejoindre | Altri modi per unirti | Outras formas de entrar |
| `ios.settings.enterCode` | Enter a pairing code | Kopplungscode eingeben | Escribir un código de vinculación | Saisir un code de jumelage | Inserisci un codice di abbinamento | Digitar um código de pareamento |
| `ios.settings.useRecovery` | Use a recovery code | Wiederherstellungscode verwenden | Usar un código de recuperación | Utiliser un code de récupération | Usa un codice di recupero | Usar um código de recuperação |
| `ios.settings.usePassphrase` | Use a sync name and passphrase | Synchronisierungsname und Passphrase verwenden | Usar un nombre de sincronización y una frase de contraseña | Utiliser un nom de synchronisation et une phrase secrète | Usa nome e passphrase della sincronizzazione | Usar um nome de sincronização e uma frase secreta |
| `ios.settings.typeCodeShown` | Type the code shown on your computer. | Gib den Code ein, der auf deinem Computer angezeigt wird. | Escribe el código que aparece en tu ordenador. | Saisissez le code affiché sur votre ordinateur. | Inserisci il codice mostrato sul computer. | Digite o código mostrado no seu computador. |
| `ios.pair.scanTitle` | Point at the code on your computer | Richte die Kamera auf den Code auf deinem Computer | Apunta al código de tu ordenador | Visez le code sur votre ordinateur | Inquadra il codice sul computer | Aponte para o código no seu computador |
| `ios.pair.typeInstead` | Type the code instead | Code stattdessen eingeben | Escribir el código | Saisir le code à la place | Inserisci il codice | Digitar o código |
| `ios.pair.notBlanc` | That's not a Blanc pairing code. | Das ist kein Blanc-Kopplungscode. | Ese no es un código de vinculación de Blanc. | Ce n’est pas un code de jumelage Blanc. | Questo non è un codice di abbinamento Blanc. | Esse não é um código de pareamento do Blanc. |
| `ios.pair.connecting` | Connecting… | Verbinde … | Conectando… | Connexion… | Connessione… | Conectando… |
| `ios.pair.cameraOff` | Camera access is off for Blanc. | Der Kamerazugriff ist für Blanc deaktiviert. | El acceso a la cámara está desactivado para Blanc. | L’accès à l’appareil photo est désactivé pour Blanc. | L’accesso alla fotocamera è disattivato per Blanc. | O acesso à câmera está desativado para o Blanc. |
| `ios.pair.openSettings` | Open Settings | Einstellungen öffnen | Abrir Ajustes | Ouvrir Réglages | Apri Impostazioni | Abrir Ajustes |
| `ios.pair.scanAgain` | Scan again | Erneut scannen | Volver a escanear | Scanner à nouveau | Scansiona di nuovo | Escanear de novo |
| `ios.pair.expired` | That code isn't valid any more. Make a new one on your computer. | Dieser Code ist nicht mehr gültig. Erstelle auf deinem Computer einen neuen. | Ese código ya no es válido. Crea uno nuevo en tu ordenador. | Ce code n’est plus valide. Créez-en un nouveau sur votre ordinateur. | Questo codice non è più valido. Creane uno nuovo sul computer. | Esse código não vale mais. Crie um novo no seu computador. |
| `ios.pair.linkConfirmTitle` | Pair with the Blanc on your computer? | Mit dem Blanc auf deinem Computer koppeln? | ¿Vincular con el Blanc de tu ordenador? | Jumeler avec le Blanc de votre ordinateur ? | Abbinare al Blanc del tuo computer? | Parear com o Blanc do seu computador? |
| `ios.pair.linkConfirmBody` | Continue only if you just scanned a code on your own computer. | Fahre nur fort, wenn du gerade einen Code auf deinem eigenen Computer gescannt hast. | Continúa solo si acabas de escanear un código en tu propio ordenador. | Continuez uniquement si vous venez de scanner un code sur votre propre ordinateur. | Continua solo se hai appena scansionato un codice sul tuo computer. | Continue só se você acabou de escanear um código no seu próprio computador. |
| `ios.pair.pair` | Pair | Koppeln | Vincular | Jumeler | Abbina | Parear |
| `ios.pair.cameraUsage` (Info.plist `NSCameraUsageDescription`) | Blanc uses the camera only to scan the pairing code on your computer. | Blanc verwendet die Kamera nur, um den Kopplungscode auf deinem Computer zu scannen. | Blanc usa la cámara solo para escanear el código de vinculación de tu ordenador. | Blanc utilise l’appareil photo uniquement pour scanner le code de jumelage sur votre ordinateur. | Blanc usa la fotocamera solo per scansionare il codice di abbinamento sul computer. | O Blanc usa a câmera só para escanear o código de pareamento do seu computador. |

Existing keys whose English changes: `settings.sync.pairing.instruction` (replaced by `settings.sync.sheet.scanIphone` when offered, kept as the fallback), and the off-state path buttons (`settings.sync.addThisDevice` / `addThisDeviceHint` and `startSyncingFromThis` / `startOnlyFirstDevice`; the passphrase start moves under Other ways with today's hint). The translators' pass in each PR runs `npm run copy:ack` for every changed key, as the source-hash rule requires. The table is the starting translation; a fluent review before release is still expected, as for every catalog change.

## 11. Tests

**Desktop**

- `test/unit/sync-start-new.test.js` (electron stub pattern): `startNew()` returns `synced` from its first pass; stores a 64-hex id, a protected 32-byte key and the localized default name; zero-fills the key; refuses when on (`sync-on`) and when the service isn't allowed; never calls `deriveKeys`; marks `origin: 'generated'`; a `503 busy` first PUT leaves credentials adopted and `lastError` set, as `enable()` does.
- `test/unit/sync-pairing.test.js` additions: `pairLinkCode()` accepts exactly the §7.3 shape, rejects every variation (http, `www.`, a port, user info, `/pair/`, a query, a bad fragment, lowercase path); `pairLink(code)` round-trips.
- `test/unit/qr-code.test.js`: matrices for a set of pair links match the committed reference fixtures module for module; the format and version bits are right; byte mode only; the encoder refuses input longer than version 3-M allows.
- Join watch: a baseline from `pairingDevices()` plus a new device id (presence only, `tabs: []`) marks the code claimed, stops the watch, clears content protection and emits `sync-pair-joined` with only `{ name, platform }`; a known device doesn't; the watch stops at expiry, cancel and window blur, never exceeds 30 reads, and never takes more than 3 of the scheduler's 10 slots in a 60 s window.
- Not ready: `beginPairing()` returns `not-ready` before the account's first successful pass (a `503 busy` and an offline first PUT both); the sheet's start state shows `notReady` and moves on when a pass succeeds.
- Worker config: a unit test pins `NEW_ACCOUNT_DAILY_LIMIT = "100"` in `wrangler.toml`.
- Content protection: set when a live code shows, cleared on close, expiry, join and window close (spy on the stub `BrowserWindow`). Its real effect is checked by hand (§6.2), not claimed by a test.
- `settings-sync-pairing-model` and `settings-sync-setup-model` reducer tests for the new states and effects; `view()` stays pure.
- Checklist: `migrationChecklistState` with the iPhone task offered and not; the one-time introduction patch keeps a retired checklist retired.
- History: a `blanc.day/pair#…` visit is recorded without its fragment.
- `isIphonePairingOffered()`: true unpackaged; false packaged while `IPHONE_PAIRING_FROM` is `null`; the availability guard fails a set constant without `ios-availability.json`.
- The Spaces question from the sheet acknowledges the device once; the Settings notice doesn't repeat it.
- `npm run browser-api:check`, `copy:check`, `audit-inventory:check`, `substrate:check`.
- Desktop acceptance (`spec/acceptance/`): "Turn on Sync without a passphrase", "Connect your iPhone with Sync off asks before turning it on" and "Add a device shows a QR and a code", up to the network call, like the 2026-10-16 scenarios; the joined state driven through the test hook's pseudo-peer (`pairingPeer`), which already exists for §4.7.
- Site: `test/site/` asserts `/pair` renders no `<script>` and that `_headers` gives it `script-src 'none'`.

**iOS**

- `PairLinkTests`: the same accept/reject vectors as the desktop, shared as a JSON fixture under `browser-api/` or `test/fixtures/` so both suites read one list.
- QR round trip: `CIQRCodeGenerator` output for a pair link decodes back with `CIDetector(ofType: CIDetectorTypeQRCode)`. The desktop's fixtures decode the same way (this is the cross-check for `qr-code.js`).
- `SyncSettingsModel` / scanner coordinator tests: a matching payload calls join once and stops scanning; a non-match keeps scanning; `.notDetermined` requests access before reading `isAvailable`; denied or restricted shows Open Settings; an unsupported device routes to the code field; an outside pair link shows the ask-first sheet and Cancel makes no network call.
- UI test (simulator, no camera): the off state shows **Pair with your Blanc**; with scanning unavailable it lands on the code field; **Other ways to join** reaches every existing path; the seeded join succeeds.
- The real-iPhone pairing gate before TestFlight (contract §8) now includes scanning the desktop sheet's QR, the Camera-app path with Safari as default, and both with Reduce Motion on.

## 12. Calls made here, for the owner to check

1. The default sync name is the localized "My Blanc"; renaming is out of scope (§5.3).
2. The recovery code is a nudge on the creating device and in the done state, never a gate (§5.4).
3. No pairing code is issued until the account's first sync pass has succeeded (§5.1).
4. Screen-capture exclusion while a code shows is best effort, checked by hand, and never claimed (§6.2).
5. The desktop reads `session` every 20 s, at most 30 times, while the sheet shows a live code, to learn of the join (§6.3).
6. The QR encoder is first-party, with a vendored MIT encoder as the fallback (§6.2).
7. A syncing iPhone's pairing screen also shows the QR (§7.1).
8. Both platforms drop the fragment from `blanc.day/pair` URLs in history (§7.3).
9. A pair link opened in Blanc from outside asks before fetching anything, naming where the code must come from rather than the sync's name; a page inside Blanc navigating to the link isn't intercepted (§7.3).
10. The iPhone wording waits for `IPHONE_PAIRING_FROM` and a new `site/src/data/ios-availability.json` (§9).
11. Generated accounts, the recovery prompt, the reworked off state and the joined confirmation ship in the next desktop feature release; only the iPhone wording, the QR and the checklist task wait (§9).

**The owner's decisions (2026-10-28):** the QR is an https link with the code in the fragment; generated accounts for every first computer; iPhone wording hidden until the app ships; entry points in Settings → Sync and Finish setup; the daily new-account budget rises to 100 with an owner deploy; the fork guard is one line in the sheet's start state; the iPhone stays join-only.

## 13. Left to the builder

- Exact layout and spacing of the sheet and the off state within the Sync page's 2026-10-27 visual language; the QR's size on small windows (never below 4 px per module).
- The localization mechanism for `NSCameraUsageDescription` under a generated Info.plist.
- How `isIphonePairingOffered()`'s release check is phrased in its test.
- Whether the join watch reuses `syncNow()` or a lighter session-only pull.
