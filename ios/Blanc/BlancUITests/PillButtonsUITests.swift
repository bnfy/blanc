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

  /// Back, Forward and New Tab after the address on every iPhone Island;
  /// Reload lives in the Sunrise menu and pull to refresh.
  func testTheIslandHasBackForwardAndNewTab() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestSettings", "-BlancUITestSettingsReset", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    let pill = app.buttons["pill.palette"]
    XCTAssertTrue(pill.waitForExistence(timeout: 15))
    let back = app.buttons["pill.back"], forward = app.buttons["pill.forward"], plus = app.buttons["New tab"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    XCTAssertTrue(forward.exists)
    XCTAssertTrue(plus.exists)
    XCTAssertFalse(back.isEnabled, "a new tab has nowhere to go back to")
    // The address, then Back, Forward and New Tab at the far end.
    XCTAssertGreaterThan(back.frame.midX, pill.frame.maxX)
    XCTAssertGreaterThan(forward.frame.midX, back.frame.midX)
    XCTAssertGreaterThan(plus.frame.midX, forward.frame.midX)
    XCTAssertFalse(app.buttons["pill.tabs"].exists, "the Island has no tab count")
    XCTAssertFalse(app.buttons["Reload page"].exists)

    // Settings → Island → Back and Forward off puts Reload in their place.
    pill.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText("/settings\n")
    let row = app.descendants(matching: .any).matching(identifier: "settings.islandHistoryButtons").firstMatch
    XCTAssertTrue(app.reveal(row, timeout: 15))
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    app.buttons["settings.done"].tap()
    XCTAssertTrue(app.buttons["Reload page"].waitForExistence(timeout: 5))
    XCTAssertFalse(back.exists)
    XCTAssertFalse(forward.exists)
    XCTAssertTrue(plus.exists)
  }

  /// The palette's tab rows have no × to miss: a swipe to the left closes one.
  func testSwipingAPaletteRowClosesItsTab() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let pill = app.buttons["pill.palette"]
    XCTAssertTrue(pill.waitForExistence(timeout: 15))
    pill.tap()
    let rows = app.buttons.matching(identifier: "palette.tab")
    XCTAssertTrue(rows.element(boundBy: 1).waitForExistence(timeout: 5))
    XCTAssertEqual(rows.count, 2)
    XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Close '")).firstMatch.exists,
                   "no close button beside the rows")
    rows.element(boundBy: 0).swipeLeft()
    let close = app.buttons["palette.tab.close"]
    XCTAssertTrue(close.waitForExistence(timeout: 3), "the swipe shows Close Tab")
    close.tap()
    let one = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == 1"), object: rows)
    XCTAssertEqual(XCTWaiter().wait(for: [one], timeout: 5), .completed, "the swipe closed one tab")
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
    let card = app.buttons.matching(identifier: "tab.card").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    card.tap()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 1))
  }
}
