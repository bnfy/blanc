import XCTest

/// The pill's heart (M8), from a seeded state (`-BlancUITestFavorites`): one
/// tab on example.com, sync off, no Favorites.
final class FavoritesUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFavorites"]
    app.launch()
  }

  func testSunriseMenuTogglesTheFavorite() {
    app.openIslandMenu()
    let save = app.buttons["Save to Favorites"]
    XCTAssertTrue(save.waitForExistence(timeout: 5))
    save.tap()
    app.openIslandMenu()
    let remove = app.buttons["Remove from Favorites"]
    XCTAssertTrue(remove.waitForExistence(timeout: 5), "the menu says the page is saved")
    remove.tap()
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Save to Favorites"].waitForExistence(timeout: 5))
  }
}
