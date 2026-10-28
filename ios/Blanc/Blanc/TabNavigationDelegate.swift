import Foundation
import WebKit
import UIKit

final class TabNavigationDelegate: NSObject, WKNavigationDelegate {
    weak var tab: TabModel?
    var onSettingsNavigation: ((URL) -> Bool)?
    private var lastRequested: URL?
    var onTitleChange: (() -> Void)?
    var onURLChange: ((URL) -> Void)?
    /// Every committed main-frame navigation, even to the address already
    /// shown (a typed search, a reload): the History visit, as desktop's
    /// did-navigate records it. The page's title usually arrives later.
    var onVisit: ((URL, String) -> Void)?
    /// A title WebKit reports for the page now showing, at the end of its
    /// load or whenever the page changes it: History renames the visit in
    /// place (desktop's page-title-updated).
    var onPageTitle: ((URL, String) -> Void)?
    /// The load that wakes a quiet tab (`wake`). It shows a page the tab had
    /// already visited, so, like desktop's `tab.waking`, it records no visit
    /// and renames none until it settles.
    private(set) var wakeNavigation: WKNavigation?
    var isWaking: Bool { wakeNavigation != nil }
    /// A main-frame navigation is about to load `url` (Blanc Blocker's per-site
    /// switch puts the tab's blocking rules on or off for that site first).
    var onWillLoadMainFrame: ((URL) -> Void)?

    func load(_ url: URL, in webView: WKWebView) {
        guard url != lastRequested else { return }
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    /// Loads a quiet tab's page as a wake, not a visit.
    func wake(_ url: URL, in webView: WKWebView) {
        lastRequested = url
        wakeNavigation = webView.load(URLRequest(url: url))
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
        committed(navigation, url: webView.url, title: webView.title ?? "")
    }

    /// Test seam: what a committed main-frame navigation reports. A commit
    /// other than the wake's means the wake was left behind.
    func committed(_ navigation: WKNavigation?, url: URL?, title: String) {
        if let wakeNavigation, navigation === wakeNavigation { return }
        wakeNavigation = nil
        if let url { onVisit?(url, title) }
    }

    /// The wake is over once its own load finishes or fails.
    private func settled(_ navigation: WKNavigation?) {
        if let wakeNavigation, navigation === wakeNavigation { self.wakeNavigation = nil }
    }

    func webView(_ webView: WKWebView,
                 didFinish navigation: WKNavigation!) {
        sync(webView, finished: true)
        settled(navigation)
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
        settled(navigation)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        tab?.hasCommitted = true
        sync(webView)
        settled(navigation)
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
    func finishedLoad(_ navigation: WKNavigation? = nil, url: URL, title: String) {
        apply(url: url, title: title, finished: true)
        settled(navigation)
    }

    /// WebKit's `title` for the page now showing, including one the page sets
    /// after it loads. An empty title mid-load keeps the tab's last one.
    func applyTitle(_ title: String) {
        guard let tab, !title.isEmpty else { return }
        if !isWaking { onPageTitle?(tab.currentURL, title) }
        guard title != tab.pageTitle else { return }
        tab.pageTitle = title
        onTitleChange?()
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
        if finished, let u = url, !title.isEmpty, !isWaking { onPageTitle?(u, title) }
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
