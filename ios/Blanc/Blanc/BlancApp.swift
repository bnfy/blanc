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
    @State private var manager = TabsManager()

    var body: some Scene {
        WindowGroup {
            ContentView(manager: manager)
                .preferredColorScheme(preferredScheme)
                .task { await manager.syncEngine.appDidBecomeActive() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await manager.syncEngine.appDidBecomeActive() } }
                }
        }
    }

    private var preferredScheme: ColorScheme? {
        switch manager.settingsStore.theme {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
