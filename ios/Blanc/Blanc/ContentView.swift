import SwiftUI

struct ContentView: View {
    let manager: TabsManager
    @State private var showPalette = false
    @State private var showBlockerDetails = false
    @State private var islandPresentation: DuoIslandPresentation?
    @Environment(\.colorScheme) private var colorScheme

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
                                    Label("Back", image: "IslandBack")
                                }
                                .labelStyle(.iconOnly)
                                .disabled(manager.activeTab?.canGoBack != true)
                            }
                            .axisBehavior(.verticalPreferred)
                            .visibilityPriority(.high)

                            ToolbarItem(placement: .bottomBar) {
                                DuoTabStrip(manager: manager) { start, source, edge in
                                    islandPresentation = DuoIslandPresentation(
                                        start: start, source: source, edge: edge)
                                }
                            }
                            .axisBehavior(.verticalPreferred)
                            .visibilityPriority(.high)

                            ToolbarItem(placement: .bottomBar) {
                                Button { manager.createTab() } label: {
                                    Label("New Tab", image: "IslandPlus")
                                }
                                .labelStyle(.iconOnly)
                            }
                            .axisBehavior(.verticalPreferred)
                            .visibilityPriority(.high)

                            ToolbarItem(placement: .bottomBar) {
                                DuoBlockerButton(manager: manager, showDetails: $showBlockerDetails)
                            }
                            .axisBehavior(.verticalPreferred)
                            .visibilityPriority(.high)

                            ToolbarItem(placement: .bottomBar) {
                                Menu {
                                    Button("Reload", systemImage: "arrow.clockwise") {
                                        manager.activeTab?.reload()
                                    }
                                    Button("Forward", systemImage: "chevron.right") {
                                        manager.activeTab?.goForward()
                                    }
                                    .disabled(manager.activeTab?.canGoForward != true)
                                    Button("Blocker details", systemImage: "shield") {
                                        showBlockerDetails = true
                                    }
                                } label: {
                                    Label("More", systemImage: "ellipsis")
                                }
                                .labelStyle(.iconOnly)
                            }
                            .axisBehavior(.verticalPreferred)
                            .visibilityPriority(.low)
                        }
                }
                .overlay {
                    if let islandPresentation {
                        DuoIslandOverlay(manager: manager, presentation: islandPresentation) {
                            self.islandPresentation = nil
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

private struct DuoIslandPresentation {
    let start: IslandPanel.Start
    let source: CGRect
    let edge: HorizontalEdge?
}

@available(iOS 27.1, *)
private struct DuoIslandOverlay: View {
    let manager: TabsManager
    let presentation: DuoIslandPresentation
    let onDismiss: () -> Void

    var body: some View {
        GeometryReader { geometry in
            let root = geometry.frame(in: .global)
            let width = min(430, geometry.size.width - 32)
            let height = min(560, max(400, 250 + CGFloat(manager.tabs.count) * 60),
                             geometry.size.height - 32)
            let sourceY = presentation.source == .zero
                ? geometry.size.height / 2
                : presentation.source.midY - root.minY
            let x: CGFloat = switch presentation.edge {
            case .trailing:
                min(geometry.size.width - width / 2 - 12,
                    max(width / 2 + 12,
                        presentation.source.minX - root.minX - width / 2 - 10))
            case .leading:
                max(width / 2 + 12,
                    min(geometry.size.width - width / 2 - 12,
                        presentation.source.maxX - root.minX + width / 2 + 10))
            case nil:
                geometry.size.width / 2
            }
            let idealY = presentation.edge == nil
                ? presentation.source.minY - root.minY - height / 2 - 12
                : sourceY
            let y = max(height / 2 + 12,
                        min(geometry.size.height - height / 2 - 12, idealY))

            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            IslandPanel(manager: manager, start: presentation.start,
                        onDismiss: onDismiss)
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.12), radius: 24, y: 12)
                .position(x: x, y: y)

            if let edge = presentation.edge {
                IslandPointer()
                    .fill(Color(.systemBackground))
                    .overlay {
                        IslandPointer()
                            .stroke(Color.primary.opacity(0.1), lineWidth: 1)
                    }
                    .frame(width: 16, height: 20)
                    .rotationEffect(.degrees(edge == .leading ? 180 : 0))
                    .position(
                        x: x + (edge == .trailing ? 1 : -1) * (width / 2 + 7),
                        y: max(y - height / 2 + 24,
                               min(y + height / 2 - 24, sourceY))
                    )
                    .allowsHitTesting(false)
            }
        }
    }
}

private struct IslandPointer: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}

@available(iOS 27.1, *)
private struct DuoTabStrip: View {
    let manager: TabsManager
    let present: (IslandPanel.Start, CGRect, HorizontalEdge?) -> Void
    @State private var tabFrames: [UUID: CGRect] = [:]
    @State private var overflowFrame: CGRect = .zero
    @Environment(\.toolbarVerticalEdge) private var verticalEdge

    var body: some View {
        let activeIndex = manager.tabs.firstIndex { $0.id == manager.activeTabId }
        let visible = DuoTabWindow.indices(count: manager.tabs.count, activeIndex: activeIndex)
            .map { manager.tabs[$0] }
        let overflow = manager.tabs.count - visible.count

        Group {
            if verticalEdge != nil {
                VStack(spacing: 0) {
                    tabButtons(visible)
                    if overflow > 0 { overflowButton(overflow) }
                }
                .frame(width: 44, height: CGFloat(visible.count + (overflow > 0 ? 1 : 0)) * 44)
                .fixedSize(horizontal: true, vertical: true)
            } else {
                HStack(spacing: 0) {
                    tabButtons(visible)
                    if overflow > 0 { overflowButton(overflow) }
                }
                .frame(width: CGFloat(visible.count + (overflow > 0 ? 1 : 0)) * 44,
                       height: 44)
                .fixedSize(horizontal: true, vertical: true)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Open tabs")
    }

    @ViewBuilder
    private func tabButtons(_ tabs: [TabModel]) -> some View {
        ForEach(tabs) { tab in
            Button {
                if tab.id == manager.activeTabId {
                    present(.page, tabFrames[tab.id] ?? .zero, verticalEdge)
                } else {
                    manager.setActive(tab.id)
                }
            } label: {
                TabGlyph(tab: tab, isActive: tab.id == manager.activeTabId)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tab.id == manager.activeTabId
                                ? "Open \(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle), address, and tabs"
                                : "Switch to \(tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle)")
            .accessibilityAddTraits(tab.id == manager.activeTabId ? [.isSelected] : [])
            .onGeometryChange(for: CGRect.self) { proxy in
                proxy.frame(in: .global)
            } action: { frame in
                tabFrames[tab.id] = frame
            }
        }
    }

    private func overflowButton(_ count: Int) -> some View {
        Button { present(.tabs, overflowFrame, verticalEdge) } label: {
            Text("+\(count)")
                .font(.custom("Inter-Medium", size: 12, relativeTo: .caption))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Show \(count) more tabs")
        .onGeometryChange(for: CGRect.self) { proxy in
            proxy.frame(in: .global)
        } action: { frame in
            overflowFrame = frame
        }
    }
}

@available(iOS 27.1, *)
private struct DuoBlockerButton: View {
    let manager: TabsManager
    @Binding var showDetails: Bool
    @Environment(\.toolbarVerticalEdge) private var verticalEdge
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var arrowEdge: Edge {
        switch verticalEdge {
        case .leading: return .leading
        case .trailing: return .trailing
        case nil: return .bottom
        }
    }

    var body: some View {
        Button {
            if manager.canToggleActiveSiteProtection {
                manager.toggleProtectionForActiveSite()
            } else {
                showDetails = true
            }
        } label: {
            Label("Blanc Blocker", image: "IslandShield")
                .opacity(manager.isActiveSiteProtected ? 1 : 0.45)
        }
        .labelStyle(.iconOnly)
        .accessibilityLabel(!manager.canToggleActiveSiteProtection
                            ? "Blanc Blocker details"
                            : manager.isActiveSiteProtected
                              ? "Turn Blanc Blocker off for this site"
                              : "Turn Blanc Blocker on for this site")
        .accessibilityValue(!manager.settingsStore.adblockEnabled
                            ? "Global blocking off"
                            : manager.activeSiteHost == nil
                              ? "Unavailable on this page"
                              : manager.isActiveSiteProtected ? "On for this site" : "Off for this site")
        .contextMenu {
            Button("Blocker details", systemImage: "shield") { showDetails = true }
        }
        .popover(isPresented: $showDetails, arrowEdge: arrowEdge) {
            BlockerDetailView(manager: manager)
                .frame(width: horizontalSizeClass == .compact ? nil : 360)
        }
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

            if isActive {
                BlancFavicon(tab: tab, size: 21)
            } else {
                Circle()
                    .fill(Color.secondary.opacity(0.48))
                    .frame(width: 6, height: 6)
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
