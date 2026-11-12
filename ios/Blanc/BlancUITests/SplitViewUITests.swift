import XCTest

/// Split View (F53): a saved split shows its panes side by side where the
/// window is iPad-sized in both directions (the iPhone Duo's inner display,
/// an iPad); elsewhere these skip, and the unit tests cover the rules.
final class SplitViewUITests: XCTestCase {
  private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestSplit"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    let size = app.windows.firstMatch.frame.size
    try XCTSkipUnless(min(size.width, size.height) >= 600, "not an unfolded layout (\(size))")
    return app
  }

  func testASavedSplitComesBackSideBySide() throws {
    let app = try launch()
    XCTAssertTrue(app.otherElements["split.divider"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.otherElements.matching(identifier: "split.corner").count, 2)
    XCTAssertTrue(app.buttons["pill.palette"].label.contains("example.com"), "the Island serves the focused pane")
  }

  func testClosingAPaneLeavesTheOtherFillingTheWindow() throws {
    let app = try launch()
    let divider = app.otherElements["split.divider"]
    XCTAssertTrue(divider.waitForExistence(timeout: 10))
    let corner = app.otherElements.matching(identifier: "split.corner").element(boundBy: 0)
    corner.buttons.firstMatch.tap()
    let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: divider)
    XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed)
    let site = app.buttons["pill.palette"]
    let org = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.org"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [org], timeout: 5), .completed, "the other pane is current: \(site.label)")
  }
}
