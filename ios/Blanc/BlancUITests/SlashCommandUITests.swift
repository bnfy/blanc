import XCTest

/// M10: the shared slash commands run from the palette.
final class SlashCommandUITests: XCTestCase {
  private func launch() -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    return app
  }

  private func type(_ command: String, in app: XCUIApplication) {
    app.buttons["pill.palette"].tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText(command + "\n")
  }

  func testFavoritesOpensTheFavoritesPage() {
    let app = launch()
    type("/favorites", in: app)
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "Favorites"),
                                          object: app.buttons["pill.palette"])
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 5), .completed, app.buttons["pill.palette"].label)
  }

  func testFindShowsTheFindBar() {
    let app = launch()
    type("/find", in: app)
    let field = app.searchFields.firstMatch
    let textField = app.textFields.matching(NSPredicate(format: "identifier != %@", "island.address")).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5) || textField.waitForExistence(timeout: 1), "the find bar shows")
  }

  func testBareSendWaitsForADevice() {
    let app = launch()
    type("/send", in: app)
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5), "the palette stays open")
    XCTAssertEqual(input.value as? String, "/send ")
  }
}
