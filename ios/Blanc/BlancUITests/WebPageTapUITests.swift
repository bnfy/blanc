import XCTest

/// A tap and a hold on a web page must not crash Blanc. Built with the iOS 26
/// SDK, a web view created before the window existed aborted in UIKit's touch
/// delivery on the first tap on its page (fixed in BlancApp).
final class WebPageTapUITests: XCTestCase {
  func testTappingAndHoldingAPageKeepsBlancRunning() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestPrivate"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.private"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
    app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    sleep(1)
    XCTAssertEqual(app.state, .runningForeground, "Blanc survives a tap on the page")
    app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).press(forDuration: 1.0)
    sleep(1)
    XCTAssertEqual(app.state, .runningForeground, "Blanc survives a hold on the page")
    XCTAssertTrue(app.buttons["pill.private"].exists)
  }
}
