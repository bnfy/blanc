import SwiftUI

/// The first-minute walkthrough (M18 §3): a card rising over the start page
/// and the Island, each step swapping its content. Pairing leads; closing the
/// card at any step keeps every choice already made (`closeWalkthrough`).
struct WalkthroughSheet: View {
    let manager: TabsManager
    /// A pairing QR scanned with the Camera app while the card shows: asked
    /// here, and a join moves the card to What arrived.
    @Binding var pairLink: PairLinkRequest?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var pairModel = SyncSettingsModel()
    @State private var measureUsage = BlancSettingsDefaults.usagePing
    @State private var showSpacesChooser = false
    @State private var defaultBrowser = DefaultBrowserStatus()
    @State private var detent: PresentationDetent = .height(360)

    private var style: BrowserStyle { BrowserStyle(scheme: colorScheme) }
    private var engine: SyncEngine { manager.syncEngine }
    private var step: WalkthroughStep? { manager.walkthrough.current }

    var body: some View {
        VStack(spacing: 0) {
            if let step {
                content(step)
                    .id(step)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: step)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .overlay(alignment: .topTrailing) {
            if step != .welcome { closeButton }
        }
        .foregroundStyle(style.text)
        .tint(style.text)
        .presentationDetents(Set([detent]), selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackground(style.surface)
        .presentationCornerRadius(30)
        .onAppear {
            measureUsage = manager.settingsStore.usagePingShown
            detent = Self.detent(for: step)
        }
        .onChange(of: step) { _, step in withAnimation { detent = Self.detent(for: step) } }
        // A join from the Pair step, or from a pairing link confirmed meanwhile.
        .onChange(of: SettingsSyncStatus(engine.status).enabled) { _, enabled in
            if enabled { manager.walkthrough.joined() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, step == .defaultBrowser else { return }
            defaultBrowser.refresh()
            manager.walkthrough.defaultBrowserChanged(defaultBrowser.isDefault)
        }
        .sheet(isPresented: $showSpacesChooser) { SharedSpacesSheet(manager: manager) }
        .sheet(item: $pairLink) { request in PairLinkConfirmView(engine: engine, code: request.code) }
        // Past Welcome the card closes with its ✕, so a choice on screen is
        // never lost to a stray swipe.
        .interactiveDismissDisabled(step != .welcome)
    }

    private static func detent(for step: WalkthroughStep?) -> PresentationDetent {
        switch step {
        case .pair: .large
        case .arrived: .height(430)
        case .shareBack: .height(490)
        case .privacy: .height(360)
        case .defaultBrowser: .height(340)
        case .welcome, nil: .height(360)
        }
    }

    @ViewBuilder private func content(_ step: WalkthroughStep) -> some View {
        switch step {
        case .welcome: welcome
        case .pair: pair
        case .arrived: arrived
        case .shareBack: shareBack
        case .privacy: privacy
        case .defaultBrowser: defaultBrowserCard
        }
    }

    // MARK: Steps

    private var welcome: some View {
        card {
            Image("AppIconPreview-AppIcon").resizable().frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                .accessibilityHidden(true)
            heading(SyncCopy.text("ios.welcome.title"), line: SyncCopy.text("ios.welcome.body"))
        } actions: {
            primary(SettingsCopy.text("pairWithBlanc"), id: "welcome.pair") { manager.walkthrough.pairWithBlanc() }
            quiet(SyncCopy.text("ios.welcome.browse"), id: "welcome.browse") { manager.walkthrough.browseWithoutPairing() }
        }
    }

    private var pair: some View {
        Form { PairWithBlancSections(engine: engine, model: pairModel) }
            .scrollContentBackground(.hidden)
            .padding(.top, 28)
            .disabled(pairModel.busy)
            .overlay { if pairModel.busy { ProgressView().accessibilityLabel(SettingsCopy.text("working")) } }
            .safeAreaInset(edge: .bottom) {
                if let error = pairModel.error {
                    Text(error).foregroundStyle(.red).padding().accessibilityIdentifier("welcome.pairError")
                }
            }
    }

    private var arrived: some View {
        card {
            VStack(alignment: .leading, spacing: 6) {
                Text(SyncCopy.text("ios.welcome.connected", ["name": SettingsSyncStatus(engine.status).handle]))
                    .font(BrowserStyle.font(12, semibold: true)).foregroundStyle(style.secondary).textCase(.uppercase)
                Text(SyncCopy.text("ios.welcome.arrived")).font(BrowserStyle.font(22, semibold: true))
            }.frame(maxWidth: .infinity, alignment: .leading)
            WalkthroughArrived(engine: engine, style: style)
        } actions: {
            primary(SyncCopy.text("ios.welcome.continue"), id: "welcome.continue") { manager.walkthrough.next() }
        }
    }

    private var shareBack: some View {
        card {
            heading(SyncCopy.text("ios.welcome.shareTitle"), line: SyncCopy.text("ios.welcome.shareBody"), leading: true)
            VStack(alignment: .leading, spacing: 14) {
                Toggle(isOn: Binding(
                    get: { SettingsSyncStatus(engine.status).sharesTabs },
                    set: { value in Task { await engine.setShareTabs(value) } })) { wrapping(SettingsCopy.text("shareTabs")) }
                    .accessibilityIdentifier("welcome.shareTabs")
                Text(SettingsCopy.text("shareTabsHelp")).font(.footnote).foregroundStyle(style.secondary).fixedSize(horizontal: false, vertical: true)
                Toggle(isOn: Binding(
                    get: { engine.spacesEnabled },
                    set: { value in if value { showSpacesChooser = true } else { manager.turnOffSharedSpaces() } })) {
                    wrapping(SyncCopy.text("sharedSpaces.switch.iphone"))
                }
                    .accessibilityIdentifier("welcome.spaces")
                Text(SyncCopy.text("sharedSpaces.switch.line.iphone")).font(.footnote).foregroundStyle(style.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16).background(style.raised, in: RoundedRectangle(cornerRadius: 16))
        } actions: {
            primary(SyncCopy.text("ios.welcome.continue"), id: "welcome.continue") { manager.walkthrough.next() }
        }
    }

    private var privacy: some View {
        card {
            heading(SyncCopy.text("ios.welcome.privacyTitle"), line: nil, leading: true)
            VStack(alignment: .leading, spacing: 10) {
                Toggle(isOn: $measureUsage) { wrapping(SyncCopy.text("ios.welcome.measureUsage")) }
                    .accessibilityIdentifier("welcome.measureUsage")
                Text(SyncCopy.text("ios.welcome.measureUsageHelp")).font(.footnote).foregroundStyle(style.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16).background(style.raised, in: RoundedRectangle(cornerRadius: 16))
        } actions: {
            primary(SyncCopy.text("ios.welcome.continue"), id: "welcome.continue") {
                manager.settingsStore.update(usagePing: measureUsage)
                manager.walkthrough.next()
                if manager.walkthrough.current == nil { manager.closeWalkthrough(usagePingShown: measureUsage) }
            }
        }
    }

    private var defaultBrowserCard: some View {
        card {
            Image(systemName: defaultBrowser.isDefault == true ? "checkmark.circle" : "safari")
                .font(.system(size: 40, weight: .light)).accessibilityHidden(true)
            heading(SyncCopy.text(defaultBrowser.isDefault == true ? "ios.defaultBrowser.done" : "ios.defaultBrowser.title"),
                    line: defaultBrowser.isDefault == true ? nil : SyncCopy.text("ios.defaultBrowser.body"))
        } actions: {
            if defaultBrowser.isDefault == true {
                primary(SettingsCopy.text("done"), id: "welcome.done") { finish() }
            } else {
                primary(SyncCopy.text("ios.defaultBrowser.open"), id: "welcome.openDefaultApps") {
                    if let url = DefaultBrowserOffer.settingsURL { openURL(url) }
                }
                quiet(SyncCopy.text("ios.defaultBrowser.notNow"), id: "welcome.notNow") { finish() }
            }
        }
        .onAppear { defaultBrowser.refresh() }
    }

    // MARK: Pieces

    private func finish() {
        manager.walkthrough.next()
        manager.closeWalkthrough(usagePingShown: measureUsage)
    }

    private var closeButton: some View {
        Button { manager.closeWalkthrough(usagePingShown: measureUsage) } label: {
            Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(style.secondary)
                .frame(width: 28, height: 28).background(style.raised, in: Circle())
                .frame(width: 44, height: 44)
        }
        .padding(.top, 10).padding(.trailing, 10)
        .accessibilityLabel(SettingsCopy.text("cancel"))
        .accessibilityIdentifier("welcome.close")
    }

    private func card<Body: View, Actions: View>(@ViewBuilder _ body: () -> Body,
                                                  @ViewBuilder actions: () -> Actions) -> some View {
        VStack(spacing: 16) {
            body()
            Spacer(minLength: 8)
            VStack(spacing: 4) { actions() }
        }
        .padding(.horizontal, 24).padding(.top, 34).padding(.bottom, 20)
    }

    /// A switch's label that wraps rather than truncating (German runs long).
    private func wrapping(_ text: String) -> some View {
        Text(text).fixedSize(horizontal: false, vertical: true)
    }

    private func heading(_ title: String, line: String?, leading: Bool = false) -> some View {
        VStack(alignment: leading ? .leading : .center, spacing: 8) {
            Text(title).font(BrowserStyle.font(24, semibold: true))
            if let line { Text(line).font(BrowserStyle.font(15)).foregroundStyle(style.secondary) }
        }
        .multilineTextAlignment(leading ? .leading : .center)
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .center)
    }

    private func primary(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(BrowserStyle.font(16, semibold: true)).foregroundStyle(style.background)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(style.text, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain).accessibilityIdentifier(id)
    }

    private func quiet(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(BrowserStyle.font(15)).frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain).accessibilityIdentifier(id)
    }
}

/// What arrived after pairing (M18 §3.2 step 3): counts from the first sync
/// pass, shown as they come; Continue never waits for them.
struct WalkthroughArrived: View {
    let engine: SyncEngine
    let style: BrowserStyle

    private var synced: Bool { SettingsSyncStatus(engine.status).lastSynced != nil }

    var body: some View {
        VStack(spacing: 0) {
            if !synced {
                row(SyncCopy.text("ios.welcome.arriving")) { ProgressView() }
            } else {
                ForEach(engine.remoteDevices.filter { !$0.tabs.isEmpty }) { device in
                    row(SyncCopy.text("ios.welcome.tabsOn", ["device": device.name])) { count(device.tabs.count) }
                }
                row(SyncCopy.text("pagesNav.bookmarks")) { count(engine.favorites.count) }
                row(SyncCopy.text("ios.welcome.settings")) { Image(systemName: "checkmark").accessibilityHidden(true) }
                if engine.libraryCount > 0 {
                    row(SyncCopy.text("ios.welcome.spaces")) { count(engine.libraryCount) }
                } else {
                    Text(SyncCopy.text("ios.welcome.spacesLater")).font(.footnote).foregroundStyle(style.secondary).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12)
                }
            }
        }
        .padding(.horizontal, 16)
        .background(style.raised, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("welcome.arrived")
    }

    private func row<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack {
            Text(title).font(BrowserStyle.font(15)).lineLimit(2)
            Spacer()
            trailing()
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(style.border).frame(height: 0.5) }
    }

    private func count(_ n: Int) -> some View {
        Text("\(n)").font(BrowserStyle.font(15, semibold: true)).monospacedDigit()
    }
}
