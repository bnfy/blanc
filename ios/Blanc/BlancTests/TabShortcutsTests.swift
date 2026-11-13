import XCTest
@testable import Blanc

/// Hardware-keyboard shortcuts (D7): ⌘1–9, next and previous tab, and zoom.
final class TabShortcutsTests: XCTestCase {
    private func item(_ id: String, _ group: String? = nil, pinned: Bool = false) -> TabSections.Item {
        TabSections.Item(id: id, groupId: group, pinned: pinned)
    }

    func testWithoutGroupsNumbersAreTabsAndNineIsTheLast() {
        let items = ["a", "b", "c"].map { item($0) }
        XCTAssertEqual(TabShortcuts.target(number: 1, items: items, splits: []), .tab("a"))
        XCTAssertEqual(TabShortcuts.target(number: 3, items: items, splits: []), .tab("c"))
        XCTAssertNil(TabShortcuts.target(number: 4, items: items, splits: []))
        XCTAssertEqual(TabShortcuts.target(number: 9, items: items, splits: []), .tab("c"))
        XCTAssertNil(TabShortcuts.target(number: 0, items: items, splits: []))
    }

    func testASplitCountsOnce() {
        let items = ["a", "b", "c"].map { item($0) }
        XCTAssertEqual(TabShortcuts.target(number: 2, items: items, splits: [["a", "b"]]), .tab("c"))
    }

    func testWithGroupsNumbersAreClustersPinsFirst() {
        let items = [item("p", pinned: true), item("g1", "G"), item("g2", "G"), item("u1"), item("u2")]
        XCTAssertEqual(TabShortcuts.target(number: 1, items: items, splits: []), .tab("p"))
        XCTAssertEqual(TabShortcuts.target(number: 2, items: items, splits: []), .group("G"))
        XCTAssertEqual(TabShortcuts.target(number: 3, items: items, splits: []), .tab("u1"))
        XCTAssertNil(TabShortcuts.target(number: 4, items: items, splits: []))
    }

    func testZoomSteps() {
        XCTAssertEqual(TabShortcuts.zoom(from: 1, step: 1), 1.1)
        XCTAssertEqual(TabShortcuts.zoom(from: 1, step: -1), 0.9)
        XCTAssertEqual(TabShortcuts.zoom(from: 3, step: 1), 3)
        XCTAssertEqual(TabShortcuts.zoom(from: 0.5, step: -1), 0.5)
        XCTAssertEqual(TabShortcuts.zoom(from: 1.3, step: -1), 1.25)
        XCTAssertEqual(TabShortcuts.zoom(from: 2.5, step: 0), 1)
    }
}

@MainActor final class KeyboardShortcutManagerTests: XCTestCase {
    private func manager() -> TabsManager {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("Shortcuts-\(UUID().uuidString)")
        let m = TabsManager(settingsDirectory: dir, sessionDirectory: dir)
        let first = m.tabs[0].id
        for url in ["https://a.test/", "https://b.test/", "https://c.test/"] { m.createTab(url: URL(string: url)!, quiet: true) }
        m.closeTab(first); m.expireUndo()
        m.setActive(m.tabs[0].id)
        return m
    }

    func testNextAndPreviousTabWrap() {
        let m = manager()
        m.cycleTab(by: -1)
        XCTAssertEqual(m.activeTab?.currentURL.host, "c.test")
        m.cycleTab(by: 1)
        XCTAssertEqual(m.activeTab?.currentURL.host, "a.test")
    }

    func testCommandNumberShowsAGroupUnfolded() throws {
        let m = manager()
        let group = try m.createGroup(named: "G", with: m.tabs[1].id)
        m.setGroupCollapsed(group, true)
        m.selectTab(number: 2)
        XCTAssertEqual(m.activeTab?.groupId, group)
        XCTAssertEqual(m.groups.first?.collapsed, false)
    }
}
