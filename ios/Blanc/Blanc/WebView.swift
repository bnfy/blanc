import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let tab: TabModel
    /// The floating Island's band inside the safe area. Websites scroll
    /// beneath it and can still bring their first and last lines clear of it.
    var islandInset: CGFloat = 0
    var islandEdge: VerticalEdge = .bottom

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
        // normal safe-area adjustment, plus room for the Island.
        webView.scrollView.contentInsetAdjustmentBehavior = startPage ? .never : .automatic
        WebView.reserveIsland(startPage ? 0 : islandInset, at: islandEdge, in: webView.scrollView)
    }

    /// Kept the same while the Island tucks away, so the page never jumps.
    static func reserveIsland(_ inset: CGFloat, at edge: VerticalEdge, in scrollView: UIScrollView) {
        let top = edge == .top ? inset : 0, bottom = edge == .bottom ? inset : 0
        guard scrollView.contentInset.top != top || scrollView.contentInset.bottom != bottom else { return }
        scrollView.contentInset.top = top
        scrollView.contentInset.bottom = bottom
        scrollView.verticalScrollIndicatorInsets.top = top
        scrollView.verticalScrollIndicatorInsets.bottom = bottom
    }
}
