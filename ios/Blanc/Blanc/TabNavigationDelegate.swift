import Foundation
import WebKit
import UIKit

final class TabNavigationDelegate: NSObject, WKNavigationDelegate {
    weak var tab: TabModel?
    var onSettingsNavigation: ((URL) -> Bool)?
    private var lastRequested: URL?
    var onTitleChange: (() -> Void)?
    var onURLChange: ((URL) -> Void)?
    /// Every finished main-frame load, even to the address already shown (a
    /// typed search, a reload): the History visit, with that page's own title.
    var onVisit: ((URL, String) -> Void)?
    /// A main-frame navigation is about to load `url` (Blanc Blocker's per-site
    /// switch puts the tab's blocking rules on or off for that site first).
    var onWillLoadMainFrame: ((URL) -> Void)?

    func load(_ url: URL, in webView: WKWebView) {
        guard url != lastRequested else { return }
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        tab?.exitReader()
        tab?.readerAvailable = false
        tab?.nativeClock.hide()
        tab?.isLoading = true
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        tab?.hasCommitted = true
    }

    func webView(_ webView: WKWebView,
                 didFinish navigation: WKNavigation!) {
        sync(webView, finished: true)
        tab?.probeReader()
        Task { @MainActor [weak tab] in
            await Task.yield()
            tab?.captureThumbnail()
        }
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        sync(webView)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        tab?.hasCommitted = true
        sync(webView)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           OSHandoff.schemes.contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        if navigationAction.targetFrame?.isMainFrame != false, let url = navigationAction.request.url {
            // Existing/restored Settings tabs may reload or traverse their history.
            // New links into Settings open the native sheet instead.
            if (navigationAction.navigationType == .linkActivated || tab?.currentURL.host != "settings"),
               onSettingsNavigation?(url) == true {
                decisionHandler(.cancel)
                return
            }
            onWillLoadMainFrame?(url)
        }
        decisionHandler(.allow)
    }

    private func sync(_ webView: WKWebView, finished: Bool = false) {
        guard let tab else { return }
        tab.isLoading = webView.isLoading
        tab.canGoBack = webView.canGoBack
        tab.canGoForward = webView.canGoForward
        apply(url: webView.url, title: webView.title ?? "", finished: finished)
    }

    /// Test seam: what a finished main-frame load reports.
    func finishedLoad(url: URL, title: String) {
        apply(url: url, title: title, finished: true)
    }

    /// The address moves first, so a title change is always about the page
    /// now showing, never the one before it.
    private func apply(url: URL?, title: String, finished: Bool) {
        guard let tab else { return }
        if let u = url {
            lastRequested = u
            applyURL(u, to: tab)
        }
        let oldTitle = tab.pageTitle
        tab.pageTitle = title
        if finished, let u = url { onVisit?(u, title) }
        if oldTitle != tab.pageTitle { onTitleChange?() }
    }

    /// Updates the tab's URL fields and fires `onURLChange` only when the URL
    /// actually changed — a same-URL reload must not trigger a session write.
    /// Split out of `sync` (internal, not private) so the change-detection is
    /// unit-testable without a live navigation.
    func applyURL(_ newURL: URL, to tab: TabModel) {
        let changed = newURL != tab.currentURL
        tab.currentURL = newURL
        tab.addressText = newURL.absoluteString
        if changed {
            tab.exitReader()
            tab.readerAvailable = false
            tab.probeReader()
            onURLChange?(newURL)
        }
    }
}
