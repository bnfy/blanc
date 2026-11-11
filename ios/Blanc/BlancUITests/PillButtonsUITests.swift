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
