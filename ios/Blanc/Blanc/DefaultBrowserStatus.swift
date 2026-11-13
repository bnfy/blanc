import SwiftUI
import UIKit

/// The default-browser offer (M18 §5): the walkthrough's step and a Settings
/// row. iOS lists Blanc under Default Browser App because the app carries
/// `com.apple.developer.web-browser`.
enum DefaultBrowserOffer {
    /// iOS's Default Apps screen, where the person picks their browser.
    static var settingsURL: URL? { URL(string: UIApplication.openDefaultApplicationsSettingsURLString) }
}

/// Whether Blanc is the default browser. Apple rate-limits the check without
/// saying how far, so it's asked only when a screen showing the answer appears
/// or Blanc comes back from iOS Settings. A refused check keeps the last answer;
/// with none yet it reads as unknown (`nil`), which still shows the offer.
@MainActor @Observable final class DefaultBrowserStatus {
    private(set) var isDefault: Bool?
    private let check: () throws -> Bool
    private let defaults: UserDefaults
    private static let lastAnswerKey = "defaultBrowserLastAnswer"

    init(check: @escaping () throws -> Bool = { try UIApplication.shared.isDefault(.webBrowser) },
         defaults: UserDefaults = .standard) {
        self.check = check
        self.defaults = defaults
        isDefault = defaults.object(forKey: Self.lastAnswerKey) as? Bool
    }

    func refresh() {
        guard let answer = try? check() else { return }
        isDefault = answer
        defaults.set(answer, forKey: Self.lastAnswerKey)
    }
}

/// Settings → Browsing: whether Blanc is the default, and the way to change it.
struct DefaultBrowserRow: View {
    @State private var status = DefaultBrowserStatus()
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Button {
            if let url = DefaultBrowserOffer.settingsURL { openURL(url) }
        } label: {
            LabeledContent {
                if let isDefault = status.isDefault {
                    Text(isDefault ? "Blanc" : SyncCopy.text("ios.defaultBrowser.notBlanc"))
                }
            } label: {
                Text(SyncCopy.text("ios.defaultBrowser.row"))
            }
        }
        .accessibilityIdentifier("settings.defaultBrowser")
        .onAppear { status.refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { status.refresh() } }
    }
}
