import XCTest

/// Glance (F34): a tab floating in a card over the current page, where the
/// window is iPad-sized in both directions (the iPhone Duo's inner display,
/// an iPad); elsewhere these skip.
final class GlanceUITests: XCTestCase {
  private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestGlance"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    let size = app.windows.firstMatch.frame.size
    try XCTSkipUnless(min(size.width, size.height) >= 600, "not an unfolded layout (\(size))")
    XCTAssertTrue(app.otherElements["glance.card"].waitForExistence(timeout: 10))
    return app
  }

  private func waitGone(_ element: XCUIElement) {
    let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
    XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed)
  }

  func testClosingTheCardLeavesTheTabOpen() throws {
    let app = try launch()
    attach(app, "glance")
    app.buttons["glance.close"].tap()
    waitGone(app.otherElements["glance.card"])
    XCTAssertTrue(app.buttons["pill.palette"].label.contains("example.com"), "still on the page beneath")
    XCTAssertEqual(app.buttons["pill.tabs"].value as? String, "2 tabs")
  }

  func testOpenAsTabMakesItsPageCurrent() throws {
    let app = try launch()
    app.buttons["glance.openAsTab"].tap()
    waitGone(app.otherElements["glance.card"])
    let site = app.buttons["pill.palette"]
    let org = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.org"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [org], timeout: 5), .completed, site.label)
  }

  func testKeepAsSplitPutsItBesideThePage() throws {
    let app = try launch()
    app.buttons["glance.keepAsSplit"].tap()
    waitGone(app.otherElements["glance.card"])
    XCTAssertTrue(app.otherElements["split.divider"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.otherElements.matching(identifier: "split.corner").count, 2)
    XCTAssertTrue(app.buttons["pill.palette"].label.contains("example.com"), "the page it floated over stays focused")
    sleep(2)
    attach(app, "kept as split")
  }

  private func attach(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
