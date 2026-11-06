import XCTest

final class SettingsUITests: XCTestCase {
    private var app: XCUIApplication!
    override func setUp() {
        continueAfterFailure = false
        launch(reset: true)
    }
    private func launch(reset: Bool, extra: [String] = []) {
        app = XCUIApplication()
        app.launchArguments = ["-BlancUITestSettings", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
            + (reset ? ["-BlancUITestSettingsReset"] : []) + extra
        app.launch()
    }
    private func open(_ command: String = "/settings") {
        let pill = app.buttons["pill.palette"]
        XCTAssertTrue(pill.waitForExistence(timeout: 15))
        pill.tap()
        let input = app.textFields["island.address"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText(command + "\n")
        // 15 s like the launch wait: right after a relaunch, a busy CI
        // simulator has taken over 5 s to show Settings.
        XCTAssertTrue(app.navigationBars[command == "/sync" ? "Sync" : "Settings"].waitForExistence(timeout: 15))
    }
    private func tap(_ id: String) {
        let element = app.descendants(matching: .any).matching(identifier: id).firstMatch
        XCTAssertTrue(app.reveal(element), id)
        element.tap()
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testPaletteAndTypedURLDoNotCreateTab() {
        let pill = app.buttons["pill.palette"]
        XCTAssertTrue(pill.waitForExistence(timeout: 15))
        let initialLabel = pill.label
        pill.tap()
        let shortcut = app.buttons["palette.settings"]
        XCTAssertTrue(shortcut.waitForExistence(timeout: 5)); shortcut.tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        capture("Native Settings — root")
        tap("settings.done")
        XCTAssertEqual(pill.label, initialLabel)
        open("blanc://settings/")
        tap("settings.done")
        XCTAssertEqual(pill.label, initialLabel)
    }
    func testSearchAndThemePersist() {
        open()
        tap("settings.searchEngine"); app.buttons["Kagi"].tap()
        tap("settings.theme"); app.buttons["Dark"].tap()
        capture("Native Settings — dark")
        tap("settings.done")
        app.terminate(); launch(reset: false)
        open()
        XCTAssertTrue(app.staticTexts["Kagi"].exists)
        XCTAssertTrue(app.staticTexts["Dark"].exists)
    }
    func testStartPageControlsAndPhotoCancellation() {
        open(); tap("settings.startPage")
        XCTAssertTrue(app.navigationBars["Start Page"].waitForExistence(timeout: 5))
        capture("Native Settings — Start Page")
        tap("settings.layout"); app.buttons["Ledger"].tap()
        tap("settings.clock")
        tap("settings.clockFont"); app.buttons["Roboto Flex"].tap()
        let height = app.sliders["settings.height"]
        XCTAssertTrue(height.exists); height.adjust(toNormalizedSliderPosition: 0.7)
        capture("Native Settings — clock")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tap("settings.wallpaper")
        tap("settings.wallpaperSource"); app.buttons["Color"].tap()
        capture("Native Settings — wallpaper")
        tap("settings.choosePhoto")
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Wallpaper"].waitForExistence(timeout: 5))
    }
    func testBlockingExceptions() {
        open(); tap("settings.privacy")
        let input = app.textFields["settings.site"]
        input.tap(); input.typeText("https://www.example.com/path")
        tap("settings.addSite")
        XCTAssertTrue(app.staticTexts["example.com"].exists)
        capture("Native Settings — allowed site")
        app.buttons["Remove site: example.com"].tap()
        XCTAssertFalse(app.buttons["Remove site: example.com"].exists)
    }
    func testClearSiteDataAsksFirst() {
        open(); tap("settings.privacy")
        tap("settings.clearSiteData")
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Cancel"].tap()
        XCTAssertFalse(app.staticTexts["settings.clearSiteData.done"].exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Removes cookies, cache, and site data'")).firstMatch.waitForExistence(timeout: 5))
        tap("settings.clearSiteData")
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        capture("Native Settings — clear site data")
        alert.buttons["Clear cookies, cache & site data"].tap()
        XCTAssertTrue(app.staticTexts["settings.clearSiteData.done"].waitForExistence(timeout: 5))
        // A second clear starts fresh: the old "Cleared." goes when it is asked for.
        tap("settings.clearSiteData")
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Cancel"].tap()
        XCTAssertFalse(app.staticTexts["settings.clearSiteData.done"].exists)
    }
    /// Pair with your Blanc leads (design 2026-10-28 §7.1); a simulator has no
    /// camera to scan with, so it lands on the code field with a hint.
    func testPairWithBlancLeadsAndFallsBackToTheCodeField() {
        open("/sync")
        let pair = app.buttons["settings.pairWithBlanc"]
        XCTAssertTrue(pair.waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["settings.syncCode"].exists, "other ways wait one level deeper")
        XCTAssertFalse(app.descendants(matching: .any)["settings.deviceName"].exists, "nothing of the connected state while Sync is off")
        XCTAssertFalse(app.buttons["settings.syncNow"].exists)
        capture("Native Settings — Sync off, Pair with your Blanc")
        pair.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings.syncCode"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Type the code shown on your computer."].exists)
        // Further down the list; on a shorter screen it isn't built yet.
        let handle = app.descendants(matching: .any)["settings.syncHandle"]
        XCTAssertTrue(app.reveal(handle), "the passphrase path is there too")
    }
    func testSyncPairingAndDisconnectConfirmation() {
        open("/sync")
        tap("settings.otherWays")
        // The code field is built after "Other ways" opens; wait before asking what kind it is.
        XCTAssertTrue(app.descendants(matching: .any)["settings.syncCode"].waitForExistence(timeout: 5))
        let code = app.textViews["settings.syncCode"]
        // TextField(axis: .vertical) is exposed as a text view on current iOS.
        let input = code.exists ? code : app.textFields["settings.syncCode"]
        input.tap(); input.typeText("K7MR-4PX2")
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        tap("settings.connect")
        // Connecting rebuilds the list; on a short sheet the name row can end up
        // above the part that's shown.
        XCTAssertTrue(app.reveal(app.textFields["settings.deviceName"], timeout: 20), app.debugDescription)
        capture("Native Settings — Sync connected")
        app.swipeUp()
        tap("settings.disconnect")
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["Cancel"].tap()
        XCTAssertTrue(app.switches["settings.shareTabs"].exists)
        tap("settings.disconnect"); app.alerts.buttons["Disconnect"].tap()
        XCTAssertTrue(app.buttons["settings.pairWithBlanc"].waitForExistence(timeout: 10))
    }
    func testBlockingPopoverOpensNativePrivacySheet() {
        open(); tap("settings.privacy")
        let blocker = app.switches["settings.blocker"]
        if blocker.value as? String == "1" {
            blocker.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        }
        XCTAssertEqual(blocker.value as? String, "0")
        tap("settings.done")
        let pill = app.buttons["pill.palette"]
        pill.tap()
        let input = app.textFields["island.address"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap(); input.typeText("https://example.com/\n")
        // With blocking off everywhere, the Sunrise menu offers the way back.
        app.openIslandMenu()
        capture("Native Settings — Sunrise menu, blocking off")
        let settings = app.buttons["Blocking settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
        XCTAssertTrue(app.navigationBars["Privacy"].waitForExistence(timeout: 5))
        tap("settings.done")
        XCTAssertTrue(app.buttons["island.menu"].waitForExistence(timeout: 5))
    }

    func testLanguagesAndLargeText() {
        let titles = [("de", "Einstellungen"), ("es", "Ajustes"), ("fr", "Réglages"), ("it", "Impostazioni"), ("pt-BR", "Configurações")]
        for (locale, _) in titles {
            app.terminate()
            app.launchArguments = ["-BlancUITestSettings", "-BlancUITestSettingsReset", "-AppleLanguages", "(\(locale))", "-AppleLocale", locale,
                                   "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            app.launch()
            let pill = app.buttons["pill.palette"]
            XCTAssertTrue(pill.waitForExistence(timeout: 15)); pill.tap()
            let input = app.textFields["island.address"]
            XCTAssertTrue(input.waitForExistence(timeout: 5))
            input.tap(); input.typeText("/settings\n")
            XCTAssertTrue(app.buttons["settings.done"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["settings.done"].isHittable)
            XCTAssertTrue(app.descendants(matching: .any)["settings.searchEngine"].exists)
            capture("Native Settings — \(locale), accessibility text")
        }
    }

    func testSyncFailureRemainsRetryable() {
        app.terminate(); launch(reset: true, extra: ["-BlancUITestSettingsOffline"])
        open("/sync")
        tap("settings.otherWays")
        // The code field is built after "Other ways" opens; wait before asking what kind it is.
        XCTAssertTrue(app.descendants(matching: .any)["settings.syncCode"].waitForExistence(timeout: 5))
        let code = app.textViews["settings.syncCode"]
        let input = code.exists ? code : app.textFields["settings.syncCode"]
        input.tap(); input.typeText("K7MR-4PX2")
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        tap("settings.connect")
        XCTAssertTrue(app.reveal(app.staticTexts["settings.syncError"], timeout: 15))
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        capture("Native Settings — Sync error")
    }
    /// iOS confirms every icon change with its own alert, shown by SpringBoard.
    private func dismissIconChangedNotice(_ id: String) {
        // It can come from either, and on a busy CI simulator it can take
        // more than 5 s, so both are watched for one longer window. XCTest
        // can also dismiss it itself, as an interruption of the tap that
        // asked for the change (CI, iOS 26.5, 2026-11-03): then the choice
        // shows with no alert left to dismiss.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let buttons = [springboard.alerts.buttons["OK"], app.alerts.buttons["OK"]]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            for ok in buttons where ok.waitForExistence(timeout: 1) { ok.tap(); return }
            if appIcon(id).isSelected, !springboard.alerts.firstMatch.exists { return }
        }
        XCTFail("iOS did not confirm the icon change")
    }
    private func appIcon(_ id: String) -> XCUIElement { app.buttons["appIcon.\(id)"] }
    /// A dropdown's value and a switch stay readable when the theme changes with
    /// Settings open. Dark then Light: one of them differs from the system's.
    func testControlsStayReadableAfterAThemeChange() {
        open()
        for theme in ["Dark", "Light"] {
            tap("settings.theme"); app.buttons[theme].tap()
            sleep(2)
            let value = app.descendants(matching: .any)["settings.searchEngine"].screenshot().image
            XCTAssertGreaterThan(value.contrast(inRightFraction: 0.45), 0.35, "\(theme): the search engine's value")
        }
        tap("settings.theme"); app.buttons["Dark"].tap()
        sleep(2)
        let toggle = app.descendants(matching: .any)["settings.islandTuck"].screenshot().image
        XCTAssertGreaterThan(toggle.saturation(inRightFraction: 0.2), 0.12, "a switch that's on isn't white on white")
    }
    func testAppIconPicker() {
        let ids = ["sunrise-gold", "sunrise-dawn", "sunrise", "sunrise-dark", "sunrise-spectrum", "sunrise-amber"]
        open()
        tap("settings.appIcon")
        for id in ids { XCTAssertTrue(appIcon(id).waitForExistence(timeout: 5), id) }
        XCTAssertEqual(ids.filter { appIcon($0).isSelected }, ["sunrise-gold"])
        capture("Native Settings — App icon")
        appIcon("sunrise-dawn").tap()
        dismissIconChangedNotice("sunrise-dawn")
        XCTAssertTrue(appIcon("sunrise-dawn").waitForSelection(timeout: 15))
        app.terminate(); launch(reset: false)
        open(); tap("settings.appIcon")
        XCTAssertTrue(appIcon("sunrise-dawn").waitForSelection(), "the choice survives a relaunch")
        appIcon("sunrise-gold").tap()
        dismissIconChangedNotice("sunrise-gold")
        XCTAssertTrue(appIcon("sunrise-gold").waitForSelection(timeout: 15))
        XCTAssertFalse(appIcon("sunrise-dawn").isSelected)
    }
}

private extension UIImage {
    /// RGB values, 0 to 1, of the image's right-hand part.
    private func pixels(inRightFraction fraction: CGFloat) -> [(r: Double, g: Double, b: Double)] {
        guard let image = cgImage else { return [] }
        let width = image.width, height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let context = CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        var result: [(r: Double, g: Double, b: Double)] = []
        for y in stride(from: 0, to: height, by: 2) {
            for x in stride(from: Int(CGFloat(width) * (1 - fraction)), to: width, by: 2) {
                let i = (y * width + x) * 4
                result.append((Double(bytes[i]) / 255, Double(bytes[i + 1]) / 255, Double(bytes[i + 2]) / 255))
            }
        }
        return result
    }

    /// How far apart the lightest and darkest pixels are.
    func contrast(inRightFraction fraction: CGFloat) -> Double {
        let luma = pixels(inRightFraction: fraction).map { 0.2126 * $0.r + 0.7152 * $0.g + 0.0722 * $0.b }
        return (luma.max() ?? 0) - (luma.min() ?? 0)
    }

    /// The most colorful pixel: 0 for gray.
    func saturation(inRightFraction fraction: CGFloat) -> Double {
        pixels(inRightFraction: fraction).map { max($0.r, $0.g, $0.b) - min($0.r, $0.g, $0.b) }.max() ?? 0
    }
}

private extension XCUIElement {
    func waitForSelection(timeout: TimeInterval = 5) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if isSelected { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return isSelected
    }
}
