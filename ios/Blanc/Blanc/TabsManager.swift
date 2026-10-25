import Observation
import Foundation
import WebKit
import UIKit

@Observable
final class TabsManager {
    private(set) var tabs: [TabModel] = []
    var isWallpaperPickerPresented = false
    var wallpaperSelectionCompletion: ((UIImage?) -> Void)?
    let startAppearance: StartAppearanceStore
    var isPalettePresented = false
    private final class WeakPreview {
        weak var tab: TabModel?
        let layout: BlancStartPageLayout?
        init(_ tab: TabModel, layout: BlancStartPageLayout?) { self.tab = tab; self.layout = layout }
    }
    @ObservationIgnored private var previews: [WeakPreview] = []
    var startPreviews: [TabModel] { previews.compactMap(\.tab) }

    func previewLayout(for webView: WKWebView) -> BlancStartPageLayout? {
        previews.first { $0.tab?.webView === webView }?.layout
    }

    func makeStartPreview(layout: BlancStartPageLayout? = nil) -> TabModel {
        let configuration = WebViewConfiguration.make(schemeHandler: schemeHandler, bridge: bridge)
        configuration.userContentController.addUserScript(WKUserScript(source: """
            document.getElementById('customizeButton')?.style.setProperty('display', 'none', 'important');
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let tab = TabModel(url: Self.newTabURL, configuration: configuration)
        previews.removeAll { $0.tab == nil }
        previews.append(WeakPreview(tab, layout: layout))
        return tab
    }

    var settingsDestination: SettingsDestination?
    var pendingSettingsDestination: SettingsDestination?

    func showSettings(_ destination: SettingsDestination = .root) {
        if isPalettePresented {
            pendingSettingsDestination = destination
            isPalettePresented = false
        } else {
            settingsDestination = destination
        }
    }

    func presentPendingSettings() {
        if let destination = pendingSettingsDestination {
            pendingSettingsDestination = nil
            settingsDestination = destination
        }
    }

    @discardableResult
    func routeSettings(_ url: URL) -> Bool {
        guard let destination = SettingsDestination.resolve(url) else { return false }
        showSettings(destination)
        return true
    }

    func setStartLayout(_ layout: BlancStartPageLayout) {
        settingsStore.update(newtabLayout: layout)
        bridge.emit("start.onStatus", payload: .object([("layout", .string(layout.rawValue))]), host: "newtab")
    }

    @discardableResult
    func changeStartAppearance(_ method: String, value: Any?) throws -> [String: Any] {
        let payload = try startAppearance.change(method, value: value)
        bridge.broadcastAppearance()
        return payload
    }

    func importWallpaper(_ image: UIImage) throws {
        try startAppearance.importImage(image)
        bridge.broadcastAppearance()
    }

    func setAdblockExceptions(_ exceptions: [String]) {
        let old = settingsStore.adblockExceptions
        settingsStore.update(adblockExceptions: exceptions)
        for tab in tabs where AdblockExceptions.isExcepted(tab.currentURL, in: old) != AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions) {
            applyBlocking(to: tab, for: tab.currentURL)
            tab.webView.reload()
        }
    }
    var activeTabId: UUID?

    let settingsStore: SettingsStore
    let historyStore: HistoryStore
    private let syncDirectory: URL
    @ObservationIgnored private var applyingRemoteSettings = false
    @ObservationIgnored lazy var syncEngine: SyncEngine = {
        var client = SyncWorkerClient()
        var secrets: any SyncSecretStore = KeychainSyncSecretStore()
        #if DEBUG
        if UITestSeed.settings {
            client = SyncWorkerClient(transport: SettingsUITestTransport())
            secrets = SettingsUITestSecrets()
        }
        #endif
        let engine = SyncEngine(state: SyncStateStore(directory: syncDirectory), secrets: secrets, client: client,
            settingsSink: { [weak self] settings in
                guard let self else { return }
                self.applyingRemoteSettings = true
                defer { self.applyingRemoteSettings = false }
                let values = settings.payload()["values"]
                var patch: [String: Any] = [:]
                if let theme = values?["theme"]?.text { patch["theme"] = theme }
                if let search = values?["searchEngine"]?.text { patch["searchEngine"] = search }
                if let enabled = values?["adblockEnabled"]?.boolean { patch["adblockEnabled"] = enabled }
                self.applySettingsPatch(patch)
            }, tabsSource: { [weak self] in self?.syncedTabs ?? [] })
        engine.onChanged = { [weak self] in self?.bridge.emitSyncChanges() }
        return engine
    }()
    var normalizer: AddressNormalizer

    @ObservationIgnored private let schemeHandler: BlancSchemeHandler
    @ObservationIgnored private lazy var bridge = PagesBridge(manager: self)
    @ObservationIgnored private let contentBlocker = ContentBlocker()
    @ObservationIgnored private let sessionStore: SessionStore
    @ObservationIgnored private var isRestoringSession = false

    static let newTabURL = URL(string: "blanc://newtab/")!
    static let privateNewTabURL = URL(string: "blanc://newtab/?private=1")!

    /// One in-memory web session shared by every private tab, forgotten when
    /// the last private tab closes (and when Blanc quits).
    @ObservationIgnored private var privateStore: WKWebsiteDataStore?
    var privateDataStore: WKWebsiteDataStore {
        if let privateStore { return privateStore }
        let store = WKWebsiteDataStore.nonPersistent()
        privateStore = store
        return store
    }

    /// The open tabs other devices may see; private tabs never leave the phone.
    var syncedTabs: [(url: String, title: String)] {
        tabs.filter { !$0.isPrivate }.map { ($0.currentURL.absoluteString, $0.pageTitle) }
    }

    var activeTab: TabModel? {
        guard let activeTabId else { return nil }
        return tabs.first { $0.id == activeTabId }
    }

    var isAdBlockReady: Bool {
        contentBlocker.isReady && contentBlocker.enabled
    }

    init(settingsDirectory: URL? = nil, sessionDirectory: URL? = nil) {
        #if DEBUG
        if UITestSeed.settings { UITestSeed.prepareSettings() }
        let settingsDirectory = UITestSeed.settings ? UITestSeed.settingsDirectory : settingsDirectory
        let sessionDirectory = UITestSeed.settings ? UITestSeed.settingsDirectory : sessionDirectory
        #endif
        syncDirectory = settingsDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let appearance = StartAppearanceStore(directory: settingsDirectory)
        self.startAppearance = appearance
        self.schemeHandler = BlancSchemeHandler(wallpaperURL: appearance.imageURL, wallpaperVersion: { [weak appearance] in
            appearance?.values["imageVersion"] as? String
        })
        let store = SettingsStore(directory: settingsDirectory)
        self.settingsStore = store
        self.sessionStore = SessionStore(directory: sessionDirectory)
        self.historyStore = HistoryStore(directory: settingsDirectory)
        self.normalizer = AddressNormalizer(searchEngine: store.searchEngine)

        contentBlocker.enabled = store.adblockEnabled

        // Always compile the blocklist, even when disabled — `enabled` gates only
        // attachment (see ContentBlocker). Skipping prepare while disabled would
        // leave isReady forever false, so a later enable would queue tabs forever.
        if let loaded = ContentBlocker.loadBundledBlocklist() {
            contentBlocker.prepare(version: loaded.version, jsonProvider: loaded.loadJSON)
        }

        var savedURLs = sessionStore.urls.compactMap { URL(string: $0) }
        #if DEBUG
        if UITestSeed.sends {
            UITestSeed.seedSends(into: syncDirectory)
            savedURLs = [UITestSeed.pageURL]
        }
        if UITestSeed.favorites || UITestSeed.privateTab {
            UITestSeed.seedFavorites(into: syncDirectory)
            savedURLs = [UITestSeed.pageURL]
        }
        defer { if UITestSeed.privateTab { createTab(url: UITestSeed.pageURL, isPrivate: true) } }
        #endif
        if savedURLs.isEmpty {
            createTab()
        } else {
            // Rebuild tabs without persisting each intermediate state, then set the
            // active tab (clamped to range) and write the session once.
            isRestoringSession = true
            for url in savedURLs {
                createTab(url: url)
            }
            let clampedIndex = min(max(sessionStore.activeIndex, 0), tabs.count - 1)
            activeTabId = tabs[clampedIndex].id
            isRestoringSession = false
            persistSession()
        }
    }

    /// Only web pages can be Favorites; Blanc's own pages can't.
    static func canFavorite(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    func isFavorite(_ tab: TabModel) -> Bool {
        syncEngine.isFavorite(url: tab.currentURL.absoluteString)
    }

    func toggleFavorite(_ tab: TabModel) {
        guard Self.canFavorite(tab.currentURL) else { return }
        let url = tab.currentURL.absoluteString, title = tab.pageTitle
        syncEngine.editFavorites {
            SyncedFavorites.toggle(
                $0, url: url, title: title, favicon: nil, now: Date().timeIntervalSince1970 * 1000,
                makeId: { UUID().uuidString.lowercased() }
            ).store
        }
    }

    @discardableResult
    func createTab(url: URL? = nil, isPrivate: Bool = false) -> UUID {
        let url = url ?? (isPrivate ? Self.privateNewTabURL : Self.newTabURL)
        if !isRestoringSession, activeTabId != nil, routeSettings(url) { return activeTabId! }
        let config = WebViewConfiguration.make(
            schemeHandler: schemeHandler, bridge: bridge,
            dataStore: isPrivate ? privateDataStore : .default())
        if contentBlocker.enabled, !AdblockExceptions.isExcepted(url, in: settingsStore.adblockExceptions),
           let ruleList = contentBlocker.compiledRuleList {
            config.userContentController.add(ruleList)
        }
        let tab = TabModel(url: url, configuration: config, isPrivate: isPrivate)
        return add(tab)
    }

    /// A tab a page opened: last in the list and current, private when its
    /// opener is.
    private func openChild(of opener: TabModel, configuration: WKWebViewConfiguration, url: URL?) -> WKWebView {
        let tab = TabModel(
            url: url ?? URL(string: "about:blank")!, configuration: configuration,
            isPrivate: opener.isPrivate, load: false)
        add(tab)
        return tab.webView
    }

    @discardableResult
    private func add(_ tab: TabModel) -> UUID {
        activeTab?.captureThumbnail()
        let isPrivate = tab.isPrivate
        tab.uiDelegate.onOpenChild = { [weak self, weak tab] configuration, url in
            guard let self, let tab else { return nil }
            return self.openChild(of: tab, configuration: configuration, url: url)
        }
        if contentBlocker.enabled && !contentBlocker.isReady
            && !AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions) {
            contentBlocker.attach(to: tab.webView)
        }
        tab.navigationDelegate.onSettingsNavigation = { [weak self] url in self?.routeSettings(url) ?? false }
        // Re-persist whenever this tab settles on a new URL (navigation/redirect).
        tab.navigationDelegate.onURLChange = { [weak self] _ in
            self?.persistSession()
        }
        tab.navigationDelegate.onVisit = { [weak self] url, title in
            if !isPrivate { self?.historyStore.addVisit(url: url, title: title) }
        }
        tab.navigationDelegate.onTitleChange = { [weak self, weak tab] in
            if let tab, !isPrivate { self?.historyStore.updateTitle(url: tab.currentURL, title: tab.pageTitle) }
            self?.syncEngine.tabsChanged()
        }
        tab.navigationDelegate.onWillLoadMainFrame = { [weak self, weak tab] url in
            if let self, let tab { self.applyBlocking(to: tab, for: url) }
        }
        tabs.append(tab)
        activeTabId = tab.id
        persistSession()
        return tab.id
    }

    /// A Favorite, History or other-device page picked in the Quick Switcher;
    /// picked from a private tab, it opens privately.
    func openFromSwitcher(_ url: URL) {
        createTab(url: url, isPrivate: activeTab?.isPrivate ?? false)
    }

    /// Only an ordinary web page can be sent to another device (desktop's
    /// `canSendTab`).
    func canSend(_ tab: TabModel) -> Bool {
        !tab.isPrivate && ["http", "https"].contains(tab.currentURL.scheme?.lowercased() ?? "")
    }

    func closeTab(_ id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let wasActive = id == activeTabId
        // If the tab is still queued for a cold-compile drain, drop it so its web view
        // isn't reloaded after it's gone (and isn't kept alive by the pending queue).
        contentBlocker.cancelPending(for: tabs[index].webView)
        tabs.remove(at: index)
        if !tabs.contains(where: \.isPrivate) { privateStore = nil }

        if tabs.isEmpty {
            createTab()
            return
        }

        if wasActive {
            let nextIndex = min(index, tabs.count - 1)
            activeTabId = tabs[nextIndex].id
        }
        persistSession()
    }

    func setActive(_ id: UUID) {
        if id != activeTabId { activeTab?.captureThumbnail() }
        guard tabs.contains(where: { $0.id == id }) else { return }
        activeTabId = id
        persistSession()
    }

    func submitActiveTabAddress() {
        if let tab = activeTab, routeSettings(normalizer.normalize(tab.addressText)) {
            tab.addressText = tab.currentURL.absoluteString
            return
        }
        activeTab?.submitAddress(using: normalizer)
        // submitAddress moves currentURL to the destination synchronously, so the
        // later navigation's onURLChange sees no change and won't fire. Persist the
        // typed navigation here, or a typed URL that resolves unchanged is lost on
        // the next launch.
        persistSession()
    }

    /// Snapshots the open tabs' URLs + active index to the session store
    /// (debounced). Suppressed while restoring so intermediate createTab calls
    /// don't overwrite the saved session mid-rebuild.
    func persistSession() {
        guard !isRestoringSession else { return }
        // Private tabs are never saved. With only private tabs open, the saved
        // session is one blank tab, so tabs the person closed stay closed.
        let saved = tabs.filter { !$0.isPrivate }
        let urls = saved.isEmpty ? [Self.newTabURL.absoluteString] : saved.map { $0.currentURL.absoluteString }
        let activeIdx = saved.firstIndex(where: { $0.id == activeTabId }) ?? 0
        sessionStore.save(urls: urls, activeIndex: activeIdx)
        syncEngine.tabsChanged()
    }

    /// Test seam: collapse the 250ms session-save debounce to disk immediately.
    func flushSession() {
        sessionStore.flush()
    }

    /// Single dispatch path for bridge settings changes. Validates each field by
    /// type, applies side effects (search engine → normalizer, adblock → tabs),
    /// then routes the accepted values through `SettingsStore.update`, which
    /// persists them. Unknown/invalid keys are ignored.
    func applySettingsPatch(_ patch: [String: Any]) {
        var themeUpdate: BlancThemePreference?
        var engineUpdate: BlancSearchEngine?
        var adblockUpdate: Bool?

        if let raw = patch["theme"] as? String,
           let value = BlancThemePreference(rawValue: raw) {
            themeUpdate = value
        }

        if let raw = patch["searchEngine"] as? String,
           let value = BlancSearchEngine(rawValue: raw) {
            engineUpdate = value
            normalizer.searchEngine = value
        }

        if let enabled = patch["adblockEnabled"] as? Bool {
            adblockUpdate = enabled
            // Foreground sync re-applies the full settings payload. An unchanged
            // blocker preference must preserve the page and its in-memory state.
            if enabled != settingsStore.adblockEnabled { applyAdblockToggle(enabled) }
        }

        // One validated mutation that also schedules the debounced save.
        let oldTheme = settingsStore.theme
        let oldEngine = settingsStore.searchEngine
        let oldBlocking = settingsStore.adblockEnabled
        settingsStore.update(theme: themeUpdate, searchEngine: engineUpdate, adblockEnabled: adblockUpdate)
        if oldTheme != settingsStore.theme || oldEngine != settingsStore.searchEngine || oldBlocking != settingsStore.adblockEnabled {
            bridge.emitSettingsChanges()
            bridge.emit("start.onStatus", payload: .object([("mobileAdblockEnabled", .bool(settingsStore.adblockEnabled))]), host: "newtab")
        }
        if !applyingRemoteSettings {
            if let themeUpdate, themeUpdate != oldTheme { syncEngine.localSettingChanged(key: "theme", value: .string(themeUpdate.rawValue)) }
            if let engineUpdate, engineUpdate != oldEngine { syncEngine.localSettingChanged(key: "searchEngine", value: .string(engineUpdate.rawValue)) }
            if let adblockUpdate, adblockUpdate != oldBlocking { syncEngine.localSettingChanged(key: "adblockEnabled", value: .bool(adblockUpdate)) }
        }
    }

    private func applyAdblockToggle(_ enabled: Bool) {
        contentBlocker.setEnabled(enabled)
        if enabled {
            if contentBlocker.isReady {
                for tab in tabs {
                    applyBlocking(to: tab, for: tab.currentURL)
                    tab.webView.reload()
                }
            } else {
                // Cold-compile still in flight: queue each tab; drainPending attaches
                // once the list is ready (setEnabled(true) re-opened attachment).
                for tab in tabs {
                    applyBlocking(to: tab, for: tab.currentURL)
                }
            }
        } else {
            for tab in tabs {
                tab.webView.configuration.userContentController.removeAllContentRuleLists()
                tab.webView.reload()
            }
        }
    }

    // MARK: Blanc Blocker, per site

    /// Whether Blanc Blocker protects the page `tab` shows: blocking is on and
    /// the person hasn't switched it off for this site.
    func isSiteProtected(_ tab: TabModel) -> Bool {
        settingsStore.adblockEnabled && !AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions)
    }

    /// Turns Blanc Blocker on or off for the site `tab` shows, then reloads it.
    func setSiteProtection(_ tab: TabModel, on: Bool) {
        guard let host = AdblockExceptions.host(for: tab.currentURL) else { return }
        var list = settingsStore.adblockExceptions.filter { $0 != host }
        if !on { list.append(host) }
        setAdblockExceptions(list)
    }

    /// Puts the tab's blocking rules on or off for the site it is about to show.
    /// WebKit can't exempt a site through a second rule list, so an allowed
    /// site's tab simply runs without the list until it navigates elsewhere.
    private func applyBlocking(to tab: TabModel, for url: URL) {
        let controller = tab.webView.configuration.userContentController
        contentBlocker.cancelPending(for: tab.webView)
        controller.removeAllContentRuleLists()
        guard contentBlocker.enabled, !AdblockExceptions.isExcepted(url, in: settingsStore.adblockExceptions) else { return }
        if let ruleList = contentBlocker.compiledRuleList {
            controller.add(ruleList)
        } else if !contentBlocker.isReady {
            contentBlocker.attach(to: tab.webView)
        }
    }
}
