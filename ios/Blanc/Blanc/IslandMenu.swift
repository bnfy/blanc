import Foundation

/// One entry in the Sunrise mark's menu on the Island.
enum IslandMenuItem: Equatable {
    /// On the Start Page: its layout, wallpaper and clock in Settings.
    case customizeStartPage
    /// Blanc Blocker's switch for the current site.
    case blocking(on: Bool)
    /// Blocking is off everywhere: the way back is Settings.
    case blockingSettings
    case favorite(saved: Bool)
    /// Send to Device ▸, when sync has somewhere to send the page.
    case send
    case share
    case find
    case newPrivateTab
}

/// The Island keeps the site, reload and New tab; everything else about the
/// page lives behind the Sunrise mark. Entries that don't apply to the page
/// (Blanc's own pages, a private tab) are left out rather than disabled.
enum IslandMenu {
    @MainActor static func items(for tab: TabModel?, manager: TabsManager) -> [IslandMenuItem] {
        var items: [IslandMenuItem] = []
        if let tab, tab.currentURL.scheme == "blanc", tab.currentURL.host == "newtab" {
            items.append(.customizeStartPage)
        }
        if let tab, AdblockExceptions.host(for: tab.currentURL) != nil {
            items.append(manager.settingsStore.adblockEnabled ? .blocking(on: manager.isSiteProtected(tab)) : .blockingSettings)
            if !tab.isPrivate, TabsManager.canFavorite(tab.currentURL) {
                items.append(.favorite(saved: manager.isFavorite(tab)))
            }
            if manager.canSend(tab), !manager.syncEngine.sendTargets.isEmpty { items.append(.send) }
            items.append(contentsOf: [.share, .find])
        }
        items.append(.newPrivateTab)
        return items
    }
}
