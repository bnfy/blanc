import CoreGraphics

/// Floating Glance (F34): where the card sits, a port of desktop's
/// `src/main/glance-card.js`. The page area is the space above the Island;
/// the remembered frame is kept as fractions of it, so it fits any window.
enum GlanceGeometry {
    static let maxDefaultWidth: CGFloat = 1100
    static let defaultWidthShare: CGFloat = 0.8
    static let gap: CGFloat = 16
    static let minWidth: CGFloat = 360
    static let minHeight: CGFloat = 280
    static let headerHeight: CGFloat = 44
    static let radius: CGFloat = 14
    /// The page's inset inside the card, below the header and at the sides.
    static let pageInset: CGFloat = 6
    /// A page area smaller than the minimum card: the card fills it less this.
    static let tinyMargin: CGFloat = 8

    /// The first-open card: large, centered, clear of the area's edges.
    static func defaultFrame(in area: CGSize) -> CGRect {
        let width = min(maxDefaultWidth, (area.width * defaultWidthShare).rounded())
        let height = area.height - 2 * gap
        return clamp(CGRect(x: (area.width - width) / 2, y: gap, width: width, height: height), in: area)
    }

    /// `frame` at least the minimum size and wholly inside `area`. An area
    /// smaller than the minimum card gets a card filling it.
    static func clamp(_ frame: CGRect, in area: CGSize) -> CGRect {
        guard area.width >= minWidth, area.height >= minHeight else {
            return CGRect(x: tinyMargin, y: tinyMargin,
                          width: max(0, area.width - 2 * tinyMargin), height: max(0, area.height - 2 * tinyMargin))
        }
        let finite = frame.origin.x.isFinite && frame.origin.y.isFinite && frame.width.isFinite && frame.height.isFinite
        let source = finite ? frame : defaultFrame(in: area)
        let width = min(max(source.width, minWidth), area.width)
        let height = min(max(source.height, minHeight), area.height)
        let x = min(max(source.minX, 0), area.width - width)
        let y = min(max(source.minY, 0), area.height - height)
        return CGRect(x: x.rounded(), y: y.rounded(), width: width.rounded(), height: height.rounded())
    }

    /// The frame as fractions of the area, to remember.
    static func fraction(_ frame: CGRect, of area: CGSize) -> CGRect {
        guard area.width > 0, area.height > 0 else { return .zero }
        return CGRect(x: frame.minX / area.width, y: frame.minY / area.height,
                      width: frame.width / area.width, height: frame.height / area.height)
    }

    /// A remembered frame placed in `area`, or the default with none.
    static func frame(remembered: CGRect?, in area: CGSize) -> CGRect {
        guard let f = remembered, f.width > 0, f.height > 0 else { return defaultFrame(in: area) }
        return clamp(CGRect(x: f.minX * area.width, y: f.minY * area.height,
                            width: f.width * area.width, height: f.height * area.height), in: area)
    }
}
