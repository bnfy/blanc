import SwiftUI
import WebKit

struct ContentView: View {
    let manager: TabsManager
    @State private var sendBanner: String?
    @Environment(\.colorScheme) private var colorScheme
    private var isPrivate: Bool { manager.activeTab?.isPrivate ?? false }
    /// A private tab uses the private (dark) look whatever the appearance setting.
    private var style: BrowserStyle { BrowserStyle(scheme: isPrivate ? .dark : colorScheme) }
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
        .sheet(item: Binding(get: { manager.settingsDestination }, set: { manager.settingsDestination = $0 })) { destination in
            SettingsSheet(manager: manager, destination: destination)
        }
        .sheet(isPresented: Binding(get: { manager.isPalettePresented }, set: { manager.isPalettePresented = $0 }), onDismiss: {
            manager.presentPendingSettings()
        }) {
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
            if manager.lastClosed != nil {
                // M11: a closed tab can come back for five seconds.
                HStack(spacing: 14) {
                    Text(SyncCopy.text("tabs.closedToast")).font(BrowserStyle.font(13))
                    Button(SyncCopy.text("menu.undo")) { withAnimation { manager.undoClose() } }
                        .font(BrowserStyle.font(13, semibold: true))
                        .frame(minHeight: 32)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("banner.undo")
                }
                .padding(.horizontal, 16).padding(.vertical, 4)
                .background(style.raised, in: Capsule())
                .overlay(Capsule().strokeBorder(style.border, lineWidth: 0.5))
                .transition(.opacity)
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
        showTabGrid = true
    }

    private var addressPill: some View {
        HStack(spacing: 0) {
            islandMark
            Rectangle().fill(style.border).frame(width: 1, height: 18)

            Button { manager.isPalettePresented = true } label: {
                HStack(spacing: 10) {
                    Text(displayDomain)
                        .font(BrowserStyle.font(15))
                        .tracking(0.15)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 12)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("Search or switch tabs, \(displayDomain)")
            .accessibilityIdentifier("pill.palette")

            if let tab = manager.activeTab, tab.isPrivate {
                // Leaving private mode closes the private tab, as on desktop.
                Button { manager.closeTab(tab.id) } label: {
                    Text(SyncCopy.text("pill.private.chip"))
                        .font(BrowserStyle.font(12, semibold: true))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .overlay(Capsule().stroke(style.text.opacity(0.4)))
                        .frame(minHeight: 48)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(SyncCopy.text("pill.private.title"))
                .accessibilityIdentifier("pill.private")
            }


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
        .shadow(color: .black.opacity(style.scheme == .dark ? 0.25 : 0.10), radius: 10, y: 4)
        .frame(maxWidth: 600)
        .environment(\.colorScheme, isPrivate ? .dark : colorScheme)
    }

    /// The Sunrise mark: the page's actions, so the Island keeps only the
    /// site, reload and New tab. Drawn in the theme's ink through the shipped
    /// mark's alpha, as the interface always draws it.
    private var islandMark: some View {
        let tab = manager.activeTab
        return Menu {
            ForEach(Array(IslandMenu.items(for: tab, manager: manager).enumerated()), id: \.offset) { _, item in
                if let tab { menuEntry(item, tab: tab) } else if item == .newPrivateTab { menuEntry(item, tab: nil) }
            }
        } label: {
            Group {
                if let mark = Self.sunriseMark {
                    Image(uiImage: mark).renderingMode(.template).resizable().scaledToFit()
                } else {
                    Image(systemName: "sun.horizon")
                }
            }
            .frame(width: 22, height: 22)
            .frame(width: 48, height: 48)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Page actions")
        .accessibilityIdentifier("island.menu")
    }

    @ViewBuilder
    private func menuEntry(_ item: IslandMenuItem, tab: TabModel?) -> some View {
        switch item {
        case .customizeStartPage:
            Button { manager.showSettings(.startPage) } label: {
                Label(SyncCopy.text("newtab.customize.button"), systemImage: "slider.horizontal.3")
            }
        case .blocking(let on):
            if let tab {
                Toggle(isOn: Binding(get: { on }, set: { manager.setSiteProtection(tab, on: $0) })) {
                    Label(SyncCopy.text("shield.adBlocking"), systemImage: "shield")
                }
            }
        case .blockingSettings:
            Button { manager.showSettings(.privacy) } label: {
                Label(SyncCopy.text("shield.settings"), systemImage: "shield.slash")
            }
        case .favorite(let saved):
            if let tab {
                Button { manager.toggleFavorite(tab) } label: {
                    Label(SyncCopy.text(saved ? "tabMenu.removeFavorite" : "tabMenu.saveFavorite"),
                          systemImage: saved ? "heart.fill" : "heart")
                }
            }
        case .send:
            if let tab {
                Menu {
                    ForEach(manager.syncEngine.sendTargets) { target in
                        Button(target.name) { send(tab: tab, to: target) }
                    }
                } label: {
                    Label(SyncCopy.text("tabMenu.sendToDevice"), systemImage: "paperplane")
                }
            }
        case .share:
            if let tab {
                ShareLink(item: tab.currentURL) {
                    Label(SyncCopy.text("share.picker.share"), systemImage: "square.and.arrow.up")
                }
            }
        case .find:
            if let tab {
                Button { tab.webView.findInteraction?.presentFindNavigator(showingReplace: false) } label: {
                    Label(SyncCopy.text("menu.findInPage"), systemImage: "magnifyingglass")
                }
            }
        case .newPrivateTab:
            Divider()
            Button { manager.createTab(isPrivate: true) } label: {
                Label(SyncCopy.text("menu.newPrivateTab"), systemImage: "eye.slash")
            }
        }
    }

    private static let sunriseMark: UIImage? = Bundle.main
        .path(forResource: "sunrise-mark", ofType: "png", inDirectory: "pages")
        .flatMap(UIImage.init(contentsOfFile:))

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

#Preview { ContentView(manager: TabsManager()) }
