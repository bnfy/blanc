import XCTest
@testable import Blanc

/// The floating Island tucks away while the person scrolls a page down.
final class IslandTuckTests: XCTestCase {
    /// A long page: 5000 pt of content in an 800 pt viewport.
    private func at(_ offset: CGFloat, content: CGFloat = 5000) -> IslandTuck.Position {
        IslandTuck.Position(offset: offset, contentHeight: content, viewportHeight: 800, topInset: 60, bottomInset: 100)
    }

    /// Scrolls through `offsets` one step at a time, as the scroll view reports.
    private func scroll(_ tuck: inout IslandTuck, _ offsets: [CGFloat], byPerson: Bool = true) {
        for (old, new) in zip(offsets, offsets.dropFirst()) {
            tuck.scrolled(from: old, to: at(new), byPerson: byPerson)
        }
    }

    func testScrollingDownTucksItOnlyPastTheThreshold() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 510, 523])
        XCTAssertFalse(tuck.isTucked, "23 pt down isn't enough")
        scroll(&tuck, [523, 524])
        XCTAssertTrue(tuck.isTucked)
    }

    func testScrollingBackUpBringsItBack() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 600])
        XCTAssertTrue(tuck.isTucked)
        scroll(&tuck, [600, 595])
        XCTAssertTrue(tuck.isTucked, "a small jitter back up keeps it tucked")
        scroll(&tuck, [595, 588])
        XCTAssertFalse(tuck.isTucked)
    }

    func testTurningAroundStartsTheCountAgain() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 520, 510, 530])
        XCTAssertFalse(tuck.isTucked, "20 pt down after turning, not 30 in all")
    }

    func testItStaysAtTheTopOfThePage() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 600])
        // The top is -topInset: the page's first line just under the status bar.
        tuck.scrolled(from: 600, to: at(-55), byPerson: true)
        XCTAssertFalse(tuck.isTucked)
        scroll(&tuck, [-60, -53], byPerson: false)
        XCTAssertFalse(tuck.isTucked, "within the slack of the top")
    }

    func testItComesBackAtTheEndOfThePage() {
        var tuck = IslandTuck()
        scroll(&tuck, [3000, 3100])
        XCTAssertTrue(tuck.isTucked)
        // The end is contentHeight + bottomInset - viewportHeight = 4300.
        tuck.scrolled(from: 3100, to: at(4295), byPerson: true)
        XCTAssertFalse(tuck.isTucked)
    }

    func testAPageThatDoesNotScrollKeepsIt() {
        var tuck = IslandTuck()
        tuck.scrolled(from: 0, to: at(40, content: 600), byPerson: true)
        XCTAssertFalse(tuck.isTucked)
    }

    func testThePageScrollingItselfNeverTucksIt() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 1500], byPerson: false)
        XCTAssertFalse(tuck.isTucked)
    }

    func testShowBringsItBackAndForgetsTheTravel() {
        var tuck = IslandTuck()
        scroll(&tuck, [500, 600])
        tuck.show()
        XCTAssertFalse(tuck.isTucked)
        scroll(&tuck, [600, 620])
        XCTAssertFalse(tuck.isTucked)
    }
}
