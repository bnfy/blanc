import Foundation

/// What a tab is called wherever the phone names it (the Island, the palette,
/// the tab grid, VoiceOver): the start page's name in the person's language,
/// else the page's title, else its site.
enum TabTitle {
    static func display(_ tab: TabModel) -> String {
        if tab.currentURL == TabsManager.newTabURL { return SyncCopy.text("ios.tabs.startPage") }
        return tab.pageTitle.isEmpty ? (tab.currentURL.host ?? tab.currentURL.absoluteString) : tab.pageTitle
    }
}
