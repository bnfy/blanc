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

    /// The Island's buttons around the address.
    struct Buttons: Equatable {
        let history: Bool
        /// Reload, which is Stop while a page loads.
        let reload: Bool
        let newTab: Bool
        /// Back and Forward at the far end and the address in the Island's center,
        /// rather than the two before a leading address.
        var centersAddress = false
    }

    /// What the address adds to each side so it sits in the Island's center
    /// with unequal controls either side of it.
    static func addressInsets(leading: CGFloat, trailing: CGFloat) -> (leading: CGFloat, trailing: CGFloat) {
        (max(0, trailing - leading), max(0, leading - trailing))
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

    /// The iPhone Island has no room for everything, so the Back and Forward
    /// setting swaps out Reload and New Tab. Stop still shows while a page
    /// loads, since nothing else can stop one.
    func buttons(historySetting: Bool, isLoading: Bool) -> Buttons {
        if showsHistoryButtons { return Buttons(history: true, reload: true, newTab: true) }
        if historySetting { return Buttons(history: true, reload: isLoading, newTab: false, centersAddress: true) }
        return Buttons(history: false, reload: true, newTab: true)
    }
}
