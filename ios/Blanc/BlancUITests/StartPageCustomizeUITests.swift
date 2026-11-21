import XCTest

/// Customizing the Start Page on iPhone: its Customize button, a hold on the page, or the Sunrise menu.
final class StartPageCustomizeUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestStartPage"]
    app.launch()
  }

  /// Customize is the fork page's sheet; "Widgets" is its first heading.
  private var customize: XCUIElement { app.webViews.staticTexts["Widgets"] }

  func testHoldingTheStartPageOpensCustomize() {
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 15))
    // The web view exists before the Start Page and its hold script finish
    // loading (slow on CI runners), so a first hold can land too early.
    for _ in 0..<3 where !customize.exists {
      page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).press(forDuration: 1.0)
      _ = customize.waitForExistence(timeout: 4)
    }
    XCTAssertTrue(customize.exists, "Customize opened")
  }

  func testCustomizeButtonOpensCustomize() {
    let button = app.webViews.buttons["Customize"]
    XCTAssertTrue(button.waitForExistence(timeout: 15), "Customize sits above the Island, as on Android")
    button.tap()
    XCTAssertTrue(customize.waitForExistence(timeout: 5))
  }

  func testSunriseMenuOffersCustomize() {
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
    XCTAssertTrue(app.webViews.buttons["Customize"].waitForExistence(timeout: 15), "the page has loaded")
    app.openIslandMenu()
    // The menu's item, not the page's own Customize button behind it.
    let item = app.buttons.matching(NSPredicate(format: "label == 'Customize'"))
      .allElementsBoundByIndex.first { !app.webViews.buttons.allElementsBoundByIndex.contains($0) }
    XCTAssertNotNil(item)
    item?.tap()
    XCTAssertTrue(customize.waitForExistence(timeout: 5), "Customize opened")
  }
}
