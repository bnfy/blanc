import XCTest

/// The App Store screenshots (M18 design §10), captured from the real app by
/// `scripts/ios-app-store-screenshots.sh`, which sets `BLANC_SHOTS_DIR`.
/// Without it (an ordinary test run, CI) this skips. Each shot starts from
/// the `-BlancUITestAppStore` seed: blanc.day pages, a group, a Space and two
/// pages a MacBook Pro sent here.
final class AppStoreScreenshotsUITests: XCTestCase {
  private var app: XCUIApplication!
  private var folder: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    let dir = ProcessInfo.processInfo.environment["BLANC_SHOTS_DIR"] ?? ""
    try XCTSkipIf(dir.isEmpty, "run by scripts/ios-app-store-screenshots.sh")
    folder = URL(fileURLWithPath: dir)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  }

  private func launch() {
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestAppStore", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 20))
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS 'blanc.day'"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 20), .completed, "blanc.day is current")
  }

  /// Waits for the page (blanc.day plays a short opening animation) and the
  /// motion to settle, then saves the whole screen.
  private func shoot(_ name: String) throws {
    sleep(8)
    let png = XCUIScreen.main.screenshot().pngRepresentation
    try png.write(to: folder.appendingPathComponent("\(name).png"))
  }

  func test1TheIslandOnAPage() throws {
    launch()
    try shoot("1-island")
  }

  func test2ThePaletteWithTabsAndSentPages() throws {
    launch()
    app.buttons["pill.palette"].tap()
    XCTAssertTrue(app.buttons["sent.s1"].waitForExistence(timeout: 10), "pages sent from the MacBook Pro")
    try shoot("2-palette")
  }

  func test3SendToDevice() throws {
    launch()
    app.openIslandMenu()
    let send = app.buttons["Send to Device"]
    XCTAssertTrue(send.waitForExistence(timeout: 5))
    send.tap()
    XCTAssertTrue(app.buttons["MacBook Pro"].waitForExistence(timeout: 5))
    try shoot("3-send")
  }

  func test4Spaces() throws {
    launch()
    let mark = app.buttons["island.space"]
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    mark.tap()
    XCTAssertTrue(app.buttons["spaces.row.Work"].waitForExistence(timeout: 5))
    try shoot("4-spaces")
  }

  func test5TheStartPage() throws {
    launch()
    app.buttons["pill.palette"].tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText("/new\n")
    let site = app.buttons["pill.palette"]
    let start = XCTNSPredicateExpectation(predicate: NSPredicate(format: "NOT (label CONTAINS 'blanc.day')"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [start], timeout: 10), .completed, "a new tab shows the Start Page")
    try shoot("5-start")
  }
}
