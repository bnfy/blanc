import WebKit

/// Opens a page's new windows (`target=_blank`, `window.open`) as tabs. WebKit
/// passes a copy of the opener's configuration, so a private tab's children
/// share its in-memory web session; the returned view must be built from it.
final class TabUIDelegate: NSObject, WKUIDelegate {
    var onOpenChild: ((WKWebViewConfiguration, URL?) -> WKWebView?)?

    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        onOpenChild?(configuration, navigationAction.request.url)
    }
}
