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
    /// Which way the page is going; a finger's moves go straight to the stage.
    @State private var gridPage = TabGridMotion.Page.full
    /// Fades the grid in and out with Reduce Motion, in place of the stage.
    @State private var gridOpacity: Double = 1
    /// True while the stage stands in for the page, so a page playing video
    /// isn't drawn under the grid for nothing.
    @State private var pageHidden = false
    /// Each tab's card in the grid, so the page knows where any tab's sits.
    @State private var cardFrames = TabCardFrames()
    /// Pictures of the pages, which travel to and from the grid in their place.
    @State private var stage = PageStageView()
    /// The Island fades out as the grid opens and back as it closes.
    @State private var islandGoneForGrid = false
    /// Goes up as the grid opens or closes, so a delayed step can tell it's stale.
    @State private var gridPass = 0
    @State private var pageFrame = CGRect.zero
    /// The Island's controls either side of the address, to center it between them.
    @State private var islandLeadingWidth: CGFloat = 0
    @State private var islandTrailingWidth: CGFloat = 0
    /// M11: how far the page has followed a sideways swipe on the Island.
    @State private var swipeOffset: CGFloat = 0
    @State private var isSwiping = false
    /// True while a drag on the Island carries the page toward the tab grid.
    @State private var isLifting = false
    /// True while a switch's slide finishes; a new swipe waits for it.
    @State private var isCommitting = false
    /// Resets on its own when the drag ends or is cancelled.
    @GestureState private var isDragging = false
    @State private var pageWidth: CGFloat = 0
    /// The Island's height with its padding, so the Spaces card rises from it.
    @State private var islandHeight: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    private var reduceMotion: Bool {
        #if DEBUG
        if UITestSeed.reduceMotion { return true }
        #endif
        return systemReduceMotion
    }
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
            // Measured inside `ignoresSafeArea`: outside it, this is the safe area.
            Color.clear
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { pageFrame = $0 }
                .ignoresSafeArea(edges: pageEdges)
            // One layout for one page or a split's panes: the current tab's
            // view keeps its identity when a split opens or closes around it,
            // so its web view moves and never reloads.
            SplitPaneLayout(ratio: draggedRatio ?? shownSplit?.ratio ?? 0.5,
                            inset: Self.splitInset, gap: Self.splitGap) {
                ForEach(visibleTabs, id: \.id) { tab in pane(tab) }
            }
            .overlay { if let split = shownSplit { splitDivider(split).opacity(showTabGrid ? 0 : 1) } }
            .padding(islandAtTop ? .top : .bottom, shownSplit != nil ? islandBand : 0)
            .ignoresSafeArea(edges: pageEdges)
            .offset(x: swipeOffset)
            .opacity(pageHidden ? 0 : 1)
            .accessibilityHidden(showTabGrid)
            // The grid takes the page's touches by covering it. `allowsHitTesting`
            // on the page would put a view around the web view that cuts it off
            // from the safe area, which moves the page and what its picture shows.
            if showTabGrid {
                TabGridView(manager: manager, close: { closeTabGrid() }, onCardFrame: { cardFrames.byTab[$0] = $1 })
                    .opacity(gridOpacity)
            }
            // Pictures of the pages, while they go to and from the grid.
            PageStageHost(stage: stage).ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
            if swipeOffset != 0, let tab = manager.activeTab,
               let neighbor = manager.neighbor(of: tab.id, offset: swipeOffset < 0 ? 1 : -1) {
                neighborPage(neighbor)
                    .offset(x: swipeOffset + (swipeOffset < 0 ? pageWidth : -pageWidth))
            }
            #if DEBUG
            if UITestSeed.pageGeometry { pageGeometryProbe }
            #endif
            // Glance (F34): a tab floating over the current page.
            ZStack {
                if showsGlance, let glance = manager.glanceTab {
                    GlanceCard(manager: manager, tab: glance, style: BrowserStyle(scheme: glance.isPrivate ? .dark : colorScheme))
                        .id(glance.id)
                        // Clear of the floating Island, which stays put while it's open.
                        .padding(islandAtTop ? .top : .bottom, islandBand)
                }
            }
            // It fades as the grid comes and goes, rather than blinking.
            .animation(.easeOut(duration: 0.18), value: showsGlance)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { pageWidth = $0 }
        .overlay(alignment: islandAtTop ? .top : .bottom) {
            // Floats over every page. Tucked, it slides past the screen's edge
            // (or only fades, with Reduce Motion) and takes no touches.
            islandContainer
                .offset(y: isIslandTucked && !reduceMotion ? (islandAtTop ? -(islandHeight + 80) : islandHeight + 40) : 0)
                // Barely there, not gone, while it's being dragged: a view at
                // zero opacity would lose the finger.
                .opacity(isIslandTucked && reduceMotion ? 0 : islandGoneForGrid ? (isLifting ? 0.01 : 0) : 1)
                .allowsHitTesting(!isIslandTucked && islandTakesTouches)
                .accessibilityHidden(showTabGrid)
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
        // A new window's unsaved tabs would close in a switch: ask first, as
        // desktop does.
        .confirmationDialog(SyncCopy.text("ws.decision.title", ["name": manager.setName(manager.pendingSetSwitch ?? "")]),
                            isPresented: Binding(get: { manager.pendingSetSwitch != nil },
                                                 set: { if !$0 { manager.pendingSetSwitch = nil } }),
                            titleVisibility: .visible) {
            Button(SyncCopy.text("ws.decision.closeAndSwitch"), role: .destructive) {
                if let id = manager.pendingSetSwitch { manager.show(set: id, closingUnsaved: true) }
            }
            if UIApplication.shared.supportsMultipleScenes {
                Button(SyncCopy.text("ws.decision.newWindow")) { manager.showPendingSetInNewWindow() }
            }
            Button(SyncCopy.text("common.cancel"), role: .cancel) { manager.pendingSetSwitch = nil }
        } message: {
            Text(SyncCopy.plural("ws.decision.closeUnsaved", count: manager.unsavedTabCount))
        }
        .alert(ReaderCopy.text("reader.title"), isPresented: Binding(get: { manager.readerError }, set: { manager.readerError = $0 })) {
            Button(SyncCopy.text("dialog.ok"), role: .cancel) {}
        } message: { Text(ReaderCopy.text("reader.unavailable")) }
        .onChange(of: manager.incomingLinkCount) { closeTabGrid() }
        .onAppear { manager.onPagePinch = { followPagePinch($0) } }
        // Like an ordinary incoming link, the pair question closes whatever is
        // open first; it's asked once that has gone, so the code is never lost.
        .onChange(of: pairLink.wrappedValue?.id, initial: true) {
            guard let request = pairLink.wrappedValue else { return }
            pairLink.wrappedValue = nil
            let covered = showTabGrid || manager.isPalettePresented || manager.isWallpaperPickerPresented
                || manager.settingsDestination != nil || manager.spaceEditor != nil
            closeTabGrid()
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
                .onChanged { swipeChanged($0.translation) }
                .onEnded { swipeEnded($0.translation, predicted: $0.predictedEndTranslation) })
            // A two-finger swipe on a trackpad switches tabs the same way; it
            // never opens the tab grid, which is a touch gesture.
            .gesture(TrackpadSwipe(
                changed: { if !isLifting { swipeChanged($0, lifts: false) } },
                ended: { if !isLifting { swipeEnded($0, predicted: $1) } },
                cancelled: {
                    guard isSwiping else { return }
                    isSwiping = false
                    if !isCommitting { withAnimation(Self.swipeSpring) { swipeOffset = 0 } }
                }))
            .onChange(of: isDragging) { _, dragging in
                // A cancelled drag (a call, Control Center) gets no onEnded.
                if !dragging, isLifting {
                    isLifting = false
                    followPagePinch(.ended(opens: false))
                }
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
        if manager.takeFindRequest() { manager.presentFind() }
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
                // Unseen, it takes no touches. `allowsHitTesting` here would
                // cut it off from the safe area and move the page.
                .opacity(tab.reader == nil ? 1 : 0)
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
                    .pointerHighlight(cornerRadius: 14)
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
                .pointerHighlight(cornerRadius: 12)
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

    /// A trackpad's swipe never lifts: the tab grid is a touch gesture.
    private func swipeChanged(_ translation: CGSize, lifts: Bool = true) {
        guard !isCommitting else { return }
        if isLifting {
            let lifted = TabGridMotion.lifted(translation, islandAtTop: islandAtTop, height: pageFrame.height)
            followPagePinch(.moved(scale: lifted.scale, translation: lifted.translation))
            return
        }
        if lifts, !isSwiping, islandTakesTouches, TabGridMotion.isLift(translation, islandAtTop: islandAtTop) {
            isLifting = true
            followPagePinch(.started)
            return
        }
        // Side by side, the Island's sideways swipe would slide two pages at
        // once; the tab grid and palette switch tabs instead.
        guard shownSplit == nil else { return }
        if !isSwiping {
            guard IslandSwipe.isSideways(translation) else { return }
            isSwiping = true
        }
        guard !reduceMotion else { return }
        let id = manager.activeTabId
        swipeOffset = IslandSwipe.displayed(translation.width,
                                            hasPrevious: manager.neighbor(of: id, offset: -1) != nil,
                                            hasNext: manager.neighbor(of: id, offset: 1) != nil)
    }

    /// The finger lifted from carrying the page: on to the grid or back.
    private func endLift(_ translation: CGSize, predicted: CGSize) {
        isLifting = false
        let opens = TabGridMotion.liftOpens(travel: TabGridMotion.liftTravel(translation, islandAtTop: islandAtTop),
                                            predicted: TabGridMotion.liftTravel(predicted, islandAtTop: islandAtTop))
        followPagePinch(.ended(opens: opens))
    }

    private func swipeEnded(_ translation: CGSize, predicted: CGSize) {
        guard !isCommitting else { return }
        if isLifting {
            endLift(translation, predicted: predicted)
            return
        }
        guard isSwiping else { return }
        isSwiping = false
        let id = manager.activeTabId
        let outcome = IslandSwipe.outcome(dx: translation.width,
                                          predictedDx: predicted.width,
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

    /// Off while the grid is up, on again as soon as the page is on its way
    /// back, so a quick tap or swipe after a short drag isn't lost.
    private var islandTakesTouches: Bool { !showTabGrid || isLifting || gridPage == .full }

    /// Glance stays through a lift, which may still settle back.
    private var showsGlance: Bool { layout.showsSplitView && shownSplit == nil && (!showTabGrid || isLifting) }

    /// Where the page area's panes sit: the whole of it for one page.
    private var paneFrames: [CGRect] {
        var area = pageFrame
        if shownSplit != nil {
            area.size.height -= islandBand
            if islandAtTop { area.origin.y += islandBand }
        }
        return SplitPaneLayout(ratio: draggedRatio ?? shownSplit?.ratio ?? 0.5, inset: Self.splitInset, gap: Self.splitGap)
            .frames(in: area, count: visibleTabs.count)
    }

    /// Where each page on screen sits at a point of the motion.
    private func stageSpots(_ page: TabGridMotion.Page, cards: [UUID: CGRect] = [:]) -> [UUID: PageStageView.Spot] {
        let panes = paneFrames
        var spots: [UUID: PageStageView.Spot] = [:]
        for (index, tab) in visibleTabs.enumerated() {
            let pane = panes.indices.contains(index) ? panes[index] : pageFrame
            let motion = TabGridMotion.transform(page, pane: pane, in: pageFrame, card: cards[tab.id],
                                                 centered: tab.currentURL.scheme == "blanc")
            spots[tab.id] = PageStageView.Spot(clip: TabGridMotion.clip(page, motion, pane: pane, card: cards[tab.id]),
                                               scale: motion.scale,
                                               radius: max(motion.cornerRadius * motion.scale, shownSplit == nil ? 0 : Self.paneRadius))
        }
        return spots
    }

    /// A tab's last picture on a plain page, for a tab that isn't on the stage.
    private func stagePicture(_ tab: TabModel, size: CGSize) -> UIView {
        let view = UIView(frame: CGRect(origin: .zero, size: size))
        view.backgroundColor = UIColor(BrowserStyle(scheme: tab.isPrivate ? .dark : colorScheme).background)
        if let image = tab.pagePicture ?? tab.thumbnail, image.size.width > 0 {
            let picture = UIImageView(image: image)
            let height = size.width * image.size.height / image.size.width
            let top = TabGridMotion.pictureTop(centered: tab.currentURL.scheme == "blanc", paneHeight: size.height,
                                               pictureHeight: height, capturedTop: tab.pagePictureTop,
                                               pageTop: shownSplit == nil ? stage.window?.safeAreaInsets.top ?? 0 : 0)
            picture.frame = CGRect(x: 0, y: top, width: size.width, height: height)
            view.addSubview(picture)
        }
        return view
    }

    /// Puts each page on screen on the stage, as it stands if `live`.
    private func stagePages(live: Bool) {
        stage.setCover(UIColor(style.surface))
        stage.keepPages(live ? [] : Set(visibleTabs.map(\.id)))
        let panes = paneFrames
        for (index, tab) in visibleTabs.enumerated() {
            let size = (panes.indices.contains(index) ? panes[index] : pageFrame).size
            guard live || !stage.hasPage(tab.id, size: size) else { continue }
            let content = (live ? tab.existingWebView?.snapshotView(afterScreenUpdates: false) : nil)
                ?? stagePicture(tab, size: size)
            stage.addPage(tab.id, content: content, size: size, centered: tab.currentURL.scheme == "blanc")
        }
    }

    /// The cards of the pages on screen, as the grid has them now.
    private var shownCards: [UUID: CGRect] {
        Dictionary(uniqueKeysWithValues: visibleTabs.compactMap { tab in cardFrames.byTab[tab.id].map { (tab.id, $0) } })
    }

    /// Opens the grid over the page, with the page's picture over it at full size.
    private func revealTabGrid() {
        // Kept off the first frame of the motion: a web page's picture comes
        // back later, and the page covers its card until it lands. Blanc's own
        // pages are drawn as they stand, for the native clock.
        for tab in visibleTabs {
            if tab.currentURL.scheme == "blanc" {
                tab.captureThumbnail(afterScreenUpdates: false)
            } else {
                Task { await tab.capturePreparedThumbnail() }
            }
        }
        gridPass += 1
        cardFrames.byTab = [:]
        gridPage = .pinching(scale: 1, translation: .zero)
        if reduceMotion {
            // Barely there, not gone: at zero, the page would take touches
            // and VoiceOver wouldn't find the grid.
            gridOpacity = 0.01
        } else {
            gridOpacity = 1
            stagePages(live: true)
            stage.place(stageSpots(.full), coverAlpha: 1)
            pageHidden = true
        }
        withAnimation(.easeOut(duration: 0.15)) { islandGoneForGrid = true }
        showTabGrid = true
        UIAccessibility.post(notification: .screenChanged, argument: nil)
    }

    /// From the Island's swipe or VoiceOver: the same landing a pinch ends in.
    private func openTabGrid() {
        revealTabGrid()
        settleInTabGrid()
    }

    private func settleInTabGrid(waitingForCards: Bool = true) {
        // A link can close the grid before a delayed landing runs.
        guard showTabGrid else { return }
        // A flick can end before the cards are laid out, and the landing reads
        // them once.
        if waitingForCards, shownCards.count < visibleTabs.count {
            let pass = gridPass
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(40))
                if pass == gridPass { settleInTabGrid(waitingForCards: false) }
            }
            return
        }
        gridPage = .card
        if reduceMotion {
            withAnimation(.easeInOut(duration: 0.2)) { gridOpacity = 1 }
            return
        }
        let pass = gridPass
        stage.animate(to: stageSpots(.card, cards: shownCards), coverAlpha: 0) {
            if pass == gridPass { stage.fadeOut() }
        }
    }

    private func closeTabGrid() {
        guard showTabGrid else { return }
        isLifting = false
        if !reduceMotion {
            // Interrupted on its way down, a page carries on from where it is.
            let landed = stage.isHidden
            stagePages(live: false)
            if landed { stage.place(stageSpots(.card, cards: shownCards), coverAlpha: 0) }
        }
        returnToPage()
    }

    /// The page back to full size, from a card or a pinch that let go.
    private func returnToPage() {
        gridPass += 1
        let pass = gridPass
        gridPage = .full
        withAnimation(.easeOut(duration: 0.2)) { islandGoneForGrid = false }
        if reduceMotion {
            withAnimation(.easeInOut(duration: 0.2)) { gridOpacity = 0 } completion: {
                if pass == gridPass { showTabGrid = false }
            }
            return
        }
        stage.animate(to: stageSpots(.full), coverAlpha: 1) {
            guard pass == gridPass else { return }
            pageHidden = false
            showTabGrid = false
            stage.fadeOut(removing: true)
        }
    }

    #if DEBUG
    /// For UI tests: the page's frame height and the web view's safe top.
    private var pageGeometryProbe: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { _ in
            Color.clear.frame(width: 1, height: 1)
                .accessibilityElement()
                .accessibilityIdentifier("test.pageGeometry")
                .accessibilityValue("\(Int(pageFrame.height)) \(Int(manager.activeTab?.existingWebView?.safeAreaInsets.top ?? -1))")
        }
        .allowsHitTesting(false)
    }
    #endif

    /// A pinch moves the page's picture directly: nothing redraws for a finger.
    private func followPagePinch(_ update: PagePinchUpdate) {
        switch update {
        case .started:
            revealTabGrid()
        case .moved(let scale, let translation):
            guard !reduceMotion else { return }
            let page = TabGridMotion.Page.pinching(scale: scale, translation: translation)
            stage.place(stageSpots(page), coverAlpha: 1 - 0.85 * TabGridMotion.progress(page))
        case .ended(let opens):
            if opens { settleInTabGrid() } else { returnToPage() }
        }
    }

    private var islandButtons: IslandLayout.Buttons {
        layout.buttons(historySetting: manager.settingsStore.islandHistoryButtons,
                       isLoading: manager.activeTab?.isLoading == true)
    }

    private var addressPill: some View {
        let buttons = islandButtons
        let insets = IslandLayout.addressInsets(leading: islandLeadingWidth, trailing: islandTrailingWidth)
        return HStack(spacing: 0) {
            HStack(spacing: 0) {
                SpaceMarkButton(manager: manager, style: islandStyle)
                islandMark
                Rectangle().fill(islandDivider).frame(width: 1, height: 18)
                if buttons.centersAddress {
                    // Stop takes the room here so the address never moves as a page loads.
                    if buttons.reload { reloadButton.padding(.leading, 4) }
                } else if buttons.history {
                    historyButtons.padding(.leading, 4)
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { islandLeadingWidth = $0 }

            // A tap rather than a Button: a Button also fires when a sideways
            // swipe on the Island lifts inside it, a tap fails once the finger moves.
            HStack(spacing: 10) {
                Text(displayDomain)
                    .font(BrowserStyle.font(15))
                    .tracking(0.15)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if !buttons.centersAddress { Spacer(minLength: 0) }
            }
            .padding(.leading, buttons.centersAddress ? 8 + insets.leading : 12)
            .padding(.trailing, buttons.centersAddress ? 8 + insets.trailing : 0)
            .frame(maxWidth: .infinity, minHeight: 48)
            .pointerHighlight()
            .contentShape(Rectangle())
            .onTapGesture { manager.isPalettePresented = true }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { manager.isPalettePresented = true }
            .accessibilityLabel(SyncCopy.text("ios.island.searchOrSwitch", ["domain": displayDomain]))
            .accessibilityValue(SyncCopy.plural("tabsMenu.header", count: manager.tabs.count))
            .accessibilityIdentifier("pill.palette")

            HStack(spacing: 0) {
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
                            .pointerHighlight()
                    }
                    .accessibilityLabel(SyncCopy.text("pill.private.title"))
                    .accessibilityIdentifier("pill.private")
                }


                if buttons.reload && !buttons.centersAddress { reloadButton }

                if buttons.newTab {
                    Rectangle().fill(islandDivider).frame(width: 1, height: 18)
                    Button { manager.createTab() } label: {
                        Image(systemName: "plus").frame(width: 44, height: 48)
                            .pointerHighlight()
                    }
                    .accessibilityLabel(SyncCopy.text("tab.new"))
                }

                if buttons.centersAddress { historyButtons.padding(.trailing, 4) }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { islandTrailingWidth = $0 }
        }
        .font(.system(size: 15, weight: .medium))
        // Not .plain: over Liquid Glass on iOS 26, plain buttons took no taps
        // at all, while the site's tap still
        // worked; borderless ones do, and draw in the row's ink all the same
        // (CI and an iOS 26.5 simulator, 2026-11-03).
        .buttonStyle(.borderless)
        .foregroundStyle(islandStyle.text)
        .islandSurface(islandStyle, in: RoundedRectangle(cornerRadius: 17))
        // A tab dragged from another window's grid or palette moves here.
        .tabDrop(into: manager)
        .frame(maxWidth: 600)
    }

    /// The Island's dividers, in its own ink, faded: on glass they follow the
    /// text over any page; on the solid surface they match the old hairline.
    private var islandDivider: Color { islandStyle.text.opacity(0.13) }

    /// Back and Forward: on the unfolded Island, or on the iPhone's when the
    /// setting is on. Dimmed by hand, since the Island's own ink overrides a
    /// disabled button's. The edge swipe still works.
    private var historyButtons: some View {
        HStack(spacing: 0) {
            backButton
            forwardButton
        }
    }

    /// Reload, or Stop while the page loads.
    private var reloadButton: some View {
        Button {
            if manager.activeTab?.isLoading == true {
                manager.activeTab?.stop()
            } else {
                manager.activeTab?.reload()
            }
        } label: {
            Image(systemName: manager.activeTab?.isLoading == true ? "xmark" : "arrow.clockwise")
                .frame(width: 44, height: 48)
                .pointerHighlight()
        }
        .accessibilityLabel(SyncCopy.text(manager.activeTab?.isLoading == true ? "ios.island.stop" : "ios.island.reload"))
    }

    private var backButton: some View {
        let tab = manager.activeTab
        return Button { tab?.goBack() } label: {
            Image(systemName: "chevron.left").frame(width: 44, height: 48)
                .opacity(tab?.canGoBack == true ? 1 : 0.35)
                .pointerHighlight()
        }
        .disabled(tab?.canGoBack != true)
        .accessibilityLabel(SyncCopy.text("pill.back"))
        .accessibilityIdentifier("pill.back")
    }

    private var forwardButton: some View {
        let tab = manager.activeTab
        return Button { tab?.goForward() } label: {
            Image(systemName: "chevron.right").frame(width: 44, height: 48)
                .opacity(tab?.canGoForward == true ? 1 : 0.35)
                .pointerHighlight()
        }
        .disabled(tab?.canGoForward != true)
        .accessibilityLabel(SyncCopy.text("pill.forward"))
        .accessibilityIdentifier("pill.forward")
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
                return action("menu.findInPage", "magnifyingglass") { manager.presentFind() }
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
        for (subview, frame) in zip(subviews, frames(in: bounds, count: subviews.count)) {
            subview.place(at: frame.origin, proposal: ProposedViewSize(frame.size))
        }
    }

    /// Where `count` panes go in `bounds`.
    func frames(in bounds: CGRect, count: Int) -> [CGRect] {
        guard count == 2 else { return Array(repeating: bounds, count: count) }
        let inner = bounds.insetBy(dx: inset, dy: inset)
        let widths = SplitModel.paneWidths(ratio, width: inner.width, gap: gap)
        return [CGRect(x: inner.minX, y: inner.minY, width: widths.leading, height: inner.height),
                CGRect(x: inner.minX + widths.leading + gap, y: inner.minY, width: widths.trailing, height: inner.height)]
    }
}
