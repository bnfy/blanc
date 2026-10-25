import SwiftUI

struct PaletteSheet: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    @State private var input = ""
    @FocusState private var inputFocused: Bool

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
            addressRow
            Rectangle().fill(style.border).frame(height: 0.5).padding(.horizontal, 12)
            listContent
                .listStyle(.plain)
                .environment(\.defaultMinListRowHeight, 44)
                .environment(\.defaultMinListHeaderHeight, 0)
                .contentMargins(.top, 0, for: .scrollContent)
                .listSectionSpacing(8)
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.interactively)
            footer
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
    }

    private var addressRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(style.secondary)
                .frame(width: 24)
            TextField("Search, enter address, or / command", text: $input)
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
                .accessibilityLabel("Clear search")
            }
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Collapse Island")
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
                    dismiss()
                } label: {
                    Label("New tab", systemImage: "plus")
                        .font(BrowserStyle.font(13, semibold: true))
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .foregroundStyle(style.raised)
                        .background(style.text, in: Capsule())
                        .frame(minHeight: 44)
                }
                Spacer(minLength: 4)
                pageShortcut("Favorites", icon: "bookmark", page: "bookmarks")
                pageShortcut("History", icon: "clock.arrow.circlepath", page: "history")
                pageShortcut("Settings", icon: "slider.horizontal.3", page: "settings")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
    }

    private func pageShortcut(_ label: String, icon: String, page: String) -> some View {
        Button {
            manager.createTab(url: URL(string: "blanc://\(page)/")!)
            dismiss()
        } label: {
            Image(systemName: icon).font(.system(size: 16)).frame(width: 44, height: 44)
        }
        .accessibilityLabel(label)
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
                ForEach(manager.tabs) { tab in
                    HStack(spacing: 0) {
                        Button {
                            manager.setActive(tab.id)
                            dismiss()
                        } label: {
                            row(icon: tab.currentURL.scheme == "blanc" ? "sun.horizon" : "globe",
                                title: tab.currentURL == TabsManager.newTabURL ? "Start Page" : tab.pageTitle.isEmpty ? tab.currentURL.host ?? "Tab" : tab.pageTitle,
                                subtitle: tab.currentURL.scheme == "blanc" ? "Blanc" : tab.currentURL.host ?? tab.currentURL.absoluteString,
                                selected: tab.id == manager.activeTabId)
                        }
                        .accessibilityAddTraits(tab.id == manager.activeTabId ? .isSelected : [])
                        Button { manager.closeTab(tab.id) } label: {
                            Image(systemName: "xmark").font(.system(size: 12)).foregroundStyle(style.secondary)
                                .frame(width: 44, height: 48)
                        }
                        .accessibilityLabel("Close \(tab.pageTitle.isEmpty ? "tab" : tab.pageTitle)")
                    }
                    .padding(.leading, 10)
                    .background(tab.id == manager.activeTabId ? style.selection : .clear, in: RoundedRectangle(cornerRadius: 10))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
                }
                .onDelete { offsets in
                    let ids = offsets.map { manager.tabs[$0].id }
                    for id in ids { manager.closeTab(id) }
                }
            } header: { groupHeading("Open tabs", count: manager.tabs.count) }

            if !manager.syncEngine.inbox.isEmpty {
                Section {
                    ForEach(manager.syncEngine.inbox) { item in
                        Button {
                            if let url = URL(string: item.url) {
                                manager.createTab(url: url)
                                manager.syncEngine.dismiss(item.id)
                                dismiss()
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
                                    if let url = URL(string: tab.url) { manager.createTab(url: url); dismiss() }
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
        let matches = SlashCommand.filter(prefix: slashWord)
        return List {
            if matches.isEmpty {
                Text("No matching command")
                    .foregroundStyle(style.secondary)
            } else {
                ForEach(matches) { cmd in
                    Button {
                        cmd.execute(manager)
                        dismiss()
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
            history: manager.historyStore.entries
        )
        return List {
            if results.isEmpty {
                Text("No matches — tap Go to open as address or search")
                    .foregroundStyle(style.secondary)
            } else {
                ForEach(results) { result in
                    Button {
                        open(result)
                        dismiss()
                    } label: {
                        row(icon: result.localTabID == nil ? "magnifyingglass" : "globe", title: result.title, subtitle: result.subtitle)
                    }
                }
            }
        }
    }

    private func open(_ result: SyncedSwitcherResult) {
        if let id = result.localTabID { manager.setActive(id) }
        else if let url = result.url { manager.createTab(url: url) }
    }

    private func handleSubmit() {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if trimmed.hasPrefix("/") {
            let slashWord = String(trimmed.split(separator: " ").first ?? Substring(trimmed))
            let matches = SlashCommand.filter(prefix: slashWord)
            if let first = matches.first {
                first.execute(manager)
                dismiss()
            }
            return
        }

        let results = QuickSwitcher.search(query: trimmed, tabs: manager.tabs, remote: manager.syncEngine.remoteDevices, favorites: manager.syncEngine.favorites, history: manager.historyStore.entries)
        if let top = QuickSwitcher.goTarget(query: trimmed, results: results) {
            open(top)
            dismiss()
            return
        }

        manager.activeTab?.addressText = trimmed
        manager.submitActiveTabAddress()
        dismiss()
    }
}
