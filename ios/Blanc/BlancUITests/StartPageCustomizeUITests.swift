import XCTest

/// Customizing the Start Page on iPhone: hold the page, or use the Sunrise menu.
final class StartPageCustomizeUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestStartPage"]
    app.launch()
  }

  func testHoldingTheStartPageOpensItsSettings() {
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 15))
    XCTAssertFalse(app.buttons["Customize"].exists, "the floating Customize button is gone on iPhone")
    page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).press(forDuration: 1.0)
    XCTAssertTrue(app.buttons["settings.layout"].waitForExistence(timeout: 5), "Start Page settings opened")
  }

  func testSunriseMenuOffersCustomize() {
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
    app.openIslandMenu()
    let customize = app.buttons["Customize"]
    XCTAssertTrue(customize.waitForExistence(timeout: 5))
    customize.tap()
    XCTAssertTrue(app.buttons["settings.layout"].waitForExistence(timeout: 5), "Start Page settings opened")
  }
}
