import Observation
import Foundation
import WebKit
import UIKit

@Observable
final class TabsManager {
    private(set) var tabs: [TabModel] = []
    /// The shown set's tab groups, in the order their sections draw (M17).
    private(set) var groups: [TabGroup] = []
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
        previews.first { $0.tab?.existingWebView === webView }?.layout
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

    /// The Start Page was held: open its settings (see `StartPageHold`).
    func startPageHeld(_ tab: TabModel) {
        guard tab.currentURL.scheme == "blanc", tab.currentURL.host == "newtab" else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        showSettings(.startPage)
    }

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
        if let target = pendingSpaceEditor {
            pendingSpaceEditor = nil
            spaceEditor = target
        }
        if pendingSpacesMenu {
            pendingSpacesMenu = false
            isSpacesMenuPresented = true
        }
    }

    /// The Space editor sheet (M17), and what waits for the palette to close.
    var spaceEditor: SpaceEditorTarget?
    @ObservationIgnored private var pendingSpaceEditor: SpaceEditorTarget?
    @ObservationIgnored private var pendingSpacesMenu = false

    /// `/space`: bare, the Spaces menu; a name, that set (This iPhone too), or
    /// New Space with the name filled in, as desktop's.
    func runSpaceCommand(_ name: String) {
        let wanted = SyncCrypto.lowercaseLikeJavaScript(SyncCrypto.trim(name))
        let iphone = SyncCrypto.lowercaseLikeJavaScript(SyncCopy.text("spaces.thisIPhone"))
        if wanted.isEmpty {
            if isPalettePresented { pendingSpacesMenu = true; isPalettePresented = false } else { isSpacesMenuPresented = true }
        } else if wanted == iphone {
            show(set: TabSets.iphoneId)
        } else if let space = spaces.first(where: { SyncCrypto.lowercaseLikeJavaScript($0.name) == wanted }) {
            show(set: space.id)
        } else if isPalettePresented {
            pendingSpaceEditor = .new(name: SyncCrypto.trim(name)); isPalettePresented = false
        } else {
            spaceEditor = .new(name: SyncCrypto.trim(name))
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
        for tab in tabs where tab.hasWebView && AdblockExceptions.isExcepted(tab.currentURL, in: old) != AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions) {
            applyBlocking(to: tab, for: tab.currentURL)
            tab.webView.reload()
        }
    }
    let readerPreferences: ReaderPreferences
    var readerError = false
    /// The shown tab. Whatever makes a tab current also wakes it if quiet.
    var activeTabId: UUID? {
        didSet { if !holdingWake, let tab = activeTab, tab.isQuiet { wake(tab) } }
    }
    /// The addresses quiet tabs last woke at, newest last (a test seam).
    @ObservationIgnored private(set) var wokenURLs: [URL] = []
    /// At launch, while waiting changes for the selected tab apply: every
    /// restored tab stays quiet until they have (M16 §4.4).
    @ObservationIgnored private var holdingWake = false

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
        if UITestSeed.sharedSeed {
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
            }, tabsSource: { [weak self] in self?.syncedTabs ?? [] })
        engine.onChanged = { [weak self] in
            self?.bridge.emitSyncChanges()
            self?.sharedSyncChanged()
        }
        engine.onSpacesMerged = { [weak self] (ids: [String]) in self?.sharedSpacesMerged(ids) }
        engine.sharedTabsSource = { [weak self] in self?.snapshotTabs ?? [] }
        engine.sharedGroupsSource = { [weak self] in
            self?.groups.map { (g: TabGroup) -> (id: String, name: String) in (g.id, g.name) } ?? []
        }
        return engine
    }()
    var normalizer: AddressNormalizer

    @ObservationIgnored private let schemeHandler: BlancSchemeHandler
    @ObservationIgnored private lazy var bridge = PagesBridge(manager: self)
    @ObservationIgnored private lazy var startPageHold = StartPageHold(manager: self)
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
    /// The same tabs as F27 publishes them (M17c): with their group and pin,
    /// and the shared Space a shared record sits in, for the `shared` sidecar.
    var snapshotTabs: [SnapshotTab] {
        let space = shownSpace?.link == .active ? shownSpace?.sharedId : nil
        return tabs.filter { !$0.isPrivate }.map { (tab: TabModel) -> SnapshotTab in
            SnapshotTab(url: tab.currentURL.absoluteString, title: tab.pageTitle, groupId: tab.groupId,
                        pinned: tab.pinned, sharedSpaceId: tab.sharedTabId == nil ? nil : space)
        }
    }

    func toggleReaderMode() {
        guard let tab = activeTab else { return }
        if tab.reader != nil { tab.exitReader(); return }
        if tab.readerBusy { return }
        guard tab.readerAllowed, !tab.isLoading,
              tab.webView.url == tab.currentURL,
              ReaderController.isWebURL(tab.currentURL),
              let script = ReaderController.script("reader-extract.generated") else { readerError = true; return }
        tab.readerBusy = true
        let generation = tab.readerGeneration
        let url = tab.currentURL
        Task { @MainActor [weak self, weak tab] in
            guard let self, let tab else { return }
            defer { tab.readerBusy = false }
            let result = try? await tab.webView.evaluateJavaScript(script, in: nil, contentWorld: .world(name: "blanc-reader-extraction"))
            guard tab.readerGeneration == generation, tab.currentURL == url,
                  tab.webView.url == url,
                  tabs.contains(where: { $0 === tab }), activeTabId == tab.id else { return }
            guard let article = result as? [String: Any], let content = article["content"] as? String,
                  content.utf8.count <= 5 * 1024 * 1024,
                  let text = article["textContent"] as? String, text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 200 else {
                readerError = true; return
            }
            tab.reader = ReaderController(article: article, sourceURL: url,
                appearance: readerPreferences.value(isPrivate: tab.isPrivate),
                saveAppearance: { [weak self, weak tab] value in
                    guard let tab else { return }
                    self?.readerPreferences.set(value, isPrivate: tab.isPrivate)
                }, onExit: { [weak tab] in tab?.exitReader() },
                openLink: { [weak self, weak tab] link, disposition in
                    guard let self, let tab else { return }
                    if disposition != "current-tab" {
                        let active = activeTabId
                        createTab(url: link, isPrivate: tab.isPrivate)
                        if disposition == "background-tab" { activeTabId = active }
                    } else {
                        tab.exitReader()
                        tab.navigationDelegate.load(link, in: tab.webView)
                    }
                })
        }
    }

    var activeTab: TabModel? {
        guard let activeTabId else { return nil }
        return tabs.first { $0.id == activeTabId }
    }

    /// The tab `offset` places from `id` in tab order, without wrapping (M11's
    /// sideways swipe on the Island).
    func neighbor(of id: UUID?, offset: Int) -> TabModel? {
        guard let id, let index = tabs.firstIndex(where: { $0.id == id }),
              tabs.indices.contains(index + offset) else { return nil }
        return tabs[index + offset]
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
        self.readerPreferences = ReaderPreferences(directory: settingsDirectory)
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
        var restoredState = sessionStore.state
        #if DEBUG
        if UITestSeed.sends || UITestSeed.twoTabs || UITestSeed.startPage || UITestSeed.favorites || UITestSeed.privateTab {
            restoredState = nil
        }
        if UITestSeed.groups {
            UITestSeed.seedFavorites(into: syncDirectory)
            restoredState = UITestSeed.groupsState()
        }
        if UITestSeed.sharedSeed {
            UITestSeed.seedSharedSpaces(into: syncDirectory)
            restoredState = UITestSeed.sharedSpacesState()
        }
        if UITestSeed.sends {
            UITestSeed.seedSends(into: syncDirectory)
            savedURLs = [UITestSeed.pageURL]
        }
        if UITestSeed.twoTabs {
            UITestSeed.seedFavorites(into: syncDirectory)
            savedURLs = [UITestSeed.pageURL, URL(string: "https://example.org/")!]
        }
        if UITestSeed.startPage {
            UITestSeed.seedFavorites(into: syncDirectory)
            savedURLs = [TabsManager.newTabURL]
        }
        if UITestSeed.favorites || UITestSeed.privateTab {
            UITestSeed.seedFavorites(into: syncDirectory)
            savedURLs = [UITestSeed.pageURL]
        }
        defer { if UITestSeed.privateTab { createTab(url: UITestSeed.pageURL, isPrivate: true) } }
        defer { if UITestSeed.twoTabs { activeTabId = tabs.first?.id } }
        #endif
        if let state = restoredState {
            iphoneSet = state.iphone
            spaces = state.spaces
            sharedBaselines = state.sharedBaselines ?? [:]
            sharedAccepted = state.sharedAccepted ?? [:]
            sharedAccount = state.sharedAccount
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            recentlyDeleted = state.deleted.filter { now - $0.deletedAt < TabSets.deletedRetentionMs }
            if spaces.contains(where: { $0.id == state.shown }) { shownSetId = state.shown }
            // Changes that waited for the selected tab when Blanc last ran
            // apply first, while every tab is still quiet; only then does the
            // surviving selection load, at its resulting address.
            holdingWake = true
            show(shownSetId == TabSets.iphoneId ? iphoneSet : spaces.first { $0.id == shownSetId }!.set)
            sharedSyncChanged()
            sharedRemoteCloses(applyAcceptedOnColdStart())
            holdingWake = false
            if let tab = activeTab, tab.isQuiet { wake(tab) }
            persistSession()
        } else if savedURLs.isEmpty {
            createTab()
        } else {
            // A file from before M17: its tabs are This iPhone's.
            show(SavedSet(tabs: savedURLs.map { SavedTab(url: $0.absoluteString, title: "") },
                          activeIndex: sessionStore.activeIndex))
            persistSession()
        }
        sharedSyncChanged()
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

    /// A new tab. `quiet: true` opens it in the background with no web view
    /// until it is shown (M17); otherwise it becomes current and loads.
    @discardableResult
    func createTab(url: URL? = nil, title: String = "", isPrivate: Bool = false, quiet: Bool = false) -> UUID {
        let url = url ?? (isPrivate ? Self.privateNewTabURL : Self.newTabURL)
        if !isRestoringSession, !quiet, activeTabId != nil, routeSettings(url) { return activeTabId! }
        let config = WebViewConfiguration.make(
            schemeHandler: schemeHandler, bridge: bridge,
            dataStore: isPrivate ? privateDataStore : .default(),
            startPageHold: startPageHold)
        if contentBlocker.enabled, !AdblockExceptions.isExcepted(url, in: settingsStore.adblockExceptions),
           let ruleList = contentBlocker.compiledRuleList {
            config.userContentController.add(ruleList)
        }
        let tab = TabModel(url: url, title: title, configuration: config, isPrivate: isPrivate, quiet: quiet)
        return add(tab)
    }

    /// Makes a quiet tab's web view with today's blocking rules, then loads it.
    private func wake(_ tab: TabModel) {
        guard tab.isQuiet else { return }
        wokenURLs = Array((wokenURLs + [tab.currentURL]).suffix(20))
        if contentBlocker.enabled && !contentBlocker.isReady
            && !AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions) {
            contentBlocker.attach(to: tab.webView)
        } else {
            applyBlocking(to: tab, for: tab.currentURL)
        }
        tab.wake()
    }

    /// A tab a page opened: last in the list and current, private when its
    /// opener is.
    private func openChild(of opener: TabModel, configuration: WKWebViewConfiguration, url: URL?) -> WKWebView {
        let tab = TabModel(
            url: url ?? URL(string: "about:blank")!, configuration: configuration,
            isPrivate: opener.isPrivate, load: false)
        tab.readerAllowed = false // A page-opened child may inherit sandbox policy.
        add(tab)
        return tab.webView
    }

    @discardableResult
    private func add(_ tab: TabModel) -> UUID {
        if !tab.isQuiet { activeTab?.captureThumbnail() }
        let isPrivate = tab.isPrivate
        tab.uiDelegate.onOpenChild = { [weak self, weak tab] configuration, url in
            guard let self, let tab else { return nil }
            return self.openChild(of: tab, configuration: configuration, url: url)
        }
        if !tab.isQuiet, contentBlocker.enabled && !contentBlocker.isReady
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
        tab.navigationDelegate.onPageTitle = { [weak self] url, title in
            if !isPrivate { self?.historyStore.updateTitle(url: url, title: title) }
        }
        tab.navigationDelegate.onTitleChange = { [weak self] in
            self?.syncEngine.tabsChanged()
        }
        tab.navigationDelegate.onWillLoadMainFrame = { [weak self, weak tab] url in
            if let self, let tab { self.applyBlocking(to: tab, for: url) }
        }
        tabs.append(tab)
        if !tab.isQuiet || (activeTabId == nil && !isRestoringSession) { activeTabId = tab.id }
        persistSession()
        return tab.id
    }

    /// A Favorite, History or other-device page picked in the Quick Switcher;
    /// picked from a private tab, it opens privately.
    func openFromSwitcher(_ url: URL) {
        createTab(url: url, isPrivate: activeTab?.isPrivate ?? false)
    }

    /// Counts links opened from other apps; ContentView closes the tab grid on
    /// each, so the page shows.
    private(set) var incomingLinkCount = 0

    /// A link from another app (`IncomingLinks`): a new ordinary tab, never
    /// private, made current over whatever sheet was open.
    func openIncomingLink(_ url: URL) {
        isPalettePresented = false
        isWallpaperPickerPresented = false
        settingsDestination = nil
        createTab(url: url, isPrivate: false)
        incomingLinkCount += 1
    }

    /// Only an ordinary web page can be sent to another device (desktop's
    /// `canSendTab`).
    func canSend(_ tab: TabModel) -> Bool {
        !tab.isPrivate && ["http", "https"].contains(tab.currentURL.scheme?.lowercased() ?? "")
    }

    /// What the last send said, shown over the Island for five seconds; the
    /// Sunrise menu's Send and `/send` share it.
    private(set) var sendNotice: String?

    /// Sends `tab`'s page to `target` and shows the result.
    func send(_ tab: TabModel, to target: SendTarget) {
        let url = tab.currentURL.absoluteString, title = tab.pageTitle
        Task {
            let result = await syncEngine.send(url: url, title: title, to: target.id)
            showSendNotice(SyncCopy.sendResult(result, device: target.name))
        }
    }

    /// `/send <device>`: the current page to the device named, without regard
    /// to case (desktop's `sendActiveTabTo`).
    func sendActiveTab(toDeviceNamed name: String) {
        guard let tab = activeTab, !tab.isPrivate else { return }
        let targets = syncEngine.sendTargets
        guard !targets.isEmpty else { return showSendNotice(SyncCopy.text("sends.none")) }
        guard let target = SlashCommand.sendTarget(named: name, in: targets) else {
            return showSendNotice(SyncCopy.text("sends.noMatch", ["name": name]))
        }
        guard canSend(tab) else { return showSendNotice(SyncCopy.text("sends.unavailable")) }
        send(tab, to: target)
    }

    private func showSendNotice(_ message: String) {
        sendNotice = message
        UIAccessibility.post(notification: .announcement, argument: message)
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            if self?.sendNotice == message { self?.sendNotice = nil }
        }
    }

    /// `/find` asks for Find in page; the page shows it once the palette has
    /// closed and the web view can take focus.
    private(set) var findRequested = false
    func requestFind() {
        findRequested = true
        if isPalettePresented { isPalettePresented = false }
    }
    func takeFindRequest() -> Bool {
        defer { findRequested = false }
        return findRequested
    }

    /// `/block-ads`: re-blocks the current site if it is allowed, otherwise
    /// switches blocking everywhere (desktop's `resolveBlockAdsCommand`).
    func runBlockAdsCommand() {
        if let tab = activeTab, let host = AdblockExceptions.host(for: tab.currentURL),
           settingsStore.adblockExceptions.contains(host) {
            if !settingsStore.adblockEnabled { applySettingsPatch(["adblockEnabled": true]) }
            setSiteProtection(tab, on: true)
        } else {
            applySettingsPatch(["adblockEnabled": !settingsStore.adblockEnabled])
        }
    }

    // MARK: Closing, with Undo (M11)

    /// The newest close, undoable while its banner shows. The tab itself is
    /// kept, so Undo brings back its page and history exactly.
    private(set) var lastClosed: ClosedTab?
    /// Closed tabs past their Undo, newest first, for /reopen. Only while the
    /// app runs; never saved.
    private(set) var reopenList: [ReopenEntry] = []
    @ObservationIgnored var undoWindow: Duration = .seconds(5)
    @ObservationIgnored private var undoExpiry: Task<Void, Never>?

    /// Puts the newest closed tab back where it was and makes it current. If
    /// closing it had opened a blank tab that's still untouched, that goes.
    func undoClose() {
        guard let closed = lastClosed else { return }
        undoExpiry?.cancel()
        lastClosed = nil
        if let blankId = closed.blankId, let blank = tabs.first(where: { $0.id == blankId }),
           blank.currentURL == Self.newTabURL, !blank.canGoBack {
            tabs.removeAll { $0.id == blankId }
        }
        for (tab, index) in ([(closed.tab, closed.index)] + closed.others).sorted(by: { $0.1 < $1.1 }) {
            tabs.insert(tab, at: min(index, tabs.count))
        }
        if let group = closed.group, !groups.contains(where: { $0.id == group.id }) { groups.append(group) }
        activeTabId = closed.tab.id
        normalizeLayout()
        persistSession()
    }

    /// Ends the Undo: the closed tab is let go and its address joins the
    /// reopen list.
    func expireUndo() {
        undoExpiry?.cancel()
        guard let closed = lastClosed else { return }
        lastClosed = nil
        for tab in [closed.tab] + closed.others.map(\.tab) {
            reopenList.insert(ReopenEntry(url: tab.currentURL, title: tab.pageTitle), at: 0)
        }
        if reopenList.count > 10 { reopenList.removeLast(reopenList.count - 10) }
    }

    /// Opens the newest closed tab again (/reopen).
    @discardableResult
    func reopenLast() -> Bool {
        // While Undo still holds the live tab, bring that back exactly.
        if lastClosed != nil { undoClose(); return true }
        expireUndo()
        guard !reopenList.isEmpty else { return false }
        createTab(url: reopenList.removeFirst().url)
        return true
    }

    func closeTab(_ id: UUID) {
        tabs.first { $0.id == id }?.exitReader()
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let wasActive = id == activeTabId
        let closing = tabs[index]
        // If the tab is still queued for a cold-compile drain, drop it so its web view
        // isn't reloaded after it's gone (and isn't kept alive by the pending queue).
        if let view = tabs[index].existingWebView { contentBlocker.cancelPending(for: view) }
        let closingGroup = groups.first { $0.id == closing.groupId }
        tabs.remove(at: index)
        recordLocalClose(closing)
        normalizeLayout()
        if !tabs.contains(where: \.isPrivate) { privateStore = nil; readerPreferences.clearPrivate() }
        // Only the newest close is undoable. A private tab's close is final, as
        // on desktop: no Undo, never in the reopen list.
        expireUndo()
        if !closing.isPrivate {
            lastClosed = ClosedTab(tab: closing, index: index, blankId: nil,
                                   group: closingGroup.flatMap { g in groups.contains { $0.id == g.id } ? nil : g })
            let window = undoWindow
            undoExpiry = Task { [weak self] in
                do { try await Task.sleep(for: window) } catch { return }
                guard let self, self.lastClosed?.tab === closing else { return }
                self.expireUndo()
            }
        }

        if tabs.isEmpty {
            let blank = createTab()
            lastClosed?.blankId = blank
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
        let leaving = protectedSharedTabId
        activeTabId = id
        activeTab?.probeReader()
        // The tab the person left takes the remote changes that waited for it.
        if leaving != nil, leaving != protectedSharedTabId { applySharedAccepted(protectedTabId: protectedSharedTabId) }
        persistSession()
    }

    // MARK: Tab groups (M17)

    /// Puts the tabs in section order (each group contiguous, its pins
    /// first) and drops groups that hold no tab, as desktop's `syncTabLayout`.
    private func normalizeLayout() {
        let known = Set(groups.map(\.id))
        for tab in tabs where tab.groupId.map({ !known.contains($0) }) ?? false { tab.groupId = nil }
        let items = tabs.map { TabSections.Item(id: $0.id.uuidString, groupId: $0.groupId, pinned: $0.pinned) }
        let byId = Dictionary(uniqueKeysWithValues: tabs.map { ($0.id.uuidString, $0) })
        tabs = TabSections.normalizeOrder(items).compactMap { byId[$0] }
        let order = TabSections.sections(items).compactMap(\.groupId)
        groups = order.compactMap { id in groups.first { $0.id == id } }
    }

    private func reorder(_ ids: [String]) {
        let byId = Dictionary(uniqueKeysWithValues: tabs.map { ($0.id.uuidString, $0) })
        tabs = ids.compactMap { byId[$0] }
    }

    private func validName(_ raw: String, excluding id: String? = nil) throws -> String {
        let name = GroupNames.normalize(raw)
        guard !name.isEmpty else { throw GroupNameError.empty }
        if groups.contains(where: { $0.id != id && GroupNames.same($0.name, name) }) { throw GroupNameError.duplicate }
        return name
    }

    /// The tab grid's and palette's sections in display order: ungrouped pins, then each group
    /// and each run of ungrouped tabs as `TabSections` lays them out.
    var displaySections: [(id: String, group: TabGroup?, tabs: [TabModel])] {
        let byId = Dictionary(uniqueKeysWithValues: tabs.map { ($0.id.uuidString, $0) })
        let items = tabs.map { TabSections.Item(id: $0.id.uuidString, groupId: $0.groupId, pinned: $0.pinned) }
        var out: [(id: String, group: TabGroup?, tabs: [TabModel])] = []
        let shelf = tabs.filter { $0.groupId == nil && $0.pinned }
        if !shelf.isEmpty { out.append(("pins", nil, shelf)) }
        for section in TabSections.sections(items) {
            let tabs = section.tabIds.compactMap { byId[$0] }
            if let groupId = section.groupId, let group = groups.first(where: { $0.id == groupId }) {
                out.append((groupId, group, tabs))
            } else {
                out.append(("run-\(section.tabIds.first ?? "")", nil, tabs))
            }
        }
        return out
    }

    /// `/group name`: the current tab joins that group, made if it's new.
    func runGroupCommand(_ name: String) {
        guard let tab = activeTab, !tab.isPrivate else { return }
        if let group = group(matching: name) { moveTab(tab.id, toGroup: group.id) }
        else { try? createGroup(named: name, with: tab.id) }
    }

    /// Shows a group: unfolds it and makes its first tab current.
    func showGroup(_ id: String) {
        guard let first = displaySections.first(where: { $0.group?.id == id })?.tabs.first else { return }
        setGroupCollapsed(id, false)
        setActive(first.id)
    }

    /// The group named `name`, compared without regard to case (`/group`).
    func group(matching name: String) -> TabGroup? {
        groups.first { GroupNames.same($0.name, name) }
    }

    /// Makes a group holding `tabId`, where that tab is. Private tabs can't.
    @discardableResult
    func createGroup(named raw: String, with tabId: UUID) throws -> String {
        let name = try validName(raw)
        guard let tab = tabs.first(where: { $0.id == tabId }), !tab.isPrivate else { throw GroupNameError.empty }
        let group = TabGroup(id: TabGroup.newId(), name: name)
        groups.append(group)
        tab.groupId = group.id
        normalizeLayout()
        persistSession()
        return group.id
    }

    func renameGroup(_ id: String, to raw: String) throws {
        let name = try validName(raw, excluding: id)
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        groups[index].name = name
        persistSession()
    }

    /// One of the eight Space presets, or nil for no colour.
    func setGroupColor(_ id: String, _ hex: String?) {
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        if let hex, !SpaceIdentity.presets.contains(where: { $0.hex == hex }) { return }
        groups[index].color = hex
        persistSession()
    }

    func setGroupCollapsed(_ id: String, _ collapsed: Bool) {
        guard let index = groups.firstIndex(where: { $0.id == id }) else { return }
        groups[index].collapsed = collapsed
        persistSession()
    }

    /// Moves a tab into a group (after its last member), or with nil out of
    /// its group to just below it.
    func moveTab(_ tabId: UUID, toGroup groupId: String?) {
        guard let tab = tabs.first(where: { $0.id == tabId }), !tab.isPrivate, tab.groupId != groupId else { return }
        let key = tab.id.uuidString
        if let groupId {
            guard groups.contains(where: { $0.id == groupId }) else { return }
            tab.groupId = groupId
            let items = tabs.map { TabSections.Item(id: $0.id.uuidString, groupId: $0.groupId, pinned: $0.pinned) }
            reorder(TabSections.placeInGroup(order: tabs.map { $0.id.uuidString }, items: items, id: key, groupId: groupId))
        } else if let old = tab.groupId {
            tab.groupId = nil
            if let last = tabs.last(where: { $0.groupId == old }) {
                var ids = tabs.map { $0.id.uuidString }.filter { $0 != key }
                ids.insert(key, at: ids.firstIndex(of: last.id.uuidString)! + 1)
                reorder(ids)
            }
        }
        normalizeLayout()
        persistSession()
    }

    /// The group's tabs stay, ungrouped, where they are.
    func ungroup(_ id: String) {
        for tab in tabs where tab.groupId == id { tab.groupId = nil }
        normalizeLayout()
        persistSession()
    }

    /// A new current tab at the end of the group.
    @discardableResult
    func newTab(inGroup id: String) -> UUID {
        let tabId = createTab()
        moveTab(tabId, toGroup: id)
        return tabId
    }

    /// Closes every tab in the group as one Undo.
    func closeGroup(_ id: String) {
        guard let group = groups.first(where: { $0.id == id }) else { return }
        let members = tabs.enumerated().filter { $0.element.groupId == id }
        guard let first = members.first else { return }
        let wasActive = members.contains { $0.element.id == activeTabId }
        for member in members {
            member.element.exitReader()
            if let view = member.element.existingWebView { contentBlocker.cancelPending(for: view) }
        }
        tabs.removeAll { $0.groupId == id }
        for member in members { recordLocalClose(member.element) }
        expireUndo()
        lastClosed = ClosedTab(tab: first.element, index: first.offset, blankId: nil,
                               others: members.dropFirst().map { ($0.element, $0.offset) }, group: group, groupClose: true)
        let closing = first.element
        let window = undoWindow
        undoExpiry = Task { [weak self] in
            do { try await Task.sleep(for: window) } catch { return }
            guard let self, self.lastClosed?.tab === closing else { return }
            self.expireUndo()
        }
        normalizeLayout()
        if tabs.isEmpty {
            let blank = createTab()
            lastClosed?.blankId = blank
            return
        }
        if wasActive { activeTabId = tabs[min(first.offset, tabs.count - 1)].id }
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

    // MARK: Tab sets: This iPhone and Spaces (M17)

    /// "iphone" or the shown Space's id.
    private(set) var shownSetId = TabSets.iphoneId
    /// The phone's Spaces in their order. The shown Space's saved tabs are
    /// stale while it shows; `tabs` is the truth.
    private(set) var spaces: [SpaceRecord] = []
    private(set) var recentlyDeleted: [DeletedSpace] = []
    /// The Space whose deletion Undo can still take back.
    private(set) var lastDeletedSpaceId: String?
    /// Whether that Space was deleted everywhere (it was shared).
    private(set) var lastDeletedSpaceWasShared = false
    @ObservationIgnored private var deletedSpaceWasShown = false
    @ObservationIgnored private var spaceUndoExpiry: Task<Void, Never>?
    @ObservationIgnored private var iphoneSet = SavedSet()

    var shownSpace: SpaceRecord? { spaces.first { $0.id == shownSetId } }
    /// The Spaces menu over the Island (M17).
    var isSpacesMenuPresented = false
    /// The Island shows a Space mark once a Space exists, never on a private tab.
    var showsSpaceMark: Bool { activeTab?.isPrivate != true && !spaces.isEmpty }
    /// Tabs in a set, for the Spaces menu's counts.
    func tabCount(_ id: String) -> Int {
        id == shownSetId ? tabs.filter { !$0.isPrivate }.count : (savedSet(id)?.tabs.count ?? 0)
    }

    /// The shown set as it would be put away.
    func captureShown() -> SavedSet {
        let saved = tabs.filter { !$0.isPrivate }
        return SavedSet(
            tabs: saved.map { SavedTab(url: $0.currentURL.absoluteString, title: $0.pageTitle, pinned: $0.pinned,
                                       groupId: $0.groupId, tabId: $0.sharedTabId) },
            groups: groups,
            activeIndex: saved.firstIndex { $0.id == activeTabId } ?? 0)
    }

    /// A set's saved tabs, for one that isn't shown (the shown one: `captureShown`).
    func savedSet(_ id: String) -> SavedSet? {
        if id == shownSetId { return captureShown() }
        return id == TabSets.iphoneId ? iphoneSet : spaces.first { $0.id == id }?.set
    }

    private func storeShown() {
        let set = captureShown()
        if shownSetId == TabSets.iphoneId { iphoneSet = set }
        else if let index = spaces.firstIndex(where: { $0.id == shownSetId }) { spaces[index].set = set }
    }

    /// Replaces the ordinary tabs with `set`'s, all quiet but the selected
    /// one. Private tabs stay open; they belong to no set.
    private func show(_ set: SavedSet) {
        let privates = tabs.filter(\.isPrivate)
        for tab in tabs where !tab.isPrivate {
            tab.exitReader()
            if let view = tab.existingWebView { contentBlocker.cancelPending(for: view) }
        }
        let wasRestoring = isRestoringSession
        isRestoringSession = true
        activeTabId = nil
        tabs = []
        groups = set.groups
        for saved in set.tabs {
            createTab(url: URL(string: saved.url) ?? Self.newTabURL, title: saved.title, quiet: true)
            tabs.last?.pinned = saved.pinned
            tabs.last?.groupId = saved.groupId
            tabs.last?.sharedTabId = saved.tabId
        }
        if tabs.isEmpty { createTab(quiet: true) }
        let count = tabs.count
        tabs.append(contentsOf: privates)
        normalizeLayout()
        isRestoringSession = wasRestoring
        let ordinary = tabs.filter { !$0.isPrivate }
        activeTabId = ordinary[min(max(set.activeIndex, 0), count - 1)].id
    }

    /// Puts the shown set away and shows This iPhone or a Space.
    func show(set id: String) {
        guard id != shownSetId, let set = savedSet(id) else { return }
        expireUndo()
        // Leaving a shared Space applies what waited for its selected tab.
        applySharedAccepted(protectedTabId: nil)
        storeShown()
        shownSetId = id
        show(set)
        persistSession()
    }

    /// Space names compare without regard to case, as desktop's.
    private func nameTaken(_ name: String, except id: String? = nil) -> Bool {
        let wanted = SyncCrypto.lowercaseLikeJavaScript(name)
        return spaces.contains { $0.id != id && SyncCrypto.lowercaseLikeJavaScript($0.name) == wanted }
    }

    private func validIdentity(color: String, symbol: String) throws -> String {
        guard let hex = SpaceIdentity.normalizeHex(color), SpaceIdentity.isSymbol(symbol) else { throw SpaceError.invalid }
        return hex
    }

    /// A new Space. With `withTab`, that tab moves into it.
    @discardableResult
    func createSpace(name raw: String, color: String, symbol: String, withTab tabId: UUID? = nil) throws -> String {
        guard let name = TabSets.spaceName(raw) else { throw SpaceError.emptyName }
        guard spaces.filter({ $0.recoveredFrom == nil }).count < TabSets.spaceLimit else { throw SpaceError.limit }
        guard !nameTaken(name) else { throw SpaceError.duplicateName }
        let hex = try validIdentity(color: color, symbol: symbol)
        let id = TabGroup.newId()
        // A new Space starts with a Start Page, or with the tab it was made from.
        let start = tabId == nil ? [SavedTab(url: Self.newTabURL.absoluteString, title: "")] : []
        spaces.append(SpaceRecord(id: id, name: name, color: hex, symbol: symbol, set: SavedSet(tabs: start)))
        if let tabId { moveTab(tabId, toSpace: id) }
        persistSession()
        return id
    }

    func updateSpace(_ id: String, name raw: String?, color: String?, symbol: String?) throws {
        guard let index = spaces.firstIndex(where: { $0.id == id }) else { return }
        var space = spaces[index]
        if let raw {
            guard let name = TabSets.spaceName(raw) else { throw SpaceError.emptyName }
            guard !nameTaken(name, except: id) else { throw SpaceError.duplicateName }
            space.name = name
        }
        space.color = try validIdentity(color: color ?? space.color, symbol: symbol ?? space.symbol)
        space.symbol = symbol ?? space.symbol
        spaces[index] = space
        persistSession()
    }

    func moveSpace(_ id: String, by offset: Int) {
        guard let index = spaces.firstIndex(where: { $0.id == id }) else { return }
        let target = min(max(index + offset, 0), spaces.count - 1)
        guard target != index else { return }
        spaces.insert(spaces.remove(at: index), at: target)
        persistSession()
    }

    /// Moves an ordinary tab, ungrouped, to the end of another set. The
    /// shown set's only tab stays.
    func moveTab(_ tabId: UUID, toSpace id: String) {
        guard id != shownSetId, savedSet(id) != nil,
              let index = tabs.firstIndex(where: { $0.id == tabId }), !tabs[index].isPrivate,
              tabs.filter({ !$0.isPrivate }).count > 1 else { return }
        let tab = tabs[index]
        let saved = SavedTab(url: tab.currentURL.absoluteString, title: tab.pageTitle, pinned: tab.pinned)
        if id == TabSets.iphoneId { iphoneSet.tabs.append(saved) }
        else if let target = spaces.firstIndex(where: { $0.id == id }) { spaces[target].set.tabs.append(saved) }
        tab.exitReader()
        if let view = tab.existingWebView { contentBlocker.cancelPending(for: view) }
        let wasActive = tab.id == activeTabId
        tabs.remove(at: index)
        normalizeLayout()
        if wasActive {
            let ordinary = tabs.filter { !$0.isPrivate }
            activeTabId = ordinary[min(index, ordinary.count - 1)].id
        }
        persistSession()
    }

    /// Deletes a Space into Recently deleted (7 days), with Undo. Deleting
    /// the shown Space shows This iPhone.
    func deleteSpace(_ id: String, now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) {
        guard spaces.contains(where: { $0.id == id }) else { return }
        let wasShown = id == shownSetId
        if wasShown { show(set: TabSets.iphoneId) }
        guard let index = spaces.firstIndex(where: { $0.id == id }) else { return }
        // A shared Space is deleted everywhere at once; what Undo or Recently
        // deleted bring back is a copy on this iPhone (design §6).
        let removed = spaces.remove(at: index)
        lastDeletedSpaceWasShared = deleteSharedEverywhere(removed, now: now)
        recentlyDeleted.insert(DeletedSpace(space: Self.localCopy(removed), deletedAt: now, index: index), at: 0)
        lastDeletedSpaceId = id
        deletedSpaceWasShown = wasShown
        spaceUndoExpiry?.cancel()
        let window = undoWindow
        spaceUndoExpiry = Task { [weak self] in
            do { try await Task.sleep(for: window) } catch { return }
            guard let self, self.lastDeletedSpaceId == id else { return }
            self.lastDeletedSpaceId = nil
        }
        persistSession()
    }

    func undoDeleteSpace() {
        guard let id = lastDeletedSpaceId else { return }
        spaceUndoExpiry?.cancel()
        lastDeletedSpaceId = nil
        restoreDeleted(id, show: deletedSpaceWasShown)
    }

    /// Brings a Space back from Recently deleted, where it was. Refused, as
    /// on desktop, at 25 Spaces or when another Space now has its name.
    @discardableResult
    func restoreDeleted(_ id: String, show showIt: Bool = false) -> Bool {
        guard let index = recentlyDeleted.firstIndex(where: { $0.space.id == id }),
              spaces.filter({ $0.recoveredFrom == nil }).count < TabSets.spaceLimit,
              !nameTaken(recentlyDeleted[index].space.name) else { return false }
        let entry = recentlyDeleted.remove(at: index)
        spaces.insert(entry.space, at: min(entry.index, spaces.count))
        if showIt { show(set: id) }
        persistSession()
        return true
    }

    /// Snapshots the open tabs' URLs + active index to the session store
    /// (debounced). Suppressed while restoring so intermediate createTab calls
    /// don't overwrite the saved session mid-rebuild.
    func persistSession() {
        guard !isRestoringSession else { return }
        saveSession()
        syncEngine.tabsChanged()
        scheduleSharedPublish()
    }

    /// Writes session.json (debounced) without telling sync the tabs changed.
    private func saveSession() {
        guard !isRestoringSession else { return }
        // Private tabs are never saved. With only private tabs open, the saved
        // session is one blank tab, so tabs the person closed stay closed.
        let saved = tabs.filter { !$0.isPrivate }
        let urls = saved.isEmpty ? [Self.newTabURL.absoluteString] : saved.map { $0.currentURL.absoluteString }
        let activeIdx = saved.firstIndex(where: { $0.id == activeTabId }) ?? 0
        var state = SessionState(shown: shownSetId, iphone: iphoneSet, spaces: spaces, deleted: recentlyDeleted,
                                 sharedBaselines: sharedBaselines.isEmpty ? nil : sharedBaselines,
                                 sharedAccepted: sharedAccepted.isEmpty ? nil : sharedAccepted,
                                 sharedAccount: sharedAccount)
        let shown = captureShown()
        if shownSetId == TabSets.iphoneId { state.iphone = shown }
        else if let index = state.spaces.firstIndex(where: { $0.id == shownSetId }) { state.spaces[index].set = shown }
        sessionStore.save(urls: urls, activeIndex: activeIdx, state: state)
    }

    // MARK: Shared Spaces (M17c)

    /// On while "Keep Spaces and groups in sync on this iPhone" is; until then
    /// every hook below does nothing.
    var sharedAdapterEnabled = false
    /// Remote closes applied outside a merge pass (a waiting change applying
    /// as the person moves on), for Recently closed.
    @ObservationIgnored var sharedClosedSink: (([ClosedRow]) -> Void)?
    @ObservationIgnored private var sharedBaselines: [String: JSONValue] = [:]
    @ObservationIgnored private var sharedAccepted: [String: JSONValue] = [:]
    /// Local edits taken before an apply, waiting for `sharedSpaceEdits`.
    @ObservationIgnored private var sharedOutbox: [String: JSONValue] = [:]
    @ObservationIgnored private var sharedDeviceId: String?
    @ObservationIgnored private var sharedColdStartApplied = false

    private static func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    /// The protected tab: the shown set's selected tab, unless a private tab is.
    private var protectedSharedTabId: String? {
        guard let tab = activeTab, !tab.isPrivate else { return nil }
        return tab.sharedTabId
    }

    /// A shared Space's displayed baseline and its waiting changes.
    func sharedBaseline(_ spaceId: String) -> JSONValue? { sharedBaselines[spaceId] }
    func sharedAcceptedSet(_ spaceId: String) -> JSONValue? { sharedAccepted[spaceId] }

    /// What each shared Space changed here since it was last asked, for
    /// `SharedSpacesState.noteLocalSpace(id:blob:edits:)`: its full displayed
    /// blob and the field writes. New tabs get their record ids here.
    func sharedSpaceEdits(deviceId: String, now: Int64) -> [(spaceId: String, blob: JSONValue, edits: JSONValue)] {
        guard sharedAdapterEnabled else { return [] }
        collectSharedEdits(deviceId: deviceId, now: now)
        var out: [(spaceId: String, blob: JSONValue, edits: JSONValue)] = []
        for space in spaces {
            guard let sid = space.sharedId, let edits = sharedOutbox[sid], let blob = sharedBaselines[sid] else { continue }
            out.append((sid, blob, edits))
        }
        sharedOutbox = [:]
        return out
    }

    /// The index writes for renamed, recoloured or moved shared Spaces, for
    /// `SharedSpacesState.setIndex(_:)`; nil when there are none.
    func sharedIndexEdits(index: JSONValue?, deviceId: String, now: Int64) -> JSONValue? {
        guard sharedAdapterEnabled else { return nil }
        return SharedSpacesAdapter.indexEdits(spaces: spaces, index: index, deviceId: deviceId, now: now)
    }

    /// Applies merged Space blobs (by shared id) to their sets in one pass.
    /// The shown set's selected tab keeps its page: a navigation or close of
    /// it waits. Returns the tabs other devices closed, for Recently closed.
    @discardableResult
    func applyMergedSpaces(_ blobs: [String: JSONValue], deviceId: String) -> [ClosedRow] {
        guard sharedAdapterEnabled else { return [] }
        let now = Self.nowMs()
        // Take local changes first, so the pass can't undo one not yet recorded.
        collectSharedEdits(deviceId: deviceId, now: now)
        var closed: [ClosedRow] = []
        for index in spaces.indices {
            guard let sid = spaces[index].sharedId, let merged = blobs[sid] else { continue }
            if spaces[index].id == shownSetId {
                closed += applyToShown(merged, spaceId: sid, protectedTabId: protectedSharedTabId, now: now)
            } else {
                // A put-away set has no protected tab, and its closes are the
                // closing device's to list (desktop's reconcileCapture).
                let result = SharedSpacesAdapter.apply(
                    merged: merged, to: spaces[index].set, spaceId: sid, baseline: sharedBaselines[sid],
                    accepted: sharedAccepted[sid], protectedTabId: nil, now: now)
                spaces[index].set = result.set
                sharedBaselines[sid] = result.baseline
                sharedAccepted[sid] = nil
            }
        }
        saveSession()
        return closed
    }

    /// At launch, once: changes that waited for the selected tab when the app
    /// last ran apply now. A return from the background is not a launch, so a
    /// second call in the same run does nothing.
    @discardableResult
    func applyAcceptedOnColdStart() -> [ClosedRow] {
        guard sharedAdapterEnabled, !sharedColdStartApplied else { return [] }
        sharedColdStartApplied = true
        let now = Self.nowMs()
        var closed: [ClosedRow] = []
        for index in spaces.indices {
            guard let sid = spaces[index].sharedId, sharedAccepted[sid] != nil else { continue }
            if spaces[index].id == shownSetId {
                closed += applyToShown(nil, spaceId: sid, protectedTabId: nil, now: now)
            } else {
                let result = SharedSpacesAdapter.apply(
                    merged: nil, to: spaces[index].set, spaceId: sid, baseline: sharedBaselines[sid],
                    accepted: sharedAccepted[sid], protectedTabId: nil, now: now)
                spaces[index].set = result.set
                sharedBaselines[sid] = result.baseline
                sharedAccepted[sid] = nil
                closed += result.closed
            }
        }
        saveSession()
        return closed
    }

    /// With the switch on: the library's Spaces join the phone's, deleted
    /// ones leave, and a stale replica's records go to a recovery Space.
    func reconcileSharedLibrary(_ state: SharedSpacesState, deviceId: String, now: Int64) {
        guard sharedAdapterEnabled, state.isEnabled else { return }
        if let edits = sharedIndexEdits(index: state.data["index"], deviceId: deviceId, now: now) { try? state.setIndex(edits) }
        var blobs: [String: JSONValue] = [:]
        for (sid, entry) in state.data["blobs"]?.pairs ?? [] { if let blob = entry["blob"] { blobs[sid] = blob } }
        let dormant = (state.data["dormantIds"]?.array ?? []).compactMap(\.string)
        let result = SharedSpacesAdapter.reconcileLibrary(
            spaces: spaces, shownSetId: shownSetId, index: state.data["index"], blobs: blobs, dormant: Set(dormant),
            drafts: Set((state.data["draftIds"]?.array ?? []).compactMap(\.string)),
            recoveries: state.data["recoveries"], recoveryDone: state.data["recoveryDone"],
            baselines: sharedBaselines, recoveryName: { (name: String) -> String in TabsManager.sharedRecoveryName(name) })
        spaces = result.spaces
        sharedBaselines = result.baselines
        if !state.accountId.isEmpty { sharedAccount = state.accountId }
        for sid in Array(sharedAccepted.keys) where !spaces.contains(where: { $0.sharedId == sid }) {
            sharedAccepted[sid] = nil
        }
        for (sid, ids) in result.recoveryDone { state.markRecoveryDone(sid, tabIds: ids) }
        if !result.dormant.isEmpty { state.setDormant(dormant + result.dormant) }
        if !result.recoveredFromShown.isEmpty {
            let protected = protectedSharedTabId
            let moved = tabs.filter { tab in
                !tab.isPrivate && tab.sharedTabId.map { result.recoveredFromShown.contains($0) && $0 != protected } == true
            }
            for tab in moved {
                tab.exitReader()
                if let view = tab.existingWebView { contentBlocker.cancelPending(for: view) }
            }
            tabs.removeAll { tab in moved.contains { $0 === tab } }
            normalizeLayout()
            if tabs.isEmpty { createTab() }
        }
        saveSession()
    }

    /// "{name} · kept on this iPhone", until that key exists: desktop's
    /// "{name} · kept on this device".
    static func sharedRecoveryName(_ name: String) -> String {
        let key = "sharedSpaces.recoveryName.iphone"
        let text = SyncCopy.text(key, ["name": name])
        return text == key ? SyncCopy.text("sharedSpaces.recoveryName", ["name": name]) : text
    }

    private func collectSharedEdits(deviceId: String, now: Int64) {
        sharedDeviceId = deviceId
        var any = false
        for index in spaces.indices {
            guard let sid = spaces[index].sharedId else { continue }
            any = true
            let shown = spaces[index].id == shownSetId
            let set = shown ? captureShown() : spaces[index].set
            let result = SharedSpacesAdapter.localEdits(
                set: set, spaceId: sid, baseline: sharedBaselines[sid], accepted: sharedAccepted[sid],
                deviceId: deviceId, now: now)
            sharedBaselines[sid] = result.baseline
            sharedAccepted[sid] = result.accepted.pairs.isEmpty ? nil : result.accepted
            if shown { bindShown(result) } else { spaces[index].set = Self.bind(set, result) }
            if !result.edits.pairs.isEmpty {
                sharedOutbox[sid] = SharedSpacesModel.applyLocalEdits(sharedOutbox[sid], result.edits)
            }
        }
        if any { saveSession() }
    }

    private static func bind(_ set: SavedSet, _ result: SharedSpacesAdapter.LocalEdits) -> SavedSet {
        var out = set
        for (n, id) in result.tabIds.enumerated() { if let id { out.tabs[n].tabId = id } }
        for (old, new) in result.groupIds {
            for n in out.groups.indices where out.groups[n].id == old { out.groups[n].id = new }
            for n in out.tabs.indices where out.tabs[n].groupId == old { out.tabs[n].groupId = new }
        }
        return out
    }

    private func bindShown(_ result: SharedSpacesAdapter.LocalEdits) {
        let ordinary = tabs.filter { !$0.isPrivate }
        for (n, id) in result.tabIds.enumerated() where ordinary.indices.contains(n) {
            if let id { ordinary[n].sharedTabId = id }
        }
        for (old, new) in result.groupIds {
            for n in groups.indices where groups[n].id == old { groups[n].id = new }
            for tab in tabs where tab.groupId == old { tab.groupId = new }
        }
    }

    /// Applies what waited in the shown shared Space for tabs that are no
    /// longer protected (`nil`: every one, as on leaving the Space).
    private func applySharedAccepted(protectedTabId: String?) {
        guard sharedAdapterEnabled, let sid = shownSpace?.sharedId, sharedAccepted[sid] != nil else { return }
        let now = Self.nowMs()
        if let deviceId = sharedDeviceId { collectSharedEdits(deviceId: deviceId, now: now) }
        guard sharedAccepted[sid] != nil else { return }
        let closed = applyToShown(nil, spaceId: sid, protectedTabId: protectedTabId, now: now)
        saveSession()
        if !closed.isEmpty {
            sharedRemoteCloses(closed)
            sharedClosedSink?(closed)
        }
    }

    private func applyToShown(_ merged: JSONValue?, spaceId sid: String, protectedTabId: String?, now: Int64) -> [ClosedRow] {
        let result = SharedSpacesAdapter.apply(
            merged: merged, to: captureShown(), spaceId: sid, baseline: sharedBaselines[sid],
            accepted: sharedAccepted[sid], protectedTabId: protectedTabId, now: now)
        sharedBaselines[sid] = result.baseline
        sharedAccepted[sid] = result.accepted.pairs.isEmpty ? nil : result.accepted
        if result.changed { materializeShown(result) }
        return result.closed
    }

    /// Carries an applied set onto the live tabs: new records become quiet
    /// tabs, a remote close removes its tab without Undo, a navigation loads a
    /// live tab or rewrites a quiet one. Private tabs keep their places.
    private func materializeShown(_ result: SharedSpacesAdapter.Applied) {
        let ordinary = tabs.filter { !$0.isPrivate }
        let privates = tabs.enumerated().filter { $0.element.isPrivate }
        let selected = activeTabId
        let wasRestoring = isRestoringSession
        isRestoringSession = true
        var kept: [TabModel] = []
        for (n, saved) in result.set.tabs.enumerated() {
            let tab: TabModel
            if let source = result.sources[n], ordinary.indices.contains(source) {
                tab = ordinary[source]
                if let id = saved.tabId, result.navigated.contains(id), let url = URL(string: saved.url) {
                    applySharedNavigation(tab, to: url, title: saved.title)
                }
            } else {
                createTab(url: URL(string: saved.url) ?? Self.newTabURL, title: saved.title, quiet: true)
                guard let made = tabs.last else { continue }
                tab = made
            }
            tab.pinned = saved.pinned
            tab.groupId = saved.groupId
            tab.sharedTabId = saved.tabId
            kept.append(tab)
        }
        for tab in ordinary where !kept.contains(where: { $0 === tab }) {
            tab.exitReader()
            if let view = tab.existingWebView { contentBlocker.cancelPending(for: view) }
        }
        var next = kept
        for (offset, tab) in privates { next.insert(tab, at: min(offset, next.count)) }
        tabs = next
        groups = result.set.groups
        normalizeLayout()
        isRestoringSession = wasRestoring
        if tabs.isEmpty { createTab(); return }
        if selected == nil || !tabs.contains(where: { $0.id == selected }) {
            let shown = tabs.filter { !$0.isPrivate }
            activeTabId = shown.isEmpty ? tabs.first?.id : shown[min(max(result.set.activeIndex, 0), shown.count - 1)].id
        }
    }

    private func applySharedNavigation(_ tab: TabModel, to url: URL, title: String) {
        tab.exitReader()
        tab.pageTitle = title
        tab.currentURL = url
        tab.addressText = url.absoluteString
        if tab.hasWebView && !tab.isQuiet { tab.navigationDelegate.load(url, in: tab.webView) }
    }

    // MARK: Shared Spaces wiring (M17c Task 18)

    @ObservationIgnored private var sharedAccount: String?
    @ObservationIgnored private var sharedPublishTask: Task<Void, Never>?
    /// How long tab changes gather before their records are written.
    @ObservationIgnored var sharedPublishDelay: Duration = .milliseconds(300)

    private var currentSyncAccount: String? {
        let state = syncEngine.stateStore.state
        return state.enabled ? state.accountId : nil
    }

    /// Follows the sync and Spaces switches: the adapter runs while sync is
    /// on and the switch is on (or a dormant copy keeps its records); another
    /// account, or none, turns every shared Space back into a local copy; a
    /// switch that went off leaves each shared Space a dormant copy.
    func sharedSyncChanged() {
        let account = currentSyncAccount
        let linked = spaces.contains { $0.sharedId != nil }
        if linked, account == nil || account != sharedAccount { unlinkSharedSpaces() }
        let state = syncEngine.sharedState
        let on = account != nil && state.isEnabled && state.accountId == account
        if !on, spaces.contains(where: { $0.sharedId != nil && $0.link == .active }) {
            let ids = spaces.compactMap { $0.link == .active ? $0.sharedId : nil }
            for index in spaces.indices where spaces[index].link == .active { spaces[index].link = .dormant }
            if account != nil {
                state.setDormant((state.data["dormantIds"]?.array ?? []).compactMap(\.string) + ids)
            }
            saveSession()
        }
        let wasEnabled = sharedAdapterEnabled
        sharedAdapterEnabled = account != nil && (on || spaces.contains { $0.link == .dormant && $0.sharedId != nil })
        if on {
            sharedAccount = account
            if !wasEnabled { sharedSpacesMerged(["index"]) }
        }
    }

    /// Every shared link is dropped: the Spaces stay as local copies.
    private func unlinkSharedSpaces() {
        for index in spaces.indices { spaces[index] = Self.localCopy(spaces[index]) }
        iphoneSet.tabs = iphoneSet.tabs.map { (tab: SavedTab) -> SavedTab in var t = tab; t.tabId = nil; return t }
        for tab in tabs { tab.sharedTabId = nil }
        sharedBaselines = [:]
        sharedAccepted = [:]
        sharedOutbox = [:]
        sharedAccount = nil
        saveSession()
    }

    /// A Space with no shared link and no record ids.
    static func localCopy(_ space: SpaceRecord) -> SpaceRecord {
        var copy = space
        copy.sharedId = nil
        copy.link = nil
        copy.set.tabs = copy.set.tabs.map { (tab: SavedTab) -> SavedTab in var t = tab; t.tabId = nil; return t }
        return copy
    }

    /// Merged index or Space blobs arrived: the library joins the phone's
    /// Spaces, each changed blob applies to its set, and pages other devices
    /// closed go to Recently closed.
    func sharedSpacesMerged(_ ids: [String]) {
        guard sharedAdapterEnabled else { return }
        let engine = syncEngine
        let state = engine.sharedState
        guard state.isEnabled else { return }
        let deviceId = engine.stateStore.state.deviceId
        let now = Self.nowMs()
        sharedAccount = currentSyncAccount
        reconcileSharedLibrary(state, deviceId: deviceId, now: now)
        var blobs: [String: JSONValue] = [:]
        for id in ids where id != "index" { if let blob = state.blob(id) { blobs[id] = blob } }
        let closed = blobs.isEmpty ? [] : applyMergedSpaces(blobs, deviceId: deviceId)
        sharedRemoteCloses(closed)
        publishSharedEdits()
    }

    /// Pages another device closed, now closed here: into Recently closed,
    /// named after the device that closed them.
    func sharedRemoteCloses(_ rows: [ClosedRow]) {
        for row in rows {
            syncEngine.recordClosed(url: row.url, title: row.title, id: row.id, spaceId: row.spaceId)
        }
    }

    private func scheduleSharedPublish() {
        guard sharedAdapterEnabled else { return }
        sharedPublishTask?.cancel()
        let delay = sharedPublishDelay
        sharedPublishTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            self?.publishSharedEdits()
        }
    }

    /// Writes what the shown and put-away shared Spaces changed here into
    /// the Spaces state (records and identity), then asks for an upload.
    func publishSharedEdits() {
        sharedPublishTask?.cancel()
        sharedPublishTask = nil
        guard sharedAdapterEnabled, let account = currentSyncAccount else { return }
        let engine = syncEngine
        let state = engine.sharedState
        guard state.accountId == account else { return }
        let deviceId = engine.stateStore.state.deviceId
        let now = Self.nowMs()
        var changed = false
        for edit in sharedSpaceEdits(deviceId: deviceId, now: now) {
            if (try? state.noteLocalSpace(id: edit.spaceId, blob: edit.blob, edits: edit.edits)) != nil { changed = true }
        }
        if state.isEnabled, let edits = sharedIndexEdits(index: state.data["index"], deviceId: deviceId, now: now) {
            if (try? state.setIndex(edits)) != nil { changed = true }
        }
        if changed { engine.spacesChanged() }
    }

    /// A tab the person closed here: into Recently closed, unless private or
    /// not a web page. In a shared Space its id is the shared record's, so
    /// every device lists the page once.
    private func recordLocalClose(_ tab: TabModel) {
        guard !tab.isPrivate, SharedSpacesAdapter.isHTTP(tab.currentURL.absoluteString) else { return }
        let space = shownSpace?.sharedId
        let id = space != nil ? (tab.sharedTabId ?? UUID().uuidString.lowercased()) : UUID().uuidString.lowercased()
        syncEngine.recordClosed(url: tab.currentURL.absoluteString, title: tab.pageTitle, id: id,
                                spaceId: tab.sharedTabId != nil ? space : nil)
    }

    /// Deleting a shared Space (switch on) writes its index tombstone at
    /// once, as desktop does; returns whether it did.
    private func deleteSharedEverywhere(_ space: SpaceRecord, now: Int64) -> Bool {
        guard let sid = space.sharedId, space.link == .active, sharedAdapterEnabled else { return false }
        let engine = syncEngine
        let state = engine.sharedState
        guard state.isEnabled, var record = state.data["index"]?["spaces"]?[sid] else { return false }
        record["deleted"] = SharedSpacesModel.field(
            .bool(true), max(now, (record["deleted"]?["c"]?.intValue ?? 0) + 1), engine.stateStore.state.deviceId)
        guard (try? state.setIndex(.object([("v", .number(1)), ("spaces", .object([(sid, record)]))]))) != nil
        else { return false }
        sharedBaselines[sid] = nil
        sharedAccepted[sid] = nil
        sharedOutbox[sid] = nil
        engine.spacesChanged()
        return true
    }

    // MARK: The Spaces switch (M17c Task 18, M16 §4.6)

    /// The switch-on sheet's rows, from the merged index.
    func sharingRows() -> [SharedSpacesSharing.Row] {
        storeShown()
        let engine = syncEngine
        return SharedSpacesSharing.rows(
            spaces: spaces, index: engine.sharedState.data["index"], deviceId: engine.stateStore.state.deviceId,
            now: Self.nowMs())
    }

    /// Turns the switch on with `choices`: each copy joins the library as a
    /// new Space (blob first, then its index entry), each Rejoin resumes its
    /// kept records, then the switch goes on and a pass uploads them.
    func turnOnSharedSpaces(_ choices: [(id: String, mode: SharedSpacesSharing.Mode)]) -> SharedSpacesSharing.PlanError? {
        let engine = syncEngine
        guard let account = currentSyncAccount else { return .notFound }
        let state = engine.sharedState
        state.rebind(accountId: account)
        storeShown()
        let deviceId = engine.stateStore.state.deviceId
        let now = Self.nowMs()
        let items: [SharedSpacesSharing.Item]
        switch SharedSpacesSharing.plan(
            spaces: spaces, choices: choices, index: state.data["index"], deviceId: deviceId, now: now) {
        case .failure(let error): return error
        case .success(let planned): items = planned
        }
        var dormant = (state.data["dormantIds"]?.array ?? []).compactMap(\.string)
        for item in items {
            guard let index = spaces.firstIndex(where: { $0.id == item.spaceId }) else { continue }
            if item.mode == .copy, let blob = item.blob, let entry = item.indexEntry {
                guard (try? state.noteLocalSpace(id: item.sharedId, blob: blob, edits: item.edits)) != nil,
                      (try? state.setIndex(.object([("v", .number(1)), ("spaces", .object([(item.sharedId, entry)]))]))) != nil
                else { return .tooLarge }
                if let old = spaces[index].sharedId { dormant.removeAll { $0 == old }; sharedBaselines[old] = nil; sharedAccepted[old] = nil }
                bindSharedCopy(at: index, item)
                sharedBaselines[item.sharedId] = blob
            } else {
                spaces[index].link = .active
                dormant.removeAll { $0 == item.sharedId }
            }
        }
        state.setDormant(dormant)
        sharedAccount = account
        saveSession()
        if state.isEnabled {
            sharedAdapterEnabled = true
            sharedSpacesMerged(["index"])
            engine.spacesChanged()
        } else {
            engine.setSpacesEnabled(true)
        }
        return nil
    }

    /// A Space now in the library: its record ids on its saved tabs (and on
    /// the live tabs when it is shown), its groups under their record ids.
    private func bindSharedCopy(at index: Int, _ item: SharedSpacesSharing.Item) {
        spaces[index].sharedId = item.sharedId
        spaces[index].link = .active
        var set = spaces[index].set
        for (n, id) in item.tabIds.enumerated() where set.tabs.indices.contains(n) { set.tabs[n].tabId = id }
        for (old, new) in item.groupIds {
            for n in set.groups.indices where set.groups[n].id == old { set.groups[n].id = new }
            for n in set.tabs.indices where set.tabs[n].groupId == old { set.tabs[n].groupId = new }
        }
        spaces[index].set = set
        guard spaces[index].id == shownSetId else { return }
        let ordinary = tabs.filter { !$0.isPrivate }
        for (n, id) in item.tabIds.enumerated() where ordinary.indices.contains(n) { ordinary[n].sharedTabId = id }
        for (old, new) in item.groupIds {
            for n in groups.indices where groups[n].id == old { groups[n].id = new }
            for tab in tabs where tab.groupId == old { tab.groupId = new }
        }
    }

    /// Off: every shared Space stays here as a dormant copy that keeps its
    /// records; nothing is deleted or taken back anywhere.
    func turnOffSharedSpaces() {
        syncEngine.setSpacesEnabled(false)
        sharedSyncChanged()
    }

    /// "Save This iPhone as a Space": This iPhone's tabs become a new Space,
    /// shown now; This iPhone keeps a Start Page. Returns the Space's id.
    @discardableResult
    func saveIPhoneAsSpace() throws -> String {
        let base = syncEngine.status["deviceName"]?.text.flatMap { $0.isEmpty ? nil : $0 } ?? "iPhone"
        var name = TabSets.spaceName(base) ?? "iPhone"
        var n = 2
        while nameTaken(name) { name = TabSets.spaceName("\(base) \(n)") ?? "\(base) \(n)"; n += 1 }
        let preset = SpaceIdentity.presets[spaces.count % SpaceIdentity.presets.count]
        let id = try createSpace(name: name, color: preset.hex, symbol: SpaceIdentity.symbolIds[0])
        storeShown()
        let saved = shownSetId == TabSets.iphoneId ? iphoneSet : (savedSet(TabSets.iphoneId) ?? SavedSet())
        guard let index = spaces.firstIndex(where: { $0.id == id }) else { return id }
        spaces[index].set = saved.tabs.isEmpty ? spaces[index].set : saved
        iphoneSet = SavedSet(tabs: [SavedTab(url: Self.newTabURL.absoluteString, title: "")])
        if shownSetId == TabSets.iphoneId {
            shownSetId = id
            for tab in tabs where !tab.isPrivate { tab.sharedTabId = nil }
        } else {
            persistSession()
        }
        persistSession()
        return id
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
                for tab in tabs where tab.hasWebView {
                    applyBlocking(to: tab, for: tab.currentURL)
                    tab.webView.reload()
                }
            } else {
                // Cold-compile still in flight: queue each tab; drainPending attaches
                // once the list is ready (setEnabled(true) re-opened attachment).
                for tab in tabs where tab.hasWebView {
                    applyBlocking(to: tab, for: tab.currentURL)
                }
            }
        } else {
            for tab in tabs where tab.hasWebView {
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

struct ClosedTab {
    let tab: TabModel
    let index: Int
    /// The blank tab closing the last tab opened, if any.
    var blankId: UUID?
    /// The rest of a group closed in one go, each with its index (M17).
    var others: [(tab: TabModel, index: Int)] = []
    /// The closed group, put back by Undo.
    var group: TabGroup?
    /// Close Group, rather than one tab: the banner says so.
    var groupClose = false
}

enum GroupNameError: Error, Equatable { case empty, duplicate }

struct ReopenEntry: Equatable {
    let url: URL
    let title: String
}
