import XCTest

/// Send to device on the phone (M7b), driven through the real UI from a seeded
/// local cache (`-BlancUITestSends`): one target, two pages sent here, no key.
final class SendToDeviceUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestSends"]
    app.launch()
  }

  /// The Send button opens its own menu, never the palette next to it.
  func testSendButtonOpensItsMenuNotThePalette() {
    let send = app.buttons["pill.send"]
    XCTAssertTrue(send.waitForExistence(timeout: 10))
    send.tap()
    XCTAssertTrue(app.buttons["MacBook Pro"].waitForExistence(timeout: 5), "the Send menu lists the target")
    XCTAssertFalse(app.buttons["Done"].exists, "the palette must not open")
  }

  /// Choosing a device always tells the sender what happened. With no key the
  /// send fails at once, so the banner says it couldn't send.
  func testChoosingADeviceShowsTheResultBanner() {
    let send = app.buttons["pill.send"]
    XCTAssertTrue(send.waitForExistence(timeout: 10))
    send.tap()
    let target = app.buttons["MacBook Pro"]
    XCTAssertTrue(target.waitForExistence(timeout: 5))
    target.tap()
    let banner = app.staticTexts["send.banner"]
    XCTAssertTrue(banner.waitForExistence(timeout: 5), "a result banner appears")
    XCTAssertTrue(banner.label.hasPrefix("Couldn"), banner.label)
  }

  /// Swipe left and Dismiss takes the page out of the palette's inbox.
  func testSwipeDismissRemovesASentPage() {
    let palette = app.buttons["pill.palette"]
    XCTAssertTrue(palette.waitForExistence(timeout: 10))
    palette.tap()
    let row = app.buttons["sent.s2"]
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.swipeLeft()
    let dismiss = app.buttons["Dismiss"]
    XCTAssertTrue(dismiss.waitForExistence(timeout: 5))
    dismiss.tap()
    XCTAssertTrue(row.waitForNonExistence(timeout: 5), "the dismissed page leaves the inbox")
    XCTAssertTrue(app.buttons["sent.s1"].exists, "the other page stays")
  }
}
