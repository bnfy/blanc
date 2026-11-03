import Foundation
import WebKit

/// What all of the app's windows share: settings, history, sync, Favorites
/// (through sync), content blocking, the web data stores, Reader preferences,
/// Recently closed and the saved session (multiple windows design §3.1, W1).
/// Each window's `TabsManager` reads these through `services`; W1 still has
/// one window.
final class BrowserServices {
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
                for window in self.windows { window.applySettingsPatch(patch) }
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
