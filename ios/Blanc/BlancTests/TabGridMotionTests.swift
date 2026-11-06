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

    /// A page wider than tall fills its card by height, as its picture does.
    func testAWidePageFillsItsCardLikeItsPicture() {
        let wide = CGRect(x: 0, y: 0, width: 1200, height: 900)
        let card = CGRect(x: 100, y: 200, width: 240, height: 240)
        let t = TabGridMotion.transform(.card, in: wide, card: card)
        XCTAssertEqual(t.scale, 240.0 / 900.0, accuracy: 0.001)
        XCTAssertEqual(wide.midX + t.offset.width, card.midX, accuracy: 0.001)
        XCTAssertEqual(wide.midY + t.offset.height - wide.height * t.scale / 2, card.minY, accuracy: 0.001)
    }

    /// Blanc's own pages are pictured from their middle.
    func testACenteredPageLandsOnTheCardsMiddle() {
        let card = CGRect(x: 220, y: 300, width: 160, height: 160)
        let t = TabGridMotion.transform(.card, in: screen, card: card, centered: true)
        XCTAssertEqual(screen.midY + t.offset.height, card.midY, accuracy: 0.001)
    }

    /// A split's panes shrink as one around the page area's center.
    func testPanesShrinkTogetherAroundTheCenter() {
        let area = CGRect(x: 0, y: 0, width: 1000, height: 800)
        let left = CGRect(x: 0, y: 0, width: 500, height: 800), right = CGRect(x: 500, y: 0, width: 500, height: 800)
        let page = TabGridMotion.Page.pinching(scale: 0.5, translation: .zero)
        let a = TabGridMotion.transform(page, pane: left, in: area, card: nil)
        let b = TabGridMotion.transform(page, pane: right, in: area, card: nil)
        // Their inner edges still meet, at the center.
        XCTAssertEqual(left.midX + a.offset.width + left.width * a.scale / 2, area.midX, accuracy: 0.001)
        XCTAssertEqual(right.midX + b.offset.width - right.width * b.scale / 2, area.midX, accuracy: 0.001)
    }

    func testEachPaneLandsOnItsOwnCard() {
        let area = CGRect(x: 0, y: 0, width: 1000, height: 800)
        let right = CGRect(x: 500, y: 0, width: 500, height: 800)
        let card = CGRect(x: 300, y: 100, width: 200, height: 200)
        let t = TabGridMotion.transform(.card, pane: right, in: area, card: card)
        XCTAssertEqual(t.scale, 0.4, accuracy: 0.001)
        XCTAssertEqual(right.midX + t.offset.width, card.midX, accuracy: 0.001)
    }

    func testProgressRunsFromThePageToItsCard() {
        XCTAssertEqual(TabGridMotion.progress(.full), 0)
        XCTAssertEqual(TabGridMotion.progress(.pinching(scale: 0.75, translation: .zero)), 0.5, accuracy: 0.001)
        XCTAssertEqual(TabGridMotion.progress(.card), 1)
    }

    func testOnePaneFillsTheAreaAndTwoShareIt() {
        let layout = SplitPaneLayout(ratio: 0.5, inset: 8, gap: 8)
        let area = CGRect(x: 0, y: 0, width: 1000, height: 800)
        XCTAssertEqual(layout.frames(in: area, count: 1), [area])
        let two = layout.frames(in: area, count: 2)
        XCTAssertEqual(two[0].minX, 8)
        XCTAssertEqual(two[1].maxX, 992, accuracy: 0.001)
        XCTAssertEqual(two[1].minX - two[0].maxX, 8, accuracy: 0.001)
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
