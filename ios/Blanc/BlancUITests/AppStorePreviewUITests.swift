import XCTest

/// The App Store app preview, played in the real app while
/// `scripts/ios-app-store-preview.sh` records the screen. It sets
/// `BLANC_PREVIEW_DIR`; without it (an ordinary test run, CI) this skips.
/// The test and the script meet through files there: `ready` once the first
/// page shows, `recording` once the recording runs, and `marks` at the end,
/// the seconds at which each step started, which the script cuts and titles by.
/// Starts from the `-BlancUITestAppStore` seed, like the screenshots.
final class AppStorePreviewUITests: XCTestCase {
  private var app: XCUIApplication!
  private var folder: URL!
  private var started = Date()
  private var marks: [String] = []

  override func setUpWithError() throws {
    continueAfterFailure = false
    let dir = ProcessInfo.processInfo.environment["BLANC_PREVIEW_DIR"] ?? ""
    try XCTSkipIf(dir.isEmpty, "run by scripts/ios-app-store-preview.sh")
    folder = URL(fileURLWithPath: dir)
  }

  private var site: XCUIElement { app.buttons["pill.palette"] }

  private func waitForSite(_ text: String) {
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 30), .completed, "the Island shows \(text)")
  }

  private func mark(_ step: String) {
    marks.append(String(format: "%.2f %@", Date().timeIntervalSince(started), step))
  }

  private func pause(_ seconds: Double) { usleep(UInt32(seconds * 1_000_000)) }

  func testPreview() throws {
    app = XCUIApplication()
    app.launchArguments = ["-BlancUITestAppStore", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(site.waitForExistence(timeout: 20))
    waitForSite("metmuseum.org")
    // Wake every tab first, so the swipes and the grid show drawn pages.
    for _ in 0..<4 { site.swipeLeft(); pause(6) }
    for _ in 0..<4 { site.swipeRight(); pause(1) }
    pause(4)
    // The tour ends on the Start Page's clock: start early in a minute, so the
    // status bar the script sets now still matches it at the end.
    while Calendar.current.component(.second, from: Date()) > 10 { pause(0.2) }
    try Data().write(to: folder.appendingPathComponent("ready"))
    let recording = folder.appendingPathComponent("recording")
    let deadline = Date().addingTimeInterval(60)
    while !FileManager.default.fileExists(atPath: recording.path) {
      XCTAssertLessThan(Date(), deadline, "the script starts recording")
      pause(0.1)
    }
    started = Date()

    mark("island")
    pause(2.5)

    mark("swipe")
    site.swipeLeft()
    pause(1.4)
    site.swipeLeft()
    pause(1.5)

    mark("refresh")
    let page = app.webViews.firstMatch
    page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
      .press(forDuration: 0.05, thenDragTo: page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62)),
             withVelocity: .slow, thenHoldForDuration: 0.4)
    pause(2.2)

    mark("grid")
    app.buttons["pill.tabs"].tap()
    pause(2.0)
    let cards = app.buttons.matching(identifier: "tab.card")
    XCTAssertTrue(cards.element(boundBy: 3).waitForExistence(timeout: 5))
    cards.element(boundBy: 3).tap()
    pause(1.8)

    mark("spaces")
    app.buttons["island.space"].tap()
    let trip = app.buttons["spaces.row.Trip"]
    XCTAssertTrue(trip.waitForExistence(timeout: 5))
    pause(1.6)
    trip.tap()
    pause(2.4)

    mark("devices")
    app.buttons["island.space"].tap()
    let iphone = app.buttons["spaces.iphone"]
    XCTAssertTrue(iphone.waitForExistence(timeout: 5))
    iphone.tap()
    pause(1.2)
    site.tap()
    XCTAssertTrue(app.buttons["sent.s1"].waitForExistence(timeout: 10))
    pause(2.2)

    mark("start")
    let input = app.textFields["island.address"]
    input.tap(); input.typeText("/new\n")
    pause(3.2)
    mark("end")

    try marks.joined(separator: "\n").write(to: folder.appendingPathComponent("marks"), atomically: true, encoding: .utf8)
  }
}
