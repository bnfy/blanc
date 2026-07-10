//
//  BlancApp.swift
//  Blanc
//
//  Created by Anthony J. Loria on 7/8/26.
//

import SwiftUI

@main
struct BlancApp: App {
    @State private var manager = TabsManager()

    var body: some Scene {
        WindowGroup {
            ContentView(manager: manager)
                .preferredColorScheme(preferredScheme)
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
