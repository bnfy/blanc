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
}
