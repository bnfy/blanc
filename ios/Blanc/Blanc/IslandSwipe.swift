import CoreGraphics

/// M11: swiping the Island sideways switches tabs, the page following the
/// finger. A drag counts only when it's clearly sideways (the Island's upward
/// swipe opens the tab grid). Moving the finger left goes to the next tab.
enum IslandSwipe {
    enum Outcome: Equatable { case previous, next, stay }

    static func isSideways(_ translation: CGSize) -> Bool {
        abs(translation.width) >= 12 && abs(translation.width) > abs(translation.height)
    }

    /// How far the page moves for a finger travel of `dx`: all the way toward a
    /// neighbor, a quarter of it past either end.
    static func displayed(_ dx: CGFloat, hasPrevious: Bool, hasNext: Bool) -> CGFloat {
        let open = dx < 0 ? hasNext : hasPrevious
        return open ? dx : dx * 0.25
    }

    /// Switches once the finger has travelled 30% of the width, or when a
    /// flick's predicted end passes 50%.
    static func outcome(dx: CGFloat, predictedDx: CGFloat, width: CGFloat, hasPrevious: Bool, hasNext: Bool) -> Outcome {
        let far = abs(dx) >= width * 0.3 || abs(predictedDx) > width * 0.5
        guard far else { return .stay }
        if dx < 0 || (dx == 0 && predictedDx < 0) { return hasNext ? .next : .stay }
        return hasPrevious ? .previous : .stay
    }
}
