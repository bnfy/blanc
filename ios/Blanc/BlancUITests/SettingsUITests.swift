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
        XCTAssertTrue(app.navigationBars[command == "/sync" ? "Sync" : "Settings"].waitForExistence(timeout: 5))
    }
    private func tap(_ id: String) {
        let element = app.descendants(matching: .any).matching(identifier: id).firstMatch
        if !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.waitForExistence(timeout: 5), id)
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
    func testSyncPairingAndDisconnectConfirmation() {
        open("/sync")
        let code = app.textViews["settings.syncCode"]
        // TextField(axis: .vertical) is exposed as a text view on current iOS.
        let input = code.exists ? code : app.textFields["settings.syncCode"]
        input.tap(); input.typeText("K7MR-4PX2")
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        tap("settings.connect")
        XCTAssertTrue(app.textFields["settings.deviceName"].waitForExistence(timeout: 20), app.debugDescription)
        capture("Native Settings — Sync connected")
        app.swipeUp()
        tap("settings.disconnect")
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["Cancel"].tap()
        XCTAssertTrue(app.switches["settings.shareTabs"].exists)
        tap("settings.disconnect"); app.alerts.buttons["Disconnect"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings.syncCode"].waitForExistence(timeout: 10))
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
        let code = app.textViews["settings.syncCode"]
        let input = code.exists ? code : app.textFields["settings.syncCode"]
        input.tap(); input.typeText("K7MR-4PX2")
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        tap("settings.connect")
        XCTAssertTrue(app.staticTexts["settings.syncError"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["settings.connect"].isEnabled)
        capture("Native Settings — Sync error")
    }
}
