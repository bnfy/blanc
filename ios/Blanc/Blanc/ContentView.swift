import SwiftUI

struct ContentView: View {
    let manager: TabsManager
    @State private var showPalette = false
    @State private var sendBanner: String?
    @Environment(\.colorScheme) private var colorScheme

    private var isPrivate: Bool { manager.activeTab?.isPrivate ?? false }

    private var theme: BlancTheme {
        resolvedTheme(preference: manager.settingsStore.theme, systemScheme: colorScheme, isPrivate: isPrivate)
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
                        .accessibilityIdentifier("send.banner")
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
            .accessibilityIdentifier("pill.palette")

            if let tab = manager.activeTab, tab.isPrivate {
                // Leaving private mode closes the private tab, as on desktop.
                Button { manager.closeTab(tab.id) } label: {
                    Text(SyncCopy.text("pill.private.chip"))
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .overlay(Capsule().stroke(Color.primary.opacity(0.4)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(SyncCopy.text("pill.private.title"))
                .accessibilityIdentifier("pill.private")
            }

            if manager.isAdBlockReady {
                Image(systemName: "shield.checkmark")
                    .foregroundStyle(.primary)
                    .font(.footnote)
                    .accessibilityLabel("Ad blocking active")
            }

            Spacer(minLength: 0)

            // Icons sit in 32 pt targets with no extra gap, so the glyphs stay
            // about as far apart as before.
            HStack(spacing: 0) {
                if let tab = manager.activeTab, !tab.isPrivate, TabsManager.canFavorite(tab.currentURL) {
                    let favorited = manager.isFavorite(tab)
                    Button { manager.toggleFavorite(tab) } label: {
                        Image(systemName: favorited ? "heart.fill" : "heart")
                            .modifier(PillIconTarget())
                    }
                    .accessibilityLabel(SyncCopy.text(favorited ? "tabMenu.removeFavorite" : "tabMenu.saveFavorite"))
                    .accessibilityValue(favorited ? "on" : "off")
                    .accessibilityIdentifier("pill.favorite")
                }
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
                        .modifier(PillIconTarget())
                }

                Button { manager.createTab() } label: {
                    Image(systemName: "plus")
                        .modifier(PillIconTarget())
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .modifier(PillStyle(theme: theme))
        // The private theme is dark whatever the appearance setting.
        .environment(\.colorScheme, isPrivate ? .dark : colorScheme)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    /// Send to device (M7b): the page goes to one of the account's other
    /// devices. Shown only for a web page while sync has somewhere to send it.
    @ViewBuilder
    private var sendMenu: some View {
        let targets = manager.syncEngine.sendTargets
        if let tab = manager.activeTab, manager.canSend(tab), !targets.isEmpty
        {
            Menu {
                Section(SyncCopy.text("tabMenu.sendToDevice")) {
                    ForEach(targets) { target in
                        Button(target.name) { send(tab: tab, to: target) }
                    }
                }
            } label: {
                Image(systemName: "paperplane")
                    .modifier(PillIconTarget())
            }
            .accessibilityLabel(SyncCopy.text("tabMenu.sendToDevice"))
            .accessibilityIdentifier("pill.send")
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

/// A pill icon's tap target. On iOS 26 a button about 20 pt across (the bare
/// symbol) doesn't register taps at all; 32 pt does.
private struct PillIconTarget: ViewModifier {
    func body(content: Content) -> some View {
        content.frame(width: 32, height: 32).contentShape(Rectangle())
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
