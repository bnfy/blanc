import XCTest

/// M18 §3: the first-minute card over the start page.
final class WalkthroughUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestStartPage", "-BlancUITestWalkthrough"]
    app.launch()
    return app
  }

  func testBrowseWithoutPairingReachesPrivacyAndCloses() {
    let app = launch()
    XCTAssertTrue(app.staticTexts["Your Blanc, in your pocket."].waitForExistence(timeout: 10))
    app.buttons["welcome.browse"].tap()
    XCTAssertTrue(app.switches["welcome.measureUsage"].waitForExistence(timeout: 5))
    app.buttons["welcome.continue"].tap()
    XCTAssertTrue(app.staticTexts["Your Blanc, in your pocket."].waitForNonExistence(timeout: 5))
    // Seen once: a relaunch shows no card.
    app.terminate()
    let again = XCUIApplication()
    // No -BlancUITest argument: the app reads what the first launch saved.
    again.launchArguments = ["-BlancWalkthroughSeen"]
    again.launch()
    XCTAssertFalse(again.staticTexts["Your Blanc, in your pocket."].waitForExistence(timeout: 4))
  }

  func testPairOpensThePairingChoices() {
    let app = launch()
    XCTAssertTrue(app.buttons["welcome.pair"].waitForExistence(timeout: 10))
    app.buttons["welcome.pair"].tap()
    XCTAssertTrue(app.buttons["settings.pairWithBlanc"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["settings.otherWays"].exists)
    app.buttons["welcome.close"].tap()
    XCTAssertTrue(app.buttons["settings.pairWithBlanc"].waitForNonExistence(timeout: 5))
  }

  /// Review Focus 1: a link from another app opens behind the card, which stays.
  func testLinkWhileTheCardShowsOpensBehindIt() {
    let app = launch()
    let title = app.staticTexts["Your Blanc, in your pocket."]
    XCTAssertTrue(title.waitForExistence(timeout: 10))
    app.open(URL(string: "https://example.org/")!)
    sleep(2)
    XCTAssertTrue(title.exists, "the card stays")
    app.buttons["welcome.browse"].tap()
    app.buttons["welcome.continue"].tap()
    let site = app.buttons["pill.palette"]
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS 'example.org'"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 10), .completed, "the link's tab is current")
  }

  /// A pairing QR read by the Camera app while the card shows asks first,
  /// from the card, and never joins on its own.
  func testPairLinkWhileTheCardShowsAsksFirst() {
    let app = launch()
    XCTAssertTrue(app.buttons["welcome.pair"].waitForExistence(timeout: 10))
    app.open(URL(string: "https://blanc.day/pair#K7MR4PX2")!)
    XCTAssertTrue(app.buttons["pair.linkPair"].waitForExistence(timeout: 10), "the question is asked over the card")
  }
}
