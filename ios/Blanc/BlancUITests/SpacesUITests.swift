import XCTest

/// M17a: tab groups in the grid, and the palette's Spaces button and Spaces card.
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

    XCTAssertEqual(app.buttons["group.fold"].label, "Research")
    XCTAssertEqual(app.buttons["group.fold"].value as? String, "2")

    app.buttons["group.fold"].tap()
    waitCount(cards, 2, "a folded group hides its cards")
    app.buttons["group.fold"].tap()
    waitCount(cards, 4, "its header unfolds the group")

    app.buttons["group.menu"].tap()
    app.buttons["Rename…"].tap()
    let field = app.textFields["group.nameField"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.clearAndType("Reading")
    app.buttons["group.nameSave"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["group.header.Reading"].waitForExistence(timeout: 5))

    app.buttons["group.menu"].tap()
    app.buttons["Close Group"].tap()
    waitCount(cards, 2, "Close Group closes both tabs")
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5))
    undo.tap()
    waitCount(cards, 4, "Undo brings the whole group back")
  }

  func testAFoldedGroupKeepsTheCurrentTab() {
    let app = launch()
    openGrid(app)
    let cards = app.buttons.matching(identifier: "tab.card")
    waitCount(cards, 4, "two loose tabs and two in Research")
    cards.element(boundBy: 2).tap()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 5))
    openGrid(app)

    app.buttons["group.fold"].tap()
    waitCount(cards, 3, "the current tab's card stays, as the way back to it")
    cards.element(boundBy: 2).tap()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 5), "the card leaves the grid")
  }

  func testMoveTabToANewGroupFromItsMenu() {
    let app = launch()
    openGrid(app)
    let cards = app.buttons.matching(identifier: "tab.card")
    app.holdForMenu(cards.element(boundBy: 1))
    app.tapMenuItem("Move to Group", opensSubmenu: true)
    app.tapMenuItem("New Group…")
    let field = app.textFields["group.nameField"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("Later")
    app.buttons["group.nameSave"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["group.header.Later"].waitForExistence(timeout: 5))
  }

  /// The Island tells VoiceOver the count, and a swipe up opens the grid.
  func testASwipeUpOnTheIslandOpensTheGrid() {
    let app = launch()
    let island = app.buttons["pill.palette"]
    XCTAssertTrue(island.waitForExistence(timeout: 5))
    XCTAssertEqual(island.value as? String, "4 tabs")
    app.openTabGrid()
    XCTAssertTrue(app.buttons.matching(identifier: "tab.card").firstMatch.waitForExistence(timeout: 5))
  }

  /// The palette's tab rows offer the grid's menu on a press and hold (owner, 2026-10-29).
  private func pressPaletteRow(_ app: XCUIApplication, _ index: Int) -> XCUIElementQuery {
    app.buttons["pill.palette"].tap()
    let rows = app.buttons.matching(identifier: "palette.tab")
    waitCount(rows, 4, "This iPhone's four tabs")
    app.holdForMenu(rows.element(boundBy: index))
    return rows
  }

  func testMoveATabToANewGroupFromItsPaletteRow() {
    let app = launch()
    _ = pressPaletteRow(app, 1)
    app.tapMenuItem("Move to Group", opensSubmenu: true)
    app.tapMenuItem("New Group…")
    let field = app.textFields["group.nameField"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("Later")
    app.buttons["group.nameSave"].tap()
    XCTAssertTrue(app.buttons["Later"].waitForExistence(timeout: 5), "the palette shows the tab under its new group")
  }

  func testMoveATabToASpaceFromItsPaletteRow() {
    let app = launch()
    let rows = pressPaletteRow(app, 1)
    app.tapMenuItem("Move to Space", opensSubmenu: true)
    app.tapMenuItem("Work")
    waitCount(rows, 3, "the tab left This iPhone for Work")
  }

  func testSwitchToASpaceAndBackToThisIPhone() {
    let app = launch()
    XCTAssertFalse(app.buttons["island.space"].exists, "the resting Island carries no Space mark")
    let spaces = app.paletteSpacesButton()
    XCTAssertEqual(spaces.label, "Spaces", "the quiet glyph shows once a Space exists")
    spaces.tap()
    let work = app.buttons["spaces.row.Work"]
    XCTAssertTrue(work.waitForExistence(timeout: 5))
    work.tap()
    let site = app.buttons["pill.palette"]
    let edu = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.edu"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [edu], timeout: 5), .completed, site.label)

    openGrid(app)
    let name = app.descendants(matching: .any)["tabs.spaceName"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "the grid says which Space it holds")
    XCTAssertEqual(name.label, "Work")
    app.buttons.matching(identifier: "tab.card").firstMatch.tap()
    XCTAssertTrue(site.waitForExistence(timeout: 5))

    XCTAssertEqual(app.paletteSpacesButton().label, "Space: Work")
    app.buttons["palette.spaces"].tap()
    app.buttons["spaces.iphone"].tap()
    let com = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.com"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [com], timeout: 5), .completed, "This iPhone's tabs come back")
    openGrid(app)
    XCTAssertFalse(name.exists, "This iPhone needs no name in the grid")
  }

  func testCreateSpaceThenDeleteWithUndo() {
    let app = launch()
    app.openSpacesCard()
    app.buttons["spaces.new"].tap()
    let name = app.textFields["space.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Reading")
    app.buttons["space.save"].tap()
    XCTAssertTrue(name.waitForNonExistence(timeout: 5))
    let spaces = app.paletteSpacesButton()
    let reading = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Space: Reading"), object: spaces)
    XCTAssertEqual(XCTWaiter().wait(for: [reading], timeout: 5), .completed, spaces.label)

    spaces.tap()
    app.buttons["spaces.edit"].tap()
    app.buttons["Edit Reading"].tap()
    let delete = app.buttons["space.delete"]
    XCTAssertTrue(app.reveal(delete), "Delete is at the editor's foot")
    delete.tap()
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5))
    undo.tap()
    XCTAssertTrue(undo.waitForNonExistence(timeout: 5))
    let restored = app.paletteSpacesButton()
    XCTAssertEqual(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Space: Reading"), object: restored)], timeout: 5), .completed,
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
