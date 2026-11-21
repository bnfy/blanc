import Foundation

enum IslandDots {
    struct Tab: Equatable {
        let id: UUID
        let groupId: String?
        let pinned: Bool
        let isPrivate: Bool
    }

    struct Dot: Equatable {
        let id: UUID
        let isActive: Bool
        let isPrivate: Bool
    }

    struct Row: Equatable {
        let dots: [Dot]
        let overflow: Int
        let groupId: String?
        let position: Int
        let count: Int
    }

    static let cap = 6

    static func row(_ tabs: [Tab], activeId: UUID, cap: Int = cap) -> Row? {
        guard cap > 0, let active = tabs.first(where: { $0.id == activeId }) else { return nil }
        let members: [Tab]
        if active.pinned && active.groupId == nil {
            members = tabs.filter { $0.pinned && $0.groupId == nil }
        } else {
            let items = tabs.map { TabSections.Item(id: $0.id.uuidString, groupId: $0.groupId, pinned: $0.pinned) }
            guard let section = TabSections.sections(items).first(where: { $0.tabIds.contains(activeId.uuidString) }) else { return nil }
            let byID = Dictionary(uniqueKeysWithValues: tabs.map { ($0.id.uuidString, $0) })
            members = section.tabIds.compactMap { byID[$0] }
        }
        guard members.count >= 2, let index = members.firstIndex(where: { $0.id == activeId }) else { return nil }
        let length = min(cap, members.count)
        let start = min(max(index - length / 2, 0), members.count - length)
        let dots = members[start..<(start + length)].map {
            Dot(id: $0.id, isActive: $0.id == activeId, isPrivate: $0.isPrivate)
        }
        return Row(dots: dots, overflow: members.count - length, groupId: active.groupId,
                   position: index + 1, count: members.count)
    }
}

extension IslandDots.Tab {
    @MainActor init(_ tab: TabModel) {
        self.init(id: tab.id, groupId: tab.groupId, pinned: tab.pinned, isPrivate: tab.isPrivate)
    }
}
