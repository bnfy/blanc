import Observation
import Foundation
import WebKit

@Observable
final class TabsManager {
    private(set) var tabs: [TabModel] = []
    var activeTabId: UUID?

    let settingsStore: SettingsStore
    var normalizer: AddressNormalizer

    @ObservationIgnored private let schemeHandler = BlancSchemeHandler()
    @ObservationIgnored private lazy var bridge = PagesBridge(manager: self)
    @ObservationIgnored private let contentBlocker = ContentBlocker()
    @ObservationIgnored private let sessionStore: SessionStore
    @ObservationIgnored private var isRestoringSession = false

    static let newTabURL = URL(string: "blanc://newtab/")!

    var activeTab: TabModel? {
        guard let activeTabId else { return nil }
        return tabs.first { $0.id == activeTabId }
    }

    var isAdBlockReady: Bool {
        contentBlocker.isReady && contentBlocker.enabled
    }

    var activeSiteHost: String? {
        Self.siteHost(for: activeTab?.currentURL)
    }

    var canToggleActiveSiteProtection: Bool {
        settingsStore.adblockEnabled && activeSiteHost != nil
    }

    var isActiveSiteProtected: Bool {
        guard let url = activeTab?.currentURL else { return false }
        return shouldBlock(url)
    }

    init(settingsDirectory: URL? = nil, sessionDirectory: URL? = nil) {
        let store = SettingsStore(directory: settingsDirectory)
        self.settingsStore = store
        self.sessionStore = SessionStore(directory: sessionDirectory)
        self.normalizer = AddressNormalizer(searchEngine: store.searchEngine)

        contentBlocker.enabled = store.adblockEnabled

        // Always compile the blocklist, even when disabled — `enabled` gates only
        // attachment (see ContentBlocker). Skipping prepare while disabled would
        // leave isReady forever false, so a later enable would queue tabs forever.
        if let loaded = ContentBlocker.loadBundledBlocklist() {
            contentBlocker.prepare(version: loaded.version, jsonProvider: loaded.loadJSON)
        }

        let savedURLs = sessionStore.urls.compactMap { URL(string: $0) }
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

    @discardableResult
    func createTab(url: URL = TabsManager.newTabURL) -> UUID {
        let config = WebViewConfiguration.make(schemeHandler: schemeHandler, bridge: bridge)
        let shouldAttach = shouldBlock(url)
        if shouldAttach, let ruleList = contentBlocker.compiledRuleList {
            config.userContentController.add(ruleList)
        }
        let tab = TabModel(url: url, configuration: config)
        tab.blockerRulesAttached = shouldAttach && contentBlocker.compiledRuleList != nil
        if shouldAttach && !contentBlocker.isReady {
            contentBlocker.attach(to: tab)
        }
        // Re-persist whenever this tab settles on a new URL (navigation/redirect).
        tab.navigationDelegate.onURLChange = { [weak self] _ in
            self?.persistSession()
        }
        tab.navigationDelegate.onMainFrameNavigation = { [weak self, weak tab] destination in
            guard let self, let tab else { return }
            self.reconcileRuleList(for: tab, destination: destination, reload: false)
        }
        tabs.append(tab)
        activeTabId = tab.id
        persistSession()
        return tab.id
    }

    func closeTab(_ id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let wasActive = id == activeTabId
        // If the tab is still queued for a cold-compile drain, drop it so its web view
        // isn't reloaded after it's gone (and isn't kept alive by the pending queue).
        contentBlocker.cancelPending(for: tabs[index])
        tabs.remove(at: index)

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
        guard tabs.contains(where: { $0.id == id }) else { return }
        activeTabId = id
        persistSession()
    }

    /// A site is the exact host of the main-frame page. Global blocking is a
    /// separate Settings control; this toggle never changes it.
    func toggleProtectionForActiveSite() {
        guard settingsStore.adblockEnabled, let host = activeSiteHost else { return }
        var allowed = settingsStore.adblockAllowedHosts
        if allowed.contains(host) {
            allowed.remove(host)
        } else {
            allowed.insert(host)
        }
        settingsStore.update(adblockAllowedHosts: allowed)
        for tab in tabs where Self.siteHost(for: tab.currentURL) == host {
            reconcileRuleList(for: tab, destination: tab.currentURL, reload: true)
        }
    }

    func submitActiveTabAddress() {
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
        guard !tabs.isEmpty else { return }
        let urls = tabs.map { $0.currentURL.absoluteString }
        let activeIdx = tabs.firstIndex(where: { $0.id == activeTabId }) ?? 0
        sessionStore.save(urls: urls, activeIndex: activeIdx)
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

        if let enabled = patch["adblockEnabled"] as? Bool { adblockUpdate = enabled }

        // One validated mutation that also schedules the debounced save.
        settingsStore.update(theme: themeUpdate, searchEngine: engineUpdate, adblockEnabled: adblockUpdate)
        if let adblockUpdate { applyAdblockToggle(adblockUpdate) }
    }

    private func applyAdblockToggle(_ enabled: Bool) {
        contentBlocker.setEnabled(enabled)
        for tab in tabs {
            reconcileRuleList(for: tab, destination: tab.currentURL, reload: true)
        }
    }

    private static func siteHost(for url: URL?) -> String? {
        guard let url,
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host?.lowercased(), !host.isEmpty else { return nil }
        return host
    }

    private func shouldBlock(_ url: URL) -> Bool {
        guard settingsStore.adblockEnabled, let host = Self.siteHost(for: url) else { return false }
        return !settingsStore.adblockAllowedHosts.contains(host)
    }

    private func reconcileRuleList(for tab: TabModel, destination: URL, reload: Bool) {
        let shouldAttach = shouldBlock(destination)
        if shouldAttach {
            if !tab.blockerRulesAttached {
                if let ruleList = contentBlocker.compiledRuleList {
                    contentBlocker.cancelPending(for: tab)
                    tab.webView.configuration.userContentController.add(ruleList)
                    tab.blockerRulesAttached = true
                    if reload { tab.webView.reload() }
                } else {
                    contentBlocker.attach(to: tab)
                }
            }
        } else {
            contentBlocker.cancelPending(for: tab)
            if tab.blockerRulesAttached {
                tab.webView.configuration.userContentController.removeAllContentRuleLists()
                tab.blockerRulesAttached = false
                if reload { tab.webView.reload() }
            }
        }
    }
}
