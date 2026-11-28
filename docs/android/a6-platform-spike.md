# A6 spike: Android's own needs (2026-11-21)

A6 in `docs/superpowers/plans/2026-11-03-android-port.md` covers what a phone browser is expected to do
that Blanc for Android doesn't do yet. This spike checks each piece against Chromium 156.0.8078.79 with
Blanc's Android patches (0101–0123) applied, on the build server's read-only emulator
(`emulator-5556`, Android 16 Google APIs x86-64, no Google account), using the debug build
`out/AndroidDebugX64` (`me.bnfy.blanc.dev`, November 15; the same code as beta.3 for everything here).
The code reading covered the checkout on the build server; paths below are relative to its `src/`.
Each ruling is proposed for the A6 plan; the owner's decisions are marked **Owner**.

## 1. Passwords: nothing saves and nothing fills today

Seen: logging in to a test site showed no save prompt, and tapping its username field offered nothing.

- **Chromium's own password manager has no store on Android.** `PasswordManagerBackendSupportHelper
  .isBackendPresent()` is `false` upstream; only Google's closed downstream code supplies one. With no
  backend, `CreatePasswordStoreBackend` returns `PasswordStoreEmptyBackend`, and
  `PasswordManagerSettingsServiceFactory` returns null, so `IsSavingAndFillingEnabled` is false
  (`chrome/browser/password_manager/android/…`, `chrome_password_manager_client.cc:302-316`). There is no
  local login database on Android. Play services and a Google account don't change this.
- **Android's own autofill (third-party mode) is off by default.** It is the profile pref
  `autofill.using_virtual_view_structure` (`kAutofillUsingPlatformAutofill`,
  `components/autofill/core/common/autofill_prefs.h:236`), default false, read once at startup by
  `AutofillClientProvider`. It needs an autofill service that is **not** Google's
  (`AutofillClientProviderUtils.java:105-107` returns `ANDROID_AUTOFILL_SERVICE_IS_GOOGLE`), so it serves
  Bitwarden, Proton Pass, 1Password and other managers, and never Google Password Manager.
- **Nobody can reach the switch.** Chromium's toggle is `AutofillOptionsFragment`, and Blanc's Settings
  hides every Chromium row it doesn't list (`blanc/android/.../settings/SettingsLayout.java`). The page
  is still reachable from Android's own autofill settings (`AutofillOptionsLauncher` on
  `APPLICATION_PREFERENCES`).

- **Chromium resets the switch at every startup.** `AutofillClientProvider` writes the pref back to
  whether Android autofill is available right now (`autofill_client_provider.cc:74-78`), so a phone whose
  autofill service is Google's at first launch gets the switch written off for good, and choosing
  Bitwarden later wouldn't turn it on (`getAndroidAutofillFrameworkAvailability` then answers
  `SETTING_TURNED_OFF`).
- Chromium's own options page says "Autofill with Google" and "Restart Chrome", so Blanc doesn't link to
  it.

**Ruling P1 (owner approved, 2026-11-21):** turn third-party mode on by default (the pref's Android
default becomes true), write it back only when it is available or the person turned it off, and add
Blanc's own Settings row: a switch, a link to Android's "Autofill service" choice, and a restart note.
**Owner** accepted that this means Google Password Manager can't fill in Blanc on Android
(there is no path for it in an open-source Chromium build), so the design's "Google Password Manager and
Bitwarden" exit gate becomes "Bitwarden (and one other free manager) fills; Google Password Manager
doesn't, and Settings says which managers work". The design's claim that "whichever password manager the
person has chosen in Android fills Blanc's login forms, including Google Password Manager" can't hold.

## 2. Passkeys: Google refuses Blanc today

Seen: `navigator.credentials.create` on webauthn.io failed at once with `NotAllowedError`, with a screen
lock set. Google Play services logged: *"Rejecting browser request from me.bnfy.blanc.dev because the
hash of the certificate (32A2…1E0) is not recognised."*

- A browser asks for passkeys on behalf of websites through Play services' privileged browser API
  (`Fido2ApiCall.java:169-175`) or Android Credential Manager with `setOrigin` (`CredManHelper.java`). Both
  check the calling app against allowlists kept outside Chromium: Google's list of privileged browsers
  (by signing-certificate hash) and each passkey provider's own list (Bitwarden, 1Password and others keep
  public ones).
- The path is chosen in `CredManSupportProvider`: Android 14+ with a recent Play services and a credential
  service uses Credential Manager alongside Play services, and **Credential Manager alone** when
  third-party mode (§1) is on (`ChromeAuthenticatorFactory.java:20-37`). So Ruling P1 also moves passkeys to
  Credential Manager, where providers like Bitwarden can serve them.
- `isUserVerifyingPlatformAuthenticatorAvailable()` was false until a screen lock was set, then true.

**Ruling K6 (new known unknown, blocking passkeys):** passkeys can't work until Blanc's **Play signing
certificate** (Play Console → Test and release → App integrity → App signing key, SHA-256) is on Google's
privileged browser list and on each provider's list. **Owner:** apply to Google (its form for
browsers) and open requests with Bitwarden and Proton Pass. The debug and upload certificates don't
matter: testers install the Play-signed build. A6's passkey gate waits on the replies; until then the
passkey half of Review Focus 3 is "fails safely" (no crash, the site's own fallback works), which this
spike saw.

## 3. Long-press menu: only "Copy link address" and "Copy link text"

Seen: long-pressing a link showed only those two items. Chrome also offers Open in new tab, Open in
private tab, Preview, Share link and Save link.

- Every item except the copy actions is gated by `areMandatoryFlowsCompleted()`
  (`ChromeContextMenuPopulator.java:463`), which is `FirstRunStatus.getFirstRunFlowComplete()`. Chromium
  sets that flag at the end of its own first-run screens (`FirstRunFlowSequencer.java:216`); patch 0102
  turns those screens off, and nothing in Blanc sets the flag. Images, videos and the page menu are
  hidden the same way.
- Items that name Google or Chrome when shown: "Search image with Google Lens", "Search %s for this
  image", "Ask Gemini" (Gemini needs profile eligibility Blanc never has), "Open in new Chrome tab" (Custom
  Tabs only), "Open in Incognito tab".

**Ruling C1:** mark Chromium's first run complete when Blanc's own first minute (A5c) finishes, and for
existing installs on first launch of the new version. **Ruling C2:** hide Google Lens, search-by-image
and Gemini; rename "Incognito" items to Blanc's "private tab" wording; check the result against Blanc's
iPhone menu (open in new tab, open in private tab, copy, share, save image).

## 4. HTTP sign-in prompts

Seen: `https://httpbin.org/basic-auth/u/p` showed Chromium's "Sign in" dialog.

- The dialog comes from `ChromeContentBrowserClient::CreateLoginDelegate` → `LoginHandlerAndroid` →
  `ChromeHttpAuthHandler`. Desktop's fork refuses it in patch 0014 (`CreateLoginDelegate` returns null when
  `blanc::browser_api::RefuseHttpAuth` says so); content then answers the challenge with no credentials and
  shows the 401 page's own body, not an error page (desktop STATUS S1.6).

**Ruling H1:** apply the same refusal on Android (F20, "same as iPhone"). Showing Blanc's error page
instead of the 401 body needs a navigation throttle and wiring to `blanc/android/pages/error.html`,
which nothing does today; the first step matches desktop (the 401 body), and the error page follows in
the same task only if it stays small.

## 5. Certificate warning

Seen: `https://expired.badssl.com` showed Chromium's interstitial with "Back to safety" and Advanced
("Proceed to … (unsafe)"). Its text says "Turn on enhanced protection to get Chrome's highest level of
security", which names Chrome and points to Google's Enhanced Safe Browsing, which Blanc has off.

**Ruling S1:** hide the enhanced-protection line (Safe Browsing is off in Blanc), and check every other
interstitial string for "Chrome" (`security_interstitials_strings.grdp:45` says "Chrome" unconditionally;
the branded strings say "Chromium" in this build). The design keeps Chromium's interstitial; only the
wording changes.

## 6. Sharing into Blanc

Seen: sharing "Look at this https://www.iana.org/…" opened that page. Sharing plain words searched
**Google** with `sourceid=chrome-mobile&source=chrome.ob`.

- `IntentHandler.getAllUrlsFromShareIntent` takes the last web address in the text; otherwise it
  classifies the text through autocomplete and searches with `TemplateUrlService`'s default engine, which
  is Google; Blanc's own address input uses Blanc's setting (A5a ruling R5) and never this path.

**Ruling SH1:** route shared plain text through Blanc's `AddressInput` (the engine in Blanc's Settings).
The share sheet already shows "Blanc"; the receiving component keeps Chrome's internal name
(`com.google.android.apps.chrome.IntentDispatcher`), which no one sees.

## 7. Video: H.264 and AAC are compiled out

Seen: `MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')` is false; VP9 is true. ClearKey
works with WebM/VP9 and fails with MP4/H.264.

- `proprietary_codecs` defaults to `is_chrome_branded` (`build/config/features.gni:31`), and neither
  Android `args.gn` sets it, so both the debug and the release builds lack MP4, H.264 and AAC.
- This affects ordinary video and audio on many sites, not only protected media.

**Owner (new, blocking for video):** turn on `proprietary_codecs = true` (with `ffmpeg_branding =
"Chrome"`) in both Android args templates. Chrome, Brave, Edge and Vivaldi ship it; the decoders mostly
run on Android's own platform codecs. It changes the release args, so it needs a reviewed args change
and a rebuild of each output (`docs/android/release.md`).

## 8. Widevine (K1)

- Chromium on Android plays Widevine through Android's `MediaDrm` (`MediaDrmBridge.java`);
  `enable_widevine` is on for every Android build, and provisioning and licences go through the OS and the
  site's licence server. Nothing in the tree checks the app's identity.
- The emulator image has only ClearKey, so Widevine needs the Pixel. Without §7's codecs most Widevine
  services would fail anyway.

**Ruling W1:** after §7, check the Shaka Player demo's Widevine streams and one real service on the
Pixel. **Owner (K1):** confirm the licensing position; on Android the CDM is the phone's, unlike the
desktop fork's.

## 9. Back and edge-to-edge

- `android:enableOnBackInvokedCallback="true"` is on, and `BackPressManager` handles predictive back
  (Android 13+). Page back/forward animations need Android 14+ in gesture navigation.
- Edge-to-edge is on by default (`kEdgeToEdgeEverywhere`, Android 11+); target SDK 37 forces it on
  Android 16. Pages drew under the status bar on the emulator, and the Island places itself from the
  insets (A1's gate passed 24 of 24 layouts).

**Ruling B1:** no code planned; the Pixel hands-on checks the back gesture's preview, back from a page
with history and from the first page, and pull-to-refresh (patch 0104 touches `SwipeRefreshHandler`)
against the back gesture.

## Order for A6

1. **C1** (one flag; unlocks the whole long-press menu) and **C2**.
2. **P1** (third-party autofill on, with a Settings row), checked with Bitwarden on the emulator.
3. **H1**, **S1** and **SH1** (small, independent).
4. **§7 codecs** once the owner approves, then **W1** on the Pixel.
5. Passkeys once K6's allowlists answer.

The emulator's changes for this spike (mobile data back on, a PIN set and removed) don't persist: it is
the read-only emulator.

## Audit, 2026-11-28

Rechecked on `emulator-5554` (Android 16, Google APIs x86-64) with the debug build of November 24
(`me.bnfy.blanc.dev` 159.0.8154.18, from `cdb76a844`), after #1679 and #1680 merged.

| Item | Today | Left for A6 |
| --- | --- | --- |
| Long-press menu (C1, C2) | Done in #1679: a link offers Open in new tab, Open in private tab, Preview page, Copy link address, Copy link text, Save link as… and Share link | Pixel hands-on |
| Passwords (P1) | Done in #1680: autofill on, a Settings row, Google's autofill service answering on the emulator | Bitwarden and Google Password Manager on the Pixel |
| HTTP sign-in (H1) | Still Chromium's "Sign in" dialog on `httpbin.org/basic-auth` | Refuse it as desktop's patch 0014 does (F20) |
| Certificate warning (S1) | Still says "Turn on enhanced protection to get Chrome's highest level of security" | Hide that line and check the other strings for "Chrome" |
| Sharing into Blanc (SH1) | A shared address opens; shared plain words search Google, as the spike saw (this row first said they opened nothing: the check's shell split the words, so no share reached Blanc) | Route shared words through Blanc's address input and search engine |
| Codecs (§7) | Not on: `requestMediaKeySystemAccess` with H.264 is unsupported, and no Android args template sets `proprietary_codecs` | A reviewed args change and a rebuild of each output |
| Widevine (W1, K1) | Unsupported on the emulator, as expected (ClearKey only) | After the codecs: Shaka's Widevine streams and one real service on the Pixel; the owner's licensing call |
| Passkeys (K6) | `isUserVerifyingPlatformAuthenticatorAvailable()` false with no screen lock; creation was refused by Play services in the spike | Waits on Google's and the providers' allowlists for the Play signing certificate |
| Back (B1) | `enableOnBackInvokedCallback` is true; Back from a second page stays in Blanc | Pixel hands-on (gesture preview, first page, pull to refresh) |
| Edge-to-edge | Done in A1 (24 of 24 layouts) | — |
