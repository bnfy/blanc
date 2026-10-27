import XCTest
@testable import Blanc

/// M11: a closed tab can be undone for five seconds, then reopened with /reopen.
@MainActor final class TabUndoTests: XCTestCase {
    private func manager() -> TabsManager {
        TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
    }
    private func open(_ m: TabsManager, _ host: String) -> TabModel {
        let id = m.createTab(url: URL(string: "https://\(host)/")!)
        return m.tabs.first { $0.id == id }!
    }

    func testUndoRestoresTheSameTabAtItsPlace() {
        let m = manager()
        let b = open(m, "b.example"), _ = open(m, "c.example")
        m.closeTab(b.id)
        XCTAssertEqual(m.lastClosed?.tab.id, b.id)
        m.undoClose()
        XCTAssertTrue(m.tabs[1] === b, "the same tab, with its page and history, back where it was")
        XCTAssertEqual(m.activeTabId, b.id)
        XCTAssertNil(m.lastClosed)
    }

    func testUndoAfterClosingTheLastTabRemovesTheBlank() {
        let m = manager()
        let only = m.tabs[0]
        m.closeTab(only.id)
        XCTAssertEqual(m.tabs.count, 1, "closing the last tab still opens a blank one")
        m.undoClose()
        XCTAssertEqual(m.tabs.map(\.id), [only.id], "undo puts it back and drops the unused blank")
    }

    func testPrivateCloseIsFinal() {
        let m = manager()
        let id = m.createTab(url: URL(string: "https://secret.example/")!, isPrivate: true)
        m.closeTab(id)
        XCTAssertNil(m.lastClosed)
        m.expireUndo()
        XCTAssertTrue(m.reopenList.isEmpty)
    }

    func testExpiredCloseGoesToTheReopenList() {
        let m = manager()
        let b = open(m, "b.example")
        b.pageTitle = "B"
        m.closeTab(b.id)
        m.expireUndo()
        XCTAssertNil(m.lastClosed)
        XCTAssertEqual(m.reopenList, [ReopenEntry(url: URL(string: "https://b.example/")!, title: "B")])
    }

    func testAnotherCloseExpiresTheFirst() {
        let m = manager()
        let b = open(m, "b.example"), c = open(m, "c.example")
        m.closeTab(b.id)
        m.closeTab(c.id)
        XCTAssertEqual(m.lastClosed?.tab.id, c.id, "only the newest close is undoable")
        XCTAssertEqual(m.reopenList.map(\.url.host), ["b.example"])
    }

    func testReopenListKeepsTen() {
        let m = manager()
        for i in 0..<12 {
            m.closeTab(open(m, "site\(i).example").id)
            m.expireUndo()
        }
        XCTAssertEqual(m.reopenList.count, 10)
        XCTAssertEqual(m.reopenList.first?.url.host, "site11.example")
    }

    func testReopenOpensTheNewestFirst() {
        let m = manager()
        m.closeTab(open(m, "b.example").id); m.expireUndo()
        m.closeTab(open(m, "c.example").id); m.expireUndo()
        XCTAssertTrue(m.reopenLast())
        XCTAssertEqual(m.activeTab?.currentURL.host, "c.example")
        XCTAssertEqual(m.reopenList.map(\.url.host), ["b.example"])
        XCTAssertTrue(m.reopenLast())
        XCTAssertFalse(m.reopenLast(), "nothing left to reopen")
    }

    func testTheUndoWindowEndsOnItsOwn() async throws {
        let m = manager()
        m.undoWindow = .milliseconds(50)
        m.closeTab(open(m, "b.example").id)
        // The expiry hops back to the main actor, and on a CI simulator the
        // main thread can stall for seconds while WebKit launches the new
        // tab's content process (#1184). Count turns, not wall-clock time, so
        // a stall doesn't spend the budget before the expiry gets its turn.
        var turns = 0
        while m.lastClosed != nil, turns < 250 {
            try await Task.sleep(for: .milliseconds(20))
            turns += 1
        }
        XCTAssertNil(m.lastClosed)
        XCTAssertEqual(m.reopenList.map(\.url.host), ["b.example"])
    }

    func testReopenCommand() {
        let m = manager()
        m.closeTab(open(m, "b.example").id); m.expireUndo()
        SlashCommand.available.first { $0.command == "/reopen" }?.execute(m)
        XCTAssertEqual(m.activeTab?.currentURL.host, "b.example")
    }

    func testNeighborFollowsTabOrder() {
        let m = manager()
        let first = m.tabs[0]
        let b = open(m, "b.example"), c = open(m, "c.example")
        XCTAssertTrue(m.neighbor(of: b.id, offset: 1) === c)
        XCTAssertTrue(m.neighbor(of: b.id, offset: -1) === first)
        XCTAssertNil(m.neighbor(of: c.id, offset: 1), "no wrap past the last tab")
        XCTAssertNil(m.neighbor(of: first.id, offset: -1), "no wrap before the first tab")
        XCTAssertNil(m.neighbor(of: nil, offset: 1))
    }

    func testReopenDuringTheUndoWindowRestoresTheLiveTab() {
        let m = manager()
        let b = open(m, "b.example"), _ = open(m, "c.example")
        m.closeTab(b.id)
        XCTAssertTrue(m.reopenLast())
        XCTAssertTrue(m.tabs.contains { $0 === b }, "the same tab, not a fresh load of its address")
        XCTAssertNil(m.lastClosed)
        XCTAssertTrue(m.reopenList.isEmpty)
    }
}
