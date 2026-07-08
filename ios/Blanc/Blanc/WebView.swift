import SwiftUI
import WebKit
import UIKit

struct WebView: UIViewRepresentable {
    let model: BrowserModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView
        model.webView = webView
        context.coordinator.load(model.currentURL, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.load(model.currentURL, in: webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: BrowserModel
        weak var webView: WKWebView?
        private var lastRequested: URL?

        init(model: BrowserModel) { self.model = model }

        func load(_ url: URL, in webView: WKWebView) {
            guard url != lastRequested else { return }
            lastRequested = url
            webView.load(URLRequest(url: url))
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.isLoading = true
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { sync(webView) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { sync(webView) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { sync(webView) }

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
            model.isLoading = webView.isLoading
            model.canGoBack = webView.canGoBack
            model.canGoForward = webView.canGoForward
            model.pageTitle = webView.title ?? ""
            if let u = webView.url {
                lastRequested = u
                model.currentURL = u
                model.addressText = u.absoluteString
            }
        }
    }
}
