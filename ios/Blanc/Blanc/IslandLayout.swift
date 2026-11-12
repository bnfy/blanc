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

    /// Where Back and Forward sit on the Island, if anywhere.
    enum History: Equatable { case hidden, beforeAddress, afterAddress }

    /// The Island's buttons around the address. New Tab is always on it, and
    /// the address always leads.
    struct Buttons: Equatable {
        let history: History
        /// Reload, which is Stop while a page loads.
        let reload: Bool
    }

    /// Back and Forward on the Island.
    let showsHistoryButtons: Bool
    /// A bottom sheet, or a panel growing up from the Island in its place.
    let palette: Palette
    /// Split View (F53): a split's panes side by side. Elsewhere its focused
    /// pane fills the screen, and the split comes back with the room (D30).
    let showsSplitView: Bool

    init(_ horizontal: UserInterfaceSizeClass?, _ vertical: UserInterfaceSizeClass?) {
        let unfolded = horizontal == .regular && vertical == .regular
        showsHistoryButtons = unfolded
        palette = unfolded ? .panel : .sheet
        showsSplitView = unfolded
    }

    /// The iPhone Island has room for Back, Forward and New Tab after the
    /// address, but not Reload as well: pull to refresh and the Sunrise menu
    /// reload a page, and Stop still shows while a page loads, since nothing
    /// else can stop one. With the Back and Forward setting off, Reload takes
    /// their place.
    func buttons(backForward: Bool, isLoading: Bool) -> Buttons {
        if showsHistoryButtons { return Buttons(history: .beforeAddress, reload: true) }
        if backForward { return Buttons(history: .afterAddress, reload: isLoading) }
        return Buttons(history: .hidden, reload: true)
    }
}
