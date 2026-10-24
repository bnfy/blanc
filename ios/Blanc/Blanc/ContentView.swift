import SwiftUI

struct ContentView: View {
    let manager: TabsManager
    @State private var showPalette = false
    @State private var sendBanner: String?
    @Environment(\.colorScheme) private var colorScheme

    private var theme: BlancTheme {
        resolvedTheme(preference: manager.settingsStore.theme, systemScheme: colorScheme)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            (Color(blancHex: BlancTokens.bg(theme)) ?? .white)
                .ignoresSafeArea()

            if let tab = manager.activeTab {
                WebView(tab: tab)
                    .id(tab.id)
                    .ignoresSafeArea(edges: .top)
            }

            VStack(spacing: 8) {
                if let sendBanner {
                    Text(sendBanner)
                        .font(.footnote)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .modifier(PillStyle(theme: theme))
                        .transition(.opacity)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                addressPill
            }
        }
        .sheet(isPresented: $showPalette) {
            PaletteSheet(manager: manager)
        }
    }

    private var addressPill: some View {
        HStack(spacing: 10) {
            Button { showPalette = true } label: {
                HStack(spacing: 8) {
                    tabDots

                    Text(displayDomain)
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open palette")

            if manager.isAdBlockReady {
                Image(systemName: "shield.checkmark")
                    .foregroundStyle(.primary)
                    .font(.footnote)
                    .accessibilityLabel("Ad blocking active")
            }

            Spacer(minLength: 0)

            sendMenu

            Button {
                if manager.activeTab?.isLoading == true {
                    manager.activeTab?.stop()
                } else {
                    manager.activeTab?.reload()
                }
            } label: {
                Image(systemName:
                    manager.activeTab?.isLoading == true ? "xmark" : "arrow.clockwise")
            }

            Button { manager.createTab() } label: {
                Image(systemName: "plus")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .modifier(PillStyle(theme: theme))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    /// Send to device (M7b): the page goes to one of the account's other
    /// devices. Shown only for a web page while sync has somewhere to send it.
    @ViewBuilder
    private var sendMenu: some View {
        let targets = manager.syncEngine.sendTargets
        if let tab = manager.activeTab, ["http", "https"].contains(tab.currentURL.scheme?.lowercased() ?? ""),
            !targets.isEmpty
        {
            Menu {
                Section(SyncCopy.text("tabMenu.sendToDevice")) {
                    ForEach(targets) { target in
                        Button(target.name) { send(tab: tab, to: target) }
                    }
                }
            } label: {
                Image(systemName: "paperplane")
            }
            .accessibilityLabel(SyncCopy.text("tabMenu.sendToDevice"))
        }
    }

    private func send(tab: TabModel, to target: SendTarget) {
        let url = tab.currentURL.absoluteString
        let title = tab.pageTitle
        Task {
            let result = await manager.syncEngine.send(url: url, title: title, to: target.id)
            let message = SyncCopy.sendResult(result, device: target.name)
            withAnimation { sendBanner = message }
            UIAccessibility.post(notification: .announcement, argument: message)
            try? await Task.sleep(for: .seconds(2.5))
            if sendBanner == message { withAnimation { sendBanner = nil } }
        }
    }

    private var displayDomain: String {
        guard let url = manager.activeTab?.currentURL else { return "New Tab" }
        if url.scheme == "blanc" {
            return url.host == "newtab" ? "New Tab" : (url.host ?? "New Tab")
        }
        return url.host ?? "New Tab"
    }

    private var tabDots: some View {
        let maxVisible = 3
        let overflow = manager.tabs.count > maxVisible
        let visible = overflow ? Array(manager.tabs.prefix(maxVisible - 1)) : manager.tabs
        let overflowCount = manager.tabs.count - visible.count

        return HStack(spacing: 6) {
            ForEach(visible) { tab in
                Circle()
                    .fill(tab.id == manager.activeTabId
                          ? Color.primary
                          : Color.secondary.opacity(0.4))
                    .frame(width: 7, height: 7)
            }
            if overflow {
                Text("+\(overflowCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct PillStyle: ViewModifier {
    let theme: BlancTheme

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular.interactive(), in: .capsule)
        } else {
            content
                .background(Color(blancHex: BlancTokens.surfaceRaised(theme)) ?? .white)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Color(blancHex: BlancTokens.border(theme)) ?? .gray))
        }
    }
}

#Preview { ContentView(manager: TabsManager()) }
