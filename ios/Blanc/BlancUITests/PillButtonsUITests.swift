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
    XCTAssertTrue(app.buttons["pill.favorite"].waitForExistence(timeout: 10))
    app.buttons["Add"].tap()
    let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["pill.favorite"])
    XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed, "+ opened a new tab")
  }
}
