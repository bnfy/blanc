import CoreGraphics

/// The Island floats over every page and tucks away while the person scrolls
/// the page down, as Safari's bar does. It comes back on a scroll up, at the
/// top or the end of the page, on a page that doesn't scroll, and on each new
/// page. Only the person's own scrolling (a drag and its glide) tucks it; a
/// page scrolling itself never does.
struct IslandTuck: Equatable {
    /// Where the page is: the scroll view's offset and its extent, in points.
    struct Position: Equatable {
        var offset: CGFloat
        var contentHeight: CGFloat
        var viewportHeight: CGFloat
        var topInset: CGFloat
        var bottomInset: CGFloat
    }

    private(set) var isTucked = false
    /// How far the page has moved in one direction since it last turned:
    /// positive down the page, negative back up.
    private var travel: CGFloat = 0

    /// Down the page this far tucks the Island; back up this far brings it back.
    static let tuckAfter: CGFloat = 24
    static let showAfter: CGFloat = 12
    /// This close to the top or the end counts as being there.
    static let edgeSlack: CGFloat = 8

    mutating func scrolled(from previousOffset: CGFloat, to position: Position, byPerson: Bool) {
        let top = -position.topInset
        let end = position.contentHeight + position.bottomInset - position.viewportHeight
        if position.offset <= top + Self.edgeSlack || position.offset >= end - Self.edgeSlack {
            show()
            return
        }
        guard byPerson else { return }
        let delta = position.offset - previousOffset
        if delta == 0 { return }
        if (delta > 0) != (travel > 0) { travel = 0 }
        travel += delta
        if travel >= Self.tuckAfter {
            isTucked = true
        } else if travel <= -Self.showAfter {
            isTucked = false
        }
    }

    mutating func show() {
        isTucked = false
        travel = 0
    }
}
