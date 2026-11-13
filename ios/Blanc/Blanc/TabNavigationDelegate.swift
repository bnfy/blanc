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
    /// A wake from saved history, whose load WebKit starts with no navigation
    /// to compare against.
    private var isRestoringHistory = false
    var isWaking: Bool { wakeNavigation != nil || isRestoringHistory }
    /// A main-frame navigation is about to load `url` (Blanc Blocker's per-site
    /// switch puts the tab's blocking rules on or off for that site first).
    var onWillLoadMainFrame: ((URL) -> Void)?
    /// Whether this page's site gets its phone layout on an iPad.
    var wantsMobileSite: ((URL) -> Bool)?

    /// A load that failed while the tab's page stays on screen (a tapped link,
    /// a reload with no connection): the page is left as it was and the
    /// window says why nothing happened.
    var onLoadFailure: ((LoadFailure) -> Void)?

    /// A link the person tapped that belongs to another app (`AppLinks`).
    var onAppLink: ((URL) -> Void)?
    /// A navigation that turned into a download (`PageDownloads`). Left
    /// unset, WebKit cancels the download.
    var onDownload: ((WKDownload) -> Void)?

    func load(_ url: URL, in webView: WKWebView) {
        guard url != lastRequested else { return }
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    /// Loads the page on screen afresh, which `load` would skip as the
    /// address it was just asked for: Request Mobile or Desktop Website needs
    /// a new load to ask the site for the other layout.
    func loadAgain(_ url: URL, in webView: WKWebView) {
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    /// Loads `url` again after it failed. `load` skips an address it was just
    /// asked for, and a web view with no page has nothing to reload, except a
    /// woken tab's restored list, which keeps its Back and Forward this way.
    func retry(_ url: URL, in webView: WKWebView) {
        lastRequested = url
        if webView.backForwardList.currentItem?.url == url, webView.reload() != nil { return }
        webView.load(URLRequest(url: url))
    }

    /// Loads a quiet tab's page as a wake, not a visit, with its saved Back and
    /// Forward list when that list still ends on this page.
    func wake(_ url: URL, in webView: WKWebView, history: Data? = nil) {
        lastRequested = url
        if let history {
            webView.interactionState = history
            if webView.backForwardList.currentItem?.url == url {
                isRestoringHistory = true
                return
            }
        }
        wakeNavigation = webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        tab?.exitReader()
        tab?.readerAvailable = false
        tab?.isLoading = true
        tab?.loadFailure = nil
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // The Start Page's glass clock goes with its page: a load that fails
        // before it commits leaves the page, so the clock stays too.
        tab?.nativeClock.hide()
        tab?.hasCommitted = true
        tab?.loadFailure = nil
        tab?.showIsland()
        committed(navigation, url: webView.url, title: webView.title ?? "")
    }

    /// Test seam: what a committed main-frame navigation reports. A commit
    /// other than the wake's means the wake was left behind.
    func committed(_ navigation: WKNavigation?, url: URL?, title: String) {
        if isRestoringHistory {
            isRestoringHistory = false
            return
        }
        if let wakeNavigation, navigation === wakeNavigation { return }
        wakeNavigation = nil
        if let url { onVisit?(url, title) }
    }

    /// The wake is over once its own load finishes or fails.
    private func settled(_ navigation: WKNavigation?) {
        isRestoringHistory = false
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
        failedBeforeCommit(error, showing: webView.url)
        // The failure view keeps the address that failed, not the Start Page's.
        sync(webView, keepsAddress: tab?.loadFailure != nil)
        settled(navigation)
    }

    /// A tab with no page yet, or only the Start Page, shows the failure in
    /// the page's place, with Try again; behind it the web view stays covered.
    /// A tab that has a page keeps it, and the window says what went wrong.
    func failedBeforeCommit(_ error: Error, showing shown: URL? = nil) {
        guard let tab else { return }
        guard let failure = LoadFailure.from(error, requested: lastRequested) else {
            tab.hasCommitted = true
            return
        }
        let onStartPage = shown?.scheme == "blanc" && shown?.host == "newtab"
        if !tab.hasCommitted || onStartPage {
            tab.loadFailure = failure
        } else if !failure.isUnsupportedAddress {
            onLoadFailure?(failure)
        }
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        // Request Desktop Website: the site is asked for what it gives a Mac.
        preferences.preferredContentMode = tab?.wantsDesktopSite == true ? .desktop : .recommended
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           OSHandoff.schemes.contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel, preferences)
            return
        }
        let mainFrame = navigationAction.targetFrame?.isMainFrame != false
        if mainFrame, navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url, AppLinks.isAppLink(url) {
            onAppLink?(url)
            decisionHandler(.cancel, preferences)
            return
        }
        // A link with the `download` attribute.
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download, preferences)
            return
        }
        if mainFrame, let url = navigationAction.request.url {
            // Existing/restored Settings tabs may reload or traverse their history.
            // New links into Settings open the native sheet instead.
            if (navigationAction.navigationType == .linkActivated || tab?.currentURL.host != "settings"),
               onSettingsNavigation?(url) == true {
                decisionHandler(.cancel, preferences)
                return
            }
            onWillLoadMainFrame?(url)
            // WebKit's own default otherwise: desktop sites on an iPad.
            if wantsMobileSite?(url) == true { preferences.preferredContentMode = .mobile }
        }
        decisionHandler(.allow, preferences)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
        let saves = PageDownloads.isDownload(showable: navigationResponse.canShowMIMEType,
                                             mainFrame: navigationResponse.isForMainFrame, disposition: disposition)
        decisionHandler(saves ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        onDownload?(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        onDownload?(download)
    }

    private func sync(_ webView: WKWebView, finished: Bool = false, keepsAddress: Bool = false) {
        guard let tab else { return }
        tab.isLoading = webView.isLoading
        // A load the reload replaced also fails; the spinner waits for its own.
        if !webView.isLoading { tab.endPullToRefresh() }
        if keepsAddress { return apply(url: nil, title: "", finished: finished) }
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
        // Every time, not only on a change: a typed address sets `currentURL`
        // before its page commits.
        tab.syncPullToRefresh()
        if changed {
            tab.exitReader()
            tab.readerAvailable = false
            tab.probeReader()
            onURLChange?(newURL)
        }
    }
}
