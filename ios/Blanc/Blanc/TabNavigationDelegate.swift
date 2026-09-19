import Foundation
import WebKit
import UIKit

final class TabNavigationDelegate: NSObject, WKNavigationDelegate {
    weak var tab: TabModel?
    private var lastRequested: URL?
    var onURLChange: ((URL) -> Void)?

    func load(_ url: URL, in webView: WKWebView) {
        guard url != lastRequested else { return }
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView,
                 didStartProvisionalNavigation navigation: WKNavigation!) {
        tab?.isLoading = true
    }

    func webView(_ webView: WKWebView,
                 didFinish navigation: WKNavigation!) {
        sync(webView)
        loadFavicon(from: webView)
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        sync(webView)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
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
        decisionHandler(.allow)
    }

    private func sync(_ webView: WKWebView) {
        guard let tab else { return }
        tab.isLoading = webView.isLoading
        tab.canGoBack = webView.canGoBack
        tab.canGoForward = webView.canGoForward
        tab.pageTitle = webView.title ?? ""
        if let u = webView.url {
            lastRequested = u
            applyURL(u, to: tab)
        }
    }

    /// Read same-origin favicons through the page's WebKit context, so the
    /// request follows the tab's content-blocking and cookie policy.
    private func loadFavicon(from webView: WKWebView) {
        guard let tab, let pageURL = webView.url,
              ["http", "https"].contains(pageURL.scheme?.lowercased() ?? "") else { return }

        let script = """
        const link = document.querySelector('link[rel~="icon"][href]');
        const candidates = [link?.href, new URL('/favicon.ico', location.href).href];
        for (const candidate of candidates) {
            if (!candidate) continue;
            try {
                const url = new URL(candidate, location.href);
                if (url.origin !== location.origin) continue;
                const response = await fetch(url.href, { credentials: 'same-origin' });
                if (!response.ok) continue;
                const blob = await response.blob();
                if (!blob.type.startsWith('image/') || blob.size > 131072) continue;
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 32;
                canvas.getContext('2d').drawImage(bitmap, 0, 0, 32, 32);
                return canvas.toDataURL('image/png');
            } catch (_) { /* Try the next same-origin icon. */ }
        }
        return null;
        """

        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak tab] result in
            guard case .success(let value) = result,
                  let tab, tab.currentURL == pageURL,
                  let encoded = value as? String,
                  let comma = encoded.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(encoded.suffix(from: encoded.index(after: comma)))),
                  UIImage(data: data) != nil else { return }
            tab.faviconData = data
        }
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
            tab.faviconData = nil
            onURLChange?(newURL)
        }
    }
}
