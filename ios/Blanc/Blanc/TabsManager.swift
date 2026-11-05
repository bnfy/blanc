import Observation
import Foundation
import WebKit
import UIKit

@Observable
final class TabsManager {
    private(set) var tabs: [TabModel] = []
    /// The shown set's tab groups, in the order their sections draw (M17).
    private(set) var groups: [TabGroup] = []
    /// Split View (F53): pairs of tabs kept side by side (`SplitModel`).
    private(set) var splits: [TabSplit] = []
    var isWallpaperPickerPresented = false
    var wallpaperSelectionCompletion: ((UIImage?) -> Void)?
    var startAppearance: StartAppearanceStore { services.startAppearance }
    var isPalettePresented = false {
        didSet { if !isPalettePresented { paletteDraft = "" } }
    }
    /// The palette's text. It lives here rather than in the palette's view so
    /// folding or unfolding, which swaps the sheet and the panel, keeps it
    /// (Duo-1); every close clears it.
    var paletteDraft = ""
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
        let configuration = WebViewConfiguration.make(schemeHandler: schemeHandler, bridge: bridge, dataStore: siteDataStore)
        // Marked from the start of every load (pages.css hides Customize under
        // the class), so a reload never shows the button even for a moment.
        configuration.userContentController.addUserScript(WKUserScript(source: """
            document.documentElement.classList.add('start-preview');
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
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
        if let space = pendingBringSpace {
            pendingBringSpace = nil
            bringSpaceTarget = space
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
        let iphone = SyncCrypto.lowercaseLikeJavaScript(TabSets.deviceSetName)
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

    /// Moves the Island. Open Start Pages reload, so their header and footer
    /// make room for it where it now sits.
    func setIslandPosition(_ position: IslandPosition) {
        guard position != settingsStore.islandPosition else { return }
        settingsStore.update(islandPosition: position)
        for tab in tabs where tab.hasWebView && !TabModel.allowsPullToRefresh(tab.currentURL) {
            tab.webView.reload()
        }
    }

    func setAdblockExceptions(_ exceptions: [String]) {
        let old = settingsStore.adblockExceptions
        settingsStore.update(adblockExceptions: exceptions)
        for tab in tabs where tab.hasWebView && AdblockExceptions.isExcepted(tab.currentURL, in: old) != AdblockExceptions.isExcepted(tab.currentURL, in: settingsStore.adblockExceptions) {
            applyBlocking(to: tab, for: tab.currentURL)
            tab.webView.reload()
        }
    }
    var readerPreferences: ReaderPreferences { services.readerPreferences }
    var readerError = false
    /// The shown tab. Whatever makes a tab current also wakes it if quiet.
    var activeTabId: UUID? {
        didSet {
            if !holdingWake, let tab = activeTab, tab.isQuiet { wake(tab) }
            // A tab switch ends a Glance (F34), as on desktop.
            if activeTabId != oldValue { glanceTabId = nil }
        }
    }
    /// The addresses quiet tabs last woke at, newest last (a test seam).
    @ObservationIgnored private(set) var wokenURLs: [URL] = []
    /// At launch, while waiting changes for the selected tab apply: every
    /// restored tab stays quiet until they have (M16 §4.4).
    @ObservationIgnored private var holdingWake = false

    /// What every window shares (`BrowserServices`).
    @ObservationIgnored let services: BrowserServices
    /// This window's id in the saved session (its scene's, once there are
    /// several windows).
    @ObservationIgnored let windowId: String
    /// The window's `UISceneSession.persistentIdentifier`, when it has one.
    @ObservationIgnored let sceneSessionId: String?
    /// Closes this window (set by its `WindowRoot`); with it, closing the last
    /// tab closes the window when another window is open.
    @ObservationIgnored var closeWindowAction: (() -> Void)?
    /// Whether the window shows its own unsaved set (a new window's), not
    /// This iPhone or a Space.
    var showsUnsavedSet: Bool { shownSetId == SavedWindow.unsavedSetId(windowId) }
    private var library: SpaceLibrary { services.library }
    /// Whether this window is rebuilding its tabs, when nothing is saved.
    var isRestoring: Bool { isRestoringSession }
    var settingsStore: SettingsStore { services.settingsStore }
    var historyStore: HistoryStore { services.historyStore }
    private var syncDirectory: URL { services.syncDirectory }
    var syncEngine: SyncEngine { services.syncEngine }

    /// Sync has news: the open pages hear of it, and Shared Spaces apply it.
    func syncDidChange() {
        bridge.emitSyncChanges()
        sharedSyncChanged()
    }
    var normalizer: AddressNormalizer

    private var schemeHandler: BlancSchemeHandler { services.schemeHandler }
    @ObservationIgnored private lazy var bridge = PagesBridge(manager: self)
    @ObservationIgnored private lazy var startPageHold = StartPageHold(manager: self)
    private var contentBlocker: ContentBlocker { services.contentBlocker }
    private var sessionStore: SessionStore { services.sessionStore }
    @ObservationIgnored private var isRestoringSession = false

    static let newTabURL = URL(string: "blanc://newtab/")!
    static let privateNewTabURL = URL(string: "blanc://newtab/?private=1")!

    /// One in-memory web session shared by every private tab, forgotten when
    /// the last private tab closes (and when Blanc quits).
    var privateDataStore: WKWebsiteDataStore { services.privateDataStore }

    /// Settings → Privacy's Clear cookies, cache & site data, as on the computer:
    /// signs every site out, in normal and private tabs, then reloads the open
    /// pages so none stays signed in from memory. History, Favorites and Sync stay.
    func clearSiteData() async {
        let stores = [siteDataStore, services.existingPrivateStore].compactMap { $0 }
        await withTaskGroup(of: Void.self) { group in
            for store in stores { group.addTask { await Self.clearWebsites(in: store) } }
        }
        pagesToReloadAfterClearing.forEach { $0.reload() }
        services.forgetTabHistories()
    }

    /// Open web pages; quiet tabs load fresh when shown, and Blanc's own pages
    /// keep their storage.
    var pagesToReloadAfterClearing: [TabModel] {
        tabs.filter { $0.existingWebView != nil && ReaderController.isWebURL($0.currentURL) }
    }

    /// Removes by data record rather than by date: WebKit lists only web sites'
    /// records, so Blanc's own blanc:// pages (Mahjong saves, hidden top sites)
    /// keep their storage.
    private static func clearWebsites(in store: WKWebsiteDataStore) async {
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        await store.removeData(ofTypes: types, for: await store.dataRecords(ofTypes: types))
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

    var siteDataStore: WKWebsiteDataStore { services.siteDataStore }

    convenience init(settingsDirectory: URL? = nil, sessionDirectory: URL? = nil, siteDataStore: WKWebsiteDataStore = .default()) {
        self.init(services: BrowserServices(settingsDirectory: settingsDirectory, sessionDirectory: sessionDirectory,
                                            siteDataStore: siteDataStore))
    }

    init(services: BrowserServices, windowId: String = "main", sceneSessionId: String? = nil) {
        self.services = services
        self.windowId = windowId
        self.sceneSessionId = sceneSessionId
        self.normalizer = AddressNormalizer(searchEngine: services.settingsStore.searchEngine)
        services.register(self)

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
        if UITestSeed.split { restoredState = UITestSeed.splitState() }
        if UITestSeed.sharedSeed {
            UITestSeed.seedSharedSpaces(into: syncDirectory)
            restoredState = UITestSeed.sharedSpacesState()
        }
        if UITestSeed.appStore {
            UITestSeed.seedAppStore(into: syncDirectory)
            restoredState = UITestSeed.appStoreState()
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
        // Glance needs the layout, which the window reports once it shows.
        defer { if UITestSeed.glance { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [self] in showInGlance(tabs[1].id) } } }
        defer { if UITestSeed.twoTabs { activeTabId = tabs.first?.id } }
        #endif
        // The first window to start reads the saved sets; the rest share them.
        if !library.loaded {
            if let state = restoredState { library.load(state) } else { library.markLoaded() }
            services.loadSavedWindows(restoredState?.windows ?? [])
        }
        let entry = services.savedWindow(windowId)
        let wanted = entry?.shown ?? restoredState?.shown ?? TabSets.iphoneId
        // A closed window opened again from Recently closed brings its tabs.
        let reopened = services.takePendingSet(windowId)
        // A window that isn't the only one and has no set of its own, or whose
        // set another window shows, starts with an unsaved set and a Start Page.
        let startsUnsaved = services.windows.count > 1
            && (entry == nil || services.window(showing: wanted, except: self) != nil)
        let target = services.takePendingShow(windowId)
        let targetSet = target.flatMap { id in
            services.window(showing: id, except: self) == nil
                ? (id == TabSets.iphoneId ? iphoneSet : spaces.first { $0.id == id }?.set) : nil
        }
        if let reopened {
            shownSetId = SavedWindow.unsavedSetId(windowId)
            show(reopened)
            persistSession()
        } else if let target, let targetSet {
            // A Space the person chose to open here rather than close tabs.
            shownSetId = target
            show(targetSet)
            persistSession()
        } else if startsUnsaved || entry?.showsUnsavedSet == true {
            shownSetId = SavedWindow.unsavedSetId(windowId)
            show(startsUnsaved ? SavedSet() : entry?.set ?? SavedSet())
            persistSession()
        } else if let state = restoredState {
            let shown = entry?.shown ?? state.shown
            if spaces.contains(where: { $0.id == shown }) { shownSetId = shown }
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
        walkthrough = WalkthroughFlow(
            paired: SyncStateStore(directory: syncDirectory).state.enabled,
            completedVersion: Self.walkthroughForced ? 0
                : Self.walkthroughSuppressed ? .max : settingsStore.walkthroughCompletedVersion,
            isDefaultBrowser: nil)
        #if DEBUG
        // Screenshots of the What arrived card from a seeded sync.
        if ProcessInfo.processInfo.arguments.contains("-BlancUITestWalkthroughArrived") { walkthrough.joined() }
        #endif
    }

    // MARK: The first-minute walkthrough (M18 §3)

    /// The card over the start page; `current == nil` hides it.
    var walkthrough = WalkthroughFlow(paired: true, completedVersion: .max, isDefaultBrowser: nil)

    /// UI tests start past the walkthrough unless one asks for it with
    /// `-BlancUITestWalkthrough`, which shows it as on a fresh install.
    private static var walkthroughSuppressed: Bool {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains { $0.hasPrefix("-BlancUITest") } && !walkthroughForced
        #else
        return false
        #endif
    }
    private static var walkthroughForced: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-BlancUITestWalkthrough")
        #else
        return false
        #endif
    }

    /// Settings → About → Show the welcome again.
    func replayWalkthrough() {
        settingsDestination = nil
        // The card rises once the Settings sheet has gone.
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(600))
            walkthrough = .replay(paired: syncEngine.stateStore.state.enabled,
                                  isDefaultBrowser: nil)
        }
    }

    /// Closes the card by any path: the privacy choice is saved with the value
    /// on screen if it wasn't already (§3.2), and this version counts as seen.
    func closeWalkthrough(usagePingShown: Bool) {
        if walkthrough.close() { settingsStore.update(usagePing: usagePingShown) }
        settingsStore.update(walkthroughCompletedVersion: WalkthroughFlow.version)
        settingsStore.flush()
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
            dataStore: isPrivate ? privateDataStore : siteDataStore,
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
        tab.wake(history: tab.isPrivate ? nil : services.tabHistory.state(id: tab.historyId))
    }

    /// After the person clears their history: nothing open now, or waiting on
    /// Undo, writes its list again.
    func stopSavingTabHistories() {
        tabs.forEach { $0.savesHistory = false }
        lastClosed?.tab.savesHistory = false
    }

    /// Saves each open page's Back and Forward list; a quiet tab's stays as it was.
    func saveTabHistories() {
        tabs.forEach(saveHistory(of:))
    }

    private func saveHistory(of tab: TabModel) {
        guard !tab.isPrivate, tab.savesHistory, let view = tab.existingWebView else { return }
        // A Start Page comes back fresh, as a new tab does.
        if tab.currentURL.scheme != "blanc", view.canGoBack || view.canGoForward,
           let state = view.interactionState as? Data {
            services.tabHistory.save(state, id: tab.historyId)
        } else {
            services.tabHistory.remove(tab.historyId)
        }
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
        tab.onPagePinch = { [weak self] in self?.onPagePinch?($0) }
        tab.uiDelegate.canGlance = { [weak self] in self?.canOpenGlance ?? false }
        tab.uiDelegate.onGlance = { [weak self] url in self?.openInGlance(url) }
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
    /// Each step of a pinch on a page, for the window to follow. A callback,
    /// because `onChange` merges steps that land together and would lose one.
    @ObservationIgnored var onPagePinch: ((PagePinchUpdate) -> Void)?

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
        // Back open: no longer recently closed here.
        for id in closed.closedIds { recentlyClosed.remove(id) }
        if let blankId = closed.blankId, let blank = tabs.first(where: { $0.id == blankId }),
           blank.currentURL == Self.newTabURL, !blank.canGoBack {
            tabs.removeAll { $0.id == blankId }
        }
        for (tab, index) in ([(closed.tab, closed.index)] + closed.others).sorted(by: { $0.1 < $1.1 }) {
            tabs.insert(tab, at: min(index, tabs.count))
        }
        if let group = closed.group, !groups.contains(where: { $0.id == group.id }) { groups.append(group) }
        for split in closed.splits {
            // A split comes back whole: its other tab must still be open.
            let open = split.tabIds.allSatisfy { id in tabs.contains { $0.id == id } }
            if open, split.tabIds.allSatisfy({ self.split(for: $0) == nil }) { splits.append(split) }
        }
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

    /// Lets Undo bring back `closing` for `undoWindow`, then lets it go.
    private func startUndoWindow(for closing: TabModel) {
        let window = undoWindow
        undoExpiry = Task { [weak self] in
            do { try await Task.sleep(for: window) } catch { return }
            guard let self, self.lastClosed?.tab === closing else { return }
            self.expireUndo()
        }
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
        let closingSplit = split(for: id)
        tabs.remove(at: index)
        let recorded = recordLocalClose(closing)
        normalizeLayout()
        services.releasePrivateBrowsingIfUnused()
        // Only the newest close is undoable. A private tab's close is final, as
        // on desktop: no Undo, never in the reopen list.
        expireUndo()
        if !closing.isPrivate {
            lastClosed = ClosedTab(tab: closing, index: index, blankId: nil,
                                   group: closingGroup.flatMap { g in groups.contains { $0.id == g.id } ? nil : g },
                                   closedIds: recorded.map { [$0] } ?? [],
                                   splits: closingSplit.map { [$0] } ?? [])
            startUndoWindow(for: closing)
        }

        if tabs.isEmpty {
            if closeEmptyWindow() { return }
            let blank = createTab()
            lastClosed?.blankId = blank
            return
        }

        if wasActive {
            // Closing a pane leaves its split's other tab current.
            let partner = closingSplit?.tabIds.first { $0 != id && tabs.map(\.id).contains($0) }
            activeTabId = partner ?? tabs[min(index, tabs.count - 1)].id
        }
        persistSession()
    }

    func setActive(_ id: UUID) {
        if id != activeTabId { activeTab?.captureThumbnail() }
        guard tabs.contains(where: { $0.id == id }) else { return }
        let leaving = protectedSharedTabId
        activeTabId = id
        activeTab?.showIsland()
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
        // A split's tabs share a group, a pin and privacy, and sit together. A
        // change from elsewhere (a closed tab, a synced move) that breaks that
        // dissolves the split rather than moving tabs the person didn't touch.
        let live = Dictionary(uniqueKeysWithValues: tabs.map { ($0.id, $0) })
        splits = splits.filter { split in
            let members = split.tabIds.compactMap { live[$0] }
            guard members.count == split.tabIds.count, members.count >= 2, let first = members.first else { return false }
            return members.allSatisfy { $0.groupId == first.groupId && $0.pinned == first.pinned && $0.isPrivate == first.isPrivate }
        }
        if !splits.isEmpty {
            tabs = SplitModel.normalizeOrder(tabs.map(\.id), splits: splits).compactMap { live[$0] }
        }
        if let glanceTabId, live[glanceTabId] == nil || split(for: glanceTabId) != nil { self.glanceTabId = nil }
    }

    // MARK: Windows (multiple windows design, W2b)

    /// What iPadOS's window list calls this window: its Space, or its page.
    var windowTitle: String {
        if let space = shownSpace { return space.name }
        return activeTab.map(TabTitle.display) ?? ""
    }

    /// A switch to this set waits for the person: this window's unsaved tabs
    /// would close (`show(set:closingUnsaved:)`).
    var pendingSetSwitch: String?

    /// This window's unsaved tabs worth asking about: ordinary tabs other
    /// than an untouched Start Page.
    var unsavedTabCount: Int {
        guard showsUnsavedSet else { return 0 }
        return tabs.filter { !$0.isPrivate && !($0.currentURL == Self.newTabURL && !$0.canGoBack) }.count
    }

    /// The name a set goes by in the Spaces menu.
    func setName(_ id: String) -> String {
        id == TabSets.iphoneId ? TabSets.deviceSetName : spaces.first { $0.id == id }?.name ?? ""
    }

    /// The waiting switch, shown in a new window instead, leaving this one's
    /// tabs where they are.
    func showPendingSetInNewWindow() {
        guard let id = pendingSetSwitch else { return }
        pendingSetSwitch = nil
        services.openNewWindow(showing: id)
    }

    /// Closed windows in Recently closed, newest first.
    var closedWindows: [ClosedWindow] { recentlyClosed.currentWindows }
    func reopenClosedWindow(_ window: ClosedWindow) { services.reopen(window, fallback: self) }
    func forgetClosedWindow(_ window: ClosedWindow) { recentlyClosed.removeWindow(window.id) }

    /// This window as the saved session keeps it. A Space or This iPhone
    /// takes the window's live tabs back into the library first.
    func savedEntry() -> SavedWindow {
        let set = captureShown()
        if showsUnsavedSet { return SavedWindow(id: windowId, shown: shownSetId, set: set, session: sceneSessionId) }
        library.store(set, for: shownSetId)
        return SavedWindow(id: windowId, shown: shownSetId, session: sceneSessionId)
    }

    /// The last tab closed: with another window open, this window closes
    /// instead of opening a Start Page. Returns whether it did.
    private func closeEmptyWindow() -> Bool {
        guard services.windows.count > 1, let closeWindowAction else { return false }
        persistSession()
        closeWindowAction()
        return true
    }

    /// Takes a tab out of this window for another, page and all: nothing
    /// closes and nothing is recorded. It leaves its split, Glance and group.
    func detachTab(_ id: UUID) -> TabModel? {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return nil }
        let tab = tabs[index]
        let wasActive = id == activeTabId
        removeFromSplit(id)
        tabs.remove(at: index)
        tab.groupId = nil
        normalizeLayout()
        if tabs.isEmpty { createTab() }
        else if wasActive { activeTabId = tabs[min(index, tabs.count - 1)].id }
        persistSession()
        return tab
    }

    /// A tab moved here from another window: it replaces this window's
    /// untouched Start Page and becomes current.
    func adopt(_ tab: TabModel) {
        if tabs.count == 1, let only = tabs.first, only.currentURL == Self.newTabURL, !only.canGoBack {
            if let view = only.existingWebView { contentBlocker.cancelPending(for: view) }
            tabs.removeAll()
        }
        add(tab)
        activeTabId = tab.id
        persistSession()
    }

    // MARK: Keyboard shortcuts (D7, iPad)

    private var shortcutItems: [TabSections.Item] {
        tabs.map { TabSections.Item(id: $0.id.uuidString, groupId: $0.groupId, pinned: $0.pinned) }
    }

    /// ⌘1–9 (`TabShortcuts.target`).
    func selectTab(number: Int) {
        let splitIds = splits.map { $0.tabIds.map(\.uuidString) }
        switch TabShortcuts.target(number: number, items: shortcutItems, splits: splitIds) {
        case .group(let id): showGroup(id)
        case .tab(let id): if let tab = tabs.first(where: { $0.id.uuidString == id }) { setActive(tab.id) }
        case nil: break
        }
    }

    /// ⌘⇧] and ⌘⇧[: the next or previous tab in order, wrapping.
    func cycleTab(by offset: Int) {
        guard tabs.count > 1, let index = tabs.firstIndex(where: { $0.id == activeTabId }) else { return }
        setActive(tabs[(index + offset + tabs.count) % tabs.count].id)
    }

    /// ⌘+, ⌘− and ⌘0 on the current page.
    func zoomActive(step: Int) {
        guard let webView = activeTab?.existingWebView else { return }
        webView.pageZoom = TabShortcuts.zoom(from: Double(webView.pageZoom), step: step)
    }

    /// Find in Page on the current page, or its Reader view.
    func presentFind() {
        guard let tab = activeTab else { return }
        (tab.reader?.webView ?? tab.webView).findInteraction?.presentFindNavigator(showingReplace: false)
    }

    // MARK: Glance (F34)

    /// The tab shown in the Glance card over the current page. It's an
    /// ordinary open tab: closing the card leaves it open, as on desktop.
    private(set) var glanceTabId: UUID?
    var glanceTab: TabModel? { glanceTabId.flatMap { id in tabs.first { $0.id == id } } }
    /// Whether the window is wide enough for Glance and Split View, from the
    /// layout (`IslandLayout.showsSplitView`). Narrowing it ends a Glance.
    var showsWideLayout = false {
        didSet { if !showsWideLayout { glanceTabId = nil } }
    }
    /// The card's frame as fractions of the page area, for this run only.
    var glanceFrame: CGRect?

    /// Glance opens over a page that isn't a split's pane, in the wide layout.
    var canOpenGlance: Bool { showsWideLayout && activeTab != nil && activeSplit == nil }

    /// Opens `url` as a new tab shown in the Glance card, private when the
    /// current tab is. A Glance already open stays open as a tab.
    func openInGlance(_ url: URL) {
        guard canOpenGlance, let current = activeTab else { return }
        let id = createTab(url: url, isPrivate: current.isPrivate, quiet: true)
        guard let tab = tabs.first(where: { $0.id == id }) else { return }
        glanceTabId = id
        wakePane(tab)
        UIAccessibility.post(notification: .announcement, argument: SyncCopy.text("glance.openedUntitled"))
    }

    /// Shows an open tab in the Glance card.
    func showInGlance(_ id: UUID) {
        guard canOpenGlance, id != activeTabId, split(for: id) == nil,
              let tab = tabs.first(where: { $0.id == id }) else { return }
        glanceTabId = id
        wakePane(tab)
    }

    func closeGlance() { glanceTabId = nil }

    /// The tabs Glance could show over the current one.
    var glanceCandidates: [TabModel] {
        tabs.filter { $0.id != activeTabId && $0.id != glanceTabId && split(for: $0.id) == nil }
    }

    /// Ends the Glance and makes its page the current tab.
    func openGlanceAsTab() {
        guard let id = glanceTabId else { return }
        setActive(id)
    }

    /// Ends the Glance with its page beside the current one, the current
    /// page first.
    func keepGlanceAsSplit() {
        guard let id = glanceTabId, let current = activeTabId else { return }
        glanceTabId = nil
        makeSplit(current, with: id)
    }

    // MARK: Split View (F53)

    /// The split holding `tabId`, if any.
    func split(for tabId: UUID?) -> TabSplit? { SplitModel.split(for: tabId, in: splits) }

    /// The split the current tab is a pane of.
    var activeSplit: TabSplit? { split(for: activeTabId) }

    /// The tabs `tab` could be split with: open, not in a split, and private
    /// only with private.
    func splitCandidates(for tab: TabModel) -> [TabModel] {
        guard split(for: tab.id) == nil else { return [] }
        return tabs.filter { $0.id != tab.id && $0.isPrivate == tab.isPrivate && split(for: $0.id) == nil }
    }

    /// Puts `otherId` beside `tabId`, which stays current in the leading pane.
    /// The other tab takes `tabId`'s group (or none) and pin, as desktop's
    /// "the initiating tab's group wins".
    func makeSplit(_ tabId: UUID, with otherId: UUID) {
        guard let tab = tabs.first(where: { $0.id == tabId }),
              let other = splitCandidates(for: tab).first(where: { $0.id == otherId }) else { return }
        other.groupId = tab.groupId
        other.pinned = tab.pinned
        let made = SplitModel.create(initiator: tab.id, other: other.id)
        splits.append(made)
        normalizeLayout()
        if activeTabId != tab.id { setActive(tab.id) }
        wakePane(other)
        persistSession()
        UIAccessibility.post(notification: .announcement, argument: SyncCopy.text(
            "split.made", ["first": TabTitle.display(tab), "second": TabTitle.display(other)]))
    }

    /// Takes a tab out of its split; with two panes the split ends and both
    /// tabs stay open where they are.
    func removeFromSplit(_ tabId: UUID) {
        guard let index = splits.firstIndex(where: { $0.tabIds.contains(tabId) }) else { return }
        let result = SplitModel.remove(splits[index], tabId: tabId)
        if let next = result.split { splits[index] = next } else { splits.remove(at: index) }
        persistSession()
    }

    /// Closes every tab of the split as one Undo, which brings the split back.
    func closeSplit(_ id: String) {
        guard let split = splits.first(where: { $0.id == id }) else { return }
        let members = tabs.enumerated().filter { split.tabIds.contains($0.element.id) }
        guard let first = members.first else { return }
        let wasActive = members.contains { $0.element.id == activeTabId }
        for member in members {
            member.element.exitReader()
            if let view = member.element.existingWebView { contentBlocker.cancelPending(for: view) }
        }
        let closingGroup = groups.first { $0.id == first.element.groupId }
        tabs.removeAll { split.tabIds.contains($0.id) }
        let recorded = members.compactMap { recordLocalClose($0.element) }
        normalizeLayout()
        services.releasePrivateBrowsingIfUnused()
        expireUndo()
        if !first.element.isPrivate {
            lastClosed = ClosedTab(tab: first.element, index: first.offset, blankId: nil,
                                   others: members.dropFirst().map { ($0.element, $0.offset) },
                                   group: closingGroup.flatMap { g in groups.contains { $0.id == g.id } ? nil : g },
                                   closedIds: recorded, splits: [split])
            startUndoWindow(for: first.element)
        }
        if tabs.isEmpty {
            if closeEmptyWindow() { return }
            let blank = createTab()
            lastClosed?.blankId = blank
            return
        }
        if wasActive { activeTabId = tabs[min(first.offset, tabs.count - 1)].id }
        persistSession()
    }

    /// The leading pane's share of the width, from the divider.
    func setSplitRatio(_ id: String, _ ratio: Double) {
        guard let index = splits.firstIndex(where: { $0.id == id }) else { return }
        splits[index].ratio = SplitModel.clampRatio(ratio)
        saveSession()
    }

    /// A pane shown beside the current tab loads, as the current tab does:
    /// visible panes are never quiet.
    func wakePane(_ tab: TabModel) {
        if tab.isQuiet, !holdingWake { wake(tab) }
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
        // A split moves as one item: its panes join or leave the group together.
        if let split = split(for: tabId) { return moveSplit(split, toGroup: groupId) }
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

    /// `moveTab(_:toGroup:)` for a split, led by its first pane.
    private func moveSplit(_ split: TabSplit, toGroup groupId: String?) {
        if let groupId, !groups.contains(where: { $0.id == groupId }) { return }
        let members = split.tabIds.compactMap { id in tabs.first { $0.id == id } }
        guard let lead = members.first else { return }
        let old = lead.groupId
        for member in members { member.groupId = groupId }
        var ids = tabs.map { $0.id.uuidString }
        let keys = members.map { $0.id.uuidString }
        if let groupId {
            ids.removeAll(where: keys.contains)
            let last = tabs.last { $0.groupId == groupId && !split.tabIds.contains($0.id) }
            let at = last.flatMap { ids.firstIndex(of: $0.id.uuidString) }.map { $0 + 1 } ?? ids.count
            ids.insert(contentsOf: keys, at: at)
        } else if let old, let last = tabs.last(where: { $0.groupId == old }) {
            ids.removeAll(where: keys.contains)
            ids.insert(contentsOf: keys, at: ids.firstIndex(of: last.id.uuidString)! + 1)
        }
        reorder(ids)
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
        let groupSplits = splits.filter { s in s.tabIds.allSatisfy { id in members.contains { $0.element.id == id } } }
        tabs.removeAll { $0.groupId == id }
        let recorded = members.compactMap { recordLocalClose($0.element) }
        expireUndo()
        lastClosed = ClosedTab(tab: first.element, index: first.offset, blankId: nil,
                               others: members.dropFirst().map { ($0.element, $0.offset) }, group: group, groupClose: true,
                               closedIds: recorded, splits: groupSplits)
        startUndoWindow(for: first.element)
        normalizeLayout()
        if tabs.isEmpty {
            if closeEmptyWindow() { return }
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
    private(set) var spaces: [SpaceRecord] {
        get { library.spaces }
        set { library.spaces = newValue }
    }
    private(set) var recentlyDeleted: [DeletedSpace] {
        get { library.recentlyDeleted }
        set { library.recentlyDeleted = newValue }
    }
    /// The Space whose deletion Undo can still take back.
    private(set) var lastDeletedSpaceId: String?
    /// Whether that Space was deleted everywhere (it was shared).
    private(set) var lastDeletedSpaceWasShared = false
    @ObservationIgnored private var deletedSpaceWasShown = false
    @ObservationIgnored private var spaceUndoExpiry: Task<Void, Never>?
    private var iphoneSet: SavedSet {
        get { library.iphoneSet }
        set { library.iphoneSet = newValue }
    }

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
        let columns = SplitModel.capture(splits, saved: saved.map(\.id))
        return SavedSet(
            tabs: saved.map { SavedTab(url: $0.currentURL.absoluteString, title: $0.pageTitle, pinned: $0.pinned,
                                       groupId: $0.groupId, tabId: $0.sharedTabId, historyId: $0.historyId) },
            groups: groups,
            activeIndex: saved.firstIndex { $0.id == activeTabId } ?? 0,
            splits: columns.splits.isEmpty ? nil : columns.splits,
            splitIds: columns.splits.isEmpty ? nil : columns.splitIds)
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
        saveTabHistories()
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
        // Private tabs' splits stay with them; the set's own come back below.
        splits = splits.filter { s in s.tabIds.allSatisfy { id in privates.contains { $0.id == id } } }
        var restored: [UUID] = []
        for saved in set.tabs {
            createTab(url: URL(string: saved.url) ?? Self.newTabURL, title: saved.title, quiet: true)
            tabs.last?.pinned = saved.pinned
            tabs.last?.groupId = saved.groupId
            tabs.last?.sharedTabId = saved.tabId
            if let historyId = saved.historyId { tabs.last?.historyId = historyId }
            if let id = tabs.last?.id { restored.append(id) }
        }
        splits += SplitModel.restore(set.splits, splitIds: set.splitIds, restored: restored)
        if tabs.isEmpty { createTab(quiet: true) }
        let count = tabs.count
        tabs.append(contentsOf: privates)
        normalizeLayout()
        isRestoringSession = wasRestoring
        let ordinary = tabs.filter { !$0.isPrivate }
        activeTabId = ordinary[min(max(set.activeIndex, 0), count - 1)].id
    }

    /// Puts the shown set away and shows This iPhone or a Space.
    func show(set id: String, closingUnsaved: Bool = false) {
        guard id != shownSetId, let set = savedSet(id) else { return }
        // A set shows in one window: choosing one another window shows brings
        // that window forward instead (desktop's workspace controller).
        if let other = services.window(showing: id, except: self) {
            services.bringForward(windowId: other)
            return
        }
        // Unsaved tabs would close: ask first, as desktop does.
        if showsUnsavedSet, !closingUnsaved, unsavedTabCount > 0 {
            pendingSetSwitch = id
            return
        }
        pendingSetSwitch = nil
        expireUndo()
        // Leaving a shared Space applies what waited for its selected tab.
        applySharedAccepted(protectedTabId: nil)
        // A new window's unsaved tabs have nowhere to wait: like desktop's
        // switch from an unsaved window, they close, into Recently closed.
        if showsUnsavedSet { services.recordClosedTabs(captureShown().tabs) }
        else { storeShown() }
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
        let before = spaces[index]
        let changed = Set([
            ("name", before.name != space.name), ("color", before.color != space.color),
            ("symbol", before.symbol != space.symbol),
        ].filter(\.1).map(\.0))
        spaces[index] = space
        writeSharedIndex { index, deviceId, now in
            SharedSpacesAdapter.identityEdits(space, fields: changed, index: index, deviceId: deviceId, now: now)
        }
        persistSession()
    }

    func moveSpace(_ id: String, by offset: Int) {
        guard let index = spaces.firstIndex(where: { $0.id == id }) else { return }
        let target = min(max(index + offset, 0), spaces.count - 1)
        guard target != index else { return }
        spaces.insert(spaces.remove(at: index), at: target)
        writeSharedIndex { index, deviceId, now in
            SharedSpacesAdapter.orderEdits(spaces: spaces, index: index, deviceId: deviceId, now: now)
        }
        persistSession()
    }

    /// Moves an ordinary tab, ungrouped, to the end of another set. The
    /// shown set's only tab stays.
    func moveTab(_ tabId: UUID, toSpace id: String) {
        guard id != shownSetId, savedSet(id) != nil,
              let index = tabs.firstIndex(where: { $0.id == tabId }), !tabs[index].isPrivate,
              tabs.filter({ !$0.isPrivate }).count > 1 else { return }
        let tab = tabs[index]
        removeFromSplit(tab.id)
        saveHistory(of: tab)
        let saved = SavedTab(url: tab.currentURL.absoluteString, title: tab.pageTitle, pinned: tab.pinned,
                             historyId: tab.historyId)
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
        scheduleSharedAutoShare()
    }

    /// Writes session.json (debounced) without telling sync the tabs changed.
    private func saveSession() {
        guard !isRestoringSession else { return }
        services.saveSession()
    }

    // MARK: Shared Spaces (M17c)

    /// On while "Keep Spaces and groups in sync on this iPhone" is; until then
    /// every hook below does nothing.
    var sharedAdapterEnabled = false
    /// Remote closes applied outside a merge pass (a waiting change applying
    /// as the person moves on), for Recently closed.
    @ObservationIgnored var sharedClosedSink: (([ClosedRow]) -> Void)?
    private var sharedBaselines: [String: JSONValue] {
        get { library.sharedBaselines }
        set { library.sharedBaselines = newValue }
    }
    private var sharedAccepted: [String: JSONValue] {
        get { library.sharedAccepted }
        set { library.sharedAccepted = newValue }
    }
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

    /// Writes a rename, recolour, new symbol or move of a shared Space into
    /// the index as it's made here, switch on or off, as desktop does. Never
    /// at sync time: a comparison then takes another device's newer rename,
    /// merged but not yet applied, for an edit made here.
    private func writeSharedIndex(_ edits: (JSONValue?, String, Int64) -> JSONValue?) {
        guard sharedAdapterEnabled, let account = currentSyncAccount else { return }
        let engine = syncEngine
        let state = engine.sharedState
        guard state.accountId == account,
              let payload = edits(state.data["index"], engine.stateStore.state.deviceId, Self.nowMs()),
              (try? state.setIndex(payload)) != nil
        else { return }
        engine.spacesChanged()
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
                if let historyId = saved.historyId { made.historyId = historyId }
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

    private var sharedAccount: String? {
        get { library.sharedAccount }
        set { library.sharedAccount = newValue }
    }
    /// The phone's own Recently closed (Task 20).
    var recentlyClosed: RecentlyClosedStore { services.recentlyClosed }
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
        let state = syncEngine.sharedState
        // A build that didn't save the account (before M17c's wiring) may have
        // rewritten session.json: links with no account, still the Spaces
        // state's, are this account's, not another's.
        if linked, sharedAccount == nil, let account, state.accountId == account { sharedAccount = account }
        if linked, account == nil || account != sharedAccount { unlinkSharedSpaces() }
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
            // Switched on by a build before new Spaces shared by themselves:
            // the Spaces here now were already offered, so the update shares
            // nothing on its own.
            if state.knownSpaceIds == nil { state.markKnown(spaces.filter { $0.recoveredFrom == nil }.map(\.id)) }
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
        copy.set.tabs = copy.set.tabs.map { (tab: SavedTab) -> SavedTab in
            var t = tab
            t.tabId = nil
            t.historyId = nil
            return t
        }
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
            recentlyClosed.add(row)
            syncEngine.recordClosed(url: row.url, title: row.title, id: row.id, spaceId: row.spaceId)
        }
    }

    // MARK: Status (M17c Task 21)

    /// Recovery Spaces whose note was shown in the Spaces menu.
    private(set) var recoveryNoted: Set<String> {
        get { library.recoveryNoted }
        set { library.recoveryNoted = newValue }
    }
    /// The Spaces menu closed: each recovery Space's note has been said.
    func noteRecoveriesSeen() {
        let ids = Set(spaces.filter { $0.recoveredFrom != nil }.map(\.id))
        guard !ids.isSubset(of: recoveryNoted) else { return }
        recoveryNoted.formUnion(ids)
        saveSession()
    }
    /// A tab of the shown shared Space past its full budget: open as usual,
    /// marked "Not synced" (M16 §5).
    func isUnsynced(_ tab: TabModel) -> Bool {
        guard let sid = shownSpace?.sharedId, shownSpace?.link == .active, let id = tab.sharedTabId else { return false }
        return syncEngine.unsyncedTabIds(sid).contains(id)
    }

    // MARK: Recently closed band (M17c Task 20, design §11)

    /// Newest first, each page once: this phone's closes (its own, and pages
    /// another device closed here), then, with the Spaces switch on, other
    /// devices' closes.
    var closedBand: [ClosedRow] {
        let local = recentlyClosed.current
        let ids = Set(local.map(\.id))
        let remote = syncEngine.closedInbox.filter { !ids.contains($0.id) }
        return (local + remote).sorted { $0.closedAt > $1.closedAt }
    }
    /// The device a row was closed on, when not this phone.
    func closedDeviceName(_ row: ClosedRow) -> String? {
        guard let from = row.fromId else { return nil }
        return row.fromName ?? syncEngine.deviceName(for: from) ?? from
    }
    /// Reopens the page as a new tab in the shown set (a new record in a
    /// shared Space); the row leaves the band.
    func reopenClosed(_ row: ClosedRow) {
        guard let url = URL(string: row.url) else { return }
        forgetClosed(row)
        createTab(url: url, title: row.title)
    }
    /// Forget: hides the row on this phone.
    func forgetClosed(_ row: ClosedRow) {
        if recentlyClosed.rows.contains(where: { $0.id == row.id }) { recentlyClosed.remove(row.id) }
        else { syncEngine.forgetClosed(id: row.id) }
    }
    /// Clear all: this phone's closes, its synced entry, and every remote row.
    func clearClosedBand() {
        recentlyClosed.clear()
        syncEngine.clearClosed()
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

    /// Writes the tab and group records the shown and put-away shared Spaces
    /// changed here into the Spaces state, then asks for an upload. Renames
    /// and moves are written as they're made (`writeSharedIndex`).
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
        if changed { engine.spacesChanged() }
    }

    /// A tab the person closed here: into Recently closed, unless private or
    /// not a web page. In a shared Space its id is the shared record's, so
    /// every device lists the page once.
    @discardableResult
    private func recordLocalClose(_ tab: TabModel) -> String? {
        guard !tab.isPrivate, SharedSpacesAdapter.isHTTP(tab.currentURL.absoluteString) else { return nil }
        let space = shownSpace?.sharedId
        let id = space != nil ? (tab.sharedTabId ?? UUID().uuidString.lowercased()) : UUID().uuidString.lowercased()
        let spaceId = tab.sharedTabId != nil ? space : nil
        recentlyClosed.add(ClosedRow(id: id, url: tab.currentURL.absoluteString, title: tab.pageTitle,
                                     closedAt: Self.nowMs(), spaceId: spaceId, fromId: nil, fromName: nil))
        syncEngine.recordClosed(url: tab.currentURL.absoluteString, title: tab.pageTitle, id: id, spaceId: spaceId)
        return id
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
        let rows = SharedSpacesSharing.rows(
            spaces: spaces, index: engine.sharedState.data["index"], deviceId: engine.stateStore.state.deviceId,
            now: Self.nowMs())
        sharingShownIds.formUnion(rows.map(\.id))
        return rows
    }
    /// Spaces listed in a Choose Spaces sheet: offered once the sheet's
    /// choice is saved, so one left unticked stays on this iPhone.
    @ObservationIgnored private var sharingShownIds: Set<String> = []

    /// Turns the switch on with `choices`: each copy joins the library as a
    /// new Space (blob first, then its index entry), each Rejoin resumes its
    /// kept records, then the switch goes on and a pass uploads them.
    func turnOnSharedSpaces(_ choices: [(id: String, mode: SharedSpacesSharing.Mode)]) -> SharedSpacesSharing.PlanError? {
        let engine = syncEngine
        guard let account = currentSyncAccount else { return .notFound }
        let state = engine.sharedState
        state.rebind(accountId: account)
        storeShown()
        // A Space already in the library from here (shared by itself while
        // the sheet was open, say) is never added a second time.
        let choices = state.isEnabled
            ? choices.filter { choice in !spaces.contains { $0.id == choice.id && $0.sharedId != nil && $0.link == .active } }
            : choices
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
        state.markKnown(Array(sharingShownIds.union(choices.map(\.id))))
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

    // MARK: New Spaces share by themselves (owner, 2026-10-31; desktop #1290)

    @ObservationIgnored private var sharedAutoShareTask: Task<Void, Never>?
    /// How long a change settles before a new Space is shared (desktop's 1.5 s).
    @ObservationIgnored var sharedAutoShareDelay: Duration = .milliseconds(1500)

    private func scheduleSharedAutoShare() {
        guard sharedAdapterEnabled, syncEngine.sharedState.isEnabled else { return }
        sharedAutoShareTask?.cancel()
        let delay = sharedAutoShareDelay
        sharedAutoShareTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            self?.autoShareSpaces()
        }
    }

    /// With the switch on, a Space this iPhone hasn't offered yet joins the
    /// library as a new Space. One the person saw in a sheet and left
    /// unticked stays here; one that can't be shared (too many tabs, too
    /// large, no room) stays here and is offered in the sheet, not retried.
    /// Switched on by a build before this, what is here counts as offered.
    /// Returns the ids of the Spaces it shared.
    @discardableResult
    func autoShareSpaces() -> [String] {
        sharedAutoShareTask?.cancel()
        sharedAutoShareTask = nil
        let engine = syncEngine
        let state = engine.sharedState
        guard sharedAdapterEnabled, let account = currentSyncAccount, state.isEnabled,
              state.accountId == account else { return [] }
        let local = spaces.filter { $0.recoveredFrom == nil }
        guard let known = state.knownSpaceIds.map(Set.init) else {
            state.markKnown(local.map(\.id))
            return []
        }
        let fresh = local.filter { $0.sharedId == nil && !known.contains($0.id) }
        guard !fresh.isEmpty else { return [] }
        let index = state.data["index"], deviceId = engine.stateStore.state.deviceId, now = Self.nowMs()
        let fits = fresh.map(\.id).filter {
            (try? SharedSpacesSharing.plan(
                spaces: spaces, choices: [(id: $0, mode: .copy)], index: index, deviceId: deviceId, now: now).get()) != nil
        }
        state.markKnown(fresh.map(\.id).filter { !fits.contains($0) })
        guard !fits.isEmpty else { return [] }
        if let error = turnOnSharedSpaces(fits.map { (id: $0, mode: .copy) }) {
            if error == .limit || error == .tooLarge { state.markKnown(fits) }
            return []
        }
        return fits
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

    // MARK: Bring a Space (M17c Task 19, design §7)

    /// Another device's Space for the Spaces menu, the Quick Switcher and
    /// the review sheet, from the merged library index.
    struct RemoteSpace: Identifiable, Equatable {
        let id: String
        let name: String
        let color: String
        let symbol: String
        let deviceId: String
        let deviceName: String
    }
    /// The Space whose review sheet is open, and the one waiting for the palette to close.
    var bringSpaceTarget: RemoteSpace?
    @ObservationIgnored private var pendingBringSpace: RemoteSpace?

    /// With sync on and the Spaces switch off: the library's Spaces this
    /// phone doesn't hold, under the device that made each, read-only.
    var remoteSpaces: [RemoteSpace] {
        let engine = syncEngine
        // The merged index isn't observed itself; its live count is, so the
        // menu redraws when a preview read lands.
        _ = engine.libraryCount
        guard currentSyncAccount != nil, !engine.sharedState.isEnabled,
              engine.sharedState.accountId == currentSyncAccount else { return [] }
        let library = SharedSpacesModel.sanitizeIndex(engine.sharedState.data["index"])?["spaces"] ?? .object([])
        let held = Set(spaces.compactMap(\.sharedId))
        let own = engine.stateStore.state.deviceId
        return SharedSpacesModel.orderOf(library).compactMap { (sid: String) -> RemoteSpace? in
            guard let record = library[sid], !SharedSpacesModel.deleted(record), !held.contains(sid) else { return nil }
            let device = record["createdBy"]?.string ?? ""
            guard device != own else { return nil }
            return RemoteSpace(
                id: sid, name: record["name"]?["v"]?.string ?? "Space", color: record["color"]?["v"]?.string ?? "#426c4c",
                symbol: record["symbol"]?["v"]?.string ?? "briefcase", deviceId: device,
                deviceName: engine.deviceName(for: device) ?? device)
        }
    }

    /// Opens a Space's review sheet (after the palette, when it is open).
    func requestBringSpace(_ space: RemoteSpace) {
        isSpacesMenuPresented = false
        if isPalettePresented {
            pendingBringSpace = space
            isPalettePresented = false
        } else {
            bringSpaceTarget = space
        }
    }

    /// Whether another local Space can be made (25, recovery Spaces aside).
    var canAddSpace: Bool { spaces.filter { $0.recoveredFrom == nil }.count < TabSets.spaceLimit }

    /// Copies another device's Space onto this iPhone as a new local Space
    /// (fresh ids, no link, so later changes there don't reach it) and shows
    /// it: its tabs quiet, only the saved selection (or first tab) loading.
    @discardableResult
    func bringSpace(_ remote: RemoteSpace, blob: JSONValue) throws -> String {
        guard canAddSpace else { throw SpaceError.limit }
        var set = SharedSpacesAdapter.project(blob)
        guard !set.tabs.isEmpty else { throw SpaceError.invalid }
        var fresh: [String: String] = [:]
        for n in set.groups.indices {
            let id = TabGroup.newId()
            fresh[set.groups[n].id] = id
            set.groups[n].id = id
        }
        for n in set.tabs.indices {
            set.tabs[n].tabId = nil
            set.tabs[n].groupId = set.tabs[n].groupId.flatMap { fresh[$0] }
        }
        let base = TabSets.spaceName(remote.name) ?? "Space"
        var name = base
        var n = 2
        while nameTaken(name) { name = TabSets.spaceName("\(base) \(n)") ?? "\(base) \(n)"; n += 1 }
        let color = SpaceIdentity.normalizeHex(remote.color) ?? SpaceIdentity.presets[0].hex
        let symbol = SpaceIdentity.isSymbol(remote.symbol) ? remote.symbol : SpaceIdentity.symbolIds[0]
        let id = TabGroup.newId()
        spaces.append(SpaceRecord(id: id, name: name, color: color, symbol: symbol, set: set))
        show(set: id)
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
    /// A settings change from a page or a slash command: it applies once for
    /// the device and every window follows (`BrowserServices.applySettingsPatch`).
    func applySettingsPatch(_ patch: [String: Any]) {
        services.applySettingsPatch(patch)
    }

    /// Blanc Blocker turned on or off: this window's loaded pages follow.
    func blockingTurned(_ enabled: Bool) {
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

    /// The theme, search engine or blocking changed: this window's pages hear.
    func settingsDidChange() {
        bridge.emitSettingsChanges()
        bridge.emit("start.onStatus", payload: .object([("mobileAdblockEnabled", .bool(settingsStore.adblockEnabled))]), host: "newtab")
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
    /// Its Recently closed rows, which Undo takes back.
    var closedIds: [String] = []
    /// The splits the closed tabs were panes of, put back by Undo (F53).
    var splits: [TabSplit] = []
}

enum GroupNameError: Error, Equatable { case empty, duplicate }

struct ReopenEntry: Equatable {
    let url: URL
    let title: String
}
