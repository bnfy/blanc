import SwiftUI
import WebKit

struct ContentView: View {
    let manager: TabsManager
    /// A pairing QR scanned with the Camera app (design 2026-10-28 §7.3).
    var pairLink: Binding<PairLinkRequest?> = .constant(nil)
    @State private var askingPair: PairLinkRequest?
    @Environment(\.colorScheme) private var colorScheme
    private var isPrivate: Bool { manager.activeTab?.isPrivate ?? false }
    /// A private tab uses the private (dark) look whatever the appearance setting.
    private var style: BrowserStyle { BrowserStyle(scheme: isPrivate ? .dark : colorScheme) }
    @State private var showTabGrid = false
    /// M11: how far the page has followed a sideways swipe on the Island.
    @State private var swipeOffset: CGFloat = 0
    @State private var isSwiping = false
    /// True while a switch's slide finishes; a new swipe waits for it.
    @State private var isCommitting = false
    /// Resets on its own when the drag ends or is cancelled.
    @GestureState private var isDragging = false
    @State private var pageWidth: CGFloat = 0
    /// The Island's height with its padding, so the Spaces card rises from it.
    @State private var islandHeight: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    /// Duo-1: the unfolded layout on the Duo's inner display.
    private var layout: IslandLayout { IslandLayout(horizontalSizeClass, verticalSizeClass) }
    private var isPalettePanelOpen: Bool { manager.isPalettePresented && layout.palette == .panel }
    /// The palette's current placement, kept as state because the sheet's
    /// binding closure outlives the body that made it: read through `layout`
    /// there, an unfold would still look like a sheet and close the palette.
    @State private var paletteIsPanel = false

    /// The page runs under the side strips (the iPhone Duo's camera and clock
    /// strip, an iPhone's notch in landscape), as in Safari: WebKit keeps the
    /// content clear of them and paints the page's background out to the edge.
    /// The Start Page also runs under the top and bottom.
    private var pageEdges: Edge.Set { isStartPage ? .all : .horizontal }

    private var isStartPage: Bool {
        manager.activeTab?.currentURL.scheme == "blanc" && manager.activeTab?.currentURL.host == "newtab"
    }

    /// The page, the Island and what floats over them; `body` adds the
    /// sheets. Split in two so Xcode 26 can type-check each half.
    private var browser: some View {
        ZStack {
            style.background.ignoresSafeArea()
            if let tab = manager.activeTab {
                WebView(tab: tab)
                    .id(tab.id)
                    .overlay {
                        // Until its first page commits, a web view is WebKit's
                        // blank white: keep the theme's background instead.
                        if !tab.hasCommitted { style.background.allowsHitTesting(false) }
                    }
                    .opacity(tab.reader == nil ? 1 : 0)
                    .allowsHitTesting(tab.reader == nil)
                    .accessibilityHidden(tab.reader != nil)
                    .ignoresSafeArea(edges: pageEdges)
                    .offset(x: swipeOffset)
                if swipeOffset != 0, let neighbor = manager.neighbor(of: tab.id, offset: swipeOffset < 0 ? 1 : -1) {
                    neighborPage(neighbor)
                        .offset(x: swipeOffset + (swipeOffset < 0 ? pageWidth : -pageWidth))
                }
                if let reader = tab.reader {
                    ReaderWebView(reader: reader).id(ObjectIdentifier(reader))
                        .ignoresSafeArea(edges: pageEdges)
                        .offset(x: swipeOffset)
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
        .overlay(alignment: .bottom) {
            if manager.isSpacesMenuPresented { spacesMenu }
        }
        .overlay(alignment: .bottom) {
            if isPalettePanelOpen { palettePanel }
        }
        .onChange(of: manager.isPalettePresented) { _, presented in
            // The sheet runs this from its onDismiss; the panel has none.
            if !presented, paletteIsPanel { paletteClosed() }
        }
        .onChange(of: layout.palette, initial: true) { _, palette in paletteIsPanel = palette == .panel }
    }

    var body: some View {
        browser
        .sheet(item: Binding(get: { manager.spaceEditor }, set: { manager.spaceEditor = $0 })) { target in
            SpaceEditor(manager: manager, target: target)
        }
        .sheet(item: Binding(get: { manager.bringSpaceTarget }, set: { manager.bringSpaceTarget = $0 }),
               onDismiss: { manager.presentPendingSettings() }) { remote in
            BringSpaceSheet(manager: manager, remote: remote)
        }
        .alert(ReaderCopy.text("reader.title"), isPresented: Binding(get: { manager.readerError }, set: { manager.readerError = $0 })) {
            Button(SyncCopy.text("dialog.ok"), role: .cancel) {}
        } message: { Text(ReaderCopy.text("reader.unavailable")) }
        .fullScreenCover(isPresented: $showTabGrid) {
            TabGridView(manager: manager)
        }
        .onChange(of: manager.incomingLinkCount) { showTabGrid = false }
        // Like an ordinary incoming link, the pair question closes whatever is
        // open first; it's asked once that has gone, so the code is never lost.
        .onChange(of: pairLink.wrappedValue?.id, initial: true) {
            guard let request = pairLink.wrappedValue else { return }
            pairLink.wrappedValue = nil
            let covered = showTabGrid || manager.isPalettePresented || manager.isWallpaperPickerPresented
                || manager.settingsDestination != nil || manager.spaceEditor != nil
            showTabGrid = false
            manager.isPalettePresented = false
            manager.isWallpaperPickerPresented = false
            manager.settingsDestination = nil
            manager.spaceEditor = nil
            Task {
                if covered { try? await Task.sleep(for: .milliseconds(600)) }
                askingPair = request
            }
        }
        .sheet(item: pairQuestionOutsideWalkthrough) { request in
            PairLinkConfirmView(engine: manager.syncEngine, code: request.code)
        }
        .sheet(isPresented: walkthroughPresented) {
            WalkthroughSheet(manager: manager, pairLink: $askingPair)
        }
        .sheet(item: Binding(get: { manager.settingsDestination }, set: { manager.settingsDestination = $0 })) { destination in
            SettingsSheet(manager: manager, destination: destination)
        }
        .sheet(isPresented: paletteSheetPresented,
               onDismiss: { if !manager.isPalettePresented { paletteClosed() } }) {
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

    /// The first-minute card (M18 §3). Swiping it away is closing it.
    private var walkthroughPresented: Binding<Bool> {
        Binding(get: { manager.walkthrough.current != nil },
                set: { presented in
                    if !presented, manager.walkthrough.current != nil {
                        manager.closeWalkthrough(usagePingShown: manager.settingsStore.usagePingShown)
                    }
                })
    }
    /// While the card is up, a pairing link's question rises from the card.
    private var pairQuestionOutsideWalkthrough: Binding<PairLinkRequest?> {
        Binding(get: { manager.walkthrough.current == nil ? askingPair : nil }, set: { askingPair = $0 })
    }

    /// The palette as a sheet. Unfolded, the palette is the panel instead;
    /// unfolding with the sheet open hands it over, text and all, without
    /// closing it. (Its own property: inline, Xcode 26 can't type-check `body`.)
    private var paletteSheetPresented: Binding<Bool> {
        Binding(get: { manager.isPalettePresented && layout.palette == .sheet },
                set: { presented in
                    // Unfolding also takes the sheet away; wait until the new
                    // layout has applied to tell that from a swipe down.
                    guard !presented else { return }
                    DispatchQueue.main.async {
                        if !paletteIsPanel { manager.isPalettePresented = false }
                    }
                })
    }

    private var islandContainer: some View {
        VStack(spacing: 8) {
            if let sendNotice = manager.sendNotice {
                Text(sendNotice).font(BrowserStyle.font(13))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(style.raised, in: Capsule())
                    .accessibilityAddTraits(.updatesFrequently)
                    .accessibilityIdentifier("send.banner")
            }
            UndoBanner(manager: manager, style: style)
            addressPill
                // The panel takes the Island's place; hidden, not removed, so
                // the page's inset never changes under it.
                .opacity(isPalettePanelOpen ? 0 : 1)
                .allowsHitTesting(!isPalettePanelOpen)
                .accessibilityHidden(isPalettePanelOpen)
                .simultaneousGesture(DragGesture(minimumDistance: 12)
                    .updating($isDragging) { _, dragging, _ in dragging = true }
                    .onChanged(swipeChanged)
                    .onEnded(swipeEnded))
                .onChange(of: isDragging) { _, dragging in
                    // A cancelled drag (a call, Control Center) gets no onEnded.
                    guard !dragging, isSwiping else { return }
                    isSwiping = false
                    if !isCommitting { withAnimation(Self.swipeSpring) { swipeOffset = 0 } }
                }
                .accessibilityAction(named: SyncCopy.text("ios.island.showAllTabs")) { openTabGrid() }
                .accessibilityAction(named: SyncCopy.text("menu.nextTab")) { switchTab(by: 1) }
                .accessibilityAction(named: SyncCopy.text("menu.previousTab")) { switchTab(by: -1) }
        }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { islandHeight = $0 }
    }

    /// The Spaces card over the page, lined up with the Island, which stays
    /// visible and usable below it.
    private var spacesMenu: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.001)
                .ignoresSafeArea()
                .onTapGesture { withAnimation(.snappy) { manager.isSpacesMenuPresented = false } }
                .accessibilityHidden(true)
            SpacesCard(manager: manager, style: style, editorTarget: Binding(
                get: { nil },
                set: { target in
                    manager.isSpacesMenuPresented = false
                    manager.spaceEditor = target
                }))
                .frame(maxWidth: 600)
                .padding(.horizontal, 16)
                .padding(.bottom, islandHeight - 4)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            Button("") { withAnimation(.snappy) { manager.isSpacesMenuPresented = false } }
                .keyboardShortcut(.cancelAction)
                .opacity(0)
                .accessibilityHidden(true)
        }
    }

    /// Duo-1: the palette growing up from the Island, at its width, over the
    /// page (not dimmed, as desktop's ⌘L panel). A tap outside or Escape closes it.
    private var palettePanel: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.001)
                .ignoresSafeArea()
                .onTapGesture { manager.isPalettePresented = false }
                .accessibilityHidden(true)
            PaletteSheet(manager: manager, placement: .panel)
                .frame(maxHeight: 520)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(style.border.opacity(0.7), lineWidth: 0.5))
                .shadow(color: .black.opacity(style.scheme == .dark ? 0.25 : 0.10), radius: 10, y: 4)
                .frame(maxWidth: 600)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("palette.panel")
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 10)
            Button("") { manager.isPalettePresented = false }
                .keyboardShortcut(.cancelAction)
                .opacity(0)
                .accessibilityHidden(true)
        }
    }

    /// What closing the palette leaves to do, sheet or panel: a Settings page,
    /// Space or Spaces menu asked for from it, or Find in page for `/find`.
    private func paletteClosed() {
        manager.presentPendingSettings()
        if manager.takeFindRequest(), let tab = manager.activeTab { presentFind(in: tab) }
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
        .ignoresSafeArea(edges: pageEdges)
        .allowsHitTesting(false)
    }

    private func swipeChanged(_ value: DragGesture.Value) {
        guard !isCommitting else { return }
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
        guard !isCommitting else { return }
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
        guard !isCommitting else { return }
        guard let target = manager.neighbor(of: manager.activeTabId, offset: offset) else {
            withAnimation(Self.swipeSpring) { swipeOffset = 0 }
            return
        }
        UISelectionFeedbackGenerator().selectionChanged()
        if reduceMotion {
            withAnimation(.easeInOut(duration: 0.2)) { manager.setActive(target.id) }
            return
        }
        isCommitting = true
        withAnimation(Self.swipeSpring) {
            swipeOffset = offset > 0 ? -pageWidth : pageWidth
        } completion: {
            isCommitting = false
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
            SpaceMarkButton(manager: manager, style: style)
            islandMark
            Rectangle().fill(style.border).frame(width: 1, height: 18)
            if layout.showsHistoryButtons { historyButtons }

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
            .accessibilityLabel(SyncCopy.text("ios.island.searchOrSwitch", ["domain": displayDomain]))
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
            .accessibilityLabel(SyncCopy.text(manager.activeTab?.isLoading == true ? "ios.island.stop" : "ios.island.reload"))

            // The tab grid, as other browsers' tab buttons open theirs: the
            // swipe up on the Island still works, but nothing showed it.
            Button { openTabGrid() } label: {
                Text("\(manager.tabs.count)")
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 21, height: 21)
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(style.text, lineWidth: 1.6))
                    .frame(width: 44, height: 48)
            }
            .accessibilityLabel(SyncCopy.text("ios.island.showAllTabs"))
            .accessibilityValue(SyncCopy.plural("tabsMenu.header", count: manager.tabs.count))
            .accessibilityIdentifier("pill.tabs")

            Rectangle().fill(style.border).frame(width: 1, height: 18)
            Button { manager.createTab() } label: {
                Image(systemName: "plus").frame(width: 44, height: 48)
            }
            .accessibilityLabel(SyncCopy.text("tab.new"))
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

    /// Duo-1: Back and Forward on the unfolded Island, dimmed when there is
    /// nowhere to go. The edge swipe still works.
    private var historyButtons: some View {
        let tab = manager.activeTab
        return HStack(spacing: 0) {
            Button { tab?.goBack() } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 48)
            }
            .disabled(tab?.canGoBack != true)
            .accessibilityLabel(SyncCopy.text("pill.back"))
            .accessibilityIdentifier("pill.back")
            Button { tab?.goForward() } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 48)
            }
            .disabled(tab?.canGoForward != true)
            .accessibilityLabel(SyncCopy.text("pill.forward"))
            .accessibilityIdentifier("pill.forward")
        }
        .padding(.leading, 4)
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
                                  UIAction(title: target.name) { _ in manager.send(tab, to: target) }
                              })
            case .share:
                guard let tab else { return nil }
                return action("share.picker.share", "square.and.arrow.up") { share(tab.currentURL) }
            case .find:
                guard let tab else { return nil }
                return action("menu.findInPage", "magnifyingglass") { presentFind(in: tab) }
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

    private func presentFind(in tab: TabModel) {
        (tab.reader?.webView ?? tab.webView).findInteraction?.presentFindNavigator(showingReplace: false)
    }

    private var displayDomain: String {
        let startPage = SyncCopy.text("ios.tabs.startPage")
        guard let url = manager.activeTab?.currentURL else { return startPage }
        if url.scheme == "blanc" {
            switch url.host {
            case "newtab": return startPage
            case "bookmarks": return SyncCopy.text("pagesNav.bookmarks")
            case "history": return SyncCopy.text("pagesNav.history")
            case "settings": return SyncCopy.text("pagesNav.settings")
            default: return url.host?.capitalized ?? startPage
            }
        }
        let host = url.host ?? startPage
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

#Preview { ContentView(manager: TabsManager()) }
