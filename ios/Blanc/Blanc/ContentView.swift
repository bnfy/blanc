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
    /// M11: how far the page has followed a sideways swipe on the Island.
    @State private var swipeOffset: CGFloat = 0
    @State private var isSwiping = false
    @State private var pageWidth: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                    .offset(x: swipeOffset)
                if swipeOffset != 0, let neighbor = manager.neighbor(of: tab.id, offset: swipeOffset < 0 ? 1 : -1) {
                    neighborPage(neighbor)
                        .offset(x: swipeOffset + (swipeOffset < 0 ? pageWidth : -pageWidth))
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
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
                .simultaneousGesture(DragGesture(minimumDistance: 12)
                    .onChanged(swipeChanged)
                    .onEnded(swipeEnded))
                .accessibilityAction(named: "Show all tabs") { openTabGrid() }
                .accessibilityAction(named: SyncCopy.text("menu.nextTab")) { switchTab(by: 1) }
                .accessibilityAction(named: SyncCopy.text("menu.previousTab")) { switchTab(by: -1) }
        }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
    }

    /// The neighbor's last picture beside the page while it follows the finger,
    /// or its site's name on a plain card when it has none yet.
    private func neighborPage(_ tab: TabModel) -> some View {
        ZStack(alignment: .top) {
            BrowserStyle(scheme: tab.isPrivate ? .dark : colorScheme).background
            if let picture = tab.thumbnail {
                Image(uiImage: picture).resizable().aspectRatio(contentMode: .fit)
            } else {
                Text(tab.currentURL.host() ?? tab.pageTitle)
                    .font(BrowserStyle.font(17))
                    .frame(maxHeight: .infinity)
            }
        }
        .ignoresSafeArea(edges: isStartPage ? .all : [])
        .allowsHitTesting(false)
    }

    private func swipeChanged(_ value: DragGesture.Value) {
        if !isSwiping {
            guard IslandSwipe.isSideways(value.translation) else { return }
            isSwiping = true
        }
        guard !reduceMotion else { return }
        let id = manager.activeTabId
        swipeOffset = IslandSwipe.displayed(value.translation.width,
                                            hasPrevious: manager.neighbor(of: id, offset: -1) != nil,
                                            hasNext: manager.neighbor(of: id, offset: 1) != nil)
    }

    private func swipeEnded(_ value: DragGesture.Value) {
        guard isSwiping else {
            // The Island's upward swipe opens the tab grid.
            if value.translation.height < -40 && abs(value.translation.height) > abs(value.translation.width) {
                openTabGrid()
            }
            return
        }
        isSwiping = false
        let id = manager.activeTabId
        let outcome = IslandSwipe.outcome(dx: value.translation.width,
                                          predictedDx: value.predictedEndTranslation.width,
                                          width: max(pageWidth, 1),
                                          hasPrevious: manager.neighbor(of: id, offset: -1) != nil,
                                          hasNext: manager.neighbor(of: id, offset: 1) != nil)
        switch outcome {
        case .stay: withAnimation(Self.swipeSpring) { swipeOffset = 0 }
        case .next: switchTab(by: 1)
        case .previous: switchTab(by: -1)
        }
    }

    private static let swipeSpring = Animation.spring(response: 0.35, dampingFraction: 0.85)

    /// Goes to the next (1) or previous (-1) tab: the page slides the rest of
    /// the way, or cross-fades with Reduce Motion.
    private func switchTab(by offset: Int) {
        guard let target = manager.neighbor(of: manager.activeTabId, offset: offset) else {
            withAnimation(Self.swipeSpring) { swipeOffset = 0 }
            return
        }
        UISelectionFeedbackGenerator().selectionChanged()
        if reduceMotion {
            withAnimation(.easeInOut(duration: 0.2)) { manager.setActive(target.id) }
            return
        }
        withAnimation(Self.swipeSpring) {
            swipeOffset = offset > 0 ? -pageWidth : pageWidth
        } completion: {
            var settle = Transaction()
            settle.disablesAnimations = true
            withTransaction(settle) {
                manager.setActive(target.id)
                swipeOffset = 0
            }
        }
    }

    private func openTabGrid() {
        manager.activeTab?.captureThumbnail()
        showTabGrid = true
    }

    private var addressPill: some View {
        HStack(spacing: 0) {
            islandMark
            Rectangle().fill(style.border).frame(width: 1, height: 18)

            // A tap rather than a Button: a Button also fires when a sideways
            // swipe on the Island lifts inside it, a tap fails once the finger moves.
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
            .onTapGesture { manager.isPalettePresented = true }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { manager.isPalettePresented = true }
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
        IslandMarkButton(image: Self.sunriseMark, tint: style.text, menu: islandMenuElements)
            .frame(width: 48, height: 48)
    }

    /// The Sunrise menu's entries for the current page (`IslandMenu`).
    private func islandMenuElements() -> [UIMenuElement] {
        let tab = manager.activeTab
        func action(_ key: String, _ symbol: String, state: UIMenuElement.State = .off, _ run: @escaping () -> Void) -> UIAction {
            UIAction(title: SyncCopy.text(key), image: UIImage(systemName: symbol), state: state) { _ in run() }
        }
        return IslandMenu.items(for: tab, manager: manager).compactMap { item -> UIMenuElement? in
            switch item {
            case .customizeStartPage:
                return action("newtab.customize.button", "slider.horizontal.3") { manager.showSettings(.startPage) }
            case .blocking(let on):
                guard let tab else { return nil }
                return action("shield.adBlocking", "shield", state: on ? .on : .off) { manager.setSiteProtection(tab, on: !on) }
            case .blockingSettings:
                return action("shield.settings", "shield.slash") { manager.showSettings(.privacy) }
            case .favorite(let saved):
                guard let tab else { return nil }
                return action(saved ? "tabMenu.removeFavorite" : "tabMenu.saveFavorite", saved ? "heart.fill" : "heart") {
                    manager.toggleFavorite(tab)
                }
            case .send:
                guard let tab else { return nil }
                return UIMenu(title: SyncCopy.text("tabMenu.sendToDevice"), image: UIImage(systemName: "paperplane"),
                              children: manager.syncEngine.sendTargets.map { target in
                                  UIAction(title: target.name) { _ in send(tab: tab, to: target) }
                              })
            case .share:
                guard let tab else { return nil }
                return action("share.picker.share", "square.and.arrow.up") { share(tab.currentURL) }
            case .find:
                guard let tab else { return nil }
                return action("menu.findInPage", "magnifyingglass") {
                    tab.webView.findInteraction?.presentFindNavigator(showingReplace: false)
                }
            case .newPrivateTab:
                return UIMenu(options: .displayInline, children: [
                    action("menu.newPrivateTab", "eye.slash") { manager.createTab(isPrivate: true) },
                ])
            }
        }
    }

    private func share(_ url: URL) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }),
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return }
        while let presented = presenter.presentedViewController { presenter = presented }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = presenter.view
        presenter.present(sheet, animated: true)
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
