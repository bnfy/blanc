import XCTest

/// iPad-1: a window can be any size, and the layout follows it without
/// touching the page. Dragging the window's corner works only where iPadOS
/// offers resizing, so that test skips elsewhere.
final class IPadWindowUITests: XCTestCase {
  private func launch() throws -> XCUIApplication {
    continueAfterFailure = false
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "iPad windows")
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFormPage"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].firstMatch.waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Loaded 1"].waitForExistence(timeout: 15), "the page loaded")
    return app
  }

  private func typeNote(_ app: XCUIApplication) -> XCUIElement {
    let note = app.webViews.textFields["Note"]
    XCTAssertTrue(note.waitForExistence(timeout: 5))
    note.tap()
    note.typeText("half a form")
    let typed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "half a form"), object: note)
    XCTAssertEqual(XCTWaiter().wait(for: [typed], timeout: 10), .completed, note.value as? String ?? "")
    return note
  }

  private func assertPageKept(_ app: XCUIApplication, _ note: XCUIElement, _ when: String) {
    sleep(1)
    XCTAssertTrue(app.staticTexts["Loaded 1"].waitForExistence(timeout: 5), "\(when): the page didn't reload")
    XCTAssertEqual(note.value as? String, "half a form", when)
  }

  /// Drags the window's bottom-right corner by `offset`.
  private func dragCorner(_ app: XCUIApplication, by offset: CGVector) {
    let frame = app.windows.firstMatch.frame
    let origin = app.coordinate(withNormalizedOffset: .zero)
    let corner = origin.withOffset(CGVector(dx: frame.maxX - 4, dy: frame.maxY - 4))
    corner.press(forDuration: 0.6, thenDragTo: corner.withOffset(offset))
  }

  func testRotatingKeepsThePage() throws {
    let app = try launch()
    let note = typeNote(app)
    addTeardownBlock { XCUIDevice.shared.orientation = .portrait }
    for orientation in [UIDeviceOrientation.landscapeLeft, .portraitUpsideDown, .landscapeRight, .portrait] {
      XCUIDevice.shared.orientation = orientation
      assertPageKept(app, note, "\(orientation.rawValue)")
    }
  }

  /// Small enough to cross into the iPhone layout, and back.
  func testResizingTheWindowKeepsThePage() throws {
    let app = try launch()
    let note = typeNote(app)
    let before = app.windows.firstMatch.frame.size
    dragCorner(app, by: CGVector(dx: -before.width / 2, dy: -before.height / 2))
    let after = app.windows.firstMatch.frame.size
    try XCTSkipIf(after == before, "this iPad doesn't offer window resizing (\(before))")
    assertPageKept(app, note, "smaller \(after)")
    dragCorner(app, by: CGVector(dx: before.width / 3, dy: before.height / 3))
    assertPageKept(app, note, "bigger \(app.windows.firstMatch.frame.size)")
  }

  /// iPads get desktop sites; the Sunrise menu saves the phone layout for
  /// the site, which its next load gets. (The menu's own fresh load fetches
  /// the real example.com, which can't show the layout it got.)
  func testRequestMobileWebsiteAsksForThePhoneLayout() throws {
    let app = try launch()
    XCTAssertTrue(app.staticTexts["Desktop layout"].exists, "an iPad's default")
    app.openIslandMenu()
    let request = app.buttons["Request Mobile Website"]
    XCTAssertTrue(request.waitForExistence(timeout: 5))
    request.tap()
    sleep(2)
    app.launch()
    XCTAssertTrue(app.staticTexts["Phone layout"].waitForExistence(timeout: 15))
    app.openIslandMenu()
    let back = app.buttons["Request Desktop Website"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    back.tap()
    sleep(2)
    app.launch()
    XCTAssertTrue(app.staticTexts["Desktop layout"].waitForExistence(timeout: 15))
  }

  /// A page that takes ⌘Y keeps it, and Blanc's History stays closed. ⌘T is
  /// Blanc's whatever the page does.
  func testAPageKeepsAShortcutItUses() throws {
    let app = try launch()
    try XCTSkipUnless(ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 27,
                      "hardware-keyboard shortcuts didn't reach the app on iOS 26 in CI")
    app.webViews.textFields["Note"].tap()
    app.typeKey("y", modifierFlags: .command)
    XCTAssertTrue(app.staticTexts["Page kept it"].waitForExistence(timeout: 5))
    sleep(1)
    XCTAssertEqual(app.buttons["pill.palette"].firstMatch.value as? String, "2 tabs", "History didn't open as well")
    app.typeKey("t", modifierFlags: .command)
    let site = app.buttons["pill.palette"].firstMatch
    let startPage = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", "Start Page"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [startPage], timeout: 5), .completed, site.label)
  }
}
