import SwiftUI

struct PaletteSheet: View {
    let manager: TabsManager
    @Environment(\.dismiss) private var dismiss
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
        NavigationStack {
            VStack(spacing: 0) {
                TextField("Search, enter address, or / for commands", text: $input)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.webSearch)
                    .submitLabel(.go)
                    .focused($inputFocused)
                    .onSubmit { handleSubmit() }
                    .padding()

                Divider()

                listContent
            }
            .navigationTitle("Blanc")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
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
                        }
                    }
                }
            }
            ForEach(manager.tabs) { tab in
                Button {
                    manager.setActive(tab.id)
                    dismiss()
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)
                                .lineLimit(1)
                            Text(tab.currentURL.absoluteString)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        if tab.id == manager.activeTabId {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                        }
                    }
                }
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
                    .foregroundStyle(.secondary)
            } else {
                ForEach(matches) { cmd in
                    Button {
                        cmd.execute(manager)
                        dismiss()
                    } label: {
                        VStack(alignment: .leading) {
                            Text(cmd.command)
                                .fontWeight(.medium)
                            Text(cmd.hint)
                                .font(.caption)
                                .foregroundStyle(.secondary)
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
                    .foregroundStyle(.secondary)
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
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
    }

    private func open(_ result: SyncedSwitcherResult) {
        if let id = result.localTabID { manager.setActive(id) }
        else if let url = result.url { manager.openFromSwitcher(url) }
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
