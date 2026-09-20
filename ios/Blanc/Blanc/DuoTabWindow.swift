import Foundation

/// A three-slot window that always contains the selected tab. With no pinned-tab
/// model on iOS yet, neighboring tabs fill the remaining slots in tab order.
enum DuoTabWindow {
    static func indices(count: Int, activeIndex: Int?, capacity: Int = 3) -> [Int] {
        guard count > 0, capacity > 0 else { return [] }
        let visibleCount = min(count, capacity)
        let active = min(max(activeIndex ?? 0, 0), count - 1)
        let start = min(max(active - visibleCount / 2, 0), count - visibleCount)
        return Array(start..<(start + visibleCount))
    }
}
