import XCTest
@testable import Blanc

final class PalettePanelDragTests: XCTestCase {
    func testAShortDragStaysOpen() {
        XCTAssertFalse(PalettePanelDrag.closes(translation: 30, predicted: 80, islandAtTop: false))
    }

    func testADragTowardTheIslandCloses() {
        XCTAssertTrue(PalettePanelDrag.closes(translation: 60, predicted: 60, islandAtTop: false))
    }

    func testAFlickCloses() {
        XCTAssertTrue(PalettePanelDrag.closes(translation: 20, predicted: 160, islandAtTop: false))
    }

    func testDraggingAwayNeverCloses() {
        XCTAssertFalse(PalettePanelDrag.closes(translation: -200, predicted: -400, islandAtTop: false))
    }

    func testATopIslandClosesUpward() {
        XCTAssertTrue(PalettePanelDrag.closes(translation: -60, predicted: -60, islandAtTop: true))
        XCTAssertFalse(PalettePanelDrag.closes(translation: 60, predicted: 60, islandAtTop: true))
    }
}
