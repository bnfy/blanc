import Observation
import Foundation
import WebKit

@Observable
final class TabModel: Identifiable {
    let id = UUID()
    var addressText: String
    var currentURL: URL
    var canGoBack = false
    var canGoForward = false
    var isLoading = false
    var pageTitle = ""
    /// Never saved, synced or recorded in History; its web data lives only in
    /// memory (`TabsManager.privateDataStore`).
    let isPrivate: Bool

    let webView: WKWebView
    let navigationDelegate: TabNavigationDelegate
    let uiDelegate = TabUIDelegate()

    /// `load: false` is for a page-opened tab, whose request WebKit loads itself.
    init(url: URL, configuration: WKWebViewConfiguration, isPrivate: Bool = false, load: Bool = true) {
        self.isPrivate = isPrivate
        self.currentURL = url
        self.addressText = url.absoluteString
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        self.navigationDelegate = TabNavigationDelegate()
        navigationDelegate.tab = self
        webView.navigationDelegate = navigationDelegate
        webView.uiDelegate = uiDelegate
        if load { navigationDelegate.load(url, in: webView) }
    }

    /// Convenience initializer for tests and previews — uses a bare web-view
    /// configuration (no `blanc://` scheme handler or bridge). Production tabs
    /// are built by `TabsManager.createTab`, which threads the configured
    /// setup through `WebViewConfiguration.make`.
    convenience init(url: URL) {
        self.init(url: url, configuration: WKWebViewConfiguration())
    }

    func submitAddress(using normalizer: AddressNormalizer) {
        if OSHandoff.isHandoff(addressText) {
            OSHandoff.open(addressText)
            return
        }
        let dest = normalizer.normalize(addressText)
        currentURL = dest
        addressText = dest.absoluteString
        navigationDelegate.load(dest, in: webView)
    }

    func goBack()    { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload()    { webView.reload() }
    func stop()      { webView.stopLoading() }
}
