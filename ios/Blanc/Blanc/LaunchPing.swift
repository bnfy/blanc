import Foundation
import UIKit

/// The iPhone launch ping (F21, M18 §7.1): one anonymous count per app
/// session, in desktop's shape, to the same Worker, which keeps the phone's
/// counts apart from desktop's (`platform: "ios"`). It is sent only when the
/// person saved yes to Measure usage, never from a Debug build, never twice in
/// one launch, and never for a launch iOS made only for Background App Refresh.
/// It carries no browsing data, and failures are silent and never retried.
enum LaunchPing {
    static let endpoint = URL(string: "https://blanc-ping.bnfy-441.workers.dev/ping")!
    static let installFileName = "install-id"

    /// As desktop: development builds never send.
    static var buildSends: Bool {
        #if DEBUG
        return false
        #else
        return true
        #endif
    }

    static func body(installId: UUID, sessionId: Int32, version: String, osMajor: Int) -> [String: Any] {
        [
            "installId": installId.uuidString.lowercased(),
            "sessionId": sessionId,
            "version": version,
            "platform": "ios",
            "arch": "arm64",
            "osVersion": String(osMajor),
        ]
    }

    static func shouldSend(saved: Bool?, alreadySent: Bool, launchedInBackground: Bool) -> Bool {
        saved == true && !alreadySent && !launchedInBackground
    }

    /// A random positive 31-bit number per launch, as desktop's `randomInt(1, 2^31)`.
    static func makeSessionId() -> Int32 { Int32.random(in: 1...Int32.max) }

    /// A random id for this install, kept in the app's own container: a
    /// reinstall removes it and counts as a new install, as on desktop. Not
    /// in the Keychain, which outlives a reinstall.
    static func installId(in directory: URL) -> UUID {
        let url = directory.appendingPathComponent(installFileName)
        if let text = try? String(contentsOf: url, encoding: .utf8),
           let id = UUID(uuidString: text.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return id
        }
        let id = UUID()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? Data(id.uuidString.utf8).write(to: url, options: .atomic)
        return id
    }
}

/// Sends the launch ping once per process.
@MainActor final class LaunchPingSender {
    private let directory: URL
    private let allowed: Bool
    private let post: ([String: Any]) async -> Void
    private var sent = false
    private let sessionId = LaunchPing.makeSessionId()

    init(directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0],
         allowed: Bool = LaunchPing.buildSends,
         post: @escaping ([String: Any]) async -> Void = LaunchPingSender.live) {
        self.directory = directory
        self.allowed = allowed
        self.post = post
    }

    /// Called when the app first becomes active in a launch the person opened.
    func sendIfAllowed(saved: Bool?) async {
        guard allowed, LaunchPing.shouldSend(saved: saved, alreadySent: sent, launchedInBackground: false) else { return }
        sent = true
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
        await post(LaunchPing.body(
            installId: LaunchPing.installId(in: directory), sessionId: sessionId, version: version,
            osMajor: ProcessInfo.processInfo.operatingSystemVersion.majorVersion))
    }

    nonisolated static func live(_ body: [String: Any]) async {
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        var request = URLRequest(url: LaunchPing.endpoint, timeoutInterval: 10)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        _ = try? await URLSession(configuration: .ephemeral).data(for: request)
    }
}
