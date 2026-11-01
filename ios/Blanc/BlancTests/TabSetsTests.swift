import XCTest
@testable import Blanc

/// M17: This iPhone and local Spaces, and saving them.
@MainActor final class TabSetsTests: XCTestCase {
    private var sessionDir: URL!
    private var settingsDir: URL!

    override func setUp() {
        super.setUp()
        sessionDir = FileManager.default.temporaryDirectory.appendingPathComponent("TabSets-\(UUID().uuidString)")
        settingsDir = FileManager.default.temporaryDirectory.appendingPathComponent("TabSets-\(UUID().uuidString)")
    }

    private func manager(_ urls: [String] = ["https://a.test/", "https://b.test/"]) -> TabsManager {
        let m = TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir)
        let first = m.tabs[0].id
        for url in urls { m.createTab(url: URL(string: url)!, title: url, quiet: true) }
        m.closeTab(first); m.expireUndo()
        return m
    }
    private func reopen() -> TabsManager { TabsManager(settingsDirectory: settingsDir, sessionDirectory: sessionDir) }
    private func hosts(_ m: TabsManager) -> [String] { m.tabs.filter { !$0.isPrivate }.map { $0.currentURL.host ?? "" } }

    func testSwitchingToASpaceAndBackKeepsThisIPhone() throws {
        let m = manager()
        let group = try m.createGroup(named: "G", with: m.tabs[1].id)
        m.setActive(m.tabs[1].id)
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.show(set: work)
        XCTAssertEqual(m.shownSetId, work)
        XCTAssertEqual(hosts(m), ["newtab"], "a new Space starts with a Start Page")
        XCTAssertTrue(m.groups.isEmpty)
        m.show(set: TabSets.iphoneId)
        XCTAssertEqual(hosts(m), ["a.test", "b.test"])
        XCTAssertEqual(m.groups.map(\.id), [group])
        XCTAssertEqual(m.activeTab?.currentURL.host, "b.test")
        XCTAssertEqual(m.tabs.map(\.hasWebView), [false, true], "only the selected tab of the shown set is live")
    }

    func testCreateSpaceWithATabMovesIt() throws {
        let m = manager()
        let tab = m.tabs[0].id
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase", withTab: tab)
        XCTAssertEqual(hosts(m), ["b.test"])
        m.show(set: work)
        XCTAssertEqual(hosts(m), ["a.test"])
        XCTAssertEqual(m.tabs[0].pageTitle, "https://a.test/")
    }

    func testPrivateTabsAreInNoSet() throws {
        let m = manager()
        let priv = m.createTab(isPrivate: true)
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.show(set: work)
        XCTAssertTrue(m.tabs.contains { $0.id == priv }, "a private tab stays open across a switch")
        m.flushSession()
        let data = try String(contentsOf: sessionDir.appendingPathComponent("session.json"), encoding: .utf8)
        XCTAssertFalse(data.contains("private=1"))
    }

    func testTwentySixthSpaceAndEmptyNamesAreRefused() throws {
        let m = manager()
        _ = try m.createSpace(name: "S0", color: "#426c4c", symbol: "star")
        XCTAssertThrowsError(try m.createSpace(name: "s0", color: "#426c4c", symbol: "star")) {
            XCTAssertEqual($0 as? SpaceError, .duplicateName, "names compare without case, as desktop's")
        }
        for i in 1..<25 { _ = try m.createSpace(name: "S\(i)", color: "#426c4c", symbol: "star") }
        XCTAssertThrowsError(try m.createSpace(name: "One more", color: "#426c4c", symbol: "star")) {
            XCTAssertEqual($0 as? SpaceError, .limit)
        }
        XCTAssertThrowsError(try m.createSpace(name: "  ", color: "#426c4c", symbol: "star"))
    }

    func testDeleteShownSpaceShowsThisIPhoneAndUndoRestoresIt() throws {
        let m = manager()
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase", withTab: m.tabs[0].id)
        m.show(set: work)
        m.deleteSpace(work)
        XCTAssertEqual(m.shownSetId, TabSets.iphoneId)
        XCTAssertEqual(hosts(m), ["b.test"])
        XCTAssertEqual(m.recentlyDeleted.map(\.space.name), ["Work"])
        m.undoDeleteSpace()
        XCTAssertEqual(m.spaces.map(\.name), ["Work"])
        XCTAssertEqual(m.shownSetId, work, "Undo also puts the person back in the Space")
        XCTAssertEqual(hosts(m), ["a.test"])
        XCTAssertTrue(m.recentlyDeleted.isEmpty)
    }

    func testRestoreIsRefusedWhenTheNameIsTaken() throws {
        let m = manager()
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.deleteSpace(work)
        _ = try m.createSpace(name: "work", color: "#376694", symbol: "star")
        XCTAssertFalse(m.restoreDeleted(work))
        XCTAssertEqual(m.recentlyDeleted.count, 1)
    }

    func testSpaceMarkShowsOnceASpaceExistsAndNeverOnAPrivateTab() throws {
        let m = manager()
        XCTAssertFalse(m.showsSpaceMark, "nothing before the first Space")
        _ = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        XCTAssertTrue(m.showsSpaceMark)
        m.createTab(isPrivate: true)
        XCTAssertFalse(m.showsSpaceMark)
    }

    func testEditAndReorderSpaces() throws {
        let m = manager()
        let a = try m.createSpace(name: "A", color: "#426c4c", symbol: "star")
        let b = try m.createSpace(name: "B", color: "#426c4c", symbol: "star")
        try m.updateSpace(a, name: "Alpha", color: "#376694", symbol: "book")
        XCTAssertEqual(m.spaces.first?.name, "Alpha")
        XCTAssertEqual(m.spaces.first?.color, "#376694")
        XCTAssertThrowsError(try m.updateSpace(a, name: nil, color: nil, symbol: "not-a-symbol"))
        m.moveSpace(b, by: -1)
        XCTAssertEqual(m.spaces.map(\.id), [b, a])
    }

    func testMoveTabToAnotherSet() throws {
        let m = manager()
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase")
        m.moveTab(m.tabs[1].id, toSpace: work)
        XCTAssertEqual(hosts(m), ["a.test"])
        m.moveTab(m.tabs[0].id, toSpace: work)
        XCTAssertEqual(hosts(m), ["a.test"], "the only tab can't leave")
        m.show(set: work)
        XCTAssertEqual(hosts(m), ["newtab", "b.test"])
        m.moveTab(m.tabs[1].id, toSpace: TabSets.iphoneId)
        m.show(set: TabSets.iphoneId)
        XCTAssertEqual(hosts(m), ["a.test", "b.test"])
    }

    // MARK: Session v2

    func testPreM17SessionOpensAsThisIPhone() throws {
        try FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: ["urls": ["https://a.test/", "https://b.test/"], "activeIndex": 1])
            .write(to: sessionDir.appendingPathComponent("session.json"))
        let m = reopen()
        XCTAssertEqual(m.shownSetId, TabSets.iphoneId)
        XCTAssertEqual(hosts(m), ["a.test", "b.test"])
        XCTAssertEqual(m.activeTab?.currentURL.host, "b.test")
    }

    func testSessionKeepsGroupsSpacesAndTheShownSet() throws {
        let m = manager()
        let group = try m.createGroup(named: "Reading", with: m.tabs[0].id)
        m.setGroupColor(group, "#6757a3")
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase", withTab: m.tabs[1].id)
        m.show(set: work)
        m.flushSession()
        let again = reopen()
        XCTAssertEqual(again.shownSetId, work)
        XCTAssertEqual(again.spaces.map(\.name), ["Work"])
        XCTAssertEqual(hosts(again), ["b.test"])
        again.show(set: TabSets.iphoneId)
        XCTAssertEqual(again.groups.map(\.name), ["Reading"])
        XCTAssertEqual(again.groups.first?.color, "#6757a3")
        XCTAssertEqual(again.tabs.first?.groupId, group)
    }

    func testRollbackMirrorFollowsTheShownSet() throws {
        let m = manager()
        let work = try m.createSpace(name: "Work", color: "#426c4c", symbol: "briefcase", withTab: m.tabs[1].id)
        m.show(set: work)
        m.flushSession()
        let raw = try JSONSerialization.jsonObject(with: Data(contentsOf: sessionDir.appendingPathComponent("session.json"))) as! [String: Any]
        XCTAssertEqual(raw["urls"] as? [String], ["https://b.test/"])
        XCTAssertEqual(raw["version"] as? Int, 2)
    }

    func testRecentlyDeletedExpiresAfterSevenDays() throws {
        let m = manager()
        let work = try m.createSpace(name: "Old", color: "#426c4c", symbol: "star")
        m.deleteSpace(work, now: Int64(Date().timeIntervalSince1970 * 1000) - TabSets.deletedRetentionMs - 1)
        m.flushSession()
        XCTAssertTrue(reopen().recentlyDeleted.isEmpty)
    }
}
