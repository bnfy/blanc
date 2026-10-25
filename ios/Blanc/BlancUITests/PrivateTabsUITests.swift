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
    // That a private page offers no Favorite is IslandMenuTests'
    // testPrivatePageIsNeverAFavorite: closing a menu here would need a tap on
    // the page, which crashes Blanc built with the iOS 26 SDK on CI.
    chip.tap()
    XCTAssertTrue(chip.waitForNonExistence(timeout: 5))
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5), "the ordinary tab is current again")
  }
}
