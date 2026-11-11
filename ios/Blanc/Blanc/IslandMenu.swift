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
    /// The iPhone Island has no Reload button; pull to refresh also reloads.
    case reload
    case share
    /// The page's whole address, which the Island shows only the site of.
    case copyLink
    case find
    /// Page Zoom ▸: Zoom In, Zoom Out and Actual Size.
    case pageZoom
    /// Request Desktop Website, or Request Mobile Website once it was asked for.
    case desktopSite(on: Bool)
    /// Glance (F34), in the wide layout: Open in Glance ▸ lists the other
    /// open tabs; Close Glance while a card is open.
    case glance
    case closeGlance
    case newPrivateTab
    /// Blanc's Settings, always last.
    case settings
}

/// The Island keeps the site, Back, Forward and New tab; everything else about the
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
            items.append(contentsOf: [.reload, .share, .copyLink, .find, .pageZoom, .desktopSite(on: tab.wantsDesktopSite)])
        }
        if manager.glanceTab != nil { items.append(.closeGlance) }
        else if manager.canOpenGlance, !manager.glanceCandidates.isEmpty { items.append(.glance) }
        items.append(contentsOf: [.newPrivateTab, .settings])
        return items
    }
}
