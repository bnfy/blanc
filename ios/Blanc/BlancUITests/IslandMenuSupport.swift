import XCTest

extension XCUIApplication {
  /// Opens the Sunrise mark's menu on the Island.
  func openIslandMenu(file: StaticString = #filePath, line: UInt = #line) {
    let mark = buttons["island.menu"]
    XCTAssertTrue(mark.waitForExistence(timeout: 10), "the Sunrise mark is on the Island", file: file, line: line)
    mark.tap()
  }

  /// Opens the palette (the open Island) and returns its footer's Spaces
  /// button, whose label names the shown Space ("Space: Work"). The resting
  /// Island carries no Space mark.
  @discardableResult
  func paletteSpacesButton(file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
    buttons["pill.palette"].tap()
    let spaces = buttons["palette.spaces"]
    XCTAssertTrue(spaces.waitForExistence(timeout: 5), "the palette offers Spaces", file: file, line: line)
    return spaces
  }

  /// Opens the Spaces card from the palette's footer.
  func openSpacesCard(file: StaticString = #filePath, line: UInt = #line) {
    paletteSpacesButton(file: file, line: line).tap()
  }

  /// Closes an open menu by tapping the page above it.
  func dismissIslandMenu() {
    coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
  }
}
