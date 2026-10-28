import XCTest

/// M17a: tab groups in the grid, and the Space mark and Spaces card.
final class SpacesUITests: XCTestCase {
  private func launch() -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestGroups"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    return app
  }

  private func openGrid(_ app: XCUIApplication) {
    let start = app.buttons["pill.palette"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -250)))
    XCTAssertTrue(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 5))
  }

  private func waitCount(_ query: XCUIElementQuery, _ count: Int, _ message: String) {
    let done = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == \(count)"), object: query)
    XCTAssertEqual(XCTWaiter().wait(for: [done], timeout: 5), .completed, message)
  }

  func testFoldRenameAndCloseGroup() {
    let app = launch()
    openGrid(app)
    let cards = app.buttons.matching(identifier: "tab.card")
    waitCount(cards, 4, "two loose tabs and two in Research")
    XCTAssertTrue(app.otherElements["group.header.Research"].exists || app.descendants(matching: .any)["group.header.Research"].exists)

    app.buttons["group.fold"].tap()
    XCTAssertTrue(app.buttons["group.tucked"].waitForExistence(timeout: 5))
    waitCount(cards, 2, "a folded group hides its cards")
    app.buttons["group.tucked"].tap()
    waitCount(cards, 4, "the tucked row unfolds the group")

    app.buttons["group.menu"].tap()
    app.buttons["Rename…"].tap()
    let field = app.alerts.textFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.clearAndType("Reading")
    app.alerts.buttons["Done"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["group.header.Reading"].waitForExistence(timeout: 5))

    app.buttons["group.menu"].tap()
    app.buttons["Close Group"].tap()
    waitCount(cards, 2, "Close Group closes both tabs")
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5))
    undo.tap()
    waitCount(cards, 4, "Undo brings the whole group back")
  }

  func testMoveTabToANewGroupFromItsMenu() {
    let app = launch()
    openGrid(app)
    let cards = app.buttons.matching(identifier: "tab.card")
    cards.element(boundBy: 1).press(forDuration: 1.2)
    app.buttons["Move to Group"].tap()
    app.buttons["New Group…"].tap()
    let field = app.alerts.textFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("Later")
    app.alerts.buttons["Create"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["group.header.Later"].waitForExistence(timeout: 5))
  }

  func testSwitchToASpaceAndBackToThisIPhone() {
    let app = launch()
    let mark = app.buttons["island.space"]
    XCTAssertTrue(mark.waitForExistence(timeout: 5), "the quiet mark shows once a Space exists")
    mark.tap()
    let work = app.buttons["spaces.row.Work"]
    XCTAssertTrue(work.waitForExistence(timeout: 5))
    work.tap()
    let site = app.buttons["pill.palette"]
    let edu = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.edu"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [edu], timeout: 5), .completed, site.label)
    XCTAssertEqual(mark.label, "Space: Work")

    mark.tap()
    app.buttons["spaces.iphone"].tap()
    let com = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.com"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [com], timeout: 5), .completed, "This iPhone's tabs come back")
  }

  func testCreateSpaceThenDeleteWithUndo() {
    let app = launch()
    let mark = app.buttons["island.space"]
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    mark.tap()
    app.buttons["spaces.new"].tap()
    let name = app.textFields["space.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Reading")
    app.buttons["space.save"].tap()
    let reading = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Space: Reading"), object: mark)
    XCTAssertEqual(XCTWaiter().wait(for: [reading], timeout: 5), .completed, mark.label)

    mark.tap()
    app.buttons["spaces.edit"].tap()
    app.buttons["Edit Reading"].tap()
    let delete = app.buttons["space.delete"]
    XCTAssertTrue(delete.waitForExistence(timeout: 5))
    delete.tap()
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5))
    undo.tap()
    XCTAssertEqual(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Space: Reading"), object: mark)], timeout: 5), .completed,
                   "Undo puts the Space back and shows it again")
  }
}

extension XCUIElement {
  func clearAndType(_ text: String) {
    tap()
    if let current = value as? String, !current.isEmpty {
      typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    typeText(text)
  }
}
