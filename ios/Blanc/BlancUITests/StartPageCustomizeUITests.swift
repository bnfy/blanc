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

  func testHoldingTheStartPageOpensItsSettings() throws {
    // A synthesized touch on a web view crashes Blanc built with the iOS 26
    // SDK under iOS 26 on CI, on main too (UIKit aborts in
    // -[UIGestureRecognizer _delayTouchesForEvent:]). Runs on iOS 27.
    try XCTSkipIf(ProcessInfo.processInfo.operatingSystemVersion.majorVersion < 27,
                  "synthesized web-view touches crash on iOS 26 CI")
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 15))
    XCTAssertFalse(app.buttons["Customize"].exists, "the floating Customize button is gone on iPhone")
    // The web view exists before the Start Page and its hold script finish
    // loading (slow on CI runners), so a first hold can land too early.
    let layout = app.buttons["settings.layout"]
    for _ in 0..<3 where !layout.exists {
      page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).press(forDuration: 1.0)
      _ = layout.waitForExistence(timeout: 4)
    }
    XCTAssertTrue(layout.exists, "Start Page settings opened")
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
