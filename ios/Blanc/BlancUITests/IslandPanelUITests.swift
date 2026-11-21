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
        app.launchArguments = ["-BlancUITestTwoTabs"]
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

    func testTappingTheDotsOpensThePanel() {
        app.buttons["island.dots"].tap()
        XCTAssertTrue(panel.waitForExistence(timeout: 5))
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
