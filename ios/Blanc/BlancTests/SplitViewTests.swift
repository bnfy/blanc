import XCTest
@testable import Blanc

/// Split View (F53): the pure rules ported from desktop's split-model.js.
final class SplitModelTests: XCTestCase {
    private let a = UUID(), b = UUID(), c = UUID(), d = UUID()

    func testCreateLeadsWithTheInitiatorAtEqualHalves() {
        let split = SplitModel.create(initiator: a, other: b)
        XCTAssertEqual(split.tabIds, [a, b])
        XCTAssertEqual(split.ratio, 0.5)
        XCTAssertTrue(split.id.hasPrefix("split-"))
    }

    func testRemovingATabFromTwoPanesDissolves() {
        let split = SplitModel.create(initiator: a, other: b)
        let result = SplitModel.remove(split, tabId: a)
        XCTAssertNil(result.split)
        XCTAssertEqual(result.dissolved, [b])
        XCTAssertEqual(SplitModel.remove(split, tabId: c).split, split)
    }

    func testOrderKeepsMembersTogetherWhereTheFirstSits() {
        let split = TabSplit(id: "s", tabIds: [a, c], ratio: 0.5)
        XCTAssertEqual(SplitModel.normalizeOrder([a, b, c, d], splits: [split]), [a, c, b, d])
        XCTAssertEqual(SplitModel.normalizeOrder([b, c, d, a], splits: [split]), [b, a, c, d])
        let once = SplitModel.normalizeOrder([b, c, d, a], splits: [split])
        XCTAssertEqual(SplitModel.normalizeOrder(once, splits: [split]), once)
    }

    func testRatioStaysUsable() {
        XCTAssertEqual(SplitModel.clampRatio(0.05), 0.2)
        XCTAssertEqual(SplitModel.clampRatio(0.95), 0.8)
        XCTAssertEqual(SplitModel.clampRatio(.nan), 0.5)
        let widths = SplitModel.paneWidths(0.5, width: 808, gap: 8)
        XCTAssertEqual(widths.leading, 400)
        XCTAssertEqual(widths.trailing, 400)
    }

    func testCaptureDropsSplitsWithoutTwoSavedTabs() {
        let kept = TabSplit(id: "kept", tabIds: [a, b], ratio: 0.3)
        let privateOne = TabSplit(id: "private", tabIds: [c, d], ratio: 0.5)
        let columns = SplitModel.capture([kept, privateOne], saved: [a, b, c])
        XCTAssertEqual(columns.splits, [SavedSplit(id: "kept", ratio: 0.3)])
        XCTAssertEqual(columns.splitIds, ["kept", "kept", nil])
    }

    func testRestoreRebuildsAndRefusesColumnsThatDontLineUp() {
        let saved = [SavedSplit(id: "s", ratio: 0.4), SavedSplit(id: "lonely", ratio: 0.5)]
        let splits = SplitModel.restore(saved, splitIds: ["s", nil, "s", "lonely"], restored: [a, b, c, d])
        XCTAssertEqual(splits, [TabSplit(id: "s", tabIds: [a, c], ratio: 0.4)])
        XCTAssertEqual(SplitModel.restore(saved, splitIds: ["s", "s"], restored: [a, b, c]), [])
        XCTAssertEqual(SplitModel.restore(nil, splitIds: nil, restored: [a]), [])
    }
}

/// Split View on the tab model: making, closing, Undo, groups and the session.
@MainActor final class SplitViewTests: XCTestCase {
    private func manager(_ urls: [String] = ["https://a.test/", "https://b.test/", "https://c.test/"],
                         directory: URL? = nil) -> TabsManager {
        let dir = directory ?? FileManager.default.temporaryDirectory.appendingPathComponent("SplitViewTests-\(UUID().uuidString)")
        let m = TabsManager(settingsDirectory: dir, sessionDirectory: dir)
        let first = m.tabs[0].id
        for url in urls { m.createTab(url: URL(string: url)!, quiet: true) }
        m.closeTab(first); m.expireUndo()
        return m
    }
    private func hosts(_ m: TabsManager) -> [String] { m.tabs.map { $0.currentURL.host ?? "" } }

    func testMakingASplitPutsTheTabsTogetherAndFocusesTheInitiator() {
        let m = manager()
        let (a, c) = (m.tabs[0], m.tabs[2])
        m.makeSplit(a.id, with: c.id)
        XCTAssertEqual(m.splits.map(\.tabIds), [[a.id, c.id]])
        XCTAssertEqual(hosts(m), ["a.test", "c.test", "b.test"])
        XCTAssertEqual(m.activeTabId, a.id)
        XCTAssertEqual(m.activeSplit?.tabIds, [a.id, c.id])
        XCTAssertFalse(c.isQuiet, "a pane beside the current tab loads")
        // A tab in a split can't join another.
        XCTAssertTrue(m.splitCandidates(for: a).isEmpty)
        XCTAssertEqual(m.splitCandidates(for: m.tabs[2]).map(\.id), [])
    }

    func testPrivateTabsSplitOnlyWithPrivateTabs() {
        let m = manager()
        m.createTab(isPrivate: true)
        let secret = m.tabs.first(where: \.isPrivate)!
        XCTAssertTrue(m.splitCandidates(for: secret).isEmpty)
        XCTAssertFalse(m.splitCandidates(for: m.tabs[0]).contains { $0.isPrivate })
    }

    func testTheOtherTabTakesTheInitiatorsGroup() throws {
        let m = manager()
        let group = try m.createGroup(named: "Research", with: m.tabs[0].id)
        let c = m.tabs.first { $0.currentURL.host == "c.test" }!
        m.makeSplit(m.tabs[0].id, with: c.id)
        XCTAssertEqual(c.groupId, group)
        XCTAssertEqual(m.splits.count, 1)
    }

    func testSplitMovesIntoAndOutOfAGroupAsOne() throws {
        let m = manager(["https://a.test/", "https://b.test/", "https://c.test/", "https://d.test/"])
        let group = try m.createGroup(named: "G", with: m.tabs[3].id)
        let (a, b) = (m.tabs[0], m.tabs[1])
        m.makeSplit(a.id, with: b.id)
        m.moveTab(b.id, toGroup: group)
        XCTAssertEqual([a.groupId, b.groupId], [group, group])
        XCTAssertEqual(hosts(m), ["c.test", "d.test", "a.test", "b.test"])
        XCTAssertEqual(m.splits.count, 1)
        m.moveTab(a.id, toGroup: nil)
        XCTAssertEqual([a.groupId, b.groupId], [nil, nil])
        XCTAssertEqual(hosts(m), ["c.test", "d.test", "a.test", "b.test"])
        XCTAssertEqual(m.splits.count, 1)
    }

    func testClosingAPaneEndsTheSplitAndUndoBringsItBack() {
        let m = manager()
        let (a, b) = (m.tabs[0], m.tabs[1])
        m.makeSplit(a.id, with: b.id)
        m.closeTab(a.id)
        XCTAssertTrue(m.splits.isEmpty)
        XCTAssertEqual(m.activeTabId, b.id, "the other pane stays current")
        m.undoClose()
        XCTAssertEqual(m.splits.map(\.tabIds), [[a.id, b.id]])
        XCTAssertEqual(m.activeTabId, a.id)
    }

    func testCloseSplitClosesBothAsOneUndo() {
        let m = manager()
        let (a, b) = (m.tabs[0], m.tabs[1])
        m.makeSplit(a.id, with: b.id)
        m.closeSplit(m.splits[0].id)
        XCTAssertEqual(hosts(m), ["c.test"])
        XCTAssertTrue(m.splits.isEmpty)
        m.undoClose()
        XCTAssertEqual(hosts(m), ["a.test", "b.test", "c.test"])
        XCTAssertEqual(m.splits.map(\.tabIds), [[a.id, b.id]])
    }

    func testRemoveFromSplitKeepsBothTabsOpen() {
        let m = manager()
        let (a, b) = (m.tabs[0], m.tabs[1])
        m.makeSplit(a.id, with: b.id)
        m.removeFromSplit(b.id)
        XCTAssertTrue(m.splits.isEmpty)
        XCTAssertEqual(hosts(m), ["a.test", "b.test", "c.test"])
    }

    func testDividerRatioIsKeptWithinBounds() {
        let m = manager()
        m.makeSplit(m.tabs[0].id, with: m.tabs[1].id)
        m.setSplitRatio(m.splits[0].id, 0.01)
        XCTAssertEqual(m.splits[0].ratio, 0.2)
    }

    func testSplitsComeBackAfterARelaunch() {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("SplitViewTests-\(UUID().uuidString)")
        let m = manager(directory: dir)
        let c = m.tabs[2]
        m.makeSplit(m.tabs[0].id, with: c.id)
        m.setSplitRatio(m.splits[0].id, 0.35)
        m.flushSession()
        let again = TabsManager(settingsDirectory: dir, sessionDirectory: dir)
        XCTAssertEqual(again.splits.count, 1)
        XCTAssertEqual(again.splits[0].ratio, 0.35)
        XCTAssertEqual(again.splits[0].tabIds.compactMap { id in again.tabs.first { $0.id == id }?.currentURL.host },
                       ["a.test", "c.test"])
    }

    func testASpaceKeepsItsSplitWhileAnotherShows() throws {
        let m = manager()
        m.makeSplit(m.tabs[0].id, with: m.tabs[1].id)
        let space = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.show(set: space)
        XCTAssertTrue(m.splits.isEmpty)
        m.show(set: TabSets.iphoneId)
        XCTAssertEqual(m.splits.count, 1)
        XCTAssertEqual(m.splits[0].tabIds.compactMap { id in m.tabs.first { $0.id == id }?.currentURL.host },
                       ["a.test", "b.test"])
    }

    func testMovingAPaneToASpaceEndsTheSplit() throws {
        let m = manager()
        m.makeSplit(m.tabs[0].id, with: m.tabs[1].id)
        let space = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.show(set: TabSets.iphoneId)
        m.moveTab(m.tabs[1].id, toSpace: space)
        XCTAssertTrue(m.splits.isEmpty)
    }
}
