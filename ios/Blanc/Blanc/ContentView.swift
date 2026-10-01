import SwiftUI

struct ContentView: View {
    let manager: TabsManager
    @State private var showPalette = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var theme: BlancTheme {
        resolvedTheme(preference: manager.settingsStore.theme, systemScheme: colorScheme)
    }

    var body: some View {
        Group {
            if #available(iOS 27.1, *) {
                NavigationStack {
                    browserPage
                        .toolbar(.hidden, for: .navigationBar)
                        .toolbar {
                            ToolbarItem(placement: .bottomBar) {
                                Button { manager.activeTab?.goBack() } label: {
                                    Label("Back", systemImage: "chevron.left")
                                }
                                .disabled(manager.activeTab?.canGoBack != true)
                            }

                            ToolbarItem(placement: .bottomBar) {
                                Button { showPalette = true } label: {
                                    Label("Search and commands", systemImage: "command")
                                }
                                .popover(isPresented: $showPalette, arrowEdge: .trailing) {
                                    if horizontalSizeClass == .compact {
                                        PaletteSheet(manager: manager)
                                    } else {
                                        PaletteSheet(manager: manager)
                                            .frame(width: 420, height: 500)
                                    }
                                }
                            }

                            ToolbarItem(placement: .bottomBar) {
                                Button {
                                    manager.applySettingsPatch([
                                        "adblockEnabled": !manager.settingsStore.adblockEnabled
                                    ])
                                } label: {
                                    Label(
                                        manager.settingsStore.adblockEnabled
                                            ? "Turn Blanc Blocker off" : "Turn Blanc Blocker on",
                                        systemImage: manager.settingsStore.adblockEnabled
                                            ? "shield.checkered" : "shield.slash"
                                    )
                                }
                                .accessibilityValue(manager.settingsStore.adblockEnabled ? "On" : "Off")
                            }

                            ToolbarItem(placement: .bottomBar) {
                                DuoTabStrip(manager: manager, openPalette: { showPalette = true })
                            }
                            .axisBehavior(.verticalPreferred)

                            ToolbarItem(placement: .bottomBar) {
                                Button { manager.createTab() } label: {
                                    Label("New Tab", systemImage: "plus")
                                }
                            }

                            ToolbarItem(placement: .bottomBar) {
                                Menu {
                                    Button("Reload", systemImage: "arrow.clockwise") {
                                        manager.activeTab?.reload()
                                    }
                                    Button("Forward", systemImage: "chevron.right") {
                                        manager.activeTab?.goForward()
                                    }
                                    .disabled(manager.activeTab?.canGoForward != true)
                                } label: {
                                    Label("More browser actions", systemImage: "ellipsis")
                                }
                            }
                        }
                }
            } else {
                ZStack(alignment: .bottom) {
                    browserPage
                    addressPill
                }
                .sheet(isPresented: $showPalette) {
                    PaletteSheet(manager: manager)
                }
            }
        }
    }

    private var browserPage: some View {
        ZStack {
            (Color(blancHex: BlancTokens.bg(theme)) ?? .white)
                .ignoresSafeArea()

            if let tab = manager.activeTab {
                WebView(tab: tab)
                    .id(tab.id)
                    .ignoresSafeArea(edges: .top)
            }
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

@available(iOS 27.1, *)
private struct DuoTabStrip: View {
    let manager: TabsManager
    let openPalette: () -> Void
    @Environment(\.toolbarVerticalEdge) private var verticalEdge

    var body: some View {
        let visible = Array(manager.tabs.prefix(3))
        let overflow = manager.tabs.count - visible.count

        Group {
            if verticalEdge != nil {
                VStack(spacing: 0) {
                    tabButtons(visible)
                    if overflow > 0 { overflowButton(overflow) }
                }
            } else {
                HStack(spacing: 0) {
                    tabButtons(visible)
                    if overflow > 0 { overflowButton(overflow) }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Open tabs")
    }

    @ViewBuilder
    private func tabButtons(_ tabs: [TabModel]) -> some View {
        ForEach(tabs) { tab in
            Button { manager.setActive(tab.id) } label: {
                TabGlyph(tab: tab, isActive: tab.id == manager.activeTabId)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)
            .accessibilityAddTraits(tab.id == manager.activeTabId ? [.isSelected] : [])
        }
    }

    private func overflowButton(_ count: Int) -> some View {
        Button(action: openPalette) {
            Text("+\(count)")
                .font(.caption2.monospacedDigit())
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Show \(count) more tabs")
    }
}

@available(iOS 27.1, *)
private struct TabGlyph: View {
    let tab: TabModel
    let isActive: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(isActive ? Color.primary.opacity(0.09) : Color.clear)

            if let data = tab.faviconData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 21, height: 21)
            } else if tab.currentURL.scheme == "blanc" {
                Image(systemName: "house")
                    .font(.system(size: 17, weight: .medium))
            } else {
                Text(String((tab.currentURL.host ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
            }

            if isActive {
                Circle()
                    .fill(Color.primary)
                    .frame(width: 4, height: 4)
                    .offset(y: 17)
            }
        }
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
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
