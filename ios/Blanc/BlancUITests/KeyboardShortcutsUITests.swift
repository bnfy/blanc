import XCTest

/// Desktop's shortcuts from a hardware keyboard (D7): the simulator sends
/// them as a connected keyboard would.
final class KeyboardShortcutsUITests: XCTestCase {
  private func launch() -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.tabs"].waitForExistence(timeout: 15))
    return app
  }

  private func tabCount(_ app: XCUIApplication, is count: Int) {
    let label = count == 1 ? "1 tab" : "\(count) tabs"
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", label), object: app.buttons["pill.tabs"])
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 5), .completed, app.buttons["pill.tabs"].value as? String ?? "")
  }

  func testNewCloseAndReopenTabs() {
    let app = launch()
    app.typeKey("t", modifierFlags: .command)
    tabCount(app, is: 3)
    app.typeKey("w", modifierFlags: .command)
    tabCount(app, is: 2)
    app.typeKey("t", modifierFlags: [.command, .shift])
    tabCount(app, is: 3)
  }

  func testCommandNumberAndShiftBracketsSwitchTabs() {
    let app = launch()
    let site = app.buttons["pill.palette"]
    func on(_ host: String) {
      let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", host), object: site)
      XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 5), .completed, site.label)
    }
    app.typeKey("2", modifierFlags: .command)
    on("example.org")
    app.typeKey("]", modifierFlags: [.command, .shift])
    on("example.com")
    app.typeKey("[", modifierFlags: [.command, .shift])
    on("example.org")
  }

  func testCommandLOpensThePalette() {
    let app = launch()
    app.typeKey("l", modifierFlags: .command)
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 5))
  }
}
