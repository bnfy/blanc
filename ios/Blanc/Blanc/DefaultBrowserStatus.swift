import SwiftUI
import UIKit

/// The default-browser offer (M18 §5): the walkthrough's step and a Settings
/// row. iOS lists Blanc under Default Browser App only once Apple grants
/// `com.apple.developer.web-browser` (request P2X5BCD4C9), so both stay hidden
/// until then. The change that adds the entitlement turns this on.
enum DefaultBrowserOffer {
    static let enabled = false

    /// iOS's Default Apps screen, where the person picks their browser.
    static var settingsURL: URL? { URL(string: UIApplication.openDefaultApplicationsSettingsURLString) }
}

/// Whether Blanc is the default browser. Apple rate-limits the check without
/// saying how far, so it's asked only when a screen showing the answer appears
/// or Blanc comes back from iOS Settings; an error reads as unknown (`nil`),
/// which still shows the offer, never "done".
@MainActor @Observable final class DefaultBrowserStatus {
    private(set) var isDefault: Bool?
    private let check: () throws -> Bool

    init(check: @escaping () throws -> Bool = { try UIApplication.shared.isDefault(.webBrowser) }) {
        self.check = check
    }

    func refresh() {
        isDefault = try? check()
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
            LabeledContent(SyncCopy.text("ios.defaultBrowser.row"),
                           value: status.isDefault == true ? "Blanc" : SyncCopy.text("ios.defaultBrowser.notBlanc"))
        }
        .accessibilityIdentifier("settings.defaultBrowser")
        .onAppear { status.refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { status.refresh() } }
    }
}
