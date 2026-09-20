import XCTest
@testable import Blanc

final class DuoTabWindowTests: XCTestCase {
    func testSelectedTabBeyondFirstThreeRemainsVisible() {
        XCTAssertEqual(DuoTabWindow.indices(count: 5, activeIndex: 4), [2, 3, 4])
        XCTAssertEqual(DuoTabWindow.indices(count: 5, activeIndex: 3), [2, 3, 4])
    }

    func testSelectionMovesWindowWithoutLosingTabOrder() {
        XCTAssertEqual(DuoTabWindow.indices(count: 5, activeIndex: 0), [0, 1, 2])
        XCTAssertEqual(DuoTabWindow.indices(count: 5, activeIndex: 2), [1, 2, 3])
    }

    func testShortAndEmptyCollections() {
        XCTAssertEqual(DuoTabWindow.indices(count: 0, activeIndex: nil), [])
        XCTAssertEqual(DuoTabWindow.indices(count: 2, activeIndex: 1), [0, 1])
    }
}
