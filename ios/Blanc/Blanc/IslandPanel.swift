import SwiftUI

struct IslandPanel: View {
    enum Start { case page, tabs }

    let manager: TabsManager
    let start: Start
    var onDismiss: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismissAction
    @State private var input = ""
    @FocusState private var inputFocused: Bool

    private var trimmedInput: String {
        input.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            pageIdentity

            addressField
                .padding(.top, 16)
                .padding(.bottom, 20)

            ScrollViewReader { proxy in
                ScrollView {
                    if trimmedInput.isEmpty {
                        tabSection
                    } else if trimmedInput.hasPrefix("/") {
                        commandSection
                    } else {
                        switcherSection
                    }
                }
                .onAppear {
                    guard start == .tabs, let selected = manager.activeTabId else { return }
                    DispatchQueue.main.async { proxy.scrollTo(selected, anchor: .center) }
                }
            }

            if trimmedInput.isEmpty { footer }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(.systemBackground))
        .presentationDetents([.medium, .large])
    }

    private var pageIdentity: some View {
        HStack(alignment: .top, spacing: 12) {
            if let tab = manager.activeTab {
                BlancFavicon(tab: tab, size: 28)
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 3) {
                    Text(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)
                        .font(.custom("Inter-SemiBold", size: 18, relativeTo: .headline))
                        .lineLimit(2)
                    if let host = tab.currentURL.host, tab.currentURL.scheme != "blanc" {
                        Label(host, systemImage: "lock")
                            .font(.custom("Inter-Regular", size: 12, relativeTo: .caption))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            Button("Close", systemImage: "xmark") { close() }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .frame(width: 36, height: 36)
        }
    }

    private var addressField: some View {
        HStack(spacing: 9) {
            BlancIslandGlyph(kind: .search, color: .secondary)
                .frame(width: 19, height: 19)
            TextField("Search or enter address", text: $input)
                .font(.custom("Inter-Regular", size: 15, relativeTo: .body))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.webSearch)
                .submitLabel(.go)
                .focused($inputFocused)
                .onSubmit(handleSubmit)
                .accessibilityLabel("Search, address, or slash command")
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 46)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private var tabSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Tabs")
                .font(.custom("Inter-SemiBold", size: 14, relativeTo: .subheadline))
                .foregroundStyle(.secondary)
                .padding(.bottom, 3)

            ForEach(manager.tabs) { tab in
                Button {
                    manager.setActive(tab.id)
                    close()
                } label: {
                    HStack(spacing: 12) {
                        BlancFavicon(tab: tab, size: 25)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)
                                .font(.custom(tab.id == manager.activeTabId ? "Inter-SemiBold" : "Inter-Regular",
                                              size: 15, relativeTo: .body))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Text(tab.currentURL.host ?? "New Tab")
                                .font(.custom("Inter-Regular", size: 12, relativeTo: .caption))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        if tab.id == manager.activeTabId {
                            Circle().fill(.primary).frame(width: 6, height: 6)
                                .accessibilityHidden(true)
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 54)
                    .background(tab.id == manager.activeTabId
                                ? Color.primary.opacity(0.07) : .clear,
                                in: RoundedRectangle(cornerRadius: 12))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab.id == manager.activeTabId ? [.isSelected] : [])
                .id(tab.id)
                .contextMenu {
                    Button("Close Tab", systemImage: "xmark") { manager.closeTab(tab.id) }
                }
            }
        }
    }

    private var footer: some View {
        Button {
            manager.createTab()
            close()
        } label: {
            HStack(spacing: 8) {
                BlancIslandGlyph(kind: .plus, color: .white)
                    .frame(width: 17, height: 17)
                Text("New Tab")
                    .font(.custom("Inter-SemiBold", size: 14, relativeTo: .subheadline))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(minHeight: 42)
            .background(Color(white: 0.12), in: Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 16)
    }

    private var commandSection: some View {
        let word = String(trimmedInput.split(separator: " ").first ?? Substring(trimmedInput))
        return VStack(alignment: .leading, spacing: 3) {
            ForEach(SlashCommand.filter(prefix: word)) { command in
                Button {
                    command.execute(manager)
                    close()
                } label: {
                    resultRow(title: command.command, subtitle: command.hint)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var switcherSection: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(QuickSwitcher.search(query: trimmedInput, tabs: manager.tabs), id: \.tab.id) { result in
                Button {
                    manager.setActive(result.tab.id)
                    close()
                } label: {
                    resultRow(title: result.title, subtitle: result.subtitle)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func resultRow(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.custom("Inter-Medium", size: 15, relativeTo: .body))
                .foregroundStyle(.primary)
            Text(subtitle)
                .font(.custom("Inter-Regular", size: 12, relativeTo: .caption))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func handleSubmit() {
        guard !trimmedInput.isEmpty else { return }
        if trimmedInput.hasPrefix("/") {
            let word = String(trimmedInput.split(separator: " ").first ?? Substring(trimmedInput))
            if let command = SlashCommand.filter(prefix: word).first {
                command.execute(manager)
                close()
            }
            return
        }
        let results = QuickSwitcher.search(query: trimmedInput, tabs: manager.tabs)
        if let first = results.first, first.score >= QuickSwitcher.strongMatchScore {
            manager.setActive(first.tab.id)
        } else {
            manager.activeTab?.addressText = trimmedInput
            manager.submitActiveTabAddress()
        }
        close()
    }

    private func close() {
        if let onDismiss { onDismiss() } else { dismissAction() }
    }
}
