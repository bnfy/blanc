import XCTest

/// Multiple windows (W2b): a window of its own, on an iPad. iPadOS may show
/// both windows or only the new one, so the checks look for a window with
/// the expected tabs rather than counting windows.
final class MultipleWindowsUITests: XCTestCase {
  private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "multiple windows are an iPad feature")
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].firstMatch.waitForExistence(timeout: 15))
    return app
  }

  /// Waits for an Island whose tab count reads `value` and whose site reads `site`.
  private func window(_ app: XCUIApplication, tabs value: String, site: String) -> Bool {
    let deadline = Date().addingTimeInterval(10)
    while Date() < deadline {
      let counts = app.buttons.matching(identifier: "pill.palette").allElementsBoundByIndex.compactMap { $0.value as? String }
      let sites = app.buttons.matching(identifier: "pill.palette").allElementsBoundByIndex.map(\.label)
      if counts.contains(value), sites.contains(where: { $0.contains(site) }) { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    return false
  }

  func testCommandNOpensAWindowWithItsOwnStartPage() throws {
    let app = try launch()
    app.typeKey("n", modifierFlags: .command)
    XCTAssertTrue(window(app, tabs: "1 tab", site: "Start Page"), "the new window has one Start Page tab")
  }

  func testMoveTabToNewWindowCarriesThePage() throws {
    let app = try launch()
    // A pinch, because iPadOS's "Hidden Windows" hint can sit over the Island's
    // middle after a relaunch, and the previous test leaves a window behind.
    let page = app.webViews.firstMatch
    XCTAssertTrue(page.waitForExistence(timeout: 10))
    page.pinch(withScale: 0.4, velocity: -1)
    let cards = app.descendants(matching: .any).matching(identifier: "tab.card")
    XCTAssertTrue(cards.element(boundBy: 1).waitForExistence(timeout: 5))
    cards.element(boundBy: 1).press(forDuration: 1.2)
    let move = app.buttons["Move Tab to New Window"]
    XCTAssertTrue(move.waitForExistence(timeout: 5))
    move.tap()
    XCTAssertTrue(window(app, tabs: "1 tab", site: "example.org"), "the moved tab has a window of its own")
  }
}
