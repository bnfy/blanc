import XCTest

final class IslandWidthUITests: XCTestCase {
    private func launch(_ seed: String) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = [seed, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["New tab"].waitForExistence(timeout: 15))
        return app
    }

    func testALongSiteKeepsEveryButtonOnScreen() {
        let app = launch("-BlancUITestLongHost")
        XCTAssertTrue(app.buttons["pill.palette"].label.contains("a-very-long"))
        let window = app.windows.firstMatch.frame
        let newTab = app.buttons["New tab"]
        for button in [app.buttons["pill.back"], app.buttons["island.menu"], newTab] {
            XCTAssertTrue(window.contains(button.frame))
        }
        XCTAssertLessThanOrEqual(newTab.frame.maxX, window.maxX - 16)
    }

    func testAShortSiteLeavesTheIslandNarrow() {
        let app = launch("-BlancUITestFavorites")
        let width = app.buttons["New tab"].frame.maxX - app.buttons["pill.back"].frame.minX
        XCTAssertLessThan(width, app.windows.firstMatch.frame.width * 0.75)
    }
}
