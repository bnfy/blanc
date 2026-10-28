import SwiftUI

/// The Spaces menu (owner's pick, 2026-10-28): a card rising from the Island,
/// which stays visible below it. This iPhone, then the phone's Spaces, then
/// New Space and Edit. A tap outside, a swipe down or Escape closes it.
struct SpacesCard: View {
    let manager: TabsManager
    let style: BrowserStyle
    @Binding var editorTarget: SpaceEditorTarget?
    @State private var editing = false
    @State private var dragY: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    row(id: TabSets.iphoneId, name: SyncCopy.text("spaces.thisIPhone")) {
                        Image(systemName: "iphone")
                            .font(.system(size: 15))
                            .frame(width: 30, height: 30)
                            .background(style.surface, in: RoundedRectangle(cornerRadius: 9))
                    }
                    .accessibilityIdentifier("spaces.iphone")
                    if !manager.spaces.isEmpty { Divider() }
                    ForEach(manager.spaces) { space in
                        row(id: space.id, name: space.name) {
                            SpaceTile(color: space.color, symbol: space.symbol, size: 30)
                        }
                        .accessibilityIdentifier("spaces.row.\(space.name)")
                    }
                    if editing && !manager.recentlyDeleted.isEmpty {
                        Divider().padding(.top, 4)
                        Text(SyncCopy.plural("ws.list.recentlyDeleted", count: manager.recentlyDeleted.count))
                            .font(BrowserStyle.font(13, semibold: true))
                            .foregroundStyle(style.secondary)
                            .padding(.top, 10)
                        ForEach(manager.recentlyDeleted, id: \.space.id) { entry in
                            HStack(spacing: 12) {
                                SpaceTile(color: entry.space.color, symbol: entry.space.symbol, size: 30).opacity(0.6)
                                Text(entry.space.name).font(BrowserStyle.font(16)).lineLimit(1)
                                Spacer(minLength: 0)
                                Button(SyncCopy.text("ws.recovery.restore")) { withAnimation { manager.restoreDeleted(entry.space.id) } }
                                    .font(BrowserStyle.font(15, semibold: true))
                                    .frame(minWidth: 44, minHeight: 44)
                                    .disabled(manager.spaces.filter { $0.recoveredFrom == nil }.count >= TabSets.spaceLimit)
                            }
                            .frame(minHeight: 52)
                        }
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: 420)
            Divider().padding(.top, 4)
            HStack {
                Button {
                    editorTarget = .new
                } label: {
                    Label(SyncCopy.text("ws.new"), systemImage: "plus")
                        .font(BrowserStyle.font(15, semibold: true))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("spaces.new")
                Spacer()
                if !manager.spaces.isEmpty {
                    Button(SyncCopy.text(editing ? "ws.editor.done" : "spaces.menuEdit")) {
                        withAnimation(.snappy) { editing.toggle() }
                    }
                    .font(BrowserStyle.font(15, semibold: true))
                    .frame(minWidth: 44, minHeight: 44)
                    .accessibilityIdentifier("spaces.edit")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .foregroundStyle(style.text)
        .background(style.raised, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(style.border.opacity(0.7), lineWidth: 0.5))
        .shadow(color: .black.opacity(style.scheme == .dark ? 0.35 : 0.18), radius: 24, y: 8)
        .offset(y: max(0, dragY))
        .gesture(DragGesture(minimumDistance: 12)
            .onChanged { dragY = $0.translation.height }
            .onEnded { value in
                if value.translation.height > 60 || value.predictedEndTranslation.height > 160 { close() }
                withAnimation(.snappy) { dragY = 0 }
            })
        .buttonStyle(.plain)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(SyncCopy.text("spaces.menuLabel"))
        .accessibilityIdentifier("spaces.card")
        .accessibilityAction(.escape) { close() }
    }

    private func close() {
        withAnimation(.snappy) { manager.isSpacesMenuPresented = false }
    }

    private func row<Icon: View>(id: String, name: String, @ViewBuilder icon: () -> Icon) -> some View {
        let shown = manager.shownSetId == id
        let count = manager.tabCount(id)
        return HStack(spacing: 12) {
            Button {
                if !editing {
                    manager.show(set: id)
                    close()
                }
            } label: {
                HStack(spacing: 12) {
                    icon()
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(BrowserStyle.font(16, semibold: true)).lineLimit(1)
                        Text(SyncCopy.plural("newtab.groups.count", count: count))
                            .font(BrowserStyle.font(13)).foregroundStyle(style.secondary)
                    }
                    Spacer(minLength: 0)
                    if shown && !editing {
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold))
                    }
                }
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .accessibilityAddTraits(shown ? .isSelected : [])
            if editing && id != TabSets.iphoneId {
                editControls(id)
            }
        }
    }

    private func editControls(_ id: String) -> some View {
        HStack(spacing: 0) {
            Button { withAnimation { manager.moveSpace(id, by: -1) } } label: {
                Image(systemName: "arrow.up").frame(width: 40, height: 44).contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text("settings.linkRoutes.moveUp"))
            .disabled(manager.spaces.first?.id == id)
            Button { withAnimation { manager.moveSpace(id, by: 1) } } label: {
                Image(systemName: "arrow.down").frame(width: 40, height: 44).contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text("settings.linkRoutes.moveDown"))
            .disabled(manager.spaces.last?.id == id)
            Button { editorTarget = .edit(id) } label: {
                Image(systemName: "pencil").frame(width: 40, height: 44).contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text("ws.row.edit", ["name": manager.spaces.first { $0.id == id }?.name ?? ""]))
            .accessibilityIdentifier("spaces.editRow")
        }
        .font(.system(size: 15, weight: .medium))
    }
}

/// The Island's leading mark: the shown Space's tile, the quiet Spaces glyph
/// on This iPhone once a Space exists, nothing before the first Space or on
/// a private tab.
struct SpaceMarkButton: View {
    let manager: TabsManager
    let style: BrowserStyle

    var body: some View {
        if manager.showsSpaceMark {
            Button {
                withAnimation(.snappy) { manager.isSpacesMenuPresented.toggle() }
            } label: {
                Group {
                    if let space = manager.shownSpace {
                        SpaceTile(color: space.color, symbol: space.symbol, size: 28)
                    } else {
                        SpacesGlyph()
                            .stroke(style.secondary, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
                            .frame(width: 20, height: 20)
                    }
                }
                .frame(width: 44, height: 48)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(manager.shownSpace.map { SyncCopy.text("spaces.mark.current", ["name": $0.name]) }
                                ?? SyncCopy.text("spaces.menuLabel"))
            .accessibilityIdentifier("island.space")
        }
    }
}
