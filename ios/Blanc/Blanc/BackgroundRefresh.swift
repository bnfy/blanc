import BackgroundTasks
import UIKit

/// Background App Refresh (M18 §6): while the phone syncs, Blanc asks iOS for
/// a refresh about 15 minutes after it leaves the screen, and the refresh
/// fetches and keeps the fixed stores (`SyncEngine.fetchAndKeep`) so the
/// phone is already current when it's picked up. iOS decides the real time,
/// and nothing is scheduled without a sync or with Background App Refresh off.
@MainActor enum BackgroundRefresh {
    static let identifier = "me.bnfy.blanc.sync"
    static let delay: TimeInterval = 15 * 60
    /// iOS grants a refresh about 30 seconds; stop taking new reads before then.
    static let budget: TimeInterval = 25

    /// The engine of the window's `TabsManager` while the app is alive (set by
    /// `BlancApp`); a refresh that launches Blanc with no window builds its own.
    static weak var liveEngine: SyncEngine?

    static func request(now: Date = Date()) -> BGAppRefreshTaskRequest {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = now.addingTimeInterval(delay)
        return request
    }

    static func shouldSchedule(hasAccount: Bool, status: UIBackgroundRefreshStatus) -> Bool {
        hasAccount && status == .available
    }

    /// Asks iOS for the next refresh, when there is a sync to refresh.
    static func schedule(hasAccount: Bool) {
        guard shouldSchedule(hasAccount: hasAccount, status: UIApplication.shared.backgroundRefreshStatus) else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
            return
        }
        try? BGTaskScheduler.shared.submit(request())
    }

    /// The refresh itself. It never builds a `TabsManager` or a web view: the
    /// iOS 26 SDK aborts on a WKWebView made before the window exists.
    static func run(now: @escaping () -> Date = Date.init) async {
        guard let engine = liveEngine ?? backgroundEngine() else { return }
        let deadline = now().addingTimeInterval(budget)
        await engine.fetchAndKeep(expired: { now() >= deadline })
        schedule(hasAccount: engine.stateStore.state.enabled)
    }

    /// An engine over the stored account, for a refresh with no window. Its
    /// sinks are empty because a background pass applies nothing.
    static func backgroundEngine(
        directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0],
        secrets: (any SyncSecretStore)? = nil
    ) -> SyncEngine? {
        let state = SyncStateStore(directory: directory)
        guard state.state.enabled else { return nil }
        return SyncEngine(
            state: state, secrets: secrets ?? KeychainSyncSecretStore(), client: SyncWorkerClient(),
            settingsSink: { _ in }, tabsSource: { [] })
    }
}
