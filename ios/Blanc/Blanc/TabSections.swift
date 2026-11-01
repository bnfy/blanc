import Foundation

/// The tab order as groups and runs of ungrouped tabs, a port of desktop's
/// `src/renderer/tab-sections.js`. A group sits where its first member is and
/// holds all its members, pins first; ungrouped pins belong to no section and
/// lead the order.
enum TabSections {
    struct Item: Equatable {
        let id: String
        let groupId: String?
        let pinned: Bool
    }

    struct Section: Equatable {
        /// nil for a run of ungrouped tabs.
        let groupId: String?
        var tabIds: [String]
    }

    private static func isShelfPin(_ item: Item) -> Bool { item.groupId == nil && item.pinned }

    static func sections(_ items: [Item]) -> [Section] {
        var sections: [Section] = []
        var pins: [String: [String]] = [:]
        var groupIndex: [String: Int] = [:]
        var runIndex: Int?
        for item in items where !isShelfPin(item) {
            guard let groupId = item.groupId else {
                if runIndex == nil {
                    sections.append(Section(groupId: nil, tabIds: []))
                    runIndex = sections.count - 1
                }
                sections[runIndex!].tabIds.append(item.id)
                continue
            }
            if groupIndex[groupId] == nil {
                sections.append(Section(groupId: groupId, tabIds: []))
                groupIndex[groupId] = sections.count - 1
                runIndex = nil
            }
            if item.pinned { pins[groupId, default: []].append(item.id) }
            else { sections[groupIndex[groupId]!].tabIds.append(item.id) }
        }
        for (groupId, index) in groupIndex {
            sections[index].tabIds = (pins[groupId] ?? []) + sections[index].tabIds
        }
        return sections
    }

    /// The order sections draw: ungrouped pins first, then every section.
    static func normalizeOrder(_ items: [Item]) -> [String] {
        items.filter(isShelfPin).map(\.id) + sections(items).flatMap(\.tabIds)
    }

    /// `order` with `id` moved just after the last other member of `groupId`;
    /// unchanged when the group has no other member.
    static func placeInGroup(order: [String], items: [Item], id: String, groupId: String) -> [String] {
        let groupOf = Dictionary(items.map { ($0.id, $0.groupId) }, uniquingKeysWith: { a, _ in a })
        let others = order.filter { $0 != id && groupOf[$0] == groupId }
        guard let last = others.last, order.contains(id) else { return order }
        var next = order.filter { $0 != id }
        next.insert(id, at: next.firstIndex(of: last)! + 1)
        return next
    }
}
