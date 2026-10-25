import Observation
import Foundation
import WebKit
import UIKit

@Observable
final class TabModel: Identifiable {
    let id = UUID()
    var addressText: String
    var currentURL: URL
    var canGoBack = false
    var canGoForward = false
    var isLoading = false
    var pageTitle = ""
    var thumbnail: UIImage?

    let nativeClock = NativeClockOverlay()
    let webView: WKWebView
    let navigationDelegate: TabNavigationDelegate

    init(url: URL, configuration: WKWebViewConfiguration) {
        self.currentURL = url
        self.addressText = url.absoluteString
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        self.navigationDelegate = TabNavigationDelegate()
        navigationDelegate.tab = self
        webView.navigationDelegate = navigationDelegate
        navigationDelegate.load(url, in: webView)
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

    /// In-memory square preview of the last visible page, including native glass.
    /// Never mount or load background tabs just to produce a thumbnail.
    @MainActor
    func captureThumbnail(allowCovered: Bool = false) {
        guard let window = webView.window, allowCovered || window.rootViewController?.presentedViewController == nil,
              webView.bounds.width > 0, webView.bounds.height > 0 else { return }
        let side: CGFloat = 320
        let scale = side / min(webView.bounds.width, webView.bounds.height)
        let size = CGSize(width: webView.bounds.width * scale, height: webView.bounds.height * scale)
        let rect = CGRect(x: (side - size.width) / 2, y: currentURL.scheme == "blanc" ? (side - size.height) / 2 : 0, width: size.width, height: size.height)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        // WebKit's remote surface cannot be drawn directly into a scaled
        // hierarchy rect. Capture at its real size, then crop/downsample.
        var drawn = false
        let full = UIGraphicsImageRenderer(bounds: webView.bounds, format: format).image { _ in
            drawn = webView.drawHierarchy(in: webView.bounds, afterScreenUpdates: true)
        }
        guard drawn else { return }
        thumbnail = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            full.draw(in: rect)
        }
    }

    @MainActor
    func capturePreparedThumbnail() async {
        let url = currentURL
        if url.scheme == "blanc" {
            captureThumbnail(allowCovered: true)
            return
        }
        let configuration = WKSnapshotConfiguration()
        configuration.snapshotWidth = 320
        guard let full = try? await webView.takeSnapshot(configuration: configuration),
              currentURL == url, !Task.isCancelled, full.size.width > 0, full.size.height > 0 else { return }
        let side: CGFloat = 320
        let factor = side / min(full.size.width, full.size.height)
        let size = CGSize(width: full.size.width * factor, height: full.size.height * factor)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        thumbnail = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            full.draw(in: CGRect(x: (side - size.width) / 2, y: 0, width: size.width, height: size.height))
        }
    }

    func goBack()    { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload()    { webView.reload() }
    func stop()      { webView.stopLoading() }
}
