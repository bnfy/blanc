import XCTest

/// Tapping the Island grows it into the palette panel above the keyboard;
/// iPhone landscape keeps the sheet.
final class IslandPanelUITests: XCTestCase {
    private let app = XCUIApplication()
    private var site: XCUIElement { app.buttons["pill.palette"] }
    private var panel: XCUIElement { app.otherElements["palette.panel"] }
    private var field: XCUIElement { app.textFields["island.address"] }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .phone, "iPhone portrait and landscape")
        XCUIDevice.shared.orientation = .portrait
        // Default settings: nothing from this simulator's own sync or Island
        // setup changes what the panel holds or where it sits.
        app.launchArguments = ["-BlancUITestTwoTabs", "-BlancUITestSettings", "-BlancUITestSettingsReset"]
        app.launch()
        XCTAssertTrue(site.waitForExistence(timeout: 15))
        try XCTSkipUnless(app.windows.firstMatch.frame.width < 600, "the phone layout")
    }

    private func openPanel() {
        site.tap()
        XCTAssertTrue(panel.waitForExistence(timeout: 5))
        XCTAssertTrue(field.waitForExistence(timeout: 5))
    }

    func testTappingTheSiteOpensThePanelWithSearchFocused() {
        openPanel()
        let focus = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hasKeyboardFocus == YES"), object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [focus], timeout: 5), .completed)
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        XCTAssertLessThanOrEqual(field.frame.maxY, keyboard.frame.minY)
    }

    /// Two tabs make a short panel: it hugs its rows instead of keeping its
    /// full height with a gap above the search field.
    func testThePanelHugsAShortList() {
        openPanel()
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        sleep(1)
        let rows = app.buttons.matching(identifier: "palette.tab")
        XCTAssertEqual(rows.count, 2)
        let lastRow = rows.element(boundBy: 1).frame
        XCTAssertLessThan(field.frame.minY - lastRow.maxY, 80, "no gap between the rows and search: \(lastRow) \(field.frame)")
        XCTAssertLessThanOrEqual(field.frame.maxY, keyboard.frame.minY)
    }


    /// The page's whole address is a pill at the start of the search row
    /// (no search glass, no copy button): typing sets it aside, a tap puts it
    /// in the field to edit, and holding it offers Copy Link.
    func testTheAddressPillSitsInTheSearchRow() {
        openPanel()
        let pill = app.buttons["palette.urlPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        XCTAssertEqual(pill.value as? String, "https://example.com/")
        XCTAssertEqual(pill.frame.midY, field.frame.midY, accuracy: 4, "in the search row")
        XCTAssertLessThan(pill.frame.minX, field.frame.minX, "before the field")
        XCTAssertFalse(app.buttons["palette.copyLink"].exists, "no copy button")
        field.typeText("b")
        XCTAssertTrue(pill.waitForNonExistence(timeout: 3), "typing sets the address aside")
        field.typeText(XCUIKeyboardKey.delete.rawValue)
        XCTAssertTrue(pill.waitForExistence(timeout: 3))
        pill.tap()
        let edited = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "https://example.com/"), object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [edited], timeout: 3), .completed, "a tap puts the address in the field")
        XCTAssertFalse(pill.exists)
        // Clearing the field brings the address back.
        let clear = app.buttons["Clear search"]
        XCTAssertTrue(clear.waitForExistence(timeout: 3))
        clear.tap()
        XCTAssertTrue(pill.waitForExistence(timeout: 3))
        pill.press(forDuration: 1.0)
        let copy = app.buttons["Copy Link"]
        XCTAssertTrue(copy.waitForExistence(timeout: 3), "holding the pill offers Copy Link")
        copy.tap()
        XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["send.banner"].waitForExistence(timeout: 3), "Link copied")
    }

    func testTappingOutsideCloses() {
        openPanel()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
        XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
        XCTAssertTrue(site.isHittable)
    }

    func testDraggingTowardTheIslandCloses() {
        openPanel()
        let start = field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 150)))
        XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
    }

    func testRotatingHandsThePanelToTheSheetWithTheText() {
        openPanel()
        field.typeText("blanc")
        addTeardownBlock { XCUIDevice.shared.orientation = .portrait }
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, "blanc")
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(panel.waitForExistence(timeout: 5))
        XCTAssertEqual(panel.textFields["island.address"].value as? String, "blanc")
    }
}
