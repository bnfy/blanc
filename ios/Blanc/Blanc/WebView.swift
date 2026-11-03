import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let tab: TabModel
    /// The floating Island's band above the home indicator. Websites scroll
    /// beneath it and can still bring their last line up clear of it.
    var islandInset: CGFloat = 0

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
        // normal safe-area adjustment, plus room for the Island below.
        webView.scrollView.contentInsetAdjustmentBehavior = startPage ? .never : .automatic
        WebView.reserveIsland(startPage ? 0 : islandInset, in: webView.scrollView)
    }

    /// Kept the same while the Island tucks away, so the page never jumps.
    static func reserveIsland(_ inset: CGFloat, in scrollView: UIScrollView) {
        guard scrollView.contentInset.bottom != inset else { return }
        scrollView.contentInset.bottom = inset
        scrollView.verticalScrollIndicatorInsets.bottom = inset
    }
}
