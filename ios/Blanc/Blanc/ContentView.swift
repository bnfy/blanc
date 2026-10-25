import SwiftUI

struct ContentView: View {
    let manager: TabsManager
    @State private var sendBanner: String?
    @Environment(\.colorScheme) private var colorScheme
    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    @State private var showSiteProtection = false
    @State private var showTabGrid = false

    private var isStartPage: Bool {
        manager.activeTab?.currentURL.scheme == "blanc" && manager.activeTab?.currentURL.host == "newtab"
    }

    var body: some View {
        ZStack {
            style.background.ignoresSafeArea()
            if let tab = manager.activeTab {
                WebView(tab: tab)
                    .id(tab.id)
                    .ignoresSafeArea(edges: isStartPage ? .all : [])
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !isStartPage {
                islandContainer.background(style.background)
            }
        }
        .overlay(alignment: .bottom) {
            if isStartPage { islandContainer }
        }
        .fullScreenCover(isPresented: $showTabGrid) {
            TabGridView(manager: manager)
        }
        .sheet(isPresented: Binding(get: { manager.isPalettePresented }, set: { manager.isPalettePresented = $0 })) {
            PaletteSheet(manager: manager)
        }
        .sheet(isPresented: Binding(get: { manager.isWallpaperPickerPresented }, set: { manager.isWallpaperPickerPresented = $0 }), onDismiss: {
            let completion = manager.wallpaperSelectionCompletion
            manager.wallpaperSelectionCompletion = nil
            completion?(nil)
        }) {
            WallpaperPicker { image in
                let completion = manager.wallpaperSelectionCompletion
                manager.wallpaperSelectionCompletion = nil
                manager.isWallpaperPickerPresented = false
                completion?(image)
            }
        }
    }

    private var islandContainer: some View {
        VStack(spacing: 8) {
            if let sendBanner {
                Text(sendBanner).font(BrowserStyle.font(13))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(style.raised, in: Capsule())
                    .accessibilityAddTraits(.updatesFrequently)
                    .accessibilityIdentifier("send.banner")
            }
            addressPill
                .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { value in
                    if value.translation.height < -40 && abs(value.translation.height) > abs(value.translation.width) {
                        openTabGrid()
                    }
                })
                .accessibilityAction(named: "Show all tabs") { openTabGrid() }
        }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
    }

    private func openTabGrid() {
        manager.activeTab?.captureThumbnail()
        showSiteProtection = false
        showTabGrid = true
    }

    private var addressPill: some View {
        HStack(spacing: 0) {
            Button { manager.isPalettePresented = true } label: {
                HStack(spacing: 10) {
                    Text(displayDomain)
                        .font(BrowserStyle.font(15))
                        .tracking(0.15)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 16)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("Search or switch tabs, \(displayDomain)")
            .accessibilityIdentifier("pill.palette")

            blockerButton

            if let tab = manager.activeTab, TabsManager.canFavorite(tab.currentURL) {
                let favorited = manager.isFavorite(tab)
                Button { manager.toggleFavorite(tab) } label: {
                    Image(systemName: favorited ? "heart.fill" : "heart")
                }
                .accessibilityLabel(SyncCopy.text(favorited ? "tabMenu.removeFavorite" : "tabMenu.saveFavorite"))
                .accessibilityValue(favorited ? "on" : "off")
                .accessibilityIdentifier("pill.favorite")
                .frame(width: 44, height: 48)
            }
            sendMenu

            Button {
                if manager.activeTab?.isLoading == true {
                    manager.activeTab?.stop()
                } else {
                    manager.activeTab?.reload()
                }
            } label: {
                Image(systemName: manager.activeTab?.isLoading == true ? "xmark" : "arrow.clockwise")
                    .frame(width: 44, height: 48)
            }
            .accessibilityLabel(manager.activeTab?.isLoading == true ? "Stop loading" : "Reload page")

            Rectangle().fill(style.border).frame(width: 1, height: 18)
            Button { manager.createTab() } label: {
                Image(systemName: "plus").frame(width: 44, height: 48)
            }
            .accessibilityLabel("New tab")
        }
        .font(.system(size: 15, weight: .medium))
        .buttonStyle(.plain)
        .foregroundStyle(style.text)
        .background(style.raised, in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17).strokeBorder(style.border.opacity(0.7), lineWidth: 0.5))
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.25 : 0.10), radius: 10, y: 4)
        .frame(maxWidth: 600)
    }

    /// Blanc Blocker, as on desktop's pill: the cut shield, faded when the
    /// person has allowed ads here or switched blocking off, opening site
    /// protection. WebKit's content blocker reports nothing it blocks, so the
    /// phone has no count badge.
    @ViewBuilder
    private var blockerButton: some View {
        if let tab = manager.activeTab, AdblockExceptions.host(for: tab.currentURL) != nil {
            let protected = manager.isSiteProtected(tab)
            Button { showSiteProtection = true } label: {
                BlockerShield()
                    .stroke(style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                    .frame(width: 16, height: 16)
                    .foregroundStyle(protected ? style.text : style.secondary)
                    .opacity(protected ? 1 : 0.45)
                    .frame(width: 44, height: 48)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Site protection")
            .accessibilityValue(protected ? "on" : "off")
            .accessibilityIdentifier("pill.shield")
            .popover(isPresented: $showSiteProtection) {
                SiteProtectionView(manager: manager, tab: tab, style: style)
                    .presentationCompactAdaptation(.popover)
            }
        }
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
            .accessibilityIdentifier("pill.send")
            .frame(width: 44, height: 48)
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
            try? await Task.sleep(for: .seconds(5))
            if sendBanner == message { withAnimation { sendBanner = nil } }
        }
    }

    private var displayDomain: String {
        guard let url = manager.activeTab?.currentURL else { return "Start Page" }
        if url.scheme == "blanc" {
            switch url.host {
            case "newtab": return "Start Page"
            case "bookmarks": return "Favorites"
            default: return url.host?.capitalized ?? "Start Page"
            }
        }
        let host = url.host ?? "Start Page"
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

/// Blanc Blocker's mark: desktop's cut shield (`#pillShield` in
/// `src/renderer/index.html`) on the same 16-unit grid, the cut parallel to
/// the Blanc mark's diagonal.
private struct BlockerShield: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = min(rect.width, rect.height) / 16
        let origin = CGPoint(x: rect.midX - 8 * unit, y: rect.midY - 8 * unit)
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: origin.x + x * unit, y: origin.y + y * unit)
        }
        var path = Path()
        path.move(to: point(8, 1.8))
        path.addLine(to: point(13, 3.7))
        path.addLine(to: point(13, 7.5))
        path.addCurve(to: point(8, 14.2), control1: point(13, 10.6), control2: point(10.9, 12.8))
        path.addCurve(to: point(3, 7.5), control1: point(5.1, 12.8), control2: point(3, 10.6))
        path.addLine(to: point(3, 3.7))
        path.closeSubpath()
        path.move(to: point(4.4, 11.47))
        path.addLine(to: point(12.61, 3.55))
        return path
    }
}

/// Site protection, desktop's shield popover for the phone: the site, its
/// Blanc Blocker switch, and a way to Settings when blocking is off everywhere.
private struct SiteProtectionView: View {
    let manager: TabsManager
    let tab: TabModel
    let style: BrowserStyle
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let host = AdblockExceptions.host(for: tab.currentURL) ?? ""
        VStack(spacing: 14) {
            VStack(spacing: 3) {
                Text("Site protection")
                    .font(BrowserStyle.font(17, semibold: true))
                Text(host)
                    .font(BrowserStyle.font(13))
                    .foregroundStyle(style.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            if manager.settingsStore.adblockEnabled {
                Toggle(isOn: Binding(
                    get: { manager.isSiteProtected(tab) },
                    set: { manager.setSiteProtection(tab, on: $0) }
                )) {
                    Text("Ad & tracker blocking").font(BrowserStyle.font(15))
                }
                .accessibilityLabel("Ad & tracker protection for this site")
                .accessibilityIdentifier("shield.toggle")
                Text("Changing site protection reloads this page.")
                    .font(BrowserStyle.font(12))
                    .foregroundStyle(style.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("Ad blocking is off everywhere")
                    .font(BrowserStyle.font(15))
                Button("Blocking settings") {
                    dismiss()
                    if let url = URL(string: "blanc://settings/") { manager.createTab(url: url) }
                }
                .font(BrowserStyle.font(15, semibold: true))
            }
        }
        .padding(18)
        .frame(width: 280)
        .foregroundStyle(style.text)
    }
}

#Preview { ContentView(manager: TabsManager()) }
