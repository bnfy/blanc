import XCTest

/// M11: in the tab grid, swiping a card sideways closes its tab, with Undo.
final class TabGridSwipeUITests: XCTestCase {
  /// The Island's upward swipe opens the grid; XCUI's swipeUp on a 52 pt
  /// element travels less than the 40 pt it needs, so drag explicitly.
  private func openGrid(_ site: XCUIElement) {
    let start = site.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -250)))
  }

  /// The two things that once made the page's picture jump as it landed: a
  /// page frame shorter than the page, and a web view losing its safe area.
  func testThePageKeepsItsPlaceUnderTheGrid() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs", "-BlancUITestPageGeometry"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    let geometry = app.descendants(matching: .any)["test.pageGeometry"]
    XCTAssertTrue(geometry.waitForExistence(timeout: 5))
    sleep(2)
    let before = geometry.value as? String ?? ""
    let parts = before.split(separator: " ").compactMap { Int($0) }
    XCTAssertEqual(parts.count, 2, before)
    XCTAssertEqual(parts[0], Int(app.windows.firstMatch.frame.height), "the page's frame is the whole window")
    XCTAssertGreaterThan(parts[1], 0, "the web view clears the status bar")

    openGrid(site)
    XCTAssertTrue(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 5))
    sleep(2)
    XCTAssertEqual(geometry.value as? String, before)
  }

  func testTheGridTakesThePagesTouches() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTapPage"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    sleep(2)
    openGrid(site)
    let card = app.buttons.matching(identifier: "tab.card").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)).tap()
    sleep(1)
    XCTAssertFalse(card.label.contains("tapped"), card.label)

    // The same tap on the page itself does reach it.
    card.tap()
    XCTAssertTrue(site.waitForExistence(timeout: 5))
    sleep(1)
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)).tap()
    sleep(1)
    openGrid(site)
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    let tapped = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "tapped"), object: card)
    XCTAssertEqual(XCTWaiter().wait(for: [tapped], timeout: 5), .completed, card.label)
  }

  func testReduceMotionOpensAndLeavesTheGrid() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs", "-BlancUITestReduceMotion"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    openGrid(site)
    let cards = app.buttons.matching(identifier: "tab.card")
    XCTAssertTrue(cards.element(boundBy: 1).waitForExistence(timeout: 5))
    cards.element(boundBy: 1).tap()
    XCTAssertTrue(app.otherElements["tabs.grid"].waitForNonExistence(timeout: 5), "the grid fades away")
    XCTAssertTrue(site.waitForExistence(timeout: 5))
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
    // Tapped by position, as a finger does: for a moment after a lift,
    // iOS 26.5 reports New Tab's accessibility frame across the whole
    // Island, so `isHittable` fails there although a real tap reaches the
    // address (checked by hand on an iOS 26.5 simulator, 2026-11-11).
    site.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 5), "a tap right after isn't lost")
  }
}
