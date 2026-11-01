import XCTest
@testable import Blanc

/// M11: when a sideways swipe on the Island counts, and how far the page moves.
final class IslandSwipeTests: XCTestCase {
    func testOnlyAClearlySidewaysDragCounts() {
        XCTAssertTrue(IslandSwipe.isSideways(CGSize(width: 12, height: 0)))
        XCTAssertFalse(IslandSwipe.isSideways(CGSize(width: 11, height: 0)))
        XCTAssertFalse(IslandSwipe.isSideways(CGSize(width: 20, height: 20)))
        XCTAssertTrue(IslandSwipe.isSideways(CGSize(width: -30, height: 10)))
    }

    func testThePageResistsPastEitherEnd() {
        XCTAssertEqual(IslandSwipe.displayed(-100, hasPrevious: true, hasNext: false), -25)
        XCTAssertEqual(IslandSwipe.displayed(-100, hasPrevious: true, hasNext: true), -100)
        XCTAssertEqual(IslandSwipe.displayed(80, hasPrevious: false, hasNext: true), 20)
    }

    func testOutcome() {
        func outcome(_ dx: CGFloat, _ predicted: CGFloat, previous: Bool = true, next: Bool = true) -> IslandSwipe.Outcome {
            IslandSwipe.outcome(dx: dx, predictedDx: predicted, width: 400, hasPrevious: previous, hasNext: next)
        }
        XCTAssertEqual(outcome(-120, -120), .next, "30% of the width travelled")
        XCTAssertEqual(outcome(-119, -150), .stay)
        XCTAssertEqual(outcome(-60, -210), .next, "a flick whose predicted end passes 50%")
        XCTAssertEqual(outcome(130, 130, previous: false), .stay, "no tab before the first")
        XCTAssertEqual(outcome(130, 130), .previous)
    }

    /// The unfolded iPhone Duo is about 950 pt wide in landscape: the swipe
    /// asks no more of the thumb than on the widest iPhone held upright.
    func testAWideScreenNeedsNoMoreThanTheWidestIPhone() {
        func outcome(_ dx: CGFloat, _ predicted: CGFloat, width: CGFloat) -> IslandSwipe.Outcome {
            IslandSwipe.outcome(dx: dx, predictedDx: predicted, width: width, hasPrevious: true, hasNext: true)
        }
        XCTAssertEqual(outcome(-132, -132, width: 950), .next, "30% of 440 pt")
        XCTAssertEqual(outcome(-131, -150, width: 950), .stay)
        XCTAssertEqual(outcome(-60, -221, width: 950), .next, "a flick past 50% of 440 pt")
        XCTAssertEqual(outcome(-131, -131, width: 440), .stay, "the widest iPhone is unchanged")
        XCTAssertEqual(outcome(-132, -132, width: 440), .next)
    }
}
