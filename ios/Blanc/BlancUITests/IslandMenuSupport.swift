import XCTest

extension XCUIApplication {
  /// Opens the Sunrise mark's menu on the Island.
  func openIslandMenu(file: StaticString = #filePath, line: UInt = #line) {
    let mark = buttons["island.menu"]
    XCTAssertTrue(mark.waitForExistence(timeout: 10), "the Sunrise mark is on the Island", file: file, line: line)
    mark.tap()
  }
}
