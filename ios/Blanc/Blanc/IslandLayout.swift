import SwiftUI

/// Where the Island sits: along the bottom of the screen, under the thumb (the
/// default), or along the top, as in a desktop browser (Settings → Appearance).
enum IslandPosition: String, CaseIterable {
    case bottom, top
}

/// Duo-1: what the Island does in the window's size classes. Regular in both
/// directions (the iPhone Duo's inner display) is the unfolded layout;
/// everything else, including the inner display in system Split View and a
/// Plus or Pro Max iPhone in landscape (regular width, compact height), is the
/// iPhone layout. Chosen by size class only, never by device (design
/// 2026-10-29 §4.1).
struct IslandLayout: Equatable {
    enum Palette { case sheet, panel }

    /// The Island's buttons around the dots and the site.
    struct Buttons: Equatable {
        enum Leading: Equatable { case back, reload }
        enum Trailing: Equatable { case newTab, stop }
        let leading: Leading
        let forward: Bool
        let trailing: Trailing
    }

    /// A bottom sheet, or a panel growing up from the Island in its place.
    let palette: Palette
    /// Split View (F53): a split's panes side by side. Elsewhere its focused
    /// pane fills the screen, and the split comes back with the room (D30).
    let showsSplitView: Bool

    init(_ horizontal: UserInterfaceSizeClass?, _ vertical: UserInterfaceSizeClass?) {
        let unfolded = horizontal == .regular && vertical == .regular
        // The palette grows from the Island everywhere except at compact
        // height (an iPhone in landscape), where the keyboard leaves no room
        // for a list and the sheet stays (owner, 2026-11-21).
        palette = vertical == .compact ? .sheet : .panel
        showsSplitView = unfolded
    }

    /// Back leads every Island, iPhone or iPad (owner, 2026-11-12: the iPad
    /// Island matches the iPhone's); Forward joins it only while there's
    /// somewhere to go. With the Back and Forward setting off, Reload leads
    /// instead. Stop takes New Tab's slot while a page loads, so the Island
    /// never changes width for a load (owner, 2026-11-21); pull to refresh and
    /// the page menu still reload.
    func buttons(backForward: Bool, canGoForward: Bool, isLoading: Bool) -> Buttons {
        Buttons(leading: backForward ? .back : .reload, forward: backForward && canGoForward,
                trailing: isLoading ? .stop : .newTab)
    }
}
