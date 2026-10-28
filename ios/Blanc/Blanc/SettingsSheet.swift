import SwiftUI
import WebKit

/// Native destinations also serve legacy internal links without creating tabs.
enum SettingsDestination: String, Identifiable, Hashable {
    case root, privacy, sync, startPage
    var id: String { rawValue }
    static func resolve(_ url: URL) -> Self? {
        guard url.scheme?.lowercased() == "blanc", url.host?.lowercased() == "settings" else { return nil }
        switch url.fragment?.lowercased() {
        case "group-sync", "sync": return .sync
        case "group-privacy", "privacy": return .privacy
        case "start-page", "startpage", "group-startpage": return .startPage
        default: return .root
        }
    }
}

/// Shared catalog lookup: native controls use the same translations as pages.
enum SettingsCopy {
    private static let aliases: [String: String] = [
        "time-of-day": "ios.settings.timeOfDay",
        "title": "footer.settings",
        "done": "shield.done",
        "browsing": "settings.general.cards.browsing",
        "searchEngine": "settings.general.searchEngine.label",
        "appearance": "settings.general.cards.appearance",
        "theme": "settings.general.theme.label",
        "system": "settings.general.theme.system",
        "light": "settings.general.theme.light",
        "dark": "settings.general.theme.dark",
        "startPage": "settings.general.cards.startPage",
        "on": "settings.trust.on",
        "off": "shield.badge.off",
        "sync": "settings.nav.sync",
        "layout": "newtab.customize.layout",
        "ledger": "newtab.layout.ledger",
        "billboard": "newtab.layout.billboard",
        "shelf": "newtab.layout.shelf",
        "tally": "newtab.layout.tally",
        "wallpaper": "newtab.customize.wallpaperHeading",
        "clock": "newtab.customize.clockHeading",
        "sunrise": "settings.general.surfaceStyle.sunrise",
        "color": "groupMenu.colorLabel",
        "fill": "newtab.wallpaper.fillLabel",
        "soft": "newtab.wallpaper.fillSoft",
        "solid": "newtab.clock.solid",
        "gradient": "newtab.wallpaper.fillGradient",
        "auto": "settings.trust.dnsAuto",
        "spotlight": "newtab.wallpaper.styleSpotlight",
        "wash": "newtab.wallpaper.styleLabel",
        "font": "newtab.clock.font",
        "instrument": "newtab.clock.font.instrument",
        "condensed": "newtab.clock.font.condensed",
        "inter": "newtab.clock.font.inter",
        "flex": "newtab.clock.font.flex",
        "weight": "newtab.clock.weight",
        "height": "newtab.clock.height",
        "tone": "newtab.clock.tone",
        "style": "newtab.clock.style",
        "glass": "newtab.clock.glass",
        "sage": "spaces.color.sage",
        "sky": "spaces.color.sky",
        "iris": "spaces.color.iris",
        "rose": "spaces.color.rose",
        "clay": "spaces.color.clay",
        "sand": "spaces.color.sand",
        "slate": "spaces.color.slate",
        "graphite": "spaces.color.graphite",
        "connect": "settings.sync.switch.connect",
        "handle": "settings.sync.syncName",
        "cancel": "fill.setupEnable.cancelLabel",
        "syncNow": "settings.sync.syncNow",
        "pairDevice": "settings.sync.addAnotherDevice",
        "copyRecovery": "settings.sync.recovery.copy",
        "pairExpired": "settings.sync.pairing.expired",
        "desktopAccount": "settings.sync.createOnComputer",
        "pairDeviceHelp": "settings.sync.pairing.instruction",
    ]
    static func text(_ key: String) -> String { SyncCopy.text(aliases[key] ?? "ios.settings." + key) }
    static let searchEngines = BlancSearchEngine.allCases.filter { $0 != .custom }
    static let colors = ["sage", "sky", "iris", "rose", "clay", "sand", "slate", "graphite"]
}

struct SettingsSheet: View {
    let manager: TabsManager
    let destination: SettingsDestination
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @State private var path: [SettingsDestination] = []
    private var style: BrowserStyle { BrowserStyle(scheme: scheme) }

    var body: some View {
        NavigationStack(path: $path) {
            root
                .settingsTitle(SettingsCopy.text("title"))
                .navigationDestination(for: SettingsDestination.self) { destination in
                    switch destination {
                    case .sync: SyncSettingsView(engine: manager.syncEngine, manager: manager)
                    case .privacy: PrivacySettingsView(manager: manager)
                    case .startPage: StartSettingsView(manager: manager)
                    case .root: root
                    }
                }
        }
        .environment(\.dismissSettings, { dismiss() })
        .font(BrowserStyle.font(17))
        .tracking(0.17)
        .foregroundStyle(style.text)
        .tint(style.text)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(style.surface)
        .onAppear { if destination != .root { path = [destination] } }
    }

    private var root: some View {
        Form {
            Section(SettingsCopy.text("browsing")) {
                Picker(SettingsCopy.text("searchEngine"), selection: Binding(
                    get: { manager.settingsStore.searchEngine == .custom ? .duckduckgo : manager.settingsStore.searchEngine },
                    set: { manager.applySettingsPatch(["searchEngine": $0.rawValue]) })) {
                    ForEach(SettingsCopy.searchEngines, id: \.self) { Text($0.label).tag($0) }
                }.accessibilityIdentifier("settings.searchEngine")
            }
            Section(SettingsCopy.text("appearance")) {
                Picker(SettingsCopy.text("theme"), selection: Binding(get: { manager.settingsStore.theme }, set: { manager.applySettingsPatch(["theme": $0.rawValue]) })) {
                    ForEach(BlancThemePreference.allCases, id: \.self) { Text(SettingsCopy.text($0.rawValue)).tag($0) }
                }.accessibilityIdentifier("settings.theme")
                NavigationLink(value: SettingsDestination.startPage) {
                    summary("startPage", value: SettingsCopy.text(manager.settingsStore.newtabLayout.rawValue))
                }.accessibilityIdentifier("settings.startPage")
            }
            Section(SettingsCopy.text("privacy")) {
                NavigationLink(value: SettingsDestination.privacy) {
                    summary("blocker", value: SettingsCopy.text(manager.settingsStore.adblockEnabled ? "on" : "off"))
                }.accessibilityIdentifier("settings.privacy")
            }
            Section(SettingsCopy.text("sync")) {
                NavigationLink(value: SettingsDestination.sync) {
                    summary("sync", value: SettingsCopy.text(manager.syncEngine.status["enabled"]?.bool == true ? "connected" : "notConnected"))
                }.accessibilityIdentifier("settings.sync")
            }
            Section(SettingsCopy.text("about")) {
                LabeledContent(SettingsCopy.text("version"), value: version)
                Link(SettingsCopy.text("website"), destination: URL(string: "https://blanc.day")!)
                Link(SettingsCopy.text("privacyPolicy"), destination: URL(string: "https://blanc.day/privacy")!)
                Link(SettingsCopy.text("support"), destination: URL(string: "mailto:support@blanc.day")!)
            }
        }
        .settingsFormStyle()
    }

    private func summary(_ key: String, value: String) -> some View {
        LabeledContent(SettingsCopy.text(key)) { Text(value).foregroundStyle(style.secondary) }
    }
    private var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        return "\(info["CFBundleShortVersionString"] as? String ?? "—") (\(info["CFBundleVersion"] as? String ?? "—"))"
    }
}

private struct SettingsDismissKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}
extension EnvironmentValues {
    var dismissSettings: () -> Void {
        get { self[SettingsDismissKey.self] }
        set { self[SettingsDismissKey.self] = newValue }
    }
}

private struct SettingsFormStyle: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismissSettings) private var dismissSettings
    func body(content: Content) -> some View {
        content.scrollContentBackground(.hidden)
            .background(BrowserStyle(scheme: scheme).surface)
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(SettingsCopy.text("done"), action: dismissSettings)
                        .accessibilityIdentifier("settings.done")
                }
            }
    }
}
extension View {
    func settingsFormStyle() -> some View { modifier(SettingsFormStyle()) }
    func settingsTitle(_ title: String) -> some View {
        navigationTitle(title).toolbar {
            ToolbarItem(placement: .principal) {
                Text(title).font(BrowserStyle.font(17, semibold: true))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
            }
        }
    }
}

enum SettingsSiteInput {
    static func normalize(_ input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed.contains("://") ? trimmed : "https://" + trimmed),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = AdblockExceptions.normalize(trimmed),
              !host.contains(where: { $0.isWhitespace }) else { return nil }
        return host
    }
}

struct PrivacySettingsView: View {
    let manager: TabsManager
    @State private var site = ""
    @State private var error: String?
    var body: some View {
        Form {
            Section {
                Toggle(SettingsCopy.text("blocker"), isOn: Binding(get: { manager.settingsStore.adblockEnabled }, set: { manager.applySettingsPatch(["adblockEnabled": $0]) }))
                    .accessibilityIdentifier("settings.blocker")
            } footer: { Text(SettingsCopy.text("blockerHelp")) }
            Section {
                ForEach(manager.settingsStore.adblockExceptions, id: \.self) { host in
                    HStack {
                        Text(host)
                        Spacer()
                        Button(role: .destructive) { manager.setAdblockExceptions(manager.settingsStore.adblockExceptions.filter { $0 != host }) } label: {
                            Image(systemName: "minus.circle")
                        }.frame(minWidth: 44, minHeight: 44).buttonStyle(.borderless)
                            .accessibilityLabel(SettingsCopy.text("removeSite") + ": " + host)
                    }
                }
                TextField(SettingsCopy.text("site"), text: $site)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    .accessibilityIdentifier("settings.site")
                    .onSubmit(addSite)
                Button(SettingsCopy.text("addSite"), action: addSite).accessibilityIdentifier("settings.addSite")
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("settings.error") }
            } header: { Text(SettingsCopy.text("exceptions")) }
              footer: { Text(SettingsCopy.text("exceptionsHelp")) }
        }
        .settingsFormStyle().settingsTitle(SettingsCopy.text("privacy"))
    }
    private func addSite() {
        guard let host = SettingsSiteInput.normalize(site) else {
            error = SettingsCopy.text("invalidSite"); return
        }
        guard !manager.settingsStore.adblockExceptions.contains(host) else {
            error = SettingsCopy.text("duplicateSite"); return
        }
        manager.setAdblockExceptions(manager.settingsStore.adblockExceptions + [host])
        site = ""; error = nil
    }
}

struct StartSettingsView: View {
    let manager: TabsManager
    var body: some View {
        Form {
            Section {
                StartSettingsPreview(manager: manager).frame(height: 250)
                    .accessibilityLabel(SettingsCopy.text("preview"))
                    .listRowInsets(EdgeInsets())
                Picker(SettingsCopy.text("layout"), selection: Binding(get: { manager.settingsStore.newtabLayout }, set: { manager.setStartLayout($0) })) {
                    ForEach(BlancStartPageLayout.allCases, id: \.self) { Text(SettingsCopy.text($0.rawValue)).tag($0) }
                }.accessibilityIdentifier("settings.layout")
            }
            Section {
                NavigationLink(SettingsCopy.text("wallpaper")) { WallpaperSettingsView(manager: manager) }.accessibilityIdentifier("settings.wallpaper")
                NavigationLink(SettingsCopy.text("clock")) { ClockSettingsView(manager: manager) }.accessibilityIdentifier("settings.clock")
            } footer: { Text(SettingsCopy.text("clockHelp")) }
        }.settingsFormStyle().settingsTitle(SettingsCopy.text("startPage"))
    }
}

/// The preview uses the actual bundled Start Page, including its native clock.
/// It never joins the session, records visits, or accepts interaction.
struct StartSettingsPreview: UIViewRepresentable {
    let manager: TabsManager
    var layout: BlancStartPageLayout? = nil
    func makeUIView(context: Context) -> PreviewContainer {
        let tab = manager.makeStartPreview(layout: layout)
        context.coordinator.tab = tab
        return PreviewContainer(webView: tab.webView)
    }
    func updateUIView(_ view: PreviewContainer, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var tab: TabModel? }
    final class PreviewContainer: UIView {
        let webView: WKWebView
        private let spinner = UIActivityIndicatorView(style: .medium)
        private var loadingObservation: NSKeyValueObservation?
        init(webView: WKWebView) {
            self.webView = webView
            super.init(frame: .zero)
            clipsToBounds = true
            isUserInteractionEnabled = false
            accessibilityElementsHidden = true
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            addSubview(webView)
            addSubview(spinner)
            loadingObservation = webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] view, _ in
                let loading = view.isLoading
                DispatchQueue.main.async { [weak self] in
                    if loading { self?.spinner.startAnimating() } else { self?.spinner.stopAnimating() }
                }
            }
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.width > 0, bounds.height > 0 else { return }
            let scale = bounds.width / 390
            webView.transform = .identity
            webView.bounds = CGRect(x: 0, y: 0, width: 390, height: bounds.height / scale)
            webView.center = CGPoint(x: bounds.midX, y: bounds.midY)
            webView.transform = CGAffineTransform(scaleX: scale, y: scale)
            spinner.center = CGPoint(x: bounds.midX, y: bounds.midY)
        }
    }
}
