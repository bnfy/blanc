import XCTest

/// The private pill (M9), from a seeded state (`-BlancUITestPrivate`): one
/// ordinary tab and a current private tab, both on example.com.
final class PrivateTabsUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestPrivate"]
    app.launch()
  }

  func testPrivateChipClosesTheTab() {
    let chip = app.buttons["pill.private"]
    XCTAssertTrue(chip.waitForExistence(timeout: 10))
    XCTAssertEqual(chip.label, "Leave private mode — closes this tab")
    XCTAssertFalse(app.buttons["pill.favorite"].exists, "a private page can't be a Favorite")
    chip.tap()
    XCTAssertTrue(app.buttons["pill.favorite"].waitForExistence(timeout: 5), "the ordinary tab is current again")
    XCTAssertFalse(app.buttons["pill.private"].exists)
  }
}
