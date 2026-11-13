//
//  BlancApp.swift
//  Blanc
//
//  Created by Anthony J. Loria on 7/8/26.
//

import SwiftUI

@main
struct BlancApp: App {
    @UIApplicationDelegateAdaptor(BlancAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var app = BlancAppState()

    var body: some Scene {
        // A window per request (multiple windows design): each has its own
        // tabs over the app's shared services. On iPhone there is only one.
        WindowGroup(for: WindowRequest.self) { $request in
            WindowRoot(request: request ?? WindowRequest(), app: app)
        } defaultValue: {
            WindowRequest()
        }
        // Desktop's keyboard shortcuts for a hardware keyboard (D7), acting on
        // the focused window.
        .commands { BrowserCommands() }
        .onChange(of: scenePhase) { _, phase in
            let engine = BrowserServices.shared.syncEngine
            if phase == .active {
                engine.startForegroundChecks()
                Task { await engine.appDidBecomeActive() }
            } else {
                engine.stopForegroundChecks()
                if phase == .background {
                    BrowserServices.shared.saveTabHistories()
                    BackgroundRefresh.schedule(hasAccount: engine.stateStore.state.enabled)
                }
            }
        }
        // M18 §6: fetch and keep what other devices changed, for the next time
        // Blanc is in front.
        .backgroundTask(.appRefresh(BackgroundRefresh.identifier)) {
            await BackgroundRefresh.run()
        }
    }
}
