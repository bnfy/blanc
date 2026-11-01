import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let tab: TabModel

    func makeUIView(context: Context) -> WKWebView {
        configureInsets(tab.webView)
        return tab.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        configureInsets(webView)
    }

    private func configureInsets(_ webView: WKWebView) {
        let startPage = tab.currentURL.scheme == "blanc" && tab.currentURL.host == "newtab"
        // The Start Page paints beneath the system bars and floating Island;
        // its stylesheet reserves space for the controls. Websites keep their
        // normal safe-area adjustment and separate bottom toolbar.
        webView.scrollView.contentInsetAdjustmentBehavior = startPage ? .never : .automatic
    }
}
