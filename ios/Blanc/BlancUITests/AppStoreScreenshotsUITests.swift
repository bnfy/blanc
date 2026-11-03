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
    let png = XCUIScreen.main.screenshot().pngRepresentation
    try png.write(to: folder.appendingPathComponent("\(name).png"))
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
    XCTAssertTrue(app.buttons["sent.s1"].waitForExistence(timeout: 10), "pages sent from the MacBook Pro")
    // Lowering the palette puts the keyboard away; raising it again keeps it away.
    app.swipeDown()
    sleep(1)
    // Its top edge (above the search field, so the field isn't focused) sits
    // 420 points up from the bottom of the screen.
    let edge = 1 - 412 / app.frame.height
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: edge))
      .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    sleep(1)
    let mac = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'MacBook Pro ('")).firstMatch
    for _ in 0..<3 where !mac.isHittable { app.swipeUp() }
    XCTAssertTrue(mac.waitForExistence(timeout: 5), "the MacBook Pro's tabs")
    mac.tap()
    sleep(1)
    app.swipeUp()
    try shoot("2-devices", settle: 3)
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
    let tabs = app.buttons["pill.tabs"]
    let cards = app.buttons.matching(identifier: "tab.card")
    // Visit each tab once so its card shows the page, not a placeholder.
    for index in [1, 2, 3, 4, 0] {
      tabs.tap()
      XCTAssertTrue(cards.element(boundBy: index).waitForExistence(timeout: 5))
      cards.element(boundBy: index).tap()
      sleep(7)
    }
    tabs.tap()
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
