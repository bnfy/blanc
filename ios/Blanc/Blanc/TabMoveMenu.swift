import SwiftUI

/// Move to Group ▸ and Move to Space ▸ for an ordinary tab, from a press and
/// hold on its card in the grid or its row in the palette. New Group… and
/// New Space… hand the tab back to the caller, which owns the naming sheets.
struct TabMoveMenu: View {
    let manager: TabsManager
    let tab: TabModel
    let newGroup: () -> Void
    let newSpace: () -> Void

    var body: some View {
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
