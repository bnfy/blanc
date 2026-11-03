import SwiftUI
import UIKit

/// What a window is for (multiple windows design §4): its id, which names it
/// in the saved session, and a tab to bring into it when it opens. Windows
/// are the same window when their ids match, so opening a window's request
/// again brings it forward.
struct WindowRequest: Codable, Hashable {
    var id = UUID()
    /// A tab moving here from another window (Move Tab to New Window).
    var moveTabId: UUID?

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Things one app run keeps for every window: links that arrive before a
/// window can take them, and the launch ping.
@Observable final class BlancAppState {
    @ObservationIgnored var incomingLinks = IncomingLinks()
    @ObservationIgnored var launchPing = LaunchPingSender()
}

/// One window: its own tabs (`TabsManager`) over the app's shared services.
/// The manager is made once the window's scene is known, not before: a
/// WKWebView made before its window exists aborts in UIKit's touch delivery
/// on the first tap when built with the iOS 26 SDK (CI probe runs
/// 40352397246 to 40365031742, 2026-10-26).
struct WindowRoot: View {
    let request: WindowRequest
    let app: BlancAppState
    @State private var manager: TabsManager?
    @State private var scene: UIWindowScene?
    /// A pairing QR scanned with the Camera app: Blanc asks before joining.
    @State private var pairLink: PairLinkRequest?
    /// A tab dragged out of another window to make this one (W3).
    @State private var draggedTab: UUID?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Group {
            if let manager {
                ContentView(manager: manager, pairLink: $pairLink)
                    .focusedSceneValue(\.tabsManager, manager)
                    .task { await app.launchPing.sendIfAllowed(saved: manager.settingsStore.usagePing) }
                    // A new install saves its choice in the walkthrough: count
                    // its first launch then, not only from the next one.
                    .onChange(of: manager.settingsStore.usagePing) { _, saved in
                        Task { await app.launchPing.sendIfAllowed(saved: saved) }
                    }
            } else {
                Color(uiColor: .systemBackground).ignoresSafeArea()
            }
        }
        .preferredColorScheme(preferredScheme)
        .background(SceneReader { scene = $0 })
        .onChange(of: scene, initial: true) { start() }
        .onOpenURL { url in
            let target = manager?.services.frontWindow ?? manager
            app.incomingLinks.receive(url, into: target)
            if target != nil, let code = app.incomingLinks.takePairCode() { pairLink = PairLinkRequest(code: code) }
        }
        .onContinueUserActivity(TabDrag.activityType) { activity in
            guard let id = TabDrag.tabId(from: activity) else { return }
            if let manager { manager.services.moveTab(id, to: manager) } else { draggedTab = id }
        }
        // iPadOS's window list names the window by its Space, or its page.
        .onChange(of: manager?.windowTitle, initial: true) { _, title in scene?.title = title ?? "" }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active, let manager { manager.services.frontWindow = manager }
        }
    }

    private func start() {
        guard manager == nil, let scene else { return }
        let services = BrowserServices.shared
        services.openWindowAction = { request in openWindow(value: request) }
        let first = services.windows.isEmpty
        let made = TabsManager(services: services, windowId: request.id.uuidString,
                               sceneSessionId: scene.session.persistentIdentifier)
        made.closeWindowAction = { [weak scene] in
            guard let scene else { return }
            UIApplication.shared.requestSceneSessionDestruction(scene.session, options: nil)
        }
        manager = made
        if let moving = request.moveTabId ?? draggedTab { services.moveTab(moving, to: made) }
        draggedTab = nil
        scene.title = made.windowTitle
        if first { BackgroundRefresh.liveEngine = services.syncEngine }
        app.incomingLinks.flush(into: services.frontWindow ?? made)
        if let code = app.incomingLinks.takePairCode() { pairLink = PairLinkRequest(code: code) }
    }

    private var preferredScheme: ColorScheme? {
        switch manager?.settingsStore.theme ?? .system {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Reports the window scene a view is shown in, once it's in a window.
private struct SceneReader: UIViewRepresentable {
    let found: (UIWindowScene) -> Void

    func makeUIView(context: Context) -> ReaderView {
        let view = ReaderView()
        view.found = found
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: ReaderView, context: Context) { view.found = found }

    final class ReaderView: UIView {
        var found: ((UIWindowScene) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let scene = window?.windowScene { found?(scene) }
        }
    }
}

/// The focused window's tabs, for the keyboard menu (`BrowserCommands`).
struct FocusedTabsManagerKey: FocusedValueKey { typealias Value = TabsManager }
extension FocusedValues {
    var tabsManager: TabsManager? {
        get { self[FocusedTabsManagerKey.self] }
        set { self[FocusedTabsManagerKey.self] = newValue }
    }
}

/// Hears when iPadOS discards windows (swiped away in the app switcher, or
/// closed while Blanc wasn't running), so their unsaved tabs reach Recently
/// closed (multiple windows design §4).
final class BlancAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {
        BrowserServices.shared.windowsDiscarded(Set(sceneSessions.map(\.persistentIdentifier)))
    }
}
