# iPhone Liquid Glass App Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six Icon Composer app icons for Blanc for iPhone, with Sunrise Dawn as the standard icon, and a Settings → Appearance → App icon picker that switches between them.

**Architecture:** A new `scripts/ios-app-icons.js` holds the iPhone catalog and draws the six `.icon` packages. `brand:build` emits them into `ios/Blanc/Blanc/AppIcons/`, and `brand:check` guards them. Picker previews are `ictool` renders made by a Mac-only script and pinned by a lock file that a unit test checks. On the Swift side, an `AppIconChoice` enum and an `AppIconModel` wrap `UIApplication`'s alternate-icon API, and a list view in Settings shows the choices.

**Tech Stack:** Node 22 with `sharp` (brand build), Icon Composer 27.1 `ictool` (previews only), Xcode 27.1 locally and Xcode 26 in CI, SwiftUI, XCTest and XCUITest.

**Spec:** `docs/superpowers/specs/2026-10-29-ios-liquid-glass-app-icons-design.md` (the appendix holds every artwork value).

## Global Constraints

- **Catalog.** The order, ids, `.icon` names and labels are exactly these:
  1. `sunrise-dawn` / `AppIcon` / Sunrise Dawn
  2. `sunrise` / `Sunrise` / Sunrise
  3. `sunrise-dark` / `SunriseDark` / Sunrise Dark
  4. `sunrise-gold` / `SunriseGold` / Sunrise Gold
  5. `sunrise-spectrum` / `SunriseSpectrum` / Sunrise Spectrum
  6. `sunrise-amber` / `SunriseAmber` / Sunrise Amber
- **Labels.** Labels for ids 2 to 6 come from `settings-schema/schema.json` `appIcons`. `sunrise-dawn` is never added to the schema or to desktop code.
- **Package folder.** Packages live in `ios/Blanc/Blanc/AppIcons/<Name>.icon/`, holding `icon.json` and `Assets/*.png`.
- **Platforms key.** Every iOS package has `"supported-platforms": { "circles": ["watchOS"], "squares": "shared" }`.
- **Build settings.** `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` stays. Both app configurations get `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "Sunrise SunriseDark SunriseGold SunriseSpectrum SunriseAmber"`.
- **Old icon set.** `ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset` is deleted.
- **Unchanged.** The macOS, Windows and Linux icons, in-app marks, website, `assets/sunrise-app-icon.png` and `build/icon.png`. `brand:check` must still pass for all of them.
- **Copy.** No new copy keys. The row and the footer use `settings.general.appIconSetting.label` and `settings.general.appIconSetting.hint`, and icon names stay untranslated.
- **Identifiers.** `settings.appIcon` for the Settings row, and `appIcon.<id>` for each picker row.
- **Commits.** Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **iOS refuses the change.** When `setAlternateIconName` throws (the app is inactive, or the system refuses), the checkmark stays on the old icon and nothing crashes. *Test:* `AppIconModelTests.testFailedSwitchKeepsCurrent` (Task 3).
2. **A name the build no longer has.** `alternateIconName` may return a name from another build. The picker then shows Dawn as current. *Test:* `AppIconChoiceTests.testUnknownNameIsDawn` (Task 3).
3. **Dark Settings.** In Dark, the picker shows each icon's Dark preview. *Test:* `ios-app-icons.test.js` "every preview imageset has a dark-appearance image" (Task 2).
4. **Stale previews.** After an icon's artwork changes, the picker must not keep showing the old preview. *Test:* `ios-app-icons.test.js` "the previews lock matches every package" (Task 2).
5. **The choice survives a relaunch.** After switching to Gold and relaunching, Gold is still checked. *Test:* `SettingsUITests.testAppIconPicker`, which relaunches mid-test (Task 3).

---

### Task 1: Generate the six packages through brand:build

**Files:**
- Create: `scripts/ios-app-icons.js`
- Modify: `scripts/build-brand-assets.js`
  - Drop the `AppIcon.appiconset/icon-sunrise.png` emit (line 722).
  - Emit the packages after `colorwaySources()` (line 748).
- Delete: `ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset/`
- Modify: `test/unit/brand-assets.test.js:110-119`
- Create: `test/unit/ios-app-icons.test.js` (catalog and package tests. Task 2 adds the preview tests and Task 3 the Swift and project tests.)

**Interfaces:**
- Produces, from `scripts/ios-app-icons.js`:
  - `IOS_APP_ICON_DIR = 'ios/Blanc/Blanc/AppIcons'`
  - `IOS_APP_ICONS`, a frozen array of `{ id, nativeName, label }` in catalog order.
  - `async iosAppIconFiles(master: Buffer) → Promise<Record<string, Buffer|string>>`, keyed by repository-relative path (`<dir>/<Name>.icon/icon.json` and `<dir>/<Name>.icon/Assets/<file>.png`).
  - `packageDigest(packageDir: string) → string`: the sha256 over the package's sorted relative paths and bytes.
- Consumes:
  - `createIconDocument` from `scripts/after-pack-app-icons.js`.
  - Definitions from `src/main/app-icon-assets.js` (`sunrise`, `sunrise-dark`, `sunrise-spectrum`, `sunrise-amber`).
  - Layer PNGs read from `build/app-icons/Icon.icon/Assets/` and `build/app-icons/colorways/`. These are emitted earlier in the same `brand:build` run.

- [ ] **Step 1: Write the failing tests** in `test/unit/ios-app-icons.test.js`:
  - `'the iPhone catalog is Dawn first, then the Mac icons'`:
    - `IOS_APP_ICONS.map(i => i.id)` deep-equals `['sunrise-dawn','sunrise','sunrise-dark','sunrise-gold','sunrise-spectrum','sunrise-amber']`, and `nativeName`s are `['AppIcon','Sunrise','SunriseDark','SunriseGold','SunriseSpectrum','SunriseAmber']`.
    - Each label after the first equals the schema's `appIcons` label for that id.
    - `IOS_APP_ICONS[0].label === 'Sunrise Dawn'`.
    - The schema has no `sunrise-dawn`.
  - `'every package exists and names only images it contains'`: for each icon:
    - `<dir>/<Name>.icon/icon.json` parses.
    - `supported-platforms` deep-equals the global value.
    - There are 1 to 4 groups.
    - Every `image-name` found by walking `groups[].layers[]` exists in `Assets/`, and `Assets/` holds no other file.
  - `'Dawn and Gold glass groups match the spec appendix'`:
    - In `AppIcon.icon`, `groups.map(g => g.layers.map(l => l.name))` deep-equals `[['Water'],['Sun'],['Rays'],['Glow','Night','Sky']]`.
    - `groups[0].translucency` deep-equals `{enabled:true,value:0.35}` and `groups[0]['blur-material'] === 0.6`.
    - In `SunriseGold.icon`, the layer names are `[['Water'],['Sun'],['Rays'],['Reflection','Glow','Tile']]`.
  - `'reused packages match their Mac layers byte for byte'`:
    - `Sunrise.icon/Assets/sunrise-mark.png` equals `build/app-icons/Icon.icon/Assets/sunrise-mark.png`.
    - Each `SunriseSpectrum`/`SunriseAmber` asset equals the same-named file in `build/app-icons/colorways/`.
- [ ] **Step 2: Rewrite the iOS block of `brand-assets.test.js`.**
  - Remove the `AppIcon.appiconset` assertions.
  - Assert that `ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset` does not exist and that `ios/Blanc/Blanc/AppIcons/AppIcon.icon/icon.json` exists.
- [ ] **Step 3: Run** `node --test test/unit/ios-app-icons.test.js test/unit/brand-assets.test.js`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement `scripts/ios-app-icons.js`.**
  - Port the proof generator using the appendix values: `split`, `grow` (blur σ, then the 40→70 ramp), paint, the sky/night/glow/reflection SVGs, and the two documents.
  - Build the reused packages: `createIconDocument(def)`, then override `supported-platforms`.
  - `sharp` and `path` come from the repository's own dependencies.
- [ ] **Step 5: Wire it into `build-brand-assets.js` and remove the old icon set.**
  - Add `for (const [file, contents] of Object.entries(await iosAppIconFiles(master))) await emit(file, contents);` after the colorway loop.
  - Delete line 722.
  - Run `git rm -r ios/Blanc/Blanc/Assets.xcassets/AppIcon.appiconset`.
- [ ] **Step 6: Run** `npm run brand:build && npm run brand:check && node --test test/unit/ios-app-icons.test.js test/unit/brand-assets.test.js`. Expected:
  - `brand:build` reports only new `ios/Blanc/Blanc/AppIcons/**` files, and no file outside that folder changes (`git status`).
  - `brand:check` prints "Brand assets are current."
  - The tests pass.
- [ ] **Step 7: Render the two drawn packages with `ictool`** (Default, Dark, ClearLight, TintedLight) and compare them side by side with the proof renders. They must look the same, so any visible difference is a bug.
- [ ] **Step 8: Commit** with the message "iOS: generate six Liquid Glass app icon packages through brand:build".

### Task 2: Picker previews and their lock

**Files:**
- Create: `scripts/build-ios-icon-previews.js`
- Modify: `package.json` scripts: `"ios:icon-previews": "node scripts/build-ios-icon-previews.js"`
- Create (generated): `ios/Blanc/Blanc/Assets.xcassets/AppIconPreview-<Name>.imageset/{<Name>.png,<Name>-dark.png,Contents.json}` ×6, and `ios/Blanc/app-icon-previews.lock.json`
- Test: `test/unit/ios-app-icons.test.js`

**Interfaces:**
- Consumes: `IOS_APP_ICONS`, `IOS_APP_ICON_DIR`, `packageDigest` (Task 1).
- Produces:
  - Imageset names `AppIconPreview-<nativeName>`.
  - A lock shaped `{ "icons": { "<nativeName>": { "package": "<sha256>", "light": "<sha256>", "dark": "<sha256>" } } }`.

- [ ] **Step 1: Write the failing tests:**
  - `'every preview imageset has a dark-appearance image'`: for each icon, `Contents.json` has one `idiom: universal` image with no `appearances` and one with `appearances: [{appearance:'luminosity', value:'dark'}]`, both `scale: '3x'`. Both files exist and are 180×180 (check with `sharp().metadata()`).
  - `'the previews lock matches every package'`: for each icon, `lock.icons[nativeName].package === packageDigest(...)`, and the `light`/`dark` values equal the sha256 of the two PNGs.
- [ ] **Step 2: Run** `node --test test/unit/ios-app-icons.test.js`. Expected: FAIL (no imagesets).
- [ ] **Step 3: Implement the script.**
  - Exit with a clear message unless `process.platform === 'darwin'` and `/Applications/Icon Composer.app/Contents/Executables/ictool` exists.
  - For each icon, run `ictool <pkg> --export-image --platform iOS --rendition Default|Dark --width 60 --height 60 --scale 3`.
  - Convert the 16-bit output to 8-bit RGBA PNG with `sharp(...).png({ compressionLevel: 9 })`.
  - Write the imageset and then the lock (two-space JSON, trailing newline).
- [ ] **Step 4: Run** `npm run ios:icon-previews && node --test test/unit/ios-app-icons.test.js`. Expected: PASS. Then open two previews and check that they show the right icons.
- [ ] **Step 5: Commit** with the message "iOS: render App icon picker previews with Icon Composer, pinned by a lock".

### Task 3: The App icon picker

**Files:**
- Create: `ios/Blanc/Blanc/AppIconChoice.swift`, `ios/Blanc/Blanc/AppIconSettingsView.swift`
- Modify:
  - `ios/Blanc/Blanc/SettingsSheet.swift`: add the aliases `"appIcon": "settings.general.appIconSetting.label"` and `"appIconHint": "settings.general.appIconSetting.hint"`, and a row in the Appearance section after Theme.
  - `ios/Blanc/Blanc.xcodeproj/project.pbxproj`: the alternate-names setting in both app configurations, next to `ASSETCATALOG_COMPILER_APPICON_NAME` (lines 393, 433).
- Test:
  - `ios/Blanc/BlancTests/AppIconChoiceTests.swift` (holds `AppIconChoiceTests` and `AppIconModelTests`)
  - `ios/Blanc/BlancUITests/SettingsUITests.swift`
  - `test/unit/ios-app-icons.test.js`

**Interfaces:**
- Consumes: imageset names `AppIconPreview-<nativeName>` (Task 2); the generated `BlancAppIcon` enum and its `label`.
- Produces:
  - `enum AppIconChoice: String, CaseIterable, Identifiable`, with cases `sunriseDawn = "sunrise-dawn"`, `sunrise`, `sunriseDark = "sunrise-dark"`, `sunriseGold = "sunrise-gold"`, `sunriseSpectrum = "sunrise-spectrum"` and `sunriseAmber = "sunrise-amber"`, in that order.
    - `var alternateIconName: String?`: `nil` for Dawn, otherwise the `.icon` name.
    - `var label: String`: "Sunrise Dawn" for Dawn, otherwise `BlancAppIcon(rawValue:)!.label`.
    - `var previewImageName: String`: `"AppIconPreview-AppIcon"` for Dawn, otherwise `"AppIconPreview-\(alternateIconName!)"`.
    - `static func current(alternateIconName: String?) -> AppIconChoice`: `nil` or an unknown name gives `.sunriseDawn`.
  - `@MainActor protocol AlternateIconSwitching { var alternateIconName: String? { get }; func setAlternateIconName(_ name: String?) async throws }`, with `extension UIApplication: AlternateIconSwitching {}`.
  - `@MainActor final class AppIconModel: ObservableObject` with `@Published private(set) var current: AppIconChoice`, `init(switcher: AlternateIconSwitching = UIApplication.shared)`, `func refresh()` and `func choose(_ choice: AppIconChoice) async`. `choose` sets `current` only after the call succeeds.
  - `struct AppIconSettingsView: View`, with `@ObservedObject var model: AppIconModel`.

- [ ] **Step 1: Write the failing tests.**
  - **XCTest `AppIconChoiceTests`:**
    - `testCatalogOrderMatchesBrandBuild`: `allCases.map(\.rawValue)` equals the six ids in order.
    - `testDawnIsPrimary`: `alternateIconName == nil`, and `current(alternateIconName: nil) == .sunriseDawn`.
    - `testAlternateNamesRoundTrip`: each non-Dawn case satisfies `current(alternateIconName: c.alternateIconName) == c`.
    - `testUnknownNameIsDawn`: `current(alternateIconName: "Ember") == .sunriseDawn`.
    - `testPreviewsAreBundled`: `UIImage(named: c.previewImageName) != nil` for every case.
  - **XCTest `AppIconModelTests`** use a fake switcher:
    - `testChooseSwitches`: choosing `.sunriseGold` records `"SunriseGold"` and makes `current == .sunriseGold`.
    - `testChooseDawnClearsName`: choosing Dawn records `nil`.
    - `testFailedSwitchKeepsCurrent`: when the fake throws, `current` stays as it was.
  - **XCUITest `testAppIconPicker`:**
    - Open `/settings`, tap `settings.appIcon`, and check that six `appIcon.*` buttons exist and only `appIcon.sunrise-dawn` `isSelected`.
    - Tap `appIcon.sunrise-gold` and dismiss iOS's notice: tap `OK` in `XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts`, or on the app's own alert if it shows there. Check that `appIcon.sunrise-gold` is selected.
    - Relaunch without reset, reopen the picker, and check Gold is still selected.
    - Tap Dawn, dismiss the notice, and check Dawn is selected.
  - **Node test** `'the Swift catalog and Xcode settings match the brand catalog'`:
    - `AppIconChoice.swift` declares the six raw values in catalog order.
    - Every non-Dawn `nativeName` appears as a quoted `"<Name>"` in it.
    - `project.pbxproj` has the exact alternate-names line twice and `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;` twice.
- [ ] **Step 2: Run** `node --test test/unit/ios-app-icons.test.js` (expected FAIL), and run the XCTest file in the background: `xcodebuild test -project Blanc.xcodeproj -scheme Blanc -destination 'id=<proof sim>' -only-testing:BlancTests/AppIconChoiceTests -only-testing:BlancTests/AppIconModelTests`. Expected: build failure (types missing).
- [ ] **Step 3: Implement the two Swift files, the Settings row and the build setting.**
  - **The row:**
    - A `NavigationLink` to `AppIconSettingsView(model:)`, labeled with `summary("appIcon", value: model.current.label)`, `.accessibilityIdentifier("settings.appIcon")`.
    - `SettingsSheet` owns `@StateObject private var appIcons = AppIconModel()` and calls `refresh()` in `.onAppear`.
  - **The list:**
    - A `Form` with one `Section`, footed by `SettingsCopy.text("appIconHint")`.
    - Each row is a `Button` containing `Image(previewImageName)`, resizable at 60×60, then the label, then a trailing `checkmark` when current. Rows carry `.accessibilityIdentifier("appIcon.\(id)")` and `.accessibilityAddTraits(current ? .isSelected : [])`.
    - Tapping a row runs `Task { await model.choose(choice) }`.
    - The list uses `.settingsFormStyle()` and `.settingsTitle(SettingsCopy.text("appIcon"))`, like the other subpages.
- [ ] **Step 4: Run the node test, the XCTests and the UI test** in the background with `-only-testing:BlancUITests/SettingsUITests/testAppIconPicker`. Expected: PASS.
- [ ] **Step 5: Commit** with the message "iOS: Settings → App icon picker for the six Sunrise icons".

### Task 4: Parity records and docs

**Files:**
- Modify:
  - `spec/divergence-register.md`: add D33 after D32, and add a pointer to D33 in D6's parity contract.
  - `spec/features.md`: add an iPhone bullet to F17.
  - `spec/parity-matrix.md`: in the F17 row, set iOS to PARTIAL and add D33.
  - `docs/ios/app-store-connect.md`: item 19.
  - `CLAUDE.md` and `AGENTS.md`: in the "App icon" paragraph, add one sentence on the iPhone catalog and correct the "every Sunrise surface" claim for the iPhone's Spectrum and Amber.
- Test: `npm run test:unit` (spec and doc guards).

- [ ] **Step 1: Write the text from the spec's "Parity records" section** (wording as in the spec, plain language).
- [ ] **Step 2: Run** `npm run substrate:check && npm run test:unit`. Expected: both pass.
- [ ] **Step 3: Commit** with the message "Spec: record the iPhone app icon catalog (D33) and update F17".

### Task 5: Verify, install, PR

- [ ] **Step 1: Run the iOS suite.** `xcodebuild test` for the whole scheme on the proof simulator (`784679CB-E973-41C5-9E7C-7AD407719EC1`, iPhone Air, iOS 27.1), in the background. Expected: every test passes, with failures reported verbatim.
- [ ] **Step 2: Inspect the built bundle.** Run `xcrun assetutil --info` on the built `Blanc.app/Assets.car`. Expected:
  - `IconImageStack` entries for `AppIcon` and the five alternates.
  - Flat `Icon Image` renditions for all six.
  - `CFBundleAlternateIcons` in the built `Info.plist`, with five names.
- [ ] **Step 3: Take Home Screen screenshots on the proof simulator.** Capture Dawn as installed, the picker in Light and Dark, and the Home Screen after switching to Spectrum and back.
- [ ] **Step 4: Install on the owner's iPhone.** Build Debug for device `00008150-001C2CE83EF0401C` with `-derivedDataPath <scratchpad>/dd-device -allowProvisioningUpdates`, then install with `xcrun devicectl device install app`.
- [ ] **Step 5: Run the repository checks.** `npm run lint`, `npm run substrate:check` and `npm run test:unit`.
- [ ] **Step 6: Open the PR.** Push the branch and open a PR without merging it. Its body summarizes the change and the screenshots, and lists what wasn't verified: iOS 18 on a device, and Clear and Tinted on a real Home Screen. Bind it with `ccd_pr`.
