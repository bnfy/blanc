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
}
