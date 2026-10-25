import XCTest
import WebKit
@testable import Blanc

final class TabsManagerTests: XCTestCase {
    private func tmpDir() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("TabsManagerTests-\(UUID().uuidString)")
    }

    private func makeManager(settingsDir: URL? = nil, sessionDir: URL? = nil) -> TabsManager {
        TabsManager(
            settingsDirectory: settingsDir ?? tmpDir(),
            sessionDirectory: sessionDir ?? tmpDir()
        )
    }

    @MainActor func testToggleFavoriteFlipsState() {
        let m = makeManager()
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://example.com/")!
        tab.pageTitle = "Example"
        XCTAssertFalse(m.isFavorite(tab))
        m.toggleFavorite(tab)
        XCTAssertTrue(m.isFavorite(tab))
        XCTAssertEqual(m.syncEngine.favorites.map(\.title), ["Example"])
        m.toggleFavorite(tab)
        XCTAssertFalse(m.isFavorite(tab))
    }

    @MainActor func testVisitsRecordHistory() {
        let m = makeManager()
        let tab = m.activeTab!
        // The delegate's real order at each finished load: title, then address.
        tab.navigationDelegate.finishedLoad(url: URL(string: "https://news.example/")!, title: "News")
        tab.navigationDelegate.finishedLoad(url: URL(string: "https://news.example/story")!, title: "Story")
        XCTAssertEqual(m.historyStore.entries.map(\.url), ["https://news.example/story", "https://news.example/"])
        XCTAssertEqual(m.historyStore.entries.map(\.title), ["Story", "News"], "each page keeps its own title")
    }

    @MainActor func testVisitToTheSameAddressIsRecorded() {
        let m = makeManager()
        let tab = m.activeTab!
        // A typed address moves currentURL before the load finishes.
        let typed = URL(string: "https://search.example/?q=blanc")!
        tab.currentURL = typed
        tab.navigationDelegate.finishedLoad(url: typed, title: "blanc - Search")
        XCTAssertEqual(m.historyStore.entries.map(\.url), [typed.absoluteString])
        XCTAssertEqual(m.historyStore.entries.first?.title, "blanc - Search")
    }

    func testSiteProtectionTogglesForTheCurrentSite() {
        let dir = tmpDir()
        let m = makeManager(settingsDir: dir)
        let tab = m.activeTab!
        tab.currentURL = URL(string: "https://www.example.com/article")!
        XCTAssertTrue(m.isSiteProtected(tab))
        m.setSiteProtection(tab, on: false)
        XCTAssertFalse(m.isSiteProtected(tab))
        XCTAssertEqual(m.settingsStore.adblockExceptions, ["example.com"])
        m.setSiteProtection(tab, on: true)
        XCTAssertTrue(m.isSiteProtected(tab))
        XCTAssertEqual(m.settingsStore.adblockExceptions, [])
    }

    func testSiteAllowsPersist() {
        let dir = tmpDir()
        let m = makeManager(settingsDir: dir)
        m.activeTab!.currentURL = URL(string: "https://example.org/")!
        m.setSiteProtection(m.activeTab!, on: false)
        m.settingsStore.flush()
        XCTAssertEqual(SettingsStore(directory: dir).adblockExceptions, ["example.org"])
    }

    func testBlockingOffEverywhereMeansNoSiteIsProtected() {
        let m = makeManager()
        m.activeTab!.currentURL = URL(string: "https://example.com/")!
        m.applySettingsPatch(["adblockEnabled": false])
        XCTAssertFalse(m.isSiteProtected(m.activeTab!))
    }

    func testInitCreatesOneTab() {
        let m = makeManager()
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertNotNil(m.activeTabId)
        XCTAssertNotNil(m.activeTab)
    }

    func testCreateTabAddsAndActivates() {
        let m = makeManager()
        let before = m.tabs.count
        let id = m.createTab()
        XCTAssertEqual(m.tabs.count, before + 1)
        XCTAssertEqual(m.activeTabId, id)
    }

    func testCloseTabRemoves() {
        let m = makeManager()
        let id = m.createTab()
        let count = m.tabs.count
        m.closeTab(id)
        XCTAssertEqual(m.tabs.count, count - 1)
    }

    func testCloseActivePicksRightNeighbor() {
        let m = makeManager()
        let _ = m.createTab(url: URL(string: "https://b.test")!)
        let c = m.createTab(url: URL(string: "https://c.test")!)
        let b = m.tabs[1].id
        m.setActive(b)
        m.closeTab(b)
        XCTAssertEqual(m.activeTabId, c)
    }

    func testCloseRightmostActivePicksLeft() {
        let m = makeManager()
        let a = m.tabs[0].id
        let b = m.createTab(url: URL(string: "https://b.test")!)
        m.closeTab(b)
        XCTAssertEqual(m.activeTabId, a)
    }

    func testCloseLastCreatesNew() {
        let m = makeManager()
        let onlyId = m.tabs[0].id
        m.closeTab(onlyId)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertNotNil(m.activeTabId)
        XCTAssertNotEqual(m.activeTabId, onlyId)
    }

    func testSetActive() {
        let m = makeManager()
        let a = m.tabs[0].id
        let _ = m.createTab()
        m.setActive(a)
        XCTAssertEqual(m.activeTabId, a)
    }

    func testSetActiveIgnoresUnknownId() {
        let m = makeManager()
        let before = m.activeTabId
        m.setActive(UUID())
        XCTAssertEqual(m.activeTabId, before)
    }

    func testActiveTabMatchesId() {
        let m = makeManager()
        let id = m.createTab(url: URL(string: "https://test.com")!)
        XCTAssertEqual(m.activeTab?.id, id)
    }

    func testCloseNonActivePreservesActive() {
        let m = makeManager()
        let a = m.tabs[0].id
        let b = m.createTab()
        m.closeTab(a)
        XCTAssertEqual(m.activeTabId, b)
    }

    func testInitReadsStoredSearchEngine() {
        let dir = tmpDir()
        let data = try! JSONSerialization.data(withJSONObject: ["searchEngine": "brave"])
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! data.write(to: dir.appendingPathComponent("settings.json"))

        let m = TabsManager(settingsDirectory: dir)
        XCTAssertEqual(m.normalizer.searchEngine, .brave)
    }

    func testInitReadsStoredAdblockDisabled() {
        let dir = tmpDir()
        let data = try! JSONSerialization.data(withJSONObject: ["adblockEnabled": false])
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try! data.write(to: dir.appendingPathComponent("settings.json"))

        let m = TabsManager(settingsDirectory: dir)
        XCTAssertEqual(m.settingsStore.adblockEnabled, false)
        XCTAssertFalse(m.isAdBlockReady)
    }

    // MARK: - applySettingsPatch

    func testPatchThemeUpdatesStore() {
        let m = makeManager()
        m.applySettingsPatch(["theme": "dark"])
        XCTAssertEqual(m.settingsStore.theme, .dark)
    }

    func testPatchSearchEngineUpdatesNormalizer() {
        let m = makeManager()
        m.applySettingsPatch(["searchEngine": "google"])
        XCTAssertEqual(m.settingsStore.searchEngine, .google)
        XCTAssertEqual(m.normalizer.searchEngine, .google)
    }

    func testPatchInvalidEnumIsDropped() {
        let m = makeManager()
        m.applySettingsPatch(["theme": "neon"])
        XCTAssertEqual(m.settingsStore.theme, BlancSettingsDefaults.theme)
    }

    func testPatchUnknownKeyIsDropped() {
        let m = makeManager()
        m.applySettingsPatch(["unknownKey": "value"])
        m.settingsStore.flush()   // `.atomic` write creates the file even on first save
        let data = try! Data(contentsOf: m.settingsStore.testFileURL)
        let dict = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertNil(dict["unknownKey"], "bridge patch must not persist unknown keys")
    }

    func testPatchAdblockDisabledUpdatesStore() {
        let m = makeManager()
        m.applySettingsPatch(["adblockEnabled": false])
        XCTAssertEqual(m.settingsStore.adblockEnabled, false)
    }

    @MainActor
    func testUnchangedBlockingPreferenceDoesNotReloadPages() async throws {
        let dir = tmpDir()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data("{\"adblockEnabled\":false}".utf8).write(to: dir.appendingPathComponent("settings.json"))
        let manager = makeManager(settingsDir: dir)
        let webView = try XCTUnwrap(manager.activeTab?.webView)
        webView.stopLoading()
        let loaded = expectation(description: "local page loaded")
        let observer = BlockingNavigationObserver()
        observer.finished = { loaded.fulfill() }
        webView.navigationDelegate = observer
        webView.loadHTMLString("<html><body>Page state must survive sync.</body></html>", baseURL: nil)
        // A cold CI simulator can take well over 10 s to launch the first WebContent
        // process; the wait ends as soon as the page finishes, so a generous bound only
        // costs time when WebKit is slow.
        await fulfillment(of: [loaded], timeout: 60)
        observer.finished = nil
        let reloaded = expectation(description: "unchanged sync preference must not reload")
        reloaded.isInverted = true
        observer.started = { reloaded.fulfill() }
        manager.applySettingsPatch(["adblockEnabled": false])
        await fulfillment(of: [reloaded], timeout: 0.4)
    }

    // MARK: - Session restore

    func testRestoresTabsFromSession() {
        let sessionDir = tmpDir()
        let dict: [String: Any] = [
            "urls": ["https://a.test/", "https://b.test/"],
            "activeIndex": 1,
        ]
        let data = try! JSONSerialization.data(withJSONObject: dict)
        try! FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        try! data.write(to: sessionDir.appendingPathComponent("session.json"))

        let m = makeManager(sessionDir: sessionDir)
        XCTAssertEqual(m.tabs.count, 2)
        XCTAssertEqual(m.tabs[0].currentURL.absoluteString, "https://a.test/")
        XCTAssertEqual(m.tabs[1].currentURL.absoluteString, "https://b.test/")
        XCTAssertEqual(m.activeTab?.id, m.tabs[1].id)
    }

    func testEmptySessionCreatesBlankTab() {
        let m = makeManager()
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertEqual(m.tabs[0].currentURL.absoluteString, "blanc://newtab/")
    }

    func testActiveIndexClampedToRange() {
        let sessionDir = tmpDir()
        let dict: [String: Any] = ["urls": ["https://a.test/"], "activeIndex": 99]
        let data = try! JSONSerialization.data(withJSONObject: dict)
        try! FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        try! data.write(to: sessionDir.appendingPathComponent("session.json"))

        let m = makeManager(sessionDir: sessionDir)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertEqual(m.activeTab?.id, m.tabs[0].id)
    }

    func testCorruptSessionCreatesBlankTab() {
        let sessionDir = tmpDir()
        try! FileManager.default.createDirectory(at: sessionDir, withIntermediateDirectories: true)
        try! "broken".data(using: .utf8)!
            .write(to: sessionDir.appendingPathComponent("session.json"))

        let m = makeManager(sessionDir: sessionDir)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertEqual(m.tabs[0].currentURL.absoluteString, "blanc://newtab/")
    }

    func testPersistSessionWritesTabURLsToDisk() {
        let sessionDir = tmpDir()
        let m = makeManager(sessionDir: sessionDir)
        m.createTab(url: URL(string: "https://test.com/")!)
        m.flushSession()   // collapse the debounce so the file is on disk to read

        let data = try! Data(contentsOf: sessionDir.appendingPathComponent("session.json"))
        let dict = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["urls"] as? [String], ["blanc://newtab/", "https://test.com/"])
        XCTAssertEqual(dict["activeIndex"] as? Int, 1)
    }

    func testSubmitAddressPersistsNavigation() {
        // Typed-address navigation updates currentURL synchronously in submitAddress,
        // so onURLChange (which fires only on a *change* at load time) is suppressed.
        // submitActiveTabAddress must persist explicitly, or the typed URL is lost on
        // the next launch. Regression test for that P1.
        let sessionDir = tmpDir()
        let m = makeManager(sessionDir: sessionDir)
        m.activeTab?.addressText = "example.com"
        m.submitActiveTabAddress()
        m.flushSession()

        let navigated = m.activeTab!.currentURL.absoluteString
        XCTAssertTrue(navigated.contains("example.com"), "expected navigation to example.com, got \(navigated)")

        let data = try! Data(contentsOf: sessionDir.appendingPathComponent("session.json"))
        let dict = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["urls"] as? [String], [navigated],
                       "typed navigation must be persisted, not the pre-navigation URL")
    }
}

@MainActor private final class BlockingNavigationObserver: NSObject, WKNavigationDelegate {
    var started: (() -> Void)?
    var finished: (() -> Void)?
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { started?() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finished?() }
}
