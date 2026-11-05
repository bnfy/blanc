import XCTest
@testable import Blanc

/// The page's way into the tab grid, measured against Safari's.
final class TabGridMotionTests: XCTestCase {
    private let screen = CGRect(x: 0, y: 0, width: 400, height: 800)

    func testAFullPageIsUntouched() {
        XCTAssertEqual(TabGridMotion.transform(.full, in: screen, card: nil), TabGridMotion.Transform())
    }

    func testAPinchShrinksThePageAndFollowsTheFingers() {
        let moved = CGSize(width: 10, height: -20)
        let t = TabGridMotion.transform(.pinching(scale: 0.75, translation: moved), in: screen, card: nil)
        XCTAssertEqual(t.scale, 0.75)
        XCTAssertEqual(t.offset, moved)
        XCTAssertEqual(t.progress, 0.5, accuracy: 0.001)
        XCTAssertGreaterThan(t.cornerRadius, 0)
    }

    func testOpeningTheFingersNeverGrowsThePagePastFull() {
        XCTAssertEqual(TabGridMotion.transform(.pinching(scale: 1.4, translation: .zero), in: screen, card: nil).scale, 1)
    }

    func testThePageLandsOnItsCard() {
        let card = CGRect(x: 220, y: 300, width: 160, height: 200)
        let t = TabGridMotion.transform(.card, in: screen, card: card)
        XCTAssertEqual(t.scale, 0.4, accuracy: 0.001)
        XCTAssertEqual(screen.midX + t.offset.width, card.midX, accuracy: 0.001)
        // The page's top meets the card's top.
        XCTAssertEqual(screen.midY + t.offset.height - screen.height * t.scale / 2, card.minY, accuracy: 0.001)
        XCTAssertEqual(t.progress, 1)
    }

    func testWithNoCardYetThePageShrinksInPlace() {
        let t = TabGridMotion.transform(.card, in: screen, card: nil)
        XCTAssertEqual(t.offset, .zero)
        XCTAssertLessThan(t.scale, 1)
    }

    func testALiftOpensTheGridOnceTheFingersHaveClosedEnough() {
        XCTAssertTrue(TabGridMotion.opens(scale: 0.7, velocity: 0))
        XCTAssertFalse(TabGridMotion.opens(scale: 0.9, velocity: 0))
    }

    func testAQuickCloseCountsAndOpeningTheFingersDoesNot() {
        XCTAssertTrue(TabGridMotion.opens(scale: 0.9, velocity: -1))
        XCTAssertFalse(TabGridMotion.opens(scale: 0.7, velocity: 1))
    }

    func testOnlyADragIntoThePageLifts() {
        XCTAssertTrue(TabGridMotion.isLift(CGSize(width: 2, height: -20), islandAtTop: false))
        XCTAssertFalse(TabGridMotion.isLift(CGSize(width: 2, height: 20), islandAtTop: false), "down, off the screen")
        XCTAssertTrue(TabGridMotion.isLift(CGSize(width: 2, height: 20), islandAtTop: true), "a top Island drags down")
        XCTAssertFalse(TabGridMotion.isLift(CGSize(width: 30, height: -20), islandAtTop: false), "sideways switches tabs")
        XCTAssertFalse(TabGridMotion.isLift(CGSize(width: 0, height: -8), islandAtTop: false), "not yet a drag")
    }

    private func page(_ lifted: (scale: CGFloat, translation: CGSize)) -> TabGridMotion.Page {
        .pinching(scale: lifted.scale, translation: lifted.translation)
    }

    func testThePagesEdgeStaysUnderTheFinger() {
        let height: CGFloat = 800
        let frame = CGRect(x: 0, y: 0, width: 400, height: height)
        let motion = TabGridMotion.transform(page(TabGridMotion.lifted(CGSize(width: 10, height: -200), islandAtTop: false, height: height)),
                                             in: frame, card: nil)
        XCTAssertEqual(motion.scale, 0.75, accuracy: 0.001)
        XCTAssertEqual(frame.midY + height * motion.scale / 2 + motion.offset.height, height - 200, accuracy: 0.001)
        XCTAssertEqual(motion.offset.width, 10)
        let top = TabGridMotion.transform(page(TabGridMotion.lifted(CGSize(width: 0, height: 200), islandAtTop: true, height: height)),
                                          in: frame, card: nil)
        XCTAssertEqual(frame.midY - height * top.scale / 2 + top.offset.height, 200, accuracy: 0.001)
        let far = TabGridMotion.transform(page(TabGridMotion.lifted(CGSize(width: 0, height: -700), islandAtTop: false, height: height)),
                                          in: frame, card: nil)
        XCTAssertEqual(far.scale, 0.3, accuracy: 0.001, "no smaller than a pinch")
        XCTAssertEqual(frame.midY + height * far.scale / 2 + far.offset.height, height - 700, accuracy: 0.001, "still under the finger")
    }

    func testDraggingBackPastTheStartLeavesThePageFull() {
        let lifted = TabGridMotion.lifted(CGSize(width: 0, height: 30), islandAtTop: false, height: 800)
        XCTAssertEqual(TabGridMotion.transform(page(lifted), in: CGRect(x: 0, y: 0, width: 400, height: 800), card: nil).scale, 1)
    }

    func testALiftOpensWhenFarOrFlickedAndNotWhenHeadingBack() {
        XCTAssertTrue(TabGridMotion.liftOpens(travel: 60, predicted: 90))
        XCTAssertTrue(TabGridMotion.liftOpens(travel: 25, predicted: 200), "a quick flick")
        XCTAssertFalse(TabGridMotion.liftOpens(travel: 25, predicted: 50))
        XCTAssertFalse(TabGridMotion.liftOpens(travel: 120, predicted: 10), "the finger came back")
    }
}
