import XCTest

/// M11: closing a tab shows "Tab closed · Undo" over the Island.
final class TabUndoUITests: XCTestCase {
  func testUndoBringsTheTabBack() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestTwoTabs"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))
    XCTAssertTrue(site.label.contains("example.com"), site.label)
    site.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.typeText("/close\n")
    let undo = app.buttons["banner.undo"]
    XCTAssertTrue(undo.waitForExistence(timeout: 5), "the Undo banner shows")
    XCTAssertTrue(site.label.contains("example.org"), site.label)
    undo.tap()
    let back = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "example.com"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [back], timeout: 5), .completed, "the closed tab is current again")
    XCTAssertTrue(undo.waitForNonExistence(timeout: 5))
  }
}
