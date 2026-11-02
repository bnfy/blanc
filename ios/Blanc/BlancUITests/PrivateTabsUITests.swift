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
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["New Private Tab"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Save to Favorites"].exists, "a private page can't be a Favorite")
    app.dismissIslandMenu()
    chip.tap()
    // On the unfolded iPhone Duo XCUITest's tap on the page doesn't close the
    // menu (a finger's does); the chip's first tap then closes it instead.
    if !chip.waitForNonExistence(timeout: 2) { chip.tap() }
    XCTAssertTrue(chip.waitForNonExistence(timeout: 5))
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5), "the ordinary tab is current again")
  }
}
