import XCTest
@testable import Blanc

/// M17: making, naming, colouring and closing tab groups on the phone.
@MainActor final class TabGroupsTests: XCTestCase {
    private func manager(_ urls: [String] = ["https://a.test/", "https://b.test/", "https://c.test/"]) -> TabsManager {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("TabGroupsTests-\(UUID().uuidString)")
        let m = TabsManager(settingsDirectory: dir, sessionDirectory: dir)
        let first = m.tabs[0].id
        for url in urls { m.createTab(url: URL(string: url)!, quiet: true) }
        m.closeTab(first); m.expireUndo()
        return m
    }
    private func hosts(_ m: TabsManager) -> [String] { m.tabs.map { $0.currentURL.host ?? "" } }

    func testCreateAndRenameKeepTheTypedCase() throws {
        let m = manager()
        let id = try m.createGroup(named: "  Research ", with: m.tabs[1].id)
        XCTAssertEqual(m.groups.map(\.name), ["Research"])
        XCTAssertEqual(m.tabs[1].groupId, id)
        try m.renameGroup(id, to: "iOS notes")
        XCTAssertEqual(m.group(matching: "IOS NOTES")?.id, id)
    }

    func testNamesDifferingOnlyByCaseAreTheSameGroup() throws {
        let m = manager()
        _ = try m.createGroup(named: "Research", with: m.tabs[0].id)
        XCTAssertThrowsError(try m.createGroup(named: "research", with: m.tabs[1].id)) {
            XCTAssertEqual($0 as? GroupNameError, .duplicate)
        }
        XCTAssertThrowsError(try m.createGroup(named: "   ", with: m.tabs[1].id)) {
            XCTAssertEqual($0 as? GroupNameError, .empty)
        }
        XCTAssertThrowsError(try m.createGroup(named: "", with: m.tabs[1].id))
    }

    func testGroupMembersStayTogetherAndEmptyGroupsGo() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[0].id)
        m.moveTab(m.tabs[2].id, toGroup: id)
        XCTAssertEqual(hosts(m), ["a.test", "c.test", "b.test"])
        m.moveTab(m.tabs[0].id, toGroup: nil)
        m.moveTab(m.tabs.first { $0.groupId == id }!.id, toGroup: nil)
        XCTAssertTrue(m.groups.isEmpty)
    }

    func testRemoveFromGroupLandsBelowTheGroup() throws {
        let m = manager(["https://a.test/", "https://b.test/", "https://c.test/", "https://d.test/"])
        let id = try m.createGroup(named: "G", with: m.tabs[0].id)
        m.moveTab(m.tabs[1].id, toGroup: id)
        m.moveTab(m.tabs[2].id, toGroup: id)
        m.moveTab(m.tabs[0].id, toGroup: nil)
        XCTAssertEqual(hosts(m), ["b.test", "c.test", "a.test", "d.test"])
    }

    func testNewTabsAndPrivateTabsStayUngrouped() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[0].id)
        m.setActive(m.tabs[0].id)
        let plain = m.createTab()
        XCTAssertNil(m.tabs.first { $0.id == plain }?.groupId)
        let priv = m.createTab(isPrivate: true)
        m.moveTab(priv, toGroup: id)
        XCTAssertNil(m.tabs.first { $0.id == priv }?.groupId)
        let inGroup = m.newTab(inGroup: id)
        XCTAssertEqual(m.tabs.first { $0.id == inGroup }?.groupId, id)
    }

    func testColourIsAPresetOrNone() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[0].id)
        m.setGroupColor(id, "#376694")
        XCTAssertEqual(m.groups.first?.color, "#376694")
        m.setGroupColor(id, "#123456")
        XCTAssertEqual(m.groups.first?.color, "#376694", "only a preset is accepted")
        m.setGroupColor(id, nil)
        XCTAssertNil(m.groups.first?.color)
    }

    func testCloseGroupIsOneUndo() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[0].id)
        m.moveTab(m.tabs[2].id, toGroup: id)
        m.setGroupColor(id, "#426c4c")
        m.closeGroup(id)
        XCTAssertEqual(hosts(m), ["b.test"])
        XCTAssertTrue(m.groups.isEmpty)
        m.undoClose()
        XCTAssertEqual(hosts(m), ["a.test", "c.test", "b.test"])
        XCTAssertEqual(m.groups.map(\.name), ["G"])
        XCTAssertEqual(m.groups.first?.color, "#426c4c")
    }

    func testClosingTheLastMemberDropsTheGroup() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[1].id)
        m.closeTab(m.tabs[1].id)
        XCTAssertNil(m.groups.first { $0.id == id })
        m.undoClose()
        XCTAssertEqual(m.tabs[1].groupId, id, "Undo brings the group back with its last tab")
        XCTAssertEqual(m.groups.map(\.name), ["G"])
    }

    func testUngroupAndCollapse() throws {
        let m = manager()
        let id = try m.createGroup(named: "G", with: m.tabs[1].id)
        m.setGroupCollapsed(id, true)
        XCTAssertEqual(m.groups.first?.collapsed, true)
        m.ungroup(id)
        XCTAssertTrue(m.groups.isEmpty)
        XCTAssertTrue(m.tabs.allSatisfy { $0.groupId == nil })
    }
}
