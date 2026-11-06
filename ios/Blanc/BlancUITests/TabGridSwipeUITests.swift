import XCTest

/// M11: in the tab grid, swiping a card sideways closes its tab, with Undo.
final class TabGridSwipeUITests: XCTestCase {
  /// The Island's upward swipe opens the grid; XCUI's swipeUp on a 48 pt
  /// element travels less than the 40 pt it needs, so drag explicitly.
  private func openGrid(_ site: XCUIElement) {
    let start = site.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -250)))
  }

  func testSwipeCardClosesTheTabWithUndo() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    openGrid(site)
    let cards = app.buttons.matching(identifier: "tab.card")
    XCTAssertTrue(cards.element(boundBy: 1).waitForExistence(timeout: 5))
    XCTAssertEqual(cards.count, 2)
    cards.element(boundBy: 1).swipeLeft()
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5), "Undo shows in the grid, where the tab was closed")
    // Tap at once: the banner lasts five seconds and a slow runner's queries
    // eat into them, so the closed card isn't counted first.
    undo.tap()
    let two = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == 2"), object: cards)
    XCTAssertEqual(XCTWaiter().wait(for: [two], timeout: 5), .completed, "Undo brings the card back")
  }

  func testTapCardSwitches() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    openGrid(site)
    let cards = app.buttons.matching(identifier: "tab.card")
    XCTAssertTrue(cards.element(boundBy: 1).waitForExistence(timeout: 5))
    cards.element(boundBy: 1).tap()
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.org"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 5), .completed, site.label)
  }

  /// A short drag on the Island lets the page settle back.
  func testAShortDragLeavesThePage() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    let start = site.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -24)), withVelocity: 40, thenHoldForDuration: 0.3)
    XCTAssertFalse(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 2))
    XCTAssertTrue(site.isHittable, "the Island is back and usable")
    site.tap()
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 5), "a tap right after isn't lost")
  }
}
