import XCTest

/// The App Store screenshots' captures, from the real app, run by
/// `scripts/ios-app-store-screenshots.sh`, which sets `BLANC_SHOTS_DIR`.
/// Without it (an ordinary test run, CI) this skips. Each shot starts from
/// the `-BlancUITestAppStore` seed: paintings from The Met's open-access
/// collection, a "Museum day" group, a "Work" Space and a shared "Trip"
/// Space, and a MacBook Pro's tabs and two pages it sent here. The script
/// then frames each capture with its caption (`scripts/ios-app-store-compose.mjs`).
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

  private var site: XCUIElement { app.buttons["pill.palette"] }

  private func launch() {
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestAppStore", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    waitForSite("metmuseum.org")
  }

  private func waitForSite(_ text: String, not: Bool = false) {
    XCTAssertTrue(site.waitForExistence(timeout: 20))
    let format = not ? "NOT (label CONTAINS %@)" : "label CONTAINS %@"
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: format, text), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 30), .completed, "the Island shows \(text)")
  }

  /// Waits for the page's images and any motion to settle, then saves the
  /// whole screen.
  private func shoot(_ name: String, settle: UInt32 = 8) throws {
    sleep(settle)
    let file = folder.appendingPathComponent("\(name).png")
    // The unfolded iPhone Duo's inner display screenshots black from here, so
    // with BLANC_SHOTS_BY_HAND set this waits for a Device Hub screenshot
    // saved as <name>.png, announced by <name>.pending.
    if ProcessInfo.processInfo.environment["BLANC_SHOTS_BY_HAND"] == "1" {
      try Data().write(to: folder.appendingPathComponent("\(name).pending"))
      let deadline = Date().addingTimeInterval(600)
      while !FileManager.default.fileExists(atPath: file.path) {
        XCTAssertLessThan(Date(), deadline, "a screenshot of \(name)")
        usleep(500_000)
      }
      return
    }
    try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
  }

  private func run(_ command: String) {
    site.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText(command + "\n")
  }

  /// The script sets the status bar to the coming minute and passes it as
  /// `BLANC_SHOT_TIME` ("h:mm"), so the Start Page's clock reads the same.
  func test1TheStartPage() throws {
    launch()
    run("/new")
    waitForSite("metmuseum.org", not: true)
    sleep(5)
    if let time = ProcessInfo.processInfo.environment["BLANC_SHOT_TIME"], !time.isEmpty {
      let clock = DateFormatter()
      clock.dateFormat = "h:mm"
      let deadline = Date().addingTimeInterval(150)
      while clock.string(from: Date()) != time {
        XCTAssertLessThan(Date(), deadline, "the clock reaches \(time)")
        usleep(250_000)
      }
    }
    try shoot("1-start", settle: 2)
  }

  func test2YourComputersTabs() throws {
    launch()
    site.tap()
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 10))
    sleep(2)
    // Unfolded, the palette is a panel over the page; folded and on every
    // other iPhone it's a sheet, which lowering puts the keyboard away from.
    if app.frame.width < 600 { try lowerAndRaiseTheSheet() }
    let mac = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'MacBook Pro ('")).firstMatch
    let panel = app.descendants(matching: .any)["palette.panel"]
    let list: XCUIElement = panel.exists ? panel : app
    for _ in 0..<6 where !(mac.exists && mac.isHittable) { list.swipeUp() }
    if !mac.exists { try? app.debugDescription.write(to: folder.appendingPathComponent("tree.txt"), atomically: true, encoding: .utf8) }
    XCTAssertTrue(mac.waitForExistence(timeout: 5), "the MacBook Pro's tabs")
    mac.tap()
    sleep(1)
    list.swipeUp()
    try shoot("2-devices", settle: 3)
  }

  private func lowerAndRaiseTheSheet() throws {
    app.swipeDown()
    sleep(1)
    // Its top edge (above the search field, so the field isn't focused) sits
    // 420 points up from the bottom of the screen.
    let edge = 1 - 412 / app.frame.height
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: edge))
      .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    sleep(1)
  }

  func test3Spaces() throws {
    launch()
    let mark = app.buttons["island.space"]
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    mark.tap()
    XCTAssertTrue(app.buttons["spaces.row.Trip"].waitForExistence(timeout: 5))
    try shoot("3-spaces", settle: 4)
  }

  func test4Commands() throws {
    launch()
    site.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText("/")
    try shoot("4-commands", settle: 3)
  }

  func test5TabGrid() throws {
    launch()
    let cards = app.buttons.matching(identifier: "tab.card")
    // Visit each tab once so its card shows the page, not a placeholder.
    for index in [1, 2, 3, 4, 0] {
      app.openTabGrid()
      XCTAssertTrue(cards.element(boundBy: index).waitForExistence(timeout: 5))
      cards.element(boundBy: index).tap()
      sleep(7)
    }
    if !cards.firstMatch.waitForExistence(timeout: 2) { app.openTabGrid() }
    XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5))
    try shoot("5-grid", settle: 3)
  }

  func test6PrivateTab() throws {
    launch()
    app.openIslandMenu()
    let item = app.buttons["New Private Tab"]
    XCTAssertTrue(item.waitForExistence(timeout: 5))
    item.tap()
    XCTAssertTrue(app.buttons["pill.private"].waitForExistence(timeout: 10))
    run("https://www.metmuseum.org/art/collection/search/436524")
    waitForSite("metmuseum.org")
    sleep(8)
    // The menu shows Ad & tracker blocking on, in a private tab too.
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Ad & tracker blocking"].waitForExistence(timeout: 5))
    try shoot("6-private", settle: 2)
  }
}
