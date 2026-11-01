import SwiftUI

struct PaletteSheet: View {
    let manager: TabsManager
    /// A bottom sheet on iPhone; at regular width, a panel growing up from
    /// the Island in its place (Duo-1).
    var placement: IslandLayout.Palette = .sheet
    @Environment(\.colorScheme) private var colorScheme
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    /// Kept by the manager, so the sheet and the panel share it (Duo-1).
    private var input: String {
        get { manager.paletteDraft }
        nonmutating set { manager.paletteDraft = newValue }
    }
    @FocusState private var inputFocused: Bool
    /// The tab a row's New Group… or New Space… is for.
    @State private var newGroupTab: NewGroupTab?
    @State private var newSpaceTab: UUID?

    private struct NewGroupTab: Identifiable { let id: UUID }

    private enum Mode {
        case tabs, slash, switcher
    }

    private var mode: Mode {
        if input.isEmpty { return .tabs }
        if input.hasPrefix("/") { return .slash }
        return .switcher
    }

    var body: some View {
        VStack(spacing: 0) {
            switch placement {
            case .sheet:
                addressRow
                divider
                list
                footer
            case .panel:
                // The address row sits where the Island was; the rest grows up.
                list
                footer
                divider
                addressRow
            }
        }
        .font(BrowserStyle.font(15))
        .tracking(0.15)
        .foregroundStyle(style.text)
        .tint(style.text)
        .buttonStyle(.plain)
        .background(style.raised)
        .presentationBackground(style.raised)
        .presentationCornerRadius(22)
        .presentationDragIndicator(.hidden)
        .presentationDetents([.height(420), .large])
        .onAppear { inputFocused = true }
        .sheet(item: $newGroupTab) { tab in
            GroupNameSheet(title: SyncCopy.text("tabMenu.newGroup"), confirm: SyncCopy.text("tabGroups.create"),
                           initial: "") { name in
                GroupNameSheet.refusal(name) { _ = try withAnimation { try manager.createGroup(named: name, with: tab.id) } }
            }
        }
        .sheet(item: Binding(get: { newSpaceTab.map(SpaceEditorTarget.newWithTab) }, set: { if $0 == nil { newSpaceTab = nil } })) { target in
            SpaceEditor(manager: manager, target: target)
        }
    }

    private var divider: some View {
        Rectangle().fill(style.border).frame(height: 0.5).padding(.horizontal, 12)
    }

    private var list: some View {
        listContent
            .listStyle(.plain)
            .environment(\.defaultMinListRowHeight, 44)
            .environment(\.defaultMinListHeaderHeight, 0)
            .contentMargins(.top, 0, for: .scrollContent)
            .listSectionSpacing(8)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
    }

    /// Closes the palette, whichever way it is shown: the sheet follows the
    /// manager's flag, and so does the panel.
    private func close() { manager.isPalettePresented = false }

    private var addressRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(style.secondary)
                .frame(width: 24)
            TextField(SyncCopy.text("ios.palette.placeholder"), text: Binding(get: { input }, set: { input = $0 }))
                .font(BrowserStyle.font(17))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .focused($inputFocused)
                .onSubmit { handleSubmit() }
                .accessibilityIdentifier("island.address")
            if !input.isEmpty {
                Button { input = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(style.secondary)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(SyncCopy.text("ios.palette.clear"))
            }
            Button { close() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(SyncCopy.text("ios.island.collapse"))
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.vertical, 8)
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(style.border).frame(height: 0.5)
            HStack(spacing: 2) {
                Button {
                    manager.createTab()
                    close()
                } label: {
                    Label(SyncCopy.text("tab.new"), systemImage: "plus")
                        .font(BrowserStyle.font(13, semibold: true))
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .foregroundStyle(style.raised)
                        .background(style.text, in: Capsule())
                        .frame(minHeight: 44)
                }
                Spacer(minLength: 4)
                if manager.activeTab?.readerAvailable == true || manager.activeTab?.reader != nil {
                    Button { close(); manager.toggleReaderMode() } label: {
                        Image(systemName: "doc.text").frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(ReaderCopy.text(manager.activeTab?.reader != nil ? "reader.exit" : "reader.enter"))
                    .accessibilityIdentifier("palette.reader")
                }
                pageShortcut(SyncCopy.text("pagesNav.bookmarks"), icon: "bookmark", page: "bookmarks")
                pageShortcut(SyncCopy.text("pagesNav.history"), icon: "clock.arrow.circlepath", page: "history")
                pageShortcut(SyncCopy.text("pagesNav.settings"), icon: "slider.horizontal.3", page: "settings")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    private func pageShortcut(_ label: String, icon: String, page: String) -> some View {
        Button {
            manager.createTab(url: URL(string: "blanc://\(page)/")!)
            close()
        } label: {
            Image(systemName: icon).font(.system(size: 16)).frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(label)
        .accessibilityIdentifier("palette." + page)
    }

    /// A tab's row; in a group, `last` closes the group's block under it.
    private func tabRow(_ tab: TabModel, in group: TabGroup? = nil, last: Bool = false) -> some View {
        HStack(spacing: 0) {
            Button {
                manager.setActive(tab.id)
                close()
            } label: {
                row(icon: tab.currentURL.scheme == "blanc" ? "sun.horizon" : "globe",
                    title: TabTitle.display(tab),
                    subtitle: tab.currentURL.scheme == "blanc" ? "Blanc" : tab.currentURL.host ?? tab.currentURL.absoluteString,
                    selected: tab.id == manager.activeTabId)
            }
            .accessibilityAddTraits(tab.id == manager.activeTabId ? .isSelected : [])
            .accessibilityIdentifier("palette.tab")
            Button { manager.closeTab(tab.id) } label: {
                Image(systemName: "xmark").font(.system(size: 12)).foregroundStyle(style.secondary)
                    .frame(width: 44, height: 48)
            }
            .accessibilityLabel(SyncCopy.text("ios.tabs.close", ["title": TabTitle.display(tab)]))
        }
        .padding(.leading, 10)
        .background(tab.id == manager.activeTabId ? style.selection : .clear, in: RoundedRectangle(cornerRadius: 10))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 10))
        .contextMenu {
            TabMoveMenu(manager: manager, tab: tab, newGroup: { newGroupTab = NewGroupTab(id: tab.id) }, newSpace: { newSpaceTab = tab.id })
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Group {
            if let group { groupBlock(group, top: false, bottom: last) } else { Color.clear }
        })
        .listRowInsets(EdgeInsets(top: 2, leading: group == nil ? 12 : 16, bottom: last ? 6 : 2, trailing: group == nil ? 12 : 16))
        .swipeActions { Button(role: .destructive) { manager.closeTab(tab.id) } label: { Image(systemName: "xmark") } }
    }

    /// A group's header and tabs share one shaded block, as desktop's ⌘L
    /// panel draws a group, so loose tabs after it never read as its members.
    /// Its colour tints the block; lighter than a selected row either way.
    /// Inside, 4pt on every side: rows inset 16 against the block's 12.
    private func groupBlock(_ group: TabGroup, top: Bool, bottom: Bool) -> some View {
        let wash = group.color.flatMap { Color(blancHex: $0) }?.opacity(style.scheme == .dark ? 0.16 : 0.10)
            ?? style.text.opacity(style.scheme == .dark ? 0.07 : 0.035)
        return UnevenRoundedRectangle(
            topLeadingRadius: top ? 10 : 0, bottomLeadingRadius: bottom ? 10 : 0,
            bottomTrailingRadius: bottom ? 10 : 0, topTrailingRadius: top ? 10 : 0)
            .fill(wash)
            .padding(.horizontal, 12)
            .padding(.top, top ? 4 : 0)
            .padding(.bottom, bottom ? 2 : 0)
    }

    private func groupHeading(_ title: String, count: Int? = nil) -> some View {
        HStack(spacing: 6) {
            Text(title).font(BrowserStyle.font(11, semibold: true))
            if let count { Text("\(count)").font(.system(size: 11)) }
            Spacer()
        }
        .foregroundStyle(style.secondary)
        .textCase(nil)
        .padding(.top, 8)
    }

    private func row(icon: String, title: String, subtitle: String, selected: Bool = false) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 16, weight: .regular))
                .foregroundStyle(style.secondary).frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(BrowserStyle.font(15)).lineLimit(1)
                Text(subtitle).font(BrowserStyle.font(11)).foregroundStyle(style.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            if selected { Circle().fill(style.text).frame(width: 5, height: 5) }
        }
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var listContent: some View {
        switch mode {
        case .tabs:
            tabList
        case .slash:
            slashList
        case .switcher:
            switcherList
        }
    }

    private var sentAgo: RelativeDateTimeFormatter {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }

    private var tabList: some View {
        List {
            Section {
                ForEach(manager.displaySections, id: \.id) { section in
                    if let group = section.group {
                        Button {
                            withAnimation { manager.setGroupCollapsed(group.id, !group.collapsed) }
                        } label: {
                            HStack(spacing: 8) {
                                // The dot sits in the tabs' icon column and the chevron in
                                // their close column, so the block's contents line up.
                                GroupDot(color: group.color, style: style).frame(width: 24).padding(.trailing, 2)
                                Text(group.name).font(BrowserStyle.font(13, semibold: true)).lineLimit(1)
                                Text("\(section.tabs.count)").font(.system(size: 12)).foregroundStyle(style.secondary)
                                Spacer()
                                Image(systemName: group.collapsed ? "chevron.right" : "chevron.down")
                                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(style.secondary)
                                    .frame(width: 44)
                            }
                            .frame(minHeight: 36)
                            .contentShape(Rectangle())
                        }
                        .accessibilityLabel(group.name)
                        .accessibilityHint(SyncCopy.text(group.collapsed ? "group.unfold" : "group.fold"))
                        .listRowSeparator(.hidden)
                        .listRowBackground(groupBlock(group, top: true, bottom: group.collapsed || section.tabs.isEmpty))
                        .listRowInsets(EdgeInsets(top: 6, leading: 26, bottom: group.collapsed ? 4 : 0, trailing: 16))
                        if !group.collapsed {
                            ForEach(section.tabs) { tab in tabRow(tab, in: group, last: tab.id == section.tabs.last?.id) }
                        }
                    } else {
                        ForEach(section.tabs) { tab in tabRow(tab) }
                    }
                }
            } header: { groupHeading(SyncCopy.text("ios.tabs.openTabs"), count: manager.tabs.count) }

            RecentlyClosedSection(manager: manager, style: style, onOpen: { close() })

            if !manager.syncEngine.inbox.isEmpty {
                Section {
                    ForEach(manager.syncEngine.inbox) { item in
                        Button {
                            if let url = URL(string: item.url) {
                                manager.createTab(url: url)
                                manager.syncEngine.dismiss(item.id)
                                close()
                            }
                        } label: {
                            row(icon: "arrow.down.left", title: item.title.isEmpty ? item.url : item.title,
                                subtitle: SyncCopy.text("sends.from", [
                                    "device": item.fromName,
                                    "time": sentAgo.localizedString(for: Date(timeIntervalSince1970: Double(item.sentAt) / 1000), relativeTo: Date()),
                                ]))
                        }
                        .accessibilityIdentifier("sent.\(item.id)")
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 2, leading: 22, bottom: 2, trailing: 22))
                        .swipeActions(edge: .trailing) {
                            Button(SyncCopy.text("sends.dismiss"), role: .destructive) { manager.syncEngine.dismiss(item.id) }
                                .buttonStyle(.automatic)
                        }
                    }
                } header: { groupHeading(SyncCopy.text("sends.section"), count: manager.syncEngine.inbox.count) }
            }
            if !manager.syncEngine.remoteDevices.isEmpty {
                Section {
                    ForEach(manager.syncEngine.remoteDevices) { device in
                        DisclosureGroup("\(device.name) (\(device.tabs.count))") {
                            ForEach(Array(device.tabs.enumerated()), id: \.offset) { _, tab in
                                Button {
                                    if let url = URL(string: tab.url) { manager.createTab(url: url); close() }
                                } label: {
                                    row(icon: "globe", title: tab.title.isEmpty ? tab.url : tab.title, subtitle: tab.url)
                                }
                            }
                        }
                        .font(BrowserStyle.font(13))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                } header: { groupHeading(SyncCopy.text("footer.devices")) }
            }
        }
    }

    private var slashList: some View {
        let slashWord = String(input.trimmingCharacters(in: .whitespaces)
            .split(separator: " ").first ?? Substring(input))
        let matches = SlashCommand.filter(prefix: slashWord, in: manager)
        return List {
            if matches.isEmpty {
                Text(SyncCopy.text("ios.palette.noCommand"))
                    .foregroundStyle(style.secondary)
            } else {
                ForEach(matches) { cmd in
                    Button {
                        // A tapped row runs with what's typed after its name.
                        finish(cmd.execute(manager, argument: SlashCommand.argument(from: input)))
                    } label: {
                        row(icon: "command", title: cmd.command, subtitle: cmd.hint)
                    }
                }
            }
        }
    }

    private var switcherList: some View {
        let results = QuickSwitcher.search(
            query: input.trimmingCharacters(in: .whitespacesAndNewlines),
            tabs: manager.tabs, remote: manager.syncEngine.remoteDevices, favorites: manager.syncEngine.favorites,
            history: manager.historyStore.entries, groups: manager.groups, sets: switcherSets,
            remoteSpaces: switcherRemoteSpaces
        )
        return List {
            if results.isEmpty {
                Text(SyncCopy.text("ios.palette.noMatches"))
                    .foregroundStyle(style.secondary)
            } else {
                ForEach(results) { result in
                    Button {
                        open(result)
                        close()
                    } label: {
                        row(icon: result.groupId != nil ? "rectangle.stack" : result.setId != nil ? "square.on.square" : result.localTabID == nil ? "magnifyingglass" : "globe",
                            title: result.title, subtitle: result.subtitle)
                    }
                }
            }
        }
    }

    /// The sets the Quick Switcher can show: every Space but the shown one,
    /// and This iPhone while a Space is shown.
    private var switcherSets: [(id: String, name: String, count: Int)] {
        var sets = manager.spaces.filter { $0.id != manager.shownSetId }.map { ($0.id, $0.name, manager.tabCount($0.id)) }
        if manager.shownSetId != TabSets.iphoneId {
            sets.insert((TabSets.iphoneId, SyncCopy.text("spaces.thisIPhone"), manager.tabCount(TabSets.iphoneId)), at: 0)
        }
        return sets
    }

    /// Other devices' Spaces (switch off), which open their review sheet.
    private var switcherRemoteSpaces: [(id: String, name: String, device: String)] {
        manager.remoteSpaces.map { ($0.id, $0.name, $0.deviceName) }
    }

    private func open(_ result: SyncedSwitcherResult) {
        if let remoteId = result.remoteSpaceId, let remote = manager.remoteSpaces.first(where: { $0.id == remoteId }) {
            manager.requestBringSpace(remote)
            return
        }
        if let groupId = result.groupId { manager.showGroup(groupId) }
        else if let setId = result.setId { manager.show(set: setId) }
        else if let id = result.localTabID { manager.setActive(id) }
        else if let url = result.url { manager.openFromSwitcher(url) }
    }

    /// Closes the palette after a command, or keeps it open with the text a
    /// command asked for (a bare `/send` waits for a device name).
    private func finish(_ outcome: SlashOutcome) {
        switch outcome {
        case .done: close()
        case .prompt(let text): input = text
        }
    }

    private func handleSubmit() {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if trimmed.hasPrefix("/") {
            if let outcome = SlashCommand.run(trimmed, in: manager) { finish(outcome) }
            return
        }

        let results = QuickSwitcher.search(query: trimmed, tabs: manager.tabs, remote: manager.syncEngine.remoteDevices, favorites: manager.syncEngine.favorites, history: manager.historyStore.entries, groups: manager.groups, sets: switcherSets, remoteSpaces: switcherRemoteSpaces)
        if let top = QuickSwitcher.goTarget(query: trimmed, results: results) {
            open(top)
            close()
            return
        }

        manager.activeTab?.addressText = trimmed
        manager.submitActiveTabAddress()
        close()
    }
}
