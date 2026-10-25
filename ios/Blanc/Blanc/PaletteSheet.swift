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
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Blanc").font(BrowserStyle.font(22, semibold: true, relativeTo: .title2))
                    Text("Search, switch tabs, or run a command")
                        .font(BrowserStyle.font(13, relativeTo: .caption))
                        .foregroundStyle(style.secondary)
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .background(style.surface, in: Circle())
                }
                .accessibilityLabel("Close palette")
            }
            .padding(.horizontal, 20)
            .padding(.top, 26)
            .padding(.bottom, 18)

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(style.secondary)
                TextField("Search or enter address", text: $input)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.webSearch)
                    .submitLabel(.go)
                    .focused($inputFocused)
                    .onSubmit { handleSubmit() }
                if !input.isEmpty {
                    Button { input = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(style.secondary)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(style.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(style.border, lineWidth: 0.5))
            .padding(.horizontal, 20)

            HStack {
                Text(mode == .tabs ? "Open tabs" : mode == .slash ? "Commands" : "Matching tabs")
                    .font(BrowserStyle.font(13, semibold: true, relativeTo: .caption))
                Spacer()
                if mode == .tabs {
                    Text("\(manager.tabs.count)").font(.system(size: 12, weight: .medium, design: .monospaced))
                    Button {
                        manager.createTab()
                        dismiss()
                    } label: {
                        Label("New tab", systemImage: "plus")
                            .font(BrowserStyle.font(13, semibold: true))
                            .frame(minHeight: 44)
                    }
                }
            }
            .foregroundStyle(style.secondary)
            .padding(.horizontal, 24)
            .padding(.top, 10)
            .padding(.bottom, 2)

            listContent
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
        }
        .font(BrowserStyle.font(16))
        .tracking(0.16)
        .foregroundStyle(style.text)
        .tint(style.text)
        .buttonStyle(.plain)
        .background(style.raised)
        .presentationBackground(style.raised)
        .presentationCornerRadius(24)
        .presentationDragIndicator(.visible)
        .presentationDetents([.medium, .large])
        .onAppear { inputFocused = true }
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
            // Send to device (M7b): pages other devices sent here come first.
            // Tap opens one in a new tab; swipe left dismisses it. Either way
            // it leaves this list on this phone only.
            if !manager.syncEngine.inbox.isEmpty {
                Section(SyncCopy.text("sends.section")) {
                    ForEach(manager.syncEngine.inbox) { item in
                        Button {
                            if let url = URL(string: item.url) {
                                manager.createTab(url: url)
                                manager.syncEngine.dismiss(item.id)
                                dismiss()
                            }
                        } label: {
                            VStack(alignment: .leading) {
                                Text(item.title.isEmpty ? item.url : item.title).lineLimit(1)
                                Text(SyncCopy.text("sends.from", [
                                    "device": item.fromName,
                                    "time": sentAgo.localizedString(
                                        for: Date(timeIntervalSince1970: Double(item.sentAt) / 1000), relativeTo: Date()),
                                ]))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            }
                        }
                        .accessibilityIdentifier("sent.\(item.id)")
                        .swipeActions(edge: .trailing) {
                            Button(SyncCopy.text("sends.dismiss"), role: .destructive) {
                                manager.syncEngine.dismiss(item.id)
                            }
                            .buttonStyle(.automatic)
                        }
                    }
                }
            }
            ForEach(manager.tabs) { tab in
                Button {
                    manager.setActive(tab.id)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: tab.currentURL.scheme == "blanc" ? "sun.max" : "globe")
                            .font(.system(size: 17))
                            .frame(width: 38, height: 38)
                            .background(style.surface, in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(tab.pageTitle.isEmpty ? "Start Page" : tab.pageTitle)
                                .lineLimit(1)
                            Text(tab.currentURL.scheme == "blanc" ? "Blanc · \(tab.currentURL.host == "newtab" ? "Start Page" : tab.currentURL.host?.capitalized ?? "Page")" : tab.currentURL.absoluteString)
                                .font(BrowserStyle.font(12, relativeTo: .caption))
                                .foregroundStyle(style.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        if tab.id == manager.activeTabId {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                        }
                    }
                    .padding(.vertical, 7)
                    .padding(.horizontal, 12)
                    .background(tab.id == manager.activeTabId ? style.selection : .clear,
                                in: RoundedRectangle(cornerRadius: 12))
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 16))
            }
            .onDelete { offsets in
                let ids = offsets.map { manager.tabs[$0].id }
                for id in ids { manager.closeTab(id) }
            }
            if !manager.syncEngine.remoteDevices.isEmpty {
                Section(SyncCopy.text("footer.devices")) {
                    ForEach(manager.syncEngine.remoteDevices) { device in
                        DisclosureGroup("\(device.name) (\(device.tabs.count))") {
                            ForEach(Array(device.tabs.enumerated()), id: \.offset) { _, tab in
                                Button {
                                    if let url = URL(string: tab.url) { manager.createTab(url: url); dismiss() }
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(tab.title.isEmpty ? tab.url : tab.title).lineLimit(1)
                                        Text(tab.url).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                }
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
                        VStack(alignment: .leading) {
                            Text(cmd.command)
                                .font(BrowserStyle.font(16, semibold: true))
                            Text(cmd.hint)
                                .font(BrowserStyle.font(12, relativeTo: .caption))
                                .foregroundStyle(style.secondary)
                        }
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
                        VStack(alignment: .leading) {
                            Text(result.title)
                                .lineLimit(1)
                            Text(result.subtitle)
                                .font(BrowserStyle.font(12, relativeTo: .caption))
                                .foregroundStyle(style.secondary)
                                .lineLimit(1)
                        }
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
