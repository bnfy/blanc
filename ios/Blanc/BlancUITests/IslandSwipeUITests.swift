import XCTest

/// M11: swiping the Island sideways switches tabs; taps still work.
final class IslandSwipeUITests: XCTestCase {
  private func launch() -> (XCUIApplication, XCUIElement) {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    XCTAssertTrue(site.label.contains("example.com"), site.label)
    return (app, site)
  }

  private func waitFor(_ site: XCUIElement, toShow host: String) -> Bool {
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", host), object: site)
    return XCTWaiter().wait(for: [shown], timeout: 5) == .completed
  }

  func testSwipeLeftGoesToTheNextTab() {
    let (app, site) = launch()
    site.swipeLeft()
    XCTAssertTrue(waitFor(site, toShow: "example.org"), site.label)
    XCTAssertFalse(app.textFields["island.address"].exists, "a swipe doesn't open the palette")
    site.swipeRight()
    XCTAssertTrue(waitFor(site, toShow: "example.com"), site.label)
  }

  func testSwipeAtTheEndStays() {
    let (_, site) = launch()
    site.swipeRight()
    sleep(1)
    XCTAssertTrue(site.label.contains("example.com"), site.label)
  }

  func testTapStillOpensThePalette() {
    let (app, site) = launch()
    site.tap()
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 5))
  }

}
