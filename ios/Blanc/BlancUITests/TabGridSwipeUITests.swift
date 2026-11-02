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
    let one = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == 1"), object: cards)
    XCTAssertEqual(XCTWaiter().wait(for: [one], timeout: 5), .completed, "the swiped card's tab closed")
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5), "Undo shows in the grid, where the tab was closed")
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
}
