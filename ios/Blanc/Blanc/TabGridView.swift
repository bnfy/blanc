import SwiftUI

struct TabGridView: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    /// The group being renamed, or the tab a new group is being made for.
    @State private var naming: Naming?
    /// Kept apart from `naming`: an alert clears its binding before the
    /// button's action runs.
    @State private var isNaming = false
    @State private var nameDraft = ""
    @State private var nameError: String?
    @State private var newSpaceTab: UUID?

    private enum Naming: Identifiable {
        case rename(TabGroup), newGroup(UUID)
        var id: String {
            switch self { case .rename(let g): "rename-\(g.id)"; case .newGroup(let t): "new-\(t)" }
        }
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: sizeClass == .regular ? 3 : 2)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if let space = manager.shownSpace {
                    SpaceTile(color: space.color, symbol: space.symbol, size: 28)
                    Text(space.name).font(BrowserStyle.font(24, semibold: true)).lineLimit(1)
                } else {
                    Text("Open tabs").font(BrowserStyle.font(24, semibold: true))
                }
                Text("\(manager.tabs.count)").font(.system(size: 14)).foregroundStyle(style.secondary)
                Spacer()
                Button("Done") { dismiss() }
                    .font(BrowserStyle.font(16, semibold: true))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(manager.displaySections, id: \.id) { section in
                            if let group = section.group {
                                VStack(alignment: .leading, spacing: 12) {
                                    GroupHeader(group: group, count: section.tabs.count, manager: manager, style: style) {
                                        nameDraft = group.name; nameError = nil; naming = .rename(group); isNaming = true
                                    }
                                    if group.collapsed {
                                        tucked(group, count: section.tabs.count)
                                    } else {
                                        cards(section.tabs)
                                    }
                                }
                            } else {
                                cards(section.tabs)
                            }
                        }
                    }
                    .padding(20)
                }
                .onAppear {
                    if let id = manager.activeTabId { proxy.scrollTo(id, anchor: .center) }
                }
            }
            Button {
                manager.createTab()
                dismiss()
            } label: {
                Label("New tab", systemImage: "plus")
                    .font(BrowserStyle.font(16, semibold: true))
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(style.raised, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(style.border, lineWidth: 1))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .overlay(alignment: .bottom) {
            UndoBanner(manager: manager, style: style).padding(.bottom, 76)
        }
        .foregroundStyle(style.text)
        .background(style.surface.ignoresSafeArea())
        .background(TabPreviewRenderer(tabs: manager.tabs).allowsHitTesting(false).accessibilityHidden(true))
        .buttonStyle(.plain)
        .accessibilityIdentifier("tabs.grid")
        .alert(SyncCopy.text("groupMenu.nameLabel"), isPresented: $isNaming) {
            TextField(SyncCopy.text("groupMenu.nameLabel"), text: $nameDraft)
                .accessibilityIdentifier("group.nameField")
            Button(SyncCopy.text("sharedSpaces.cancel"), role: .cancel) {}
            Button(SyncCopy.text(namingIsNew ? "tabGroups.create" : "ws.editor.done")) { commitName() }
        } message: {
            if let nameError { Text(nameError) }
        }
        .sheet(item: Binding(get: { newSpaceTab.map(SpaceEditorTarget.newWithTab) }, set: { if $0 == nil { newSpaceTab = nil } })) { target in
            SpaceEditor(manager: manager, target: target)
        }
    }

    private var namingIsNew: Bool { if case .newGroup = naming { true } else { false } }

    private func commitName() {
        guard let current = naming else { return }
        do {
            switch current {
            case .rename(let group): try manager.renameGroup(group.id, to: nameDraft)
            case .newGroup(let tab): try withAnimation { _ = try manager.createGroup(named: nameDraft, with: tab) }
            }
        } catch GroupNameError.duplicate {
            nameError = SyncCopy.text("groupMenu.duplicate", ["name": GroupNames.normalize(nameDraft)])
            reopen(current)
        } catch {
            reopen(current)
        }
    }

    /// An alert closes on any button; a refused name asks again.
    private func reopen(_ current: Naming) {
        DispatchQueue.main.async { naming = current; isNaming = true }
    }

    private func cards(_ tabs: [TabModel]) -> some View {
        LazyVGrid(columns: columns, spacing: 24) {
            ForEach(tabs) { tab in
                SwipeToClose(reduceMotion: reduceMotion) {
                    withAnimation { manager.closeTab(tab.id) }
                } content: {
                    card(tab)
                }
                .id(tab.id)
            }
        }
    }

    private func tucked(_ group: TabGroup, count: Int) -> some View {
        Button { withAnimation { manager.setGroupCollapsed(group.id, false) } } label: {
            Text(SyncCopy.plural("tabGroups.tucked", count: count))
                .font(BrowserStyle.font(14))
                .foregroundStyle(style.secondary)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, 14)
                .background(style.raised, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(style.border))
                .contentShape(Rectangle())
        }
        .accessibilityIdentifier("group.tucked")
    }

    /// Move to Group ▸ and Move to Space ▸ for an ordinary tab.
    @ViewBuilder private func tabMenu(_ tab: TabModel) -> some View {
        if !tab.isPrivate {
            Menu(SyncCopy.text("tabMenu.moveToGroup")) {
                ForEach(manager.groups.filter { $0.id != tab.groupId }) { group in
                    Button(group.name) { withAnimation { manager.moveTab(tab.id, toGroup: group.id) } }
                }
                Button(SyncCopy.text("tabMenu.newGroup")) { nameDraft = ""; nameError = nil; naming = .newGroup(tab.id); isNaming = true }
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
                    Button(SyncCopy.text("tabMenu.newSpace")) { newSpaceTab = tab.id }
                }
            }
        }
    }

    private func card(_ tab: TabModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // A tap rather than a Button: a Button also fires when a sideways
            // swipe that closes the card lifts inside it.
            Group {
                ZStack {
                    style.raised
                    if let image = tab.thumbnail {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: tab.currentURL.scheme == "blanc" ? "sun.horizon" : "globe")
                                .font(.system(size: 30, weight: .light))
                            Text(title(tab)).font(BrowserStyle.font(14)).lineLimit(2)
                        }
                        .foregroundStyle(style.secondary)
                        .padding(20)
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(
                    manager.activeTabId == tab.id ? style.text : style.border,
                    lineWidth: manager.activeTabId == tab.id ? 2 : 1))
            }
            .contentShape(Rectangle())
            .onTapGesture { select(tab) }
            .contextMenu { tabMenu(tab) }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { select(tab) }
            .accessibilityAction(named: SyncCopy.text("settings.gesture.action.closeTab")) {
                withAnimation { manager.closeTab(tab.id) }
            }
            .accessibilityIdentifier("tab.card")
            .accessibilityLabel("Switch to \(title(tab))")
            .accessibilityAddTraits(manager.activeTabId == tab.id ? .isSelected : [])
            .overlay(alignment: .topTrailing) {
                Button { manager.closeTab(tab.id) } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 28, height: 28)
                        .background(style.raised, in: Circle())
                        .overlay(Circle().strokeBorder(style.border, lineWidth: 0.5))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Close \(title(tab))")
            }
            Text(title(tab)).font(BrowserStyle.font(14, semibold: true)).lineLimit(1)
            if let host = tab.currentURL.host, tab.currentURL.scheme != "blanc" {
                Text(host).font(BrowserStyle.font(12)).foregroundStyle(style.secondary).lineLimit(1)
            }
        }
    }

    private func select(_ tab: TabModel) {
        manager.setActive(tab.id)
        dismiss()
    }

    private func title(_ tab: TabModel) -> String {
        if tab.currentURL == TabsManager.newTabURL { return "Start Page" }
        return tab.pageTitle.isEmpty ? (tab.currentURL.host ?? tab.currentURL.absoluteString) : tab.pageTitle
    }
}

/// M11: swiping a tab's card sideways closes the tab, the card following the
/// finger and fading as it goes. Left closes; a drag to the right resists and
/// springs back. With Reduce Motion the card only fades.
private struct SwipeToClose<Content: View>: View {
    let reduceMotion: Bool
    let close: () -> Void
    @ViewBuilder let content: Content
    @State private var dx: CGFloat = 0
    @State private var isSwiping = false
    @GestureState private var isDragging = false

    var body: some View {
        content
            .offset(x: reduceMotion ? 0 : dx)
            .opacity(1 - min(abs(dx) / 240, 0.7))
            .onChange(of: isDragging) { _, dragging in
                // A cancelled drag gets no onEnded: put the card back.
                guard !dragging, isSwiping else { return }
                isSwiping = false
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { dx = 0 }
            }
            .simultaneousGesture(DragGesture(minimumDistance: 20)
                .updating($isDragging) { _, dragging, _ in dragging = true }
                .onChanged { value in
                    if !isSwiping {
                        guard IslandSwipe.isSideways(value.translation) else { return }
                        isSwiping = true
                    }
                    let x = value.translation.width
                    dx = x < 0 ? x : x * 0.25
                }
                .onEnded { value in
                    guard isSwiping else { return }
                    isSwiping = false
                    if value.translation.width < -100 || value.predictedEndTranslation.width < -200 {
                        withAnimation(.easeOut(duration: 0.2)) { dx = -400 } completion: { close() }
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { dx = 0 }
                    }
                })
    }
}
