import XCTest
import WebKit
@testable import Blanc

/// M17: a quiet tab keeps its address and title and makes no web view until
/// it is shown.
final class QuietTabsTests: XCTestCase {
    private func dir() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("QuietTabsTests-\(UUID().uuidString)")
    }

    @MainActor func testQuietTabHasNoWebViewUntilWoken() {
        let url = URL(string: "https://quiet.test/page")!
        let tab = TabModel(url: url, title: "Saved", configuration: WKWebViewConfiguration(), quiet: true)
        XCTAssertTrue(tab.isQuiet)
        XCTAssertFalse(tab.hasWebView)
        XCTAssertNil(tab.existingWebView)
        XCTAssertEqual(tab.pageTitle, "Saved")
        XCTAssertEqual(tab.currentURL, url)
        tab.wake()
        XCTAssertFalse(tab.isQuiet)
        XCTAssertTrue(tab.hasWebView)
    }

    @MainActor func testRestoreMakesOnlyTheSelectedTabLive() throws {
        let sessionDir = dir()
        try FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        let saved: [String: Any] = ["urls": ["https://a.test/", "https://b.test/", "https://c.test/"], "activeIndex": 1]
        try JSONSerialization.data(withJSONObject: saved).write(to: sessionDir.appendingPathComponent("session.json"))
        let m = TabsManager(settingsDirectory: dir(), sessionDirectory: sessionDir)
        XCTAssertEqual(m.tabs.count, 3)
        XCTAssertEqual(m.tabs.map(\.hasWebView), [false, true, false])
        XCTAssertEqual(m.activeTab?.currentURL.absoluteString, "https://b.test/")
    }

    @MainActor func testSelectingAQuietTabWakesIt() {
        let m = TabsManager(settingsDirectory: dir(), sessionDirectory: dir())
        let id = m.createTab(url: URL(string: "https://later.test/")!, title: "Later", quiet: true)
        let tab = m.tabs.first { $0.id == id }!
        XCTAssertFalse(tab.hasWebView)
        XCTAssertNotEqual(m.activeTabId, id, "a quiet tab opens in the background")
        m.setActive(id)
        XCTAssertTrue(tab.hasWebView)
        XCTAssertFalse(tab.isQuiet)
    }

    @MainActor func testClosingAQuietTabKeepsItsAddressAndTitleForUndo() {
        let m = TabsManager(settingsDirectory: dir(), sessionDirectory: dir())
        let id = m.createTab(url: URL(string: "https://closed.test/")!, title: "Closed page", quiet: true)
        m.closeTab(id)
        XCTAssertEqual(m.lastClosed?.tab.currentURL.absoluteString, "https://closed.test/")
        XCTAssertEqual(m.lastClosed?.tab.pageTitle, "Closed page")
        m.expireUndo()
        XCTAssertEqual(m.reopenList.first, ReopenEntry(url: URL(string: "https://closed.test/")!, title: "Closed page"))
        XCTAssertFalse(m.tabs.contains { $0.hasWebView == false && $0.id == id })
    }
}
