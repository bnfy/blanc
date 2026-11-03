import SwiftUI

/// Split with ▸, Move to Group ▸ and Move to Space ▸ for a tab, from a press and
/// hold on its card in the grid or its row in the palette. New Group… and
/// New Space… hand the tab back to the caller, which owns the naming sheets.
struct TabMoveMenu: View {
    let manager: TabsManager
    let tab: TabModel
    let newGroup: () -> Void
    let newSpace: () -> Void

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    var body: some View {
        SplitMenu(manager: manager, tab: tab,
                  offersSplit: IslandLayout(horizontalSizeClass, verticalSizeClass).showsSplitView)
        if !tab.isPrivate {
            Menu(SyncCopy.text("tabMenu.moveToGroup")) {
                ForEach(manager.groups.filter { $0.id != tab.groupId }) { group in
                    Button(group.name) { withAnimation { manager.moveTab(tab.id, toGroup: group.id) } }
                }
                Button(SyncCopy.text("tabMenu.newGroup"), action: newGroup)
                if tab.groupId != nil {
                    Button(SyncCopy.text("tabMenu.removeFromGroup")) { withAnimation { manager.moveTab(tab.id, toGroup: nil) } }
                }
            }
            if manager.tabs.filter({ !$0.isPrivate }).count > 1 {
                Menu(SyncCopy.text("tabMenu.moveToSpace")) {
                    if manager.shownSetId != TabSets.iphoneId {
                        Button(SyncCopy.text("spaces.thisIPhone")) { withAnimation { manager.moveTab(tab.id, toSpace: TabSets.iphoneId) } }
                    }
                    ForEach(manager.spaces.filter { $0.id != manager.shownSetId }) { space in
                        Button(space.name) { withAnimation { manager.moveTab(tab.id, toSpace: space.id) } }
                    }
                    Button(SyncCopy.text("tabMenu.newSpace"), action: newSpace)
                }
            }
        }
    }
}

/// Split View (F53) in a tab's menu: Split with ▸ where panes can show side
/// by side, and Remove from Split and Close Split for a split's tab anywhere,
/// so a split made unfolded can be undone folded.
struct SplitMenu: View {
    let manager: TabsManager
    let tab: TabModel
    let offersSplit: Bool

    var body: some View {
        if let split = manager.split(for: tab.id) {
            Button(SyncCopy.text("tabMenu.removeFromSplit")) { withAnimation { manager.removeFromSplit(tab.id) } }
            Button(SyncCopy.text("tabMenu.closeSplit"), role: .destructive) { withAnimation { manager.closeSplit(split.id) } }
        } else if offersSplit, !manager.splitCandidates(for: tab).isEmpty {
            Menu(SyncCopy.text("tabMenu.splitWith")) {
                ForEach(manager.splitCandidates(for: tab)) { other in
                    Button { manager.makeSplit(tab.id, with: other.id) } label: {
                        Text(TabTitle.display(other))
                        if let note = groupNote(other) { Text(note) }
                    }
                }
            }
        }
    }

    /// Making the split moves the other tab into this tab's group, or out of
    /// its own: say so beside it, as desktop's menu does.
    private func groupNote(_ other: TabModel) -> String? {
        guard other.groupId != tab.groupId else { return nil }
        let title = TabTitle.display(other)
        if let mine = manager.groups.first(where: { $0.id == tab.groupId }) {
            return SyncCopy.text("split.groupMoveInto", ["title": title, "group": mine.name])
        }
        guard let theirs = manager.groups.first(where: { $0.id == other.groupId }) else { return nil }
        return SyncCopy.text("split.groupMoveOutOf", ["title": title, "group": theirs.name])
    }
}
