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

    /// Every page runs to every edge, as in Safari: under the status bar and
    /// the notch or Dynamic Island, the side strips (the iPhone Duo's camera
    /// and clock strip, an iPhone's notch in landscape), the home indicator and
    /// the floating Island. WebKit keeps the content clear of them and paints
    /// the page out to the edge, and iOS draws its own status bar over it.
    /// A split's panes sit inside the safe area instead, as cards clear of
    /// the Island.
    private var pageEdges: Edge.Set { shownSplit != nil ? [] : .all }

    private var islandAtTop: Bool { manager.settingsStore.islandPosition == .top }
    /// The screen edge the Island sits along, and slides past when it tucks.
    private var islandEdge: VerticalEdge { islandAtTop ? .top : .bottom }

    /// The Island's own band (the Island and its padding, without the banners
    /// over it), which websites leave room for at their end.
    @State private var islandBand: CGFloat = 0
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled

    /// Out of the way while the page scrolls down, unless the person keeps it
    /// on screen in Settings. Never while something rises from it or sits over
    /// it, and never for VoiceOver, which reads the screen in order and would
    /// lose it.
    private var isIslandTucked: Bool {
        // Never beside a split or a Glance, which leave the Island's band free.
        guard manager.settingsStore.islandTucksOnScroll, manager.activeTab?.islandTucked == true,
              !voiceOverEnabled, shownSplit == nil, manager.glanceTab == nil else { return false }
        return !manager.isSpacesMenuPresented && !isPalettePanelOpen && manager.sendNotice == nil
            && manager.lastClosed == nil && manager.lastDeletedSpaceId == nil
    }

    private var isStartPage: Bool {
        manager.activeTab?.currentURL.scheme == "blanc" && manager.activeTab?.currentURL.host == "newtab"
    }

    /// Split View (F53): the current tab's split, when its panes show side
    /// by side here. Otherwise the focused pane fills the screen.
    private var shownSplit: TabSplit? {
        guard layout.showsSplitView, let split = manager.activeSplit,
              split.tabIds.allSatisfy({ id in manager.tabs.contains { $0.id == id } }) else { return nil }
        return split
    }

    /// The pages on screen: the split's panes, or the current tab alone.
    private var visibleTabs: [TabModel] {
        if let split = shownSplit { return split.tabIds.compactMap { id in manager.tabs.first { $0.id == id } } }
        return manager.activeTab.map { [$0] } ?? []
    }

    /// The divider's share while it's dragged, before it's saved.
    @State private var draggedRatio: Double?
    private static let splitInset: CGFloat = 8
    private static let splitGap: CGFloat = 8
    private static let paneRadius: CGFloat = 12

    /// The page, the Island and what floats over them; `body` adds the
    /// sheets. Split in two so Xcode 26 can type-check each half.
    private var browser: some View {
        ZStack {
            style.background.ignoresSafeArea()
            // One layout for one page or a split's panes: the current tab's
            // view keeps its identity when a split opens or closes around it,
            // so its web view moves and never reloads.
            SplitPaneLayout(ratio: draggedRatio ?? shownSplit?.ratio ?? 0.5,
                            inset: Self.splitInset, gap: Self.splitGap) {
                ForEach(visibleTabs) { tab in pane(tab) }
            }
            .overlay { if let split = shownSplit { splitDivider(split) } }
            .padding(islandAtTop ? .top : .bottom, shownSplit != nil ? islandBand : 0)
            .ignoresSafeArea(edges: pageEdges)
            .offset(x: swipeOffset)
            if swipeOffset != 0, let tab = manager.activeTab,
               let neighbor = manager.neighbor(of: tab.id, offset: swipeOffset < 0 ? 1 : -1) {
                neighborPage(neighbor)
                    .offset(x: swipeOffset + (swipeOffset < 0 ? pageWidth : -pageWidth))
            }
            // Glance (F34): a tab floating over the current page.
            if layout.showsSplitView, shownSplit == nil, let glance = manager.glanceTab {
                GlanceCard(manager: manager, tab: glance, style: BrowserStyle(scheme: glance.isPrivate ? .dark : colorScheme))
                    .id(glance.id)
                    // Clear of the floating Island, which stays put while it's open.
                    .padding(islandAtTop ? .top : .bottom, islandBand)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
        .overlay(alignment: islandAtTop ? .top : .bottom) {
            // Floats over every page. Tucked, it slides past the screen's edge
            // (or only fades, with Reduce Motion) and takes no touches.
            islandContainer
                .offset(y: isIslandTucked && !reduceMotion ? (islandAtTop ? -(islandHeight + 80) : islandHeight + 40) : 0)
                .opacity(isIslandTucked && reduceMotion ? 0 : 1)
                .allowsHitTesting(!isIslandTucked)
                .animation(.snappy(duration: 0.3), value: isIslandTucked)
        }
        .overlay(alignment: islandAtTop ? .top : .bottom) {
            if manager.isSpacesMenuPresented { spacesMenu }
        }
        .overlay(alignment: islandAtTop ? .top : .bottom) {
            if isPalettePanelOpen { palettePanel }
        }
        .onChange(of: manager.isPalettePresented) { _, presented in
            // The sheet runs this from its onDismiss; the panel has none.
            if !presented, paletteIsPanel { paletteClosed() }
        }
        .onChange(of: layout.palette, initial: true) { _, palette in paletteIsPanel = palette == .panel }
        .onChange(of: layout.showsSplitView, initial: true) { _, wide in manager.showsWideLayout = wide }
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

    /// Notices sit on the page's side of the Island, wherever it is.
    private var islandContainer: some View {
        VStack(spacing: 8) {
            if !islandAtTop { islandNotices }
            islandPill
            if islandAtTop { islandNotices }
        }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { islandHeight = $0 }
            .environment(\.colorScheme, islandScheme)
            .animation(.easeInOut(duration: 0.25), value: islandScheme)
    }

    /// Light or dark for the Island and its notices. A private tab's are always
    /// dark. On glass (iOS 26) they follow the page's own background, so the
    /// Island is dark glass on a dark site, as the system's bars are; before
    /// that, and on a page with no solid background, they follow Blanc's theme.
    private var islandScheme: ColorScheme {
        if isPrivate { return .dark }
        if #available(iOS 26, *), let tab = manager.activeTab, let page = ColorScheme(tab.pageStyle) { return page }
        return colorScheme
    }
    private var islandStyle: BrowserStyle { BrowserStyle(scheme: islandScheme) }

    @ViewBuilder private var islandNotices: some View {
        if let sendNotice = manager.sendNotice {
            Text(sendNotice).font(BrowserStyle.font(13))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .islandSurface(islandStyle, in: Capsule(), shadow: false)
                .accessibilityAddTraits(.updatesFrequently)
                .accessibilityIdentifier("send.banner")
        }
        UndoBanner(manager: manager, style: islandStyle)
    }

    private var islandPill: some View {
        addressPill
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { islandBand = $0 + 20 }
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

    /// The Spaces card over the page, lined up with the Island, which stays
    /// visible and usable beside it.
    private var spacesMenu: some View {
        ZStack(alignment: islandAtTop ? .top : .bottom) {
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
                .padding(islandAtTop ? .top : .bottom, islandHeight - 4)
                .transition(.move(edge: islandAtTop ? .top : .bottom).combined(with: .opacity))
            Button("") { withAnimation(.snappy) { manager.isSpacesMenuPresented = false } }
                .keyboardShortcut(.cancelAction)
                .opacity(0)
                .accessibilityHidden(true)
        }
    }

    /// Duo-1: the palette growing from the Island, at its width, over the
    /// page (not dimmed, as desktop's ⌘L panel). A tap outside or Escape closes it.
    private var palettePanel: some View {
        ZStack(alignment: islandAtTop ? .top : .bottom) {
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
                .padding(.top, islandAtTop ? 10 : 16)
                .padding(.bottom, islandAtTop ? 16 : 10)
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

    // MARK: Split View (F53)

    /// A page: alone it fills the area; in a split it's a rounded card, its
    /// border darker when focused, with a corner tab naming its site.
    private func pane(_ tab: TabModel) -> some View {
        let split = shownSplit
        let focused = tab.id == manager.activeTabId
        let radius = split == nil ? 0 : Self.paneRadius
        return ZStack {
            WebView(tab: tab, onTouchDown: split != nil && !focused ? { manager.setActive(tab.id) } : nil,
                    cornerRadius: radius, islandInset: split == nil ? islandBand : 0, islandEdge: islandEdge)
                .overlay {
                    // Until its first page commits, a web view is WebKit's
                    // blank white: keep the theme's background instead.
                    if !tab.hasCommitted { style.background.allowsHitTesting(false) }
                }
                .opacity(tab.reader == nil ? 1 : 0)
                .allowsHitTesting(tab.reader == nil)
                .accessibilityHidden(tab.reader != nil)
            if let reader = tab.reader {
                ReaderWebView(reader: reader, islandInset: split == nil ? islandBand : 0, islandEdge: islandEdge)
                    .id(ObjectIdentifier(reader))
            }
        }
        .overlay {
            if split != nil {
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(focused ? style.text.opacity(0.55) : style.border, lineWidth: 1)
                    .allowsHitTesting(false)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if let split { cornerTab(tab, split: split, focused: focused) }
        }
        .task(id: split?.id) { if split != nil { manager.wakePane(tab) } }
    }

    /// The pane's corner tab, as desktop's: the site and a × that closes the
    /// pane's tab, or the × alone on the focused pane, whose site the Island shows.
    private func cornerTab(_ tab: TabModel, split: TabSplit, focused: Bool) -> some View {
        let site = TabTitle.display(tab)
        return HStack(spacing: 6) {
            if !focused {
                Text(site).font(BrowserStyle.font(12)).lineLimit(1).frame(maxWidth: 160, alignment: .leading)
            }
            Button { withAnimation(.snappy) { manager.closeTab(tab.id) } } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .semibold))
                    .frame(width: 28, height: 28).contentShape(Rectangle())
            }
            .accessibilityLabel(SyncCopy.text("ios.tabs.close", ["title": site]))
        }
        .buttonStyle(.plain)
        .foregroundStyle(style.text)
        .padding(.leading, focused ? 0 : 10)
        .background(style.raised, in: Capsule())
        .overlay(Capsule().strokeBorder(style.border, lineWidth: 0.5))
        .contentShape(Capsule())
        .onTapGesture { manager.setActive(tab.id) }
        .contextMenu { SplitMenu(manager: manager, tab: tab, offersSplit: true) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(SyncCopy.text("split.cornerLabel", ["site": site]))
        .accessibilityIdentifier("split.corner")
        .padding(8)
    }

    /// The divider between the panes: drag to resize, double-tap for equal
    /// halves. VoiceOver adjusts it in tenths.
    private func splitDivider(_ split: TabSplit) -> some View {
        GeometryReader { geo in
            let width = geo.size.width - 2 * Self.splitInset
            let ratio = draggedRatio ?? split.ratio
            let leading = SplitModel.paneWidths(ratio, width: width, gap: Self.splitGap).leading
            Capsule()
                .fill(style.secondary.opacity(draggedRatio == nil ? 0.5 : 0.9))
                .frame(width: 4, height: 40)
                .frame(width: 24, height: min(geo.size.height, 160))
                .contentShape(Rectangle())
                .position(x: Self.splitInset + leading + Self.splitGap / 2, y: geo.size.height / 2)
                .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .global)
                    .onChanged { value in
                        let x = value.location.x - geo.frame(in: .global).minX
                        draggedRatio = SplitModel.clampRatio(
                            Double((x - Self.splitInset - Self.splitGap / 2) / max(width - Self.splitGap, 1)))
                    }
                    .onEnded { _ in
                        if let draggedRatio { manager.setSplitRatio(split.id, draggedRatio) }
                        draggedRatio = nil
                    })
                .onTapGesture(count: 2) { withAnimation(.snappy) { manager.setSplitRatio(split.id, 0.5) } }
                .accessibilityElement()
                .accessibilityLabel(SyncCopy.text("split.dividerLabel"))
                .accessibilityValue(Text(ratio, format: .percent.precision(.fractionLength(0))))
                .accessibilityAdjustableAction { direction in
                    let step = direction == .increment ? 0.1 : direction == .decrement ? -0.1 : 0
                    manager.setSplitRatio(split.id, split.ratio + step)
                }
                .accessibilityIdentifier("split.divider")
        }
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
        // Side by side, the Island's sideways swipe would slide two pages at
        // once; the tab grid and palette switch tabs instead.
        guard !isCommitting, shownSplit == nil else { return }
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
            // A swipe from the Island into the page (up from the bottom, down
            // from the top) opens the tab grid.
            let intoPage = islandAtTop ? value.translation.height : -value.translation.height
            if intoPage > 40 && abs(value.translation.height) > abs(value.translation.width) {
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
            SpaceMarkButton(manager: manager, style: islandStyle)
            islandMark
            Rectangle().fill(islandDivider).frame(width: 1, height: 18)
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
                        .overlay(Capsule().stroke(islandStyle.text.opacity(0.4)))
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
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(islandStyle.text, lineWidth: 1.6))
                    .frame(width: 44, height: 48)
            }
            .accessibilityLabel(SyncCopy.text("ios.island.showAllTabs"))
            .accessibilityValue(SyncCopy.plural("tabsMenu.header", count: manager.tabs.count))
            .accessibilityIdentifier("pill.tabs")

            Rectangle().fill(islandDivider).frame(width: 1, height: 18)
            Button { manager.createTab() } label: {
                Image(systemName: "plus").frame(width: 44, height: 48)
            }
            .accessibilityLabel(SyncCopy.text("tab.new"))
        }
        .font(.system(size: 15, weight: .medium))
        .buttonStyle(.plain)
        .foregroundStyle(islandStyle.text)
        .islandSurface(islandStyle, in: RoundedRectangle(cornerRadius: 17))
        .frame(maxWidth: 600)
    }

    /// The Island's dividers, in its own ink, faded: on glass they follow the
    /// text over any page; on the solid surface they match the old hairline.
    private var islandDivider: Color { islandStyle.text.opacity(0.13) }

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
        IslandMarkButton(image: Self.sunriseMark, tint: islandStyle.text, menu: islandMenuElements)
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
            case .glance:
                return UIMenu(title: SyncCopy.text("tabMenu.glance"), image: UIImage(systemName: "rectangle.on.rectangle"),
                              children: manager.glanceCandidates.map { other in
                                  UIAction(title: TabTitle.display(other)) { _ in manager.showInGlance(other.id) }
                              })
            case .closeGlance:
                return action("menu.closeGlance", "xmark.rectangle") { manager.closeGlance() }
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

/// Split View (F53): one subview fills the area; two sit side by side,
/// inset, with a gap between them that the divider sits in.
struct SplitPaneLayout: Layout {
    var ratio: Double
    var inset: CGFloat
    var gap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else {
            for subview in subviews { subview.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size)) }
            return
        }
        let inner = bounds.insetBy(dx: inset, dy: inset)
        let widths = SplitModel.paneWidths(ratio, width: inner.width, gap: gap)
        subviews[0].place(at: inner.origin, proposal: ProposedViewSize(width: widths.leading, height: inner.height))
        subviews[1].place(at: CGPoint(x: inner.minX + widths.leading + gap, y: inner.minY),
                          proposal: ProposedViewSize(width: widths.trailing, height: inner.height))
    }
}
