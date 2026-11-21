import XCTest
@testable import Blanc

final class IslandDotsTests: XCTestCase {
    private func tab(_ group: String? = nil, pinned: Bool = false, isPrivate: Bool = false) -> IslandDots.Tab {
        IslandDots.Tab(id: UUID(), groupId: group, pinned: pinned, isPrivate: isPrivate)
    }

    private var runs: [IslandDots.Tab] { [tab(), tab(), tab("G"), tab("G"), tab()] }

    func testUngroupedRunAroundTheActiveTab() throws {
        let tabs = runs
        let row = try XCTUnwrap(IslandDots.row(tabs, activeId: tabs[1].id))
        XCTAssertEqual(row.dots.map(\.id), tabs[0...1].map(\.id))
        XCTAssertNil(row.groupId)
        XCTAssertEqual(row.position, 2)
        XCTAssertEqual(row.count, 2)
    }

    func testGroupSection() throws {
        let tabs = runs
        let row = try XCTUnwrap(IslandDots.row(tabs, activeId: tabs[2].id))
        XCTAssertEqual(row.dots.map(\.id), tabs[2...3].map(\.id))
        XCTAssertEqual(row.groupId, "G")
    }

    func testAGroupBetweenRunsSplitsThem() {
        let tabs = runs
        XCTAssertNil(IslandDots.row(tabs, activeId: tabs[4].id))
    }

    func testALoneTabHasNoDots() {
        let a = tab()
        XCTAssertNil(IslandDots.row([a], activeId: a.id))
    }

    func testUngroupedPinsAreTheirOwnSection() {
        let tabs = [tab(pinned: true), tab(pinned: true), tab(), tab()]
        XCTAssertEqual(IslandDots.row(tabs, activeId: tabs[1].id)?.dots.map(\.id), tabs[0...1].map(\.id))
    }

    func testManyTabsShowAWindowAroundTheActiveTab() throws {
        let tabs = (0..<20).map { _ in tab() }
        let row = try XCTUnwrap(IslandDots.row(tabs, activeId: tabs[10].id))
        XCTAssertEqual(row.dots.map(\.id), tabs[7...12].map(\.id))
        XCTAssertEqual(row.dots.map(\.isActive), [false, false, false, true, false, false])
        XCTAssertEqual(row.overflow, 14)
        XCTAssertEqual(row.position, 11)
        XCTAssertEqual(row.count, 20)
        XCTAssertEqual(IslandDots.row(tabs, activeId: tabs[0].id)?.dots.map(\.id), tabs[0...5].map(\.id))
        XCTAssertEqual(IslandDots.row(tabs, activeId: tabs[19].id)?.dots.map(\.id), tabs[14...19].map(\.id))
    }

    func testPrivateDotsFollowTheirOwnTab() {
        let tabs = [tab(isPrivate: true), tab()]
        XCTAssertEqual(IslandDots.row(tabs, activeId: tabs[1].id)?.dots.map(\.isPrivate), [true, false])
    }
}
