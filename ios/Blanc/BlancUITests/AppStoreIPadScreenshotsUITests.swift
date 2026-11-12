import XCTest

/// The iPad App Store screenshots' captures, from the real app, run by
/// `scripts/ios-app-store-screenshots.sh --ipad`, which sets `BLANC_SHOTS_DIR`;
/// without it (an ordinary test run, CI) this skips. Landscape, the layout the
/// owner chose for the set (2026-11-12). The iPhone shots' seed (`AppStoreScreenshotsUITests`) with three
/// more paintings for the wider grid (`-BlancUITestAppStoreIPad`): paintings
/// from The Met, a "Museum day" group, a "Work" Space and a shared "Trip"
/// Space, a MacBook Pro's tabs.
final class AppStoreIPadScreenshotsUITests: XCTestCase {
  private var app: XCUIApplication!
  private var folder: URL!

  override func setUpWithError() throws {
    continueAfterFailure = false
    let dir = ProcessInfo.processInfo.environment["BLANC_SHOTS_DIR"] ?? ""
    try XCTSkipIf(dir.isEmpty, "run by scripts/ios-app-store-screenshots.sh --ipad")
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "iPad only")
    folder = URL(fileURLWithPath: dir)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    XCUIDevice.shared.orientation = .landscapeLeft
  }

  private var site: XCUIElement { app.buttons["pill.palette"] }
  private var cards: XCUIElementQuery { app.descendants(matching: .any).matching(identifier: "tab.card") }

  private func launch() {
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestAppStoreIPad", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    waitForSite("metmuseum.org")
    // A tiled window (the test runner beside Blanc) would draw the phone layout.
    let size = app.windows.firstMatch.frame.size
    XCTAssertGreaterThanOrEqual(min(size.width, size.height), 1000, "Blanc fills the screen (\(size))")
  }

  private func waitForSite(_ text: String, not: Bool = false) {
    XCTAssertTrue(site.waitForExistence(timeout: 20))
    let format = not ? "NOT (label CONTAINS %@)" : "label CONTAINS %@"
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: format, text), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 30), .completed, "the Island shows \(text)")
  }

  private func shoot(_ name: String, settle: UInt32 = 8) throws {
    sleep(settle)
    try XCUIScreen.main.screenshot().pngRepresentation.write(to: folder.appendingPathComponent("\(name).png"))
  }

  private func run(_ command: String) {
    site.tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap(); input.typeText(command + "\n")
  }

  /// The grid card of the tab whose title contains `title`.
  private func card(_ title: String) -> XCUIElement {
    cards.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
  }

  /// Visits each tab once so its grid card (and a split pane) shows the page,
  /// ending on the first.
  private func visitEveryTab() {
    app.openTabGrid()
    XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5))
    let count = cards.count
    for index in Array(1..<count) + [0] {
      if !cards.element(boundBy: index).exists { app.openTabGrid() }
      XCTAssertTrue(cards.element(boundBy: index).waitForExistence(timeout: 5))
      cards.element(boundBy: index).tap()
      sleep(6)
    }
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

  /// Wheat Field with Cypresses beside Under the Wave off Kanagawa, from the
  /// first card's Split with ▸.
  func test2SplitView() throws {
    launch()
    visitEveryTab()
    app.openTabGrid()
    XCTAssertTrue(card("Wheat Field").waitForExistence(timeout: 5))
    app.holdForMenu(card("Wheat Field"))
    app.tapMenuItem("Split with", opensSubmenu: true)
    let wave = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Katsushika Hokusai'")).firstMatch
    XCTAssertTrue(wave.waitForExistence(timeout: 5), "Split with ▸ lists the Hokusai")
    wave.tap()
    // The grid stays open; choosing the split's first tab shows the split.
    sleep(1)
    card("Wheat Field").tap()
    XCTAssertTrue(app.otherElements["split.divider"].waitForExistence(timeout: 10))
    let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: cards.firstMatch)
    XCTAssertEqual(XCTWaiter().wait(for: [closed], timeout: 5), .completed, "the grid has closed")
    try shoot("2-split")
  }

  /// Sunflowers in a Glance card over Wheat Field with Cypresses.
  func test3Glance() throws {
    launch()
    visitEveryTab()
    app.openTabGrid()
    XCTAssertTrue(card("Sunflowers").waitForExistence(timeout: 5))
    app.holdForMenu(card("Sunflowers"))
    app.tapMenuItem("Open in Glance")
    XCTAssertTrue(app.otherElements["glance.card"].waitForExistence(timeout: 10))
    try shoot("3-glance")
  }

  /// The palette, a panel over the page on iPad: this iPad's tabs, the
  /// MacBook Pro's, and the pages it sent.
  func test4Palette() throws {
    launch()
    site.tap()
    XCTAssertTrue(app.textFields["island.address"].waitForExistence(timeout: 10))
    // The on-screen keyboard's own key puts it away, leaving the screen as a
    // hardware keyboard would; by position, as the key's tap can fail its
    // scroll-to-visible check.
    sleep(1)
    let hide = app.keyboards.buttons["Hide keyboard"]
    if hide.exists { hide.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap(); sleep(1) }
    // The MacBook Pro's row, below this iPad's tabs: scroll the panel to it
    // and open it, as on the iPhone.
    let mac = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'MacBook Pro ('")).firstMatch
    let panel = app.descendants(matching: .any)["palette.panel"]
    let list: XCUIElement = panel.exists ? panel : app
    for _ in 0..<6 where !(mac.exists && mac.isHittable) { list.swipeUp() }
    XCTAssertTrue(mac.waitForExistence(timeout: 5), "the MacBook Pro's tabs")
    mac.tap()
    sleep(1)
    list.swipeUp()
    try shoot("4-palette", settle: 3)
  }

  func test5TabGrid() throws {
    launch()
    visitEveryTab()
    if !cards.firstMatch.waitForExistence(timeout: 2) { app.openTabGrid() }
    XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5))
    try shoot("5-grid", settle: 3)
  }

  func test6Spaces() throws {
    launch()
    app.openSpacesCard()
    XCTAssertTrue(app.buttons["spaces.row.Trip"].waitForExistence(timeout: 5))
    try shoot("6-spaces", settle: 4)
  }

  func test7PrivateTab() throws {
    launch()
    app.openIslandMenu()
    let item = app.buttons["New Private Tab"]
    XCTAssertTrue(item.waitForExistence(timeout: 5))
    item.tap()
    XCTAssertTrue(app.buttons["pill.private"].waitForExistence(timeout: 10))
    run("https://noddingoffapp.com")
    waitForSite("noddingoffapp.com")
    sleep(8)
    app.openIslandMenu()
    XCTAssertTrue(app.buttons["Ad & tracker blocking"].waitForExistence(timeout: 5))
    try shoot("7-private", settle: 2)
  }
}
