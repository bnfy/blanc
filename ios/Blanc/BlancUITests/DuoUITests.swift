import XCTest

/// Duo-1: the unfolded Island and the palette panel. These run only where the
/// window is iPad-sized in both directions (the iPhone Duo's inner display,
/// Xcode 27.1); on an iPhone they skip, and the other suites cover it.
final class DuoUITests: XCTestCase {
  private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    let size = app.windows.firstMatch.frame.size
    try XCTSkipUnless(min(size.width, size.height) >= 600, "not the Duo's inner display (\(size))")
    return app
  }

  func testTheUnfoldedIslandGoesBackAndForward() throws {
    let app = try launch()
    let site = app.buttons["pill.palette"]
    let back = app.buttons["pill.back"], forward = app.buttons["pill.forward"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    XCTAssertFalse(forward.isEnabled, "nowhere to go forward yet")

    site.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText("https://example.org/\n")
    let org = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.org"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [org], timeout: 15), .completed, site.label)

    let canGoBack = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: back)
    XCTAssertEqual(XCTWaiter().wait(for: [canGoBack], timeout: 5), .completed)
    back.tap()
    let com = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.com"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [com], timeout: 15), .completed, site.label)
    XCTAssertTrue(forward.isEnabled)
  }

  func testThePaletteGrowsFromTheIsland() throws {
    let app = try launch()
    let site = app.buttons["pill.palette"]
    // The Island ends with its 44 pt New tab button, which reports only its icon.
    let newTab = app.buttons["New tab"].firstMatch.frame
    let islandEnd = newTab.midX + 22
    site.tap()

    let panel = app.otherElements["palette.panel"]
    XCTAssertTrue(panel.waitForExistence(timeout: 5), "a panel, not a sheet")
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    XCTAssertTrue(input.frame.minY > panel.frame.midY, "the address row is at the panel's bottom")
    XCTAssertLessThan(abs(panel.frame.maxX - islandEnd), 1, "in the Island's place: panel \(panel.frame), New tab \(newTab), window \(app.windows.firstMatch.frame)")
    XCTAssertLessThanOrEqual(panel.frame.width, 600)
    attach(app, "palette panel")

    // Typing filters the open tabs; choosing one closes the panel.
    input.typeText("example.org")
    let row = panel.buttons.matching(NSPredicate(format: "label CONTAINS %@", "example.org")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.tap()
    XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
    let org = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.org"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [org], timeout: 5), .completed, site.label)
    XCTAssertTrue(site.isHittable, "the Island is back")
  }

  func testAPanelStartsEmptyAfterTheLastOneClosed() throws {
    let app = try launch()
    app.buttons["pill.palette"].tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText("draft")
    app.buttons["Collapse Island"].tap()
    XCTAssertTrue(app.otherElements["palette.panel"].waitForNonExistence(timeout: 5))
    app.buttons["pill.palette"].tap()
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    XCTAssertNotEqual(input.value as? String, "draft")
  }

  func testFindFromThePanelShowsTheFindBar() throws {
    let app = try launch()
    app.buttons["pill.palette"].tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText("/find\n")
    let field = app.searchFields.firstMatch
    let textField = app.textFields.matching(NSPredicate(format: "identifier != %@", "island.address")).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5) || textField.waitForExistence(timeout: 1), "the find bar shows")
  }

  private func attach(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}
