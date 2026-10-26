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

    var body: some Scene {
        WindowGroup {
            Group {
                if let manager {
                    ContentView(manager: manager)
                        .task { await manager.syncEngine.appDidBecomeActive() }
                } else {
                    Color(uiColor: .systemBackground).ignoresSafeArea()
                }
            }
            .preferredColorScheme(preferredScheme)
            .onAppear { if manager == nil { manager = TabsManager() } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active, let manager { Task { await manager.syncEngine.appDidBecomeActive() } }
            }
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
