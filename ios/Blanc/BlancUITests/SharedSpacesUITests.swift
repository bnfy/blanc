import XCTest

/// M17c: Shared Spaces on the phone, from seeded local state and an
/// in-process fake Worker (`-BlancUITestSharedSpaces`, `-BlancUITestSharedSpacesOn`).
final class SharedSpacesUITests: XCTestCase {
  private func launch(_ seed: String) -> XCUIApplication {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launchArguments = [seed, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(app.buttons["pill.palette"].waitForExistence(timeout: 15))
    return app
  }
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }
  private func openSync(_ app: XCUIApplication) {
    app.buttons["pill.palette"].tap()
    let input = app.textFields["island.address"]
    XCTAssertTrue(input.waitForExistence(timeout: 5))
    input.tap()
    input.typeText("/sync\n")
    XCTAssertTrue(app.navigationBars["Sync"].waitForExistence(timeout: 5))
  }
  private func capture(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// Turning the switch on lists the phone's Spaces: the oversized one is
  /// greyed with its reason; confirming shares the other, which then shows
  /// the sync mark in the Spaces card.
  func testTurnOnSharesTickedSpaces() {
    let app = launch("-BlancUITestSharedSpaces")
    openSync(app)
    let toggle = app.switches["sync.spaces"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5))
    app.collectionViews.firstMatch.swipeUp()
    XCTAssertEqual(toggle.value as? String, "0", "off by default")
    XCTAssertTrue(element(app, "sync.spaces.waiting").waitForExistence(timeout: 10), "the library's Space is waiting")
    toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    let archive = app.buttons["sharedSpaces.row.Archive"]
    XCTAssertTrue(archive.waitForExistence(timeout: 5))
    XCTAssertFalse(archive.isEnabled, "too many tabs to share")
    XCTAssertTrue(element(app, "sharedSpaces.reason.Archive").exists)
    let reading = app.buttons["sharedSpaces.row.Reading"]
    XCTAssertTrue(reading.isEnabled)
    XCTAssertTrue(reading.isSelected, "a Space that fits is ticked")
    capture(app, "Choose Spaces to sync")
    app.buttons["sharedSpaces.confirm"].tap()
    XCTAssertTrue(archive.waitForNonExistence(timeout: 5))
    XCTAssertTrue(element(app, "sync.spaces.choose").waitForExistence(timeout: 5), "the switch is on")
    app.buttons["settings.done"].firstMatch.tap()

    let mark = app.buttons["island.space"]
    XCTAssertTrue(mark.waitForExistence(timeout: 5))
    mark.tap()
    XCTAssertTrue(element(app, "spaces.syncMark.Reading").waitForExistence(timeout: 5), "Reading is shared")
    XCTAssertFalse(element(app, "spaces.syncMark.Archive").exists, "Archive stays local")
    capture(app, "Spaces card with shared Spaces")
  }
}
