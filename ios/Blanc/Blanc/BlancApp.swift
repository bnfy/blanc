//
//  BlancApp.swift
//  Blanc
//
//  Created by Anthony J. Loria on 7/8/26.
//

import SwiftUI

@main
struct BlancApp: App {
    @Environment(\.scenePhase) private var scenePhase
    /// Made once the first window is on screen, not with the app: a WKWebView
    /// created before the window exists (as restored tabs were) aborts in
    /// UIKit's touch delivery on the first tap on its page when built with the
    /// iOS 26 SDK (CI probe runs 40352397246 to 40365031742, 2026-10-26).
    @State private var manager: TabsManager?
    @State private var incomingLinks = IncomingLinks()
    /// A pairing QR scanned with the Camera app: Blanc asks before joining.
    @State private var pairLink: PairLinkRequest?

    var body: some Scene {
        WindowGroup {
            Group {
                if let manager {
                    ContentView(manager: manager, pairLink: $pairLink)
                        .task {
                            manager.syncEngine.startForegroundChecks()
                            await manager.syncEngine.appDidBecomeActive()
                        }
                } else {
                    Color(uiColor: .systemBackground).ignoresSafeArea()
                }
            }
            .preferredColorScheme(preferredScheme)
            .onAppear {
                guard manager == nil else { return }
                let made = TabsManager()
                manager = made
                BackgroundRefresh.liveEngine = made.syncEngine
                incomingLinks.flush(into: made)
                if let code = incomingLinks.takePairCode() { pairLink = PairLinkRequest(code: code) }
            }
            .onOpenURL {
                incomingLinks.receive($0, into: manager)
                if manager != nil, let code = incomingLinks.takePairCode() { pairLink = PairLinkRequest(code: code) }
            }

            .onChange(of: scenePhase) { _, phase in
                guard let manager else { return }
                if phase == .active {
                    manager.syncEngine.startForegroundChecks()
                    Task { await manager.syncEngine.appDidBecomeActive() }
                } else {
                    manager.syncEngine.stopForegroundChecks()
                    if phase == .background {
                        BackgroundRefresh.schedule(hasAccount: manager.syncEngine.stateStore.state.enabled)
                    }
                }
            }
        }
        // M18 §6: fetch and keep what other devices changed, for the next time
        // Blanc is in front.
        .backgroundTask(.appRefresh(BackgroundRefresh.identifier)) {
            await BackgroundRefresh.run()
        }
    }

    private var preferredScheme: ColorScheme? {
        switch manager?.settingsStore.theme ?? .system {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
