import XCTest

/// The pill's icon buttons answer taps on every supported iOS (on iOS 26 a
/// bare 20 pt symbol didn't register at all).
final class PillButtonsUITests: XCTestCase {
  func testPlusOpensANewTab() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFavorites"]
    app.launch()
    // The seeded tab is a web page, so it shows the heart; a new tab is the
    // start page, which can't be a Favorite.
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 10))
    XCTAssertTrue(site.label.contains("example.com"), site.label)
    app.buttons["New tab"].tap()
    let startPage = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "Start Page"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [startPage], timeout: 5), .completed, "+ opened a new tab")
  }

  func testBackAndForwardSettingSwapsTheIslandsButtons() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestSettings", "-BlancUITestSettingsReset", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    let pill = app.buttons["pill.palette"]
    XCTAssertTrue(pill.waitForExistence(timeout: 15))
    try XCTSkipIf(app.buttons["pill.back"].exists, "the wide Island always has Back and Forward, so the setting changes nothing")
    XCTAssertFalse(app.buttons["pill.back"].exists, "off by default")
    XCTAssertTrue(app.buttons["New tab"].exists)
    pill.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText("/settings\n")
    let row = app.descendants(matching: .any).matching(identifier: "settings.islandHistoryButtons").firstMatch
    XCTAssertTrue(app.reveal(row, timeout: 15))
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    app.buttons["settings.done"].tap()
    XCTAssertTrue(app.buttons["pill.back"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["pill.forward"].exists)
    XCTAssertFalse(app.buttons["pill.back"].isEnabled, "a new tab has nowhere to go back to")
    // Back then Forward at the far end, after the address.
    XCTAssertGreaterThan(app.buttons["pill.back"].frame.midX, pill.frame.maxX)
    XCTAssertGreaterThan(app.buttons["pill.forward"].frame.midX, app.buttons["pill.back"].frame.midX)
    XCTAssertFalse(app.buttons["pill.tabs"].exists, "the Island has no tab count")
    XCTAssertFalse(app.buttons["New tab"].exists)
    XCTAssertFalse(app.buttons["Reload page"].exists)
  }

  /// As in Safari: a pinch in on the page opens the open tabs.
  func testPinchingInOnThePageOpensTheTabGrid() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 15))
    sleep(2)
    page.pinch(withScale: 0.4, velocity: -1)
    XCTAssertTrue(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 5))
    app.buttons["Done"].tap()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 1))
  }
}
