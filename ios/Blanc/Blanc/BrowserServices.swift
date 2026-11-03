import Foundation
import UIKit
import WebKit

/// What all of the app's windows share: settings, history, sync, Favorites
/// (through sync), content blocking, the web data stores, Reader preferences,
/// Recently closed and the saved session (multiple windows design §3.1, W1).
/// Each window's `TabsManager` reads these through `services`; W1 still has
/// one window.
final class BrowserServices {
    /// The app's services, made on first use. Tests make their own.
    static let shared = BrowserServices()

    let syncDirectory: URL
    let settingsStore: SettingsStore
    let historyStore: HistoryStore
    let readerPreferences: ReaderPreferences
    let startAppearance: StartAppearanceStore
    let schemeHandler: BlancSchemeHandler
    let sessionStore: SessionStore
    let contentBlocker = ContentBlocker()
    /// The web store normal tabs share; tests pass their own.
    let siteDataStore: WKWebsiteDataStore
    private(set) lazy var recentlyClosed = RecentlyClosedStore(directory: syncDirectory)
    /// This iPhone's set, the Spaces and their bookkeeping (W2).
    let library = SpaceLibrary()

    init(settingsDirectory: URL? = nil, sessionDirectory: URL? = nil, siteDataStore: WKWebsiteDataStore = .default()) {
        self.siteDataStore = siteDataStore
        #if DEBUG
        if UITestSeed.settings { UITestSeed.prepareSettings() }
        let settingsDirectory = UITestSeed.settings ? UITestSeed.settingsDirectory : settingsDirectory
        let sessionDirectory = UITestSeed.settings ? UITestSeed.settingsDirectory : sessionDirectory
        #endif
        syncDirectory = settingsDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        readerPreferences = ReaderPreferences(directory: settingsDirectory)
        let appearance = StartAppearanceStore(directory: settingsDirectory)
        startAppearance = appearance
        schemeHandler = BlancSchemeHandler(wallpaperURL: appearance.imageURL, wallpaperVersion: { [weak appearance] in
            appearance?.values["imageVersion"] as? String
        })
        settingsStore = SettingsStore(directory: settingsDirectory)
        sessionStore = SessionStore(directory: sessionDirectory)
        historyStore = HistoryStore(directory: settingsDirectory)
        contentBlocker.enabled = settingsStore.adblockEnabled
        // Always compile the blocklist, even when disabled — `enabled` gates only
        // attachment (see ContentBlocker). Skipping prepare while disabled would
        // leave isReady forever false, so a later enable would queue tabs forever.
        if let loaded = ContentBlocker.loadBundledBlocklist() {
            contentBlocker.prepare(version: loaded.version, jsonProvider: loaded.loadJSON)
        }
        #if DEBUG
        // Every UI test starts with an empty Recently closed.
        if ProcessInfo.processInfo.arguments.contains(where: { $0.hasPrefix("-BlancUITest") }) {
            try? FileManager.default.removeItem(at: syncDirectory.appendingPathComponent("recently-closed.json"))
        }
        #endif
    }

    // MARK: Windows

    private final class WeakWindow {
        weak var manager: TabsManager?
        init(_ manager: TabsManager) { self.manager = manager }
    }
    private var windowRefs: [WeakWindow] = []

    /// The open windows' managers, in the order they opened.
    var windows: [TabsManager] { windowRefs.compactMap(\.manager) }

    func register(_ manager: TabsManager) {
        windowRefs.removeAll { $0.manager == nil || $0.manager === manager }
        windowRefs.append(WeakWindow(manager))
        if frontWindow == nil { frontWindow = manager }
    }

    /// The window in front most recently: where links from other apps go, and
    /// whose tabs an older build opens.
    weak var frontWindow: TabsManager?

    // MARK: The saved session

    /// Every window the saved session knows, in order: the open ones, and
    /// ones iPadOS set aside (disconnected to save memory) until it says it
    /// discarded them.
    private(set) var savedWindows: [SavedWindow] = []
    /// Windows discarded before the saved session was read (at launch).
    private var pendingDiscards: Set<String> = []

    /// The saved session's windows, read by the first window to start.
    func loadSavedWindows(_ saved: [SavedWindow]) {
        savedWindows = saved.filter { !pendingDiscards.contains($0.session ?? "") }
        let discarded = saved.filter { pendingDiscards.contains($0.session ?? "") }
        pendingDiscards = []
        discarded.forEach(recordClosedWindow)
    }

    func savedWindow(_ id: String) -> SavedWindow? { savedWindows.first { $0.id == id } }

    /// One save for every window, so no window overwrites another's. Waits
    /// while any window rebuilds its tabs; that window saves when it's done.
    func saveSession() {
        let live = windows
        guard let front = frontWindow ?? live.last, !live.contains(where: \.isRestoring) else { return }
        for window in live {
            let entry = window.savedEntry()
            if let index = savedWindows.firstIndex(where: { $0.id == entry.id }) { savedWindows[index] = entry }
            else { savedWindows.append(entry) }
        }
        // Private tabs are never saved. With only private tabs open, the saved
        // session is one blank tab, so tabs the person closed stay closed.
        let saved = front.tabs.filter { !$0.isPrivate }
        let urls = saved.isEmpty ? [TabsManager.newTabURL.absoluteString] : saved.map { $0.currentURL.absoluteString }
        let active = saved.firstIndex(where: { $0.id == front.activeTabId }) ?? 0
        sessionStore.save(urls: urls, activeIndex: active, state: library.state(shown: front.shownSetId, windows: savedWindows))
    }

    // MARK: Opening, closing and moving between windows

    /// Opens a window for a request (SwiftUI's `openWindow`, from any window).
    var openWindowAction: ((WindowRequest) -> Void)?

    /// A new window with a Start Page, or with `tabId` moved into it.
    func openNewWindow(moving tabId: UUID? = nil) {
        openWindowAction?(WindowRequest(moveTabId: tabId))
    }

    /// Sets new windows should show when they open, by window id.
    private var pendingShows: [String: String] = [:]
    func takePendingShow(_ windowId: String) -> String? { pendingShows.removeValue(forKey: windowId) }

    /// A new window showing This iPhone or a Space.
    func openNewWindow(showing setId: String) {
        let request = WindowRequest()
        pendingShows[request.id.uuidString] = setId
        openWindowAction?(request)
    }

    /// The window, open or set aside, that shows `setId`, other than `window`.
    func window(showing setId: String, except window: TabsManager) -> String? {
        if let open = windows.first(where: { $0 !== window && $0.shownSetId == setId }) { return open.windowId }
        let open = Set(windows.map(\.windowId))
        return savedWindows.first { $0.shown == setId && $0.id != window.windowId && !open.contains($0.id) }?.id
    }

    /// Brings a window forward (or back, if iPadOS set it aside).
    func bringForward(windowId: String) {
        guard let id = UUID(uuidString: windowId) else { return }
        openWindowAction?(WindowRequest(id: id))
    }

    /// Moves a tab, page and all, from the window that has it into `target`.
    func moveTab(_ id: UUID, to target: TabsManager) {
        guard let source = windows.first(where: { $0 !== target && $0.tabs.contains { $0.id == id } }),
              let tab = source.detachTab(id) else { return }
        target.adopt(tab)
    }

    /// iPadOS discarded these windows' scenes: an unsaved set's tabs go into
    /// Recently closed (a Space or This iPhone keeps its tabs), and the
    /// windows leave the saved session.
    func windowsDiscarded(_ sessions: Set<String>) {
        guard library.loaded else {
            pendingDiscards.formUnion(sessions)
            return
        }
        let open = Set(windows.compactMap(\.sceneSessionId))
        let gone = savedWindows.filter { sessions.contains($0.session ?? "") && !open.contains($0.session ?? "") }
        guard !gone.isEmpty else { return }
        gone.forEach(recordClosedWindow)
        savedWindows.removeAll { entry in gone.contains { $0.id == entry.id } }
        saveSession()
    }

    private func recordClosedWindow(_ entry: SavedWindow) {
        guard entry.showsUnsavedSet, let set = entry.set else { return }
        recordClosedTabs(set.tabs)
    }

    /// Tabs that closed together with no set to keep them (a window's unsaved
    /// set): one Recently closed entry for the lot, or a plain row for a
    /// single page. Other devices hear of each page, as from any close.
    func recordClosedTabs(_ tabs: [SavedTab]) {
        let pages = tabs.filter { SharedSpacesAdapter.isHTTP($0.url) }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        var ids: [String] = []
        for tab in pages {
            let id = UUID().uuidString.lowercased()
            ids.append(id)
            syncEngine.recordClosed(url: tab.url, title: tab.title, id: id, spaceId: nil)
        }
        if pages.count == 1, let tab = pages.first, let id = ids.first {
            recentlyClosed.add(ClosedRow(id: id, url: tab.url, title: tab.title, closedAt: now,
                                         spaceId: nil, fromId: nil, fromName: nil))
        } else if pages.count > 1 {
            recentlyClosed.addWindow(ClosedWindow(id: UUID().uuidString.lowercased(), closedAt: now, tabs: pages))
        }
    }

    /// Sets that windows about to open should show, by window id.
    private var pendingSets: [String: SavedSet] = [:]
    func takePendingSet(_ windowId: String) -> SavedSet? { pendingSets.removeValue(forKey: windowId) }

    /// Opens a closed window's pages again in a window of their own, or, where
    /// there's only ever one window, as tabs in `fallback`.
    func reopen(_ window: ClosedWindow, fallback: TabsManager) {
        recentlyClosed.removeWindow(window.id)
        guard UIApplication.shared.supportsMultipleScenes, let openWindowAction else {
            for tab in window.tabs { fallback.createTab(url: URL(string: tab.url) ?? TabsManager.newTabURL, title: tab.title) }
            return
        }
        let request = WindowRequest()
        pendingSets[request.id.uuidString] = SavedSet(tabs: window.tabs, activeIndex: max(window.tabs.count - 1, 0))
        openWindowAction(request)
    }

    // MARK: Settings

    /// Single dispatch path for settings changes, from a page, a slash command
    /// or another device. Validates each field by type, applies the device's
    /// side effects once (the blocker, the store, sync), then every window's
    /// (search engine, its tabs' blocking, its pages). Unknown or invalid keys
    /// are ignored.
    func applySettingsPatch(_ patch: [String: Any]) {
        let themeUpdate = (patch["theme"] as? String).flatMap(BlancThemePreference.init(rawValue:))
        let engineUpdate = (patch["searchEngine"] as? String).flatMap(BlancSearchEngine.init(rawValue:))
        let adblockUpdate = patch["adblockEnabled"] as? Bool
        if let engineUpdate { for window in windows { window.normalizer.searchEngine = engineUpdate } }
        // Foreground sync re-applies the full settings payload. An unchanged
        // blocker preference must preserve the page and its in-memory state.
        if let adblockUpdate, adblockUpdate != settingsStore.adblockEnabled {
            contentBlocker.setEnabled(adblockUpdate)
            for window in windows { window.blockingTurned(adblockUpdate) }
        }
        // One validated mutation that also schedules the debounced save.
        let oldTheme = settingsStore.theme
        let oldEngine = settingsStore.searchEngine
        let oldBlocking = settingsStore.adblockEnabled
        settingsStore.update(theme: themeUpdate, searchEngine: engineUpdate, adblockEnabled: adblockUpdate)
        if oldTheme != settingsStore.theme || oldEngine != settingsStore.searchEngine || oldBlocking != settingsStore.adblockEnabled {
            for window in windows { window.settingsDidChange() }
        }
        if !applyingRemoteSettings {
            if let themeUpdate, themeUpdate != oldTheme { syncEngine.localSettingChanged(key: "theme", value: .string(themeUpdate.rawValue)) }
            if let engineUpdate, engineUpdate != oldEngine { syncEngine.localSettingChanged(key: "searchEngine", value: .string(engineUpdate.rawValue)) }
            if let adblockUpdate, adblockUpdate != oldBlocking { syncEngine.localSettingChanged(key: "adblockEnabled", value: .bool(adblockUpdate)) }
        }
    }

    // MARK: Private browsing

    private var privateStore: WKWebsiteDataStore?
    /// The in-memory web store private tabs in every window share, made on
    /// first use.
    var privateDataStore: WKWebsiteDataStore {
        if let privateStore { return privateStore }
        let store = WKWebsiteDataStore.nonPersistent()
        privateStore = store
        return store
    }
    /// The private store if a private tab has made one.
    var existingPrivateStore: WKWebsiteDataStore? { privateStore }

    /// Once no window has a private tab, its web data and Reader settings go.
    func releasePrivateBrowsingIfUnused() {
        guard !windows.contains(where: { $0.tabs.contains(where: \.isPrivate) }) else { return }
        privateStore = nil
        readerPreferences.clearPrivate()
    }

    // MARK: Sync

    /// Set while settings that arrived from another device apply, so applying
    /// them doesn't send them back.
    var applyingRemoteSettings = false

    lazy var syncEngine: SyncEngine = {
        var client = SyncWorkerClient()
        var secrets: any SyncSecretStore = KeychainSyncSecretStore()
        #if DEBUG
        if UITestSeed.settings {
            client = SyncWorkerClient(transport: SettingsUITestTransport())
            secrets = SettingsUITestSecrets()
        }
        if UITestSeed.sharedSeed || UITestSeed.appStore {
            client = SyncWorkerClient(transport: SharedSpacesUITestTransport(
                stores: UITestSeed.workerStores(), account: UITestSeed.sharedAccount, key: UITestSeed.sharedKey))
            secrets = SharedSpacesUITestSecrets()
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
            }, tabsSource: { [weak self] in self?.windows.flatMap(\.syncedTabs) ?? [] })
        engine.onChanged = { [weak self] in self?.windows.forEach { $0.syncDidChange() } }
        engine.onSpacesMerged = { [weak self] (ids: [String]) in self?.windows.forEach { $0.sharedSpacesMerged(ids) } }
        engine.sharedTabsSource = { [weak self] in self?.windows.flatMap(\.snapshotTabs) ?? [] }
        engine.sharedGroupsSource = { [weak self] in
            self?.windows.flatMap(\.groups).map { (g: TabGroup) -> (id: String, name: String) in (g.id, g.name) } ?? []
        }
        return engine
    }()
}
