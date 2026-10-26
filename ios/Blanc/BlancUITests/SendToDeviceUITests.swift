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

  /// Send to Device in the Sunrise menu lists the targets, never the palette.
  func testSendMenuListsTheTargetNotThePalette() {
    app.openIslandMenu()
    let send = app.buttons["Send to Device"]
    XCTAssertTrue(send.waitForExistence(timeout: 5))
    send.tap()
    XCTAssertTrue(app.buttons["MacBook Pro"].waitForExistence(timeout: 5), "the Send menu lists the target")
    XCTAssertFalse(app.buttons["Done"].exists, "the palette must not open")
  }

  /// Choosing a device always tells the sender what happened. With no key the
  /// send fails at once, so the banner says it couldn't send.
  func testChoosingADeviceShowsTheResultBanner() {
    app.openIslandMenu()
    let send = app.buttons["Send to Device"]
    XCTAssertTrue(send.waitForExistence(timeout: 5))
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
    XCTAssertTrue(app.textFields["island.address"].exists, "the expanded Island keeps its address field")
    XCTAssertTrue(app.buttons["Collapse Island"].exists)
    XCTAssertTrue(app.buttons["Settings"].exists, "the footer tools stay visible above the keyboard")
    let capture = XCTAttachment(screenshot: app.screenshot())
    capture.name = "Expanded Island on iOS"
    capture.lifetime = .keepAlways
    add(capture)
  }
}
