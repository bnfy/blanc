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

    /// What WebKit reports for one ordinary page load: the commit (the page's
    /// title isn't known yet), then the finished load with its title.
    /// (WebKit doesn't let a test make a WKNavigation; nil stands for any
    /// load that isn't a wake.)
    @MainActor private func load(_ tab: TabModel, _ address: String, title: String) {
        tab.navigationDelegate.committed(nil, url: URL(string: address)!, title: "")
        tab.navigationDelegate.finishedLoad(url: URL(string: address)!, title: title)
    }

    @MainActor func testVisitsRecordHistory() {
        let m = makeManager()
        let tab = m.activeTab!
        load(tab, "https://news.example/", title: "News")
        load(tab, "https://news.example/story", title: "Story")
        XCTAssertEqual(m.historyStore.entries.map(\.url), ["https://news.example/story", "https://news.example/"])
        XCTAssertEqual(m.historyStore.entries.map(\.title), ["Story", "News"], "each page keeps its own title")
    }

    @MainActor func testVisitToTheSameAddressIsRecorded() {
        let m = makeManager()
        let tab = m.activeTab!
        // A typed address moves currentURL before the load commits.
        let typed = URL(string: "https://search.example/?q=blanc")!
        tab.currentURL = typed
        load(tab, typed.absoluteString, title: "blanc - Search")
        XCTAssertEqual(m.historyStore.entries.map(\.url), [typed.absoluteString])
        XCTAssertEqual(m.historyStore.entries.first?.title, "blanc - Search")
    }

    /// The owner's TestFlight History (2026-10-28) listed the same two pages
    /// four times each: every launch and Space switch wakes the shown tab, and
    /// each wake was recorded as a new visit. A wake shows a page the tab
    /// already visited, so, as on desktop, it records nothing.
    @MainActor func testWakingRestoredTabsRecordsNoNewVisits() throws {
        let m = makeManager()
        let nbc = URL(string: "https://www.nbc.com/")!, nintendo = URL(string: "https://www.nintendo.com/us/")!
        load(m.activeTab!, nbc.absoluteString, title: "NBC")
        load(m.activeTab!, nintendo.absoluteString, title: "Nintendo")
        for _ in 0..<2 {
            for url in [nbc, nintendo] {
                // The tabs as a relaunch or a Space switch leaves them: quiet
                // until shown, then woken by being shown.
                let id = m.createTab(url: url, quiet: true)
                let tab = try XCTUnwrap(m.tabs.first { $0.id == id })
                m.setActive(id)
                let wake = try XCTUnwrap(tab.navigationDelegate.wakeNavigation)
                tab.navigationDelegate.committed(wake, url: url, title: "")
                tab.navigationDelegate.applyTitle("Page Loading")
                tab.navigationDelegate.finishedLoad(wake, url: url, title: "Page Loading")
                XCTAssertFalse(tab.navigationDelegate.isWaking, "the wake ends with its own load")
            }
        }
        XCTAssertEqual(m.historyStore.entries.map(\.url), [nintendo.absoluteString, nbc.absoluteString])
        XCTAssertEqual(m.historyStore.entries.map(\.title), ["Nintendo", "NBC"], "a wake renames nothing either")

        // Once woken, the tab's next page is an ordinary visit again.
        let tab = m.activeTab!
        load(tab, "https://www.nintendo.com/us/store/", title: "Store")
        XCTAssertEqual(m.historyStore.entries.first?.url, "https://www.nintendo.com/us/store/")
        XCTAssertEqual(m.historyStore.entries.count, 3)
    }

    @MainActor func testLeavingAWakeBeforeItLoadsRecordsTheNextPage() throws {
        let m = makeManager()
        let id = m.createTab(url: URL(string: "https://slow.example/")!, quiet: true)
        let tab = try XCTUnwrap(m.tabs.first { $0.id == id })
        m.setActive(id)
        XCTAssertTrue(tab.navigationDelegate.isWaking)
        // A link tapped before the wake's own load commits supersedes it.
        load(tab, "https://elsewhere.example/", title: "Elsewhere")
        XCTAssertFalse(tab.navigationDelegate.isWaking)
        XCTAssertEqual(m.historyStore.entries.map(\.url), ["https://elsewhere.example/"])
    }

    /// NBC's page is titled "Page Loading - NBC.com" when it finishes and
    /// names itself a moment later: one visit, renamed in place.
    @MainActor func testATitleSetAfterLoadingRenamesTheVisitInPlace() {
        let m = makeManager()
        let tab = m.activeTab!
        load(tab, "https://www.nbc.com/", title: "Page Loading - NBC.com")
        tab.navigationDelegate.applyTitle("NBC.com - Official Site")
        XCTAssertEqual(m.historyStore.entries, [HistoryEntry(
            url: "https://www.nbc.com/", title: "NBC.com - Official Site",
            visitedAt: m.historyStore.entries.first?.visitedAt ?? 0)])
        XCTAssertEqual(tab.pageTitle, "NBC.com - Official Site")
    }

    @MainActor func testAPageWithTheSameTitleAsTheLastStillNamesItsVisit() {
        let m = makeManager()
        let tab = m.activeTab!
        load(tab, "https://docs.example/a", title: "Docs")
        load(tab, "https://docs.example/b", title: "Docs")
        XCTAssertEqual(m.historyStore.entries.map(\.title), ["Docs", "Docs"])
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
        XCTAssertEqual(SessionStore(directory: sessionDir).urls, [TabsManager.newTabURL.absoluteString], "closed tabs stay closed; a relaunch opens one blank tab")
    }

    @MainActor func testPrivateTabRecordsNoHistory() {
        let m = makeManager()
        let tab = openPrivate(m)
        load(tab, "https://secret.example/", title: "Secret")
        load(tab, "https://secret.example/next", title: "Next")
        tab.navigationDelegate.applyTitle("Renamed")
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

    @MainActor func testSwitcherPickFromAPrivateTabStaysPrivate() {
        let m = makeManager()
        _ = openPrivate(m)
        m.openFromSwitcher(URL(string: "https://bank.example/")!)
        XCTAssertEqual(m.activeTab?.isPrivate, true)
        XCTAssertFalse(m.syncedTabs.contains { $0.url == "https://bank.example/" })
        m.setActive(m.tabs[0].id)
        m.openFromSwitcher(URL(string: "https://news.example/")!)
        XCTAssertEqual(m.activeTab?.isPrivate, false)
    }

    @MainActor func testPrivateTabsAreNeverSent() {
        let m = makeManager()
        m.activeTab!.currentURL = URL(string: "https://ordinary.example/")!
        XCTAssertTrue(m.canSend(m.activeTab!))
        let secret = openPrivate(m, url: URL(string: "https://secret.example/")!)
        XCTAssertFalse(m.canSend(secret), "as desktop's canSendTab: a private page never leaves the phone")
        m.activeTab!.currentURL = URL(string: "blanc://newtab/")!
        XCTAssertFalse(m.canSend(m.activeTab!))
    }

    @MainActor func testClosingTheLastTabOpensAnOrdinaryOne() {
        let m = makeManager()
        let privateId = m.createTab(isPrivate: true)
        m.closeTab(m.tabs[0].id)
        m.closeTab(privateId)
        XCTAssertEqual(m.tabs.count, 1)
        XCTAssertFalse(m.tabs[0].isPrivate)
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
