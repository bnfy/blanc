import XCTest
import WebKit
@testable import Blanc

final class TabHistoryStoreTests: XCTestCase {
    private func folder() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testATabGetsItsOwnList() {
        let store = TabHistoryStore(directory: folder())
        store.save(Data([1, 2, 3]), id: "one")
        store.save(Data([4]), id: "two")
        XCTAssertEqual(store.state(id: "one"), Data([1, 2, 3]))
        XCTAssertEqual(store.state(id: "two"), Data([4]))
        XCTAssertNil(store.state(id: "three"))
    }

    func testAnOversizedListClearsTheOldOne() {
        let store = TabHistoryStore(directory: folder())
        store.save(Data([1]), id: "one")
        store.save(Data(count: TabHistoryStore.maxBytes + 1), id: "one")
        XCTAssertNil(store.state(id: "one"))
    }

    func testKeepOnlyDropsClosedTabs() {
        let store = TabHistoryStore(directory: folder())
        store.save(Data([1]), id: "one")
        store.save(Data([2]), id: "two")
        store.keepOnly(["two"])
        XCTAssertNil(store.state(id: "one"))
        XCTAssertEqual(store.state(id: "two"), Data([2]))
    }

    func testRemoveAllForgetsEverything() {
        let store = TabHistoryStore(directory: folder())
        store.save(Data([1]), id: "one")
        store.removeAll()
        XCTAssertNil(store.state(id: "one"))
    }

    /// An id from a saved file can't reach outside the folder, and the folder
    /// stays out of iCloud and computer backups.
    func testTheFolderIsContainedAndSkipsBackups() throws {
        let parent = folder()
        TabHistoryStore(directory: parent).save(Data([1]), id: "../escape")
        let history = parent.appendingPathComponent("tab-history")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: history.path).count, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: parent.appendingPathComponent("escape").path))
        XCTAssertEqual(try history.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
    }

    /// What a shared Space sends never carries the local id.
    func testASharedSpaceNeverSendsTheId() {
        let tab = SavedTab(url: "https://example.com/", title: "Example", historyId: "local-history-id")
        let edits = SharedSpacesAdapter.localEdits(set: SavedSet(tabs: [tab]), spaceId: "space", baseline: nil,
                                                   accepted: nil, deviceId: "device", now: 1)
        let sent = String(describing: edits)
        XCTAssertTrue(sent.contains("example.com"), "the tab itself was written")
        XCTAssertFalse(sent.contains("local-history-id"))
    }

    /// A relaunched tab goes back again, and coming back isn't a new visit.
    @MainActor func testAQuietTabWakesWithItsListAndRecordsNoVisit() async throws {
        let pages = folder()
        try FileManager.default.createDirectory(at: pages, withIntermediateDirectories: true)
        let one = pages.appendingPathComponent("one.html"), two = pages.appendingPathComponent("two.html")
        try Data("<title>One</title>".utf8).write(to: one)
        try Data("<title>Two</title>".utf8).write(to: two)

        let first = TabModel(url: one, configuration: WKWebViewConfiguration(), load: false)
        first.webView.loadFileURL(one, allowingReadAccessTo: pages)
        try await waitUntil { first.webView.url == one && !first.webView.isLoading }
        first.webView.loadFileURL(two, allowingReadAccessTo: pages)
        try await waitUntil { first.webView.url == two && !first.webView.isLoading && first.webView.canGoBack }
        let state = try XCTUnwrap(first.webView.interactionState as? Data)

        let restored = TabModel(url: two, configuration: WKWebViewConfiguration(), quiet: true)
        var visits: [URL] = []
        restored.navigationDelegate.onVisit = { url, _ in visits.append(url) }
        restored.wake(history: state)
        try await waitUntil { restored.canGoBack && !restored.webView.isLoading }
        XCTAssertEqual(restored.webView.url, two)
        XCTAssertEqual(restored.webView.backForwardList.backItem?.url, one)
        XCTAssertEqual(visits, [])
    }

    /// A list from a different page is ignored: the tab still opens its own.
    @MainActor func testAListThatEndsElsewhereLoadsTheTabsOwnPage() async throws {
        let tab = TabModel(url: URL(string: "about:blank")!, configuration: WKWebViewConfiguration(), quiet: true)
        tab.wake(history: Data([0, 1, 2]))
        try await waitUntil { !tab.webView.isLoading }
        XCTAssertEqual(tab.webView.url, URL(string: "about:blank"))
    }

    /// Two pages in a manager's tab, so it has something to go back to.
    @MainActor private func browse(_ tab: TabModel) async throws -> URL {
        let pages = folder()
        try FileManager.default.createDirectory(at: pages, withIntermediateDirectories: true)
        let one = pages.appendingPathComponent("one.html"), two = pages.appendingPathComponent("two.html")
        try Data("<title>One</title>".utf8).write(to: one)
        try Data("<title>Two</title>".utf8).write(to: two)
        tab.webView.loadFileURL(one, allowingReadAccessTo: pages)
        try await waitUntil { tab.webView.url == one && !tab.webView.isLoading }
        tab.webView.loadFileURL(two, allowingReadAccessTo: pages)
        try await waitUntil { tab.currentURL == two && !tab.webView.isLoading && tab.webView.canGoBack }
        return two
    }

    @MainActor func testAnOrdinaryTabIsSavedAndAPrivateOneNever() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        let ordinaryId = m.createTab()
        let ordinary = m.tabs.first { $0.id == ordinaryId }!
        _ = try await browse(ordinary)
        let privateId = m.createTab(isPrivate: true)
        let hidden = m.tabs.first { $0.id == privateId }!
        _ = try await browse(hidden)
        m.saveTabHistories()
        XCTAssertNotNil(m.services.tabHistory.state(id: ordinary.historyId))
        XCTAssertNil(m.services.tabHistory.state(id: hidden.historyId))
    }

    /// After clearing, a list still in memory never reaches the disk again.
    @MainActor func testForgettingDeletesListsAndStopsSavingOpenTabs() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        let id = m.createTab()
        let tab = m.tabs.first { $0.id == id }!
        _ = try await browse(tab)
        m.saveTabHistories()
        m.services.forgetTabHistories()
        XCTAssertNil(m.services.tabHistory.state(id: tab.historyId))
        m.saveTabHistories()
        XCTAssertNil(m.services.tabHistory.state(id: tab.historyId))
    }

    /// A tab waiting on Undo when the person clears can't bring its list back.
    @MainActor func testForgettingCoversATabWaitingOnUndo() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        m.services.register(m)
        let id = m.createTab()
        let tab = m.tabs.first { $0.id == id }!
        _ = try await browse(tab)
        m.closeTab(id)
        m.services.forgetTabHistories()
        XCTAssertFalse(tab.savesHistory)
    }

    /// Closing a tab takes its list with it at the next save.
    @MainActor func testAClosedTabsListGoes() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        let id = m.createTab()
        let tab = m.tabs.first { $0.id == id }!
        _ = try await browse(tab)
        m.services.register(m)
        m.services.saveTabHistories()
        XCTAssertNotNil(m.services.tabHistory.state(id: tab.historyId))
        m.closeTab(id)
        m.services.saveSession()
        m.services.saveTabHistories()
        XCTAssertNil(m.services.tabHistory.state(id: tab.historyId))
    }

    /// Two tabs on one address keep their own lists.
    @MainActor func testTabsOnTheSameAddressKeepSeparateLists() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        let firstId = m.createTab(), secondId = m.createTab()
        let first = m.tabs.first { $0.id == firstId }!, second = m.tabs.first { $0.id == secondId }!
        _ = try await browse(first)
        m.saveTabHistories()
        XCTAssertNotNil(m.services.tabHistory.state(id: first.historyId))
        XCTAssertNil(m.services.tabHistory.state(id: second.historyId))
    }

    /// A Start Page comes back fresh, whatever list its web view holds.
    @MainActor func testAStartPageSavesNoList() async throws {
        let m = TabsManager(settingsDirectory: folder(), sessionDirectory: folder())
        let id = m.createTab()
        let tab = m.tabs.first { $0.id == id }!
        _ = try await browse(tab)
        tab.currentURL = TabsManager.newTabURL
        m.saveTabHistories()
        XCTAssertNil(m.services.tabHistory.state(id: tab.historyId))
    }

    /// The id comes back with the tab after a relaunch.
    @MainActor func testATabKeepsItsHistoryIdAcrossARelaunch() throws {
        let session = folder(), settings = folder()
        let m = TabsManager(settingsDirectory: settings, sessionDirectory: session)
        let id = m.createTab(url: URL(string: "https://example.com/")!, quiet: true)
        let historyId = m.tabs.first { $0.id == id }!.historyId
        m.services.register(m)
        m.services.saveSession()
        m.services.sessionStore.flush()
        let next = TabsManager(settingsDirectory: settings, sessionDirectory: session)
        XCTAssertTrue(next.tabs.contains { $0.historyId == historyId })
    }

    /// The id never changes what a tab is, and never reaches a shared record.
    func testTheIdIsNotPartOfATabsValue() {
        let plain = SavedTab(url: "https://example.com/", title: "Example")
        var marked = plain
        marked.historyId = "local"
        XCTAssertEqual(plain, marked)
    }
}
