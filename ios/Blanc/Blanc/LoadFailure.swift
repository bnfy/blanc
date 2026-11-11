import SwiftUI

/// A page that failed to load before any of it showed: no connection, no such
/// server, a certificate WebKit refused, a navigation Blanc Blocker stopped.
nonisolated struct LoadFailure: Equatable, Sendable {
    /// The address that didn't load, when the error or the request names it.
    let url: URL?
    /// The system's own sentence for what went wrong, in the app's language.
    let reason: String
    /// An address only another app could open (`someapp://…`). Pages try
    /// these on their own to see whether an app is installed, so one failing
    /// behind a page that still shows isn't worth a notice.
    let isUnsupportedAddress: Bool

    private static let webKitDomain = "WebKitErrorDomain"
    /// WebKit's "frame load interrupted" (Blanc cancelled the load itself: a
    /// `mailto:` handed to iOS, a Settings link) and "plug-in handled load"
    /// (a video or audio file that plays in place of a page).
    private static let handledWebKitCodes: Set<Int> = [102, 204]

    /// Nil for a load that didn't fail as far as the person is concerned: one
    /// they stopped or replaced with another, and WebKit's handled ones.
    static func from(_ error: Error, requested: URL? = nil) -> LoadFailure? {
        let error = error as NSError
        if error.domain == NSURLErrorDomain, error.code == NSURLErrorCancelled { return nil }
        if error.domain == webKitDomain, handledWebKitCodes.contains(error.code) { return nil }
        let url = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL
            ?? (error.userInfo[NSURLErrorFailingURLStringErrorKey] as? String).flatMap { URL(string: $0) }
            ?? requested
        return LoadFailure(url: url, reason: error.localizedDescription,
                           isUnsupportedAddress: error.domain == NSURLErrorDomain && error.code == NSURLErrorUnsupportedURL)
    }
}

/// What a tab shows in place of a page that never loaded: what happened, the
/// address, and Try again. Drawn over the tab's empty web view, in the same
/// words as desktop's error page.
struct LoadFailureView: View {
    let tab: TabModel
    let failure: LoadFailure
    let style: BrowserStyle

    var body: some View {
        VStack(spacing: 10) {
            Text(SyncCopy.text("error.title"))
                .font(BrowserStyle.font(22, semibold: true, relativeTo: .title2))
                .accessibilityAddTraits(.isHeader)
            if let address = failure.url?.absoluteString {
                Text(address)
                    .font(BrowserStyle.font(13, relativeTo: .footnote))
                    .foregroundStyle(style.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
            }
            Text(failure.reason)
                .font(BrowserStyle.font(15))
                .foregroundStyle(style.secondary)
            Button { tab.retryFailedLoad() } label: {
                Text(SyncCopy.text("error.retry"))
                    .font(BrowserStyle.font(15, semibold: true))
                    .padding(.horizontal, 20)
                    .frame(minHeight: 44)
                    .foregroundStyle(style.raised)
                    .background(style.text, in: Capsule())
                    .contentShape(Capsule())
                    .pointerHighlight(cornerRadius: 22)
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .accessibilityIdentifier("page.retry")
        }
        .multilineTextAlignment(.center)
        .tracking(0.15)
        .foregroundStyle(style.text)
        .padding(.horizontal, 32)
        .frame(maxWidth: 440)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(style.background)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("page.loadFailure")
        .onAppear { AccessibilityNotification.Announcement(SyncCopy.text("error.title")).post() }
    }
}
