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
    let first = app.collectionViews.buttons.firstMatch
    XCTAssertEqual(first.label, close.label)
    XCTAssertFalse(app.buttons["Save to Favorites"].exists)
    close.tap()
    let regular = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", "Private tab"), object: menu)
    XCTAssertEqual(XCTWaiter.wait(for: [regular], timeout: 5), .completed)
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5))
  }
}
