import SwiftUI

/// A tab group's header in the tab grid (owner's pick, 2026-10-28): colour
/// dot (a ring for no colour), name, count, fold, and the group's menu.
struct GroupHeader: View {
    let group: TabGroup
    let count: Int
    let manager: TabsManager
    let style: BrowserStyle
    let rename: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            GroupDot(color: group.color, style: style)
            Text(group.name).font(BrowserStyle.font(17, semibold: true)).lineLimit(1)
            Text("\(count)").font(.system(size: 14)).foregroundStyle(style.secondary)
            Spacer(minLength: 0)
            Button {
                withAnimation { manager.setGroupCollapsed(group.id, !group.collapsed) }
            } label: {
                Image(systemName: group.collapsed ? "chevron.right" : "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(style.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text(group.collapsed ? "group.unfold" : "group.fold"))
            .accessibilityIdentifier("group.fold")
            Menu {
                Button(SyncCopy.text("groupMenu.rename"), systemImage: "pencil", action: rename)
                Menu(SyncCopy.text("groupMenu.colorLabel")) {
                    Button(SyncCopy.text("groupMenu.colorNone")) { manager.setGroupColor(group.id, nil) }
                    ForEach(SpaceIdentity.presets, id: \.hex) { preset in
                        Button(SyncCopy.text("spaces.color.\(preset.id)")) { manager.setGroupColor(group.id, preset.hex) }
                    }
                }
                Button(SyncCopy.text("groupMenu.newTab"), systemImage: "plus") { manager.newTab(inGroup: group.id) }
                Button(SyncCopy.text("groupMenu.ungroup"), systemImage: "rectangle.stack.badge.minus") {
                    withAnimation { manager.ungroup(group.id) }
                }
                Button(SyncCopy.text("groupMenu.close"), systemImage: "xmark", role: .destructive) {
                    withAnimation { manager.closeGroup(group.id) }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text("groupMenu.options"))
            .accessibilityIdentifier("group.menu")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("group.header.\(group.name)")
    }
}

/// A group's colour as a dot, or a hollow ring when it has none.
struct GroupDot: View {
    let color: String?
    let style: BrowserStyle
    var body: some View {
        Group {
            if let color, let fill = Color(blancHex: color) {
                Circle().fill(fill).overlay {
                    // A colour too close to the surface gets a hairline, as desktop's.
                    if SpaceIdentity.paint(color, theme: style.scheme == .dark ? "dark" : "light")?.edge == true {
                        Circle().strokeBorder(style.secondary.opacity(0.6), lineWidth: 1)
                    }
                }
            } else {
                Circle().strokeBorder(style.secondary, lineWidth: 1.5)
            }
        }
        .frame(width: 10, height: 10)
        .accessibilityHidden(true)
    }
}
