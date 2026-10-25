# Native Settings verification — October 25, 2026

The iOS Settings implementation is described in [native-settings.md](native-settings.md).
No release, TestFlight upload, or production Sync account change was performed.

## Automated checks

- iOS unit suite: **271 passed**, including the real WebKit Start Page preview,
  restored Settings-tab compatibility, preference persistence and side effects,
  exception validation, and Sync presentation-state tests.
- iPhone 17e, iOS 26.5: the final focused UI run passed the palette/typed-URL
  route, shield-to-Privacy route, and encrypted-fixture Sync join/disconnect flow.
- iPhone 17 Pro Max, iOS 26.5: the focused UI run passed the palette and shield
  routes, full Start Page customization/photo cancellation, and the five
  non-English locales at accessibility text size. Its 12 native Settings unit
  tests also passed. A final follow-up passed the real-WebKit assertion that the
  read-only preview hides its own Customize button, plus the full customization
  and photo-cancellation UI scenario; the corrected captures replace the earlier
  preview images.
- Earlier UI passes exercised all seven original Settings scenarios on an
  iPhone 17 Pro running iOS 27.0, including dark-theme/search persistence,
  allowed-site editing and retryable Sync failures. The additional shield route
  was verified in the final device runs above.
- Desktop unit suite: **4,622 passed, 2 skipped**. The skipped cases are
  Linux-launcher tests on this macOS host. Dependencies match `package-lock.json`;
  the pinned blocker seed was prepared without changing its manifest.
- `npm run lint`, `npm run copy:check`, `npm run settings:check`,
  `npm run ios:sync-vectors:check`, and the iOS page-bridge/default/locale Node
  tests passed. `git diff --check` passed.

The Sync UI fixture uses the real encryption and engine with an isolated
DEBUG-only transport and secret store. It never contacts production Sync.

## Visual and accessibility evidence

Screenshots were retained for the root sheet, allowed sites, connected Sync,
Start Page, wallpaper, clock, and German, Spanish, French, Italian and Brazilian
Portuguese with accessibility text enabled. The final task artifact folder is
named `native-settings`; its representative files are `settings-small.png`,
`settings.png`, `clock.png`, `wallpaper.png`, `sync-small.png`, and
`settings-<locale>-large-text.png`.

Native controls supply their accessible names and actions; navigation uses
system modal and back behavior, and the preview is noninteractive and hidden
from the accessibility tree. A physical-device VoiceOver session and execution
on the minimum supported iOS 18.4 runtime were not performed. Available
simulator runtimes used for this work were iOS 26.5 and 27.0.

## Reproduction

Open `ios/Blanc/Blanc.xcodeproj`, select the Blanc scheme and an available iPhone
simulator, and run the BlancTests target plus `SettingsUITests` in BlancUITests.
UI fixtures are enabled only by those tests' DEBUG launch arguments and keep
state in a dedicated temporary directory. Ordinary launches retain the existing
production stores, Keychain and Sync transport.

## CI fixture correction

The first hosted iOS run passed all 271 unit tests but timed out waiting for the
connected Sync UI. The fixture server repeated both an account-password KDF and
the pairing KDF after the real client had already derived its pairing key. The
hosted runner's existing crypto-vector tests measured several seconds per KDF,
so this extra server-side work could exhaust the UI test's 20-second deadline.

The DEBUG-only server now uses the existing public desktop pairing-vector keys
and account. A unit test binds those constants to the committed vectors and
checks the encrypted response and rejection of unknown pair IDs. The real
client still derives its key, authenticates/decrypts the response, persists its
account, and performs its normal sync. The 20-second connection assertion and
production crypto are unchanged.

After this correction, all 13 native Settings tests and both the successful
pairing/disconnect and offline/retry UI scenarios passed locally. The hosted
result is tracked on PR #1121.
