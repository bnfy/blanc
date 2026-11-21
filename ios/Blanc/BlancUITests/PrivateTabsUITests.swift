import XCTest

/// The private Island (M9), from a seeded state (`-BlancUITestPrivate`): one
/// ordinary tab and a current private tab, both on example.com.
final class PrivateTabsUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestPrivate"]
    app.launch()
  }

  func testThePageMenuSaysPrivateAndClosesTheTab() {
    let menu = app.buttons["island.menu"]
    XCTAssertTrue(menu.waitForExistence(timeout: 10))
    XCTAssertEqual(menu.value as? String, "Private tab")
    XCTAssertFalse(app.buttons["pill.private"].exists)
    app.openIslandMenu()
    let close = app.buttons["Close Private Tab"]
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    // The menu opens toward the page with its first item nearest the
    // button, so Close Private Tab sits right beside the Island.
    let nearest = app.collectionViews.buttons.allElementsBoundByIndex
      .min { abs($0.frame.midY - menu.frame.midY) < abs($1.frame.midY - menu.frame.midY) }
    XCTAssertEqual(nearest?.label, close.label)
    XCTAssertFalse(app.buttons["Save to Favorites"].exists)
    close.tap()
    let regular = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", "Private tab"), object: menu)
    XCTAssertEqual(XCTWaiter.wait(for: [regular], timeout: 5), .completed)
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5))
  }
}
