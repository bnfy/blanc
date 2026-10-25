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

  private func waitForValue(_ element: XCUIElement, _ value: String) {
    let expectation = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", value), object: element)
    XCTAssertEqual(XCTWaiter().wait(for: [expectation], timeout: 5), .completed, "expected \(value)")
  }

  func testHeartTogglesTheFavorite() {
    let heart = app.buttons["pill.favorite"]
    XCTAssertTrue(heart.waitForExistence(timeout: 10))
    waitForValue(heart, "off")
    heart.tap()
    waitForValue(heart, "on")
    heart.tap()
    waitForValue(heart, "off")
  }
}
