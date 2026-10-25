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
        tab.navigationDelegate.applyURL(URL(string: "https://example.com/page")!, to: tab)
        XCTAssertEqual(m.historyStore.entries.map(\.url), ["https://example.com/page"])
        tab.pageTitle = "Example page"
        tab.navigationDelegate.onTitleChange?()
        XCTAssertEqual(m.historyStore.entries.first?.title, "Example page")
    }

    @MainActor private func openPrivate(_ m: TabsManager, url: URL? = nil) -> TabModel {
        let id = m.createTab(url: url, isPrivate: true)
        return m.tabs.first { $0.id == id }!
    }

    @MainActor func testPrivateTabUsesNonPersistentStore() {
        let m = makeManager()
        let tab = openPrivate(m)
        XCTAssertTrue(tab.isPrivate)
        XCTAssertEqual(tab.currentURL, TabsManager.privateNewTabURL)
        XCTAssertFalse(tab.webView.configuration.websiteDataStore.isPersistent)
        XCTAssertTrue(m.tabs[0].webView.configuration.websiteDataStore.isPersistent, "ordinary tabs keep the default store")
    }

    @MainActor func testPrivateTabsShareOneStore() {
        let m = makeManager()
        let a = openPrivate(m), b = openPrivate(m)
        XCTAssertTrue(a.webView.configuration.websiteDataStore === b.webView.configuration.websiteDataStore)
    }

    @MainActor func testClosingLastPrivateTabForgetsTheStore() {
        let m = makeManager()
        let a = openPrivate(m)
        _ = openPrivate(m)
        let first = a.webView.configuration.websiteDataStore
        m.closeTab(a.id)
        XCTAssertTrue(openPrivate(m).webView.configuration.websiteDataStore === first, "the store lives while any private tab is open")
        for tab in m.tabs where tab.isPrivate { m.closeTab(tab.id) }
        XCTAssertFalse(openPrivate(m).webView.configuration.websiteDataStore === first)
    }

    @MainActor func testSessionNeverPersistsPrivateTabs() {
        let sessionDir = tmpDir()
        let m = makeManager(sessionDir: sessionDir)
        m.activeTab!.navigationDelegate.applyURL(URL(string: "https://ordinary.example/")!, to: m.activeTab!)
        let privateId = m.createTab(url: URL(string: "https://secret.example/")!, isPrivate: true)
        m.flushSession()
        XCTAssertEqual(SessionStore(directory: sessionDir).urls, ["https://ordinary.example/"])
        m.closeTab(m.tabs[0].id)
        XCTAssertEqual(m.tabs.map(\.id), [privateId], "only the private tab is left")
        m.flushSession()
        XCTAssertEqual(SessionStore(directory: sessionDir).urls, ["https://ordinary.example/"], "a private-only window keeps the last ordinary session")
    }

    @MainActor func testPrivateTabRecordsNoHistory() {
        let m = makeManager()
        let tab = openPrivate(m)
        tab.navigationDelegate.applyURL(URL(string: "https://secret.example/")!, to: tab)
        tab.pageTitle = "Secret"
        tab.navigationDelegate.onTitleChange?()
        XCTAssertTrue(m.historyStore.entries.isEmpty)
    }

    @MainActor func testPrivateTabIsNotInTheSyncSnapshot() {
        let m = makeManager()
        m.activeTab!.navigationDelegate.applyURL(URL(string: "https://ordinary.example/")!, to: m.activeTab!)
        m.createTab(url: URL(string: "https://secret.example/")!, isPrivate: true)
        XCTAssertEqual(m.syncedTabs.map(\.url), ["https://ordinary.example/"])
    }

    /// WebKit hands the opener's configuration to `createWebViewWith`; the
    /// returned view must be built from it.
    private final class OpenAction: WKNavigationAction {
        let target: URLRequest
        init(_ url: URL) { target = URLRequest(url: url) }
        override var request: URLRequest { target }
    }

    @MainActor func testChildOfPrivateTabIsPrivate() {
        let m = makeManager()
        let parent = openPrivate(m)
        let child = parent.webView.uiDelegate?.webView?(
            parent.webView, createWebViewWith: parent.webView.configuration,
            for: OpenAction(URL(string: "https://child.example/")!), windowFeatures: WKWindowFeatures())
        XCTAssertNotNil(child)
        XCTAssertEqual(m.tabs.count, 3)
        let tab = m.tabs.last!
        XCTAssertTrue(tab.webView === child)
        XCTAssertTrue(tab.isPrivate)
        XCTAssertEqual(m.activeTabId, tab.id)
        XCTAssertTrue(tab.webView.configuration.websiteDataStore === parent.webView.configuration.websiteDataStore)
        XCTAssertFalse(m.syncedTabs.contains { $0.url == "https://child.example/" })
    }

    @MainActor func testChildOfOrdinaryTabIsOrdinary() {
        let m = makeManager()
        let parent = m.activeTab!
        let child = parent.webView.uiDelegate?.webView?(
            parent.webView, createWebViewWith: parent.webView.configuration,
            for: OpenAction(URL(string: "https://child.example/")!), windowFeatures: WKWindowFeatures())
        XCTAssertNotNil(child)
        XCTAssertEqual(m.tabs.count, 2)
        XCTAssertFalse(m.tabs.last!.isPrivate)
        XCTAssertTrue(m.tabs.last!.webView.configuration.websiteDataStore.isPersistent)
    }

    @MainActor func testClosingTheLastTabOpensAnOrdinaryOne() {
        let m = makeManager()
        let privateId = m.createTab(isPrivate: true)
        m.closeTab(m.tabs[0].id)
        m.closeTab(privateId)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertFalse(m.tabs[0].isPrivate)
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
        await fulfillment(of: [loaded], timeout: 10)
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
