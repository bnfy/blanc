import XCTest

/// Blanc in the share sheet (M18 design §8): the extension opens Blanc with a
/// `blanc-share:` link, so these open that link the way the extension does.
/// Tapping Blanc in a real share sheet is checked by hand on the iPhone.
final class ShareExtensionUITests: XCTestCase {
  private func share(_ link: String) -> URL {
    var parts = URLComponents(string: "blanc-share://open")!
    parts.queryItems = [URLQueryItem(name: "u", value: link)]
    return parts.url!
  }

  func testASharedLinkOpensInANewTab() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFavorites"]
    app.launch()
    let site = app.buttons["pill.palette"]
    XCTAssertTrue(site.waitForExistence(timeout: 15))

    app.open(share("https://example.org/"))
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS 'example.org'"), object: site)
    XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 10), .completed, "the shared link's tab is current")
  }

  func testASharedPairLinkAsksFirst() {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = ["-BlancUITestFavorites"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))

    app.open(share("https://blanc.day/pair#K7MR4PX2"))
    XCTAssertTrue(app.buttons["pair.linkPair"].waitForExistence(timeout: 10), "pairing asks before joining")
  }
}
