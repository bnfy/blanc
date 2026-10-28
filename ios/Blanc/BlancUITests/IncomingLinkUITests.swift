import XCTest

/// A link another app hands Blanc (M18 §6) opens in a new, ordinary tab and
/// shows, from a seeded state (`-BlancUITestPrivate`): an ordinary tab and a
/// current private tab, both on example.com.
final class IncomingLinkUITests: XCTestCase {
  private let link = URL(string: "https://example.org/")!

  func testLinkFromAnotherAppOpensANewTab() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestPrivate"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    // Open the grid first: the link must close it and show its page.
    let start = site.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -250)))
    XCTAssertTrue(app.otherElements["tabs.grid"].waitForExistence(timeout: 5))

    app.open(link)
    XCTAssertTrue(app.otherElements["tabs.grid"].waitForNonExistence(timeout: 5), "the grid closes")
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS 'example.org'"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 10), .completed, "the link's tab is current")
    XCTAssertFalse(app.buttons["pill.private"].exists, "the link's tab isn't private")
  }

  func testLinkOpensBlancFromAColdLaunch() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFavorites"]
    app.launch()
    app.terminate()

    app.open(link)
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS 'example.org'"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 10), .completed, "the link waited for the tabs and opened")
  }
}
