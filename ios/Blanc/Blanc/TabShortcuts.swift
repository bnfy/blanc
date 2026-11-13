import Foundation

/// Hardware-keyboard tab shortcuts (D7's iPad allowance): the rules behind
/// ⌘1–9, a port of desktop's `selectTabAtIndex` in `src/main/main.js`.
enum TabShortcuts {
    enum Target: Equatable {
        case tab(String)
        /// Show the group: unfold it and make its first tab current.
        case group(String)
    }

    /// What ⌘ plus `number` (1–9) goes to. With groups, the nth cluster:
    /// ungrouped pins as one leading cluster, then each group and each run of
    /// ungrouped tabs. Without groups, the browser convention: 1–8 that tab,
    /// 9 the last, a split counting once at its first tab.
    static func target(number: Int, items: [TabSections.Item], splits: [[String]]) -> Target? {
        guard (1...9).contains(number) else { return nil }
        let index = number - 1
        if items.contains(where: { $0.groupId != nil }) {
            var slots: [(groupId: String?, tabIds: [String])] = []
            let pins = items.filter { $0.groupId == nil && $0.pinned }.map(\.id)
            if !pins.isEmpty { slots.append((nil, pins)) }
            slots += TabSections.sections(items).map { ($0.groupId, $0.tabIds) }
            guard slots.indices.contains(index), let first = slots[index].tabIds.first else { return nil }
            return slots[index].groupId.map(Target.group) ?? .tab(first)
        }
        let later = Set(splits.flatMap { $0.dropFirst() })
        let numbered = items.map(\.id).filter { !later.contains($0) }
        guard let id = index >= 8 ? numbered.last : (numbered.indices.contains(index) ? numbered[index] : nil) else {
            return nil
        }
        return .tab(id)
    }

    /// Browser zoom steps (⌘+ / ⌘−), as Chromium's.
    static let zoomLevels: [Double] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

    /// The next zoom level from `current`: `step` 1 in, -1 out, 0 back to 100%.
    static func zoom(from current: Double, step: Int) -> Double {
        guard step != 0 else { return 1 }
        if step > 0 { return zoomLevels.first { $0 > current + 0.001 } ?? zoomLevels.last! }
        return zoomLevels.last { $0 < current - 0.001 } ?? zoomLevels.first!
    }
}
