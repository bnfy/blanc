import UIKit
import WebKit

/// Links that belong to another app: the App Store, Maps, a bank's own app.
/// WebKit can't load them, so a tapped one did nothing. Blanc asks first,
/// naming the site, and then hands the link to iOS. Only a link the person
/// tapped is offered: a page that tries one by itself gets no alert.
enum AppLinks {
    /// What a web view loads itself, or what is never another app's.
    private static let pageSchemes: Set<String> = [
        "http", "https", "blanc", "about", "blob", "data", "file", "javascript", "ws", "wss", "applewebdata",
    ]

    static func isAppLink(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), !scheme.isEmpty else { return false }
        return !pageSchemes.contains(scheme) && !OSHandoff.schemes.contains(scheme)
    }

    /// Asks over `webView`'s page, then opens `url`; `failed` gets the
    /// sentence to show when no app on the phone takes it.
    static func ask(_ url: URL, from webView: WKWebView, failed: @escaping (String) -> Void) {
        guard let presenter = PageDialog.presenter(for: webView) else { return }
        let alert = UIAlertController(title: webView.url?.host, message: SyncCopy.text("ios.appLink.message"),
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: SyncCopy.text("common.cancel"), style: .cancel))
        alert.addAction(UIAlertAction(title: SyncCopy.text("downloads.open"), style: .default) { _ in
            UIApplication.shared.open(url, options: [:]) { opened in
                if !opened { failed(SyncCopy.text("externalApp.none.message", ["protocol": (url.scheme ?? "") + ":"])) }
            }
        })
        presenter.present(alert, animated: true)
    }
}
