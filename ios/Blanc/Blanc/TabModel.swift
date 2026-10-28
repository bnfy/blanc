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
    /// Never saved, synced or recorded in History; its web data lives only in
    /// memory (`TabsManager.privateDataStore`).
    let isPrivate: Bool
    var thumbnail: UIImage?
    /// The group this tab belongs to (M17), nil when ungrouped.
    var groupId: String?
    var pinned = false
    /// The shared record's id while this tab is in a shared Space (M17c).
    var sharedTabId: String?
    var reader: ReaderController?
    var readerAvailable = false
    var readerGeneration = 0
    var readerAllowed = true
    var readerBusy = false
    @ObservationIgnored private var readerURLObservation: NSKeyValueObservation?

    let nativeClock = NativeClockOverlay()
    let navigationDelegate: TabNavigationDelegate
    let uiDelegate = TabUIDelegate()
    /// M17: a quiet tab holds its address and title and has made no web view
    /// yet; it loads when it is first shown (`wake()`).
    private(set) var isQuiet: Bool
    @ObservationIgnored private let configuration: WKWebViewConfiguration
    @ObservationIgnored private var storage: WKWebView?
    var hasWebView: Bool { storage != nil }
    /// The web view if this tab has made one. Lookups across every tab use
    /// this, so they never make one for a quiet tab.
    var existingWebView: WKWebView? { storage }
    /// The tab's web view, made on first use (without loading anything).
    var webView: WKWebView {
        if let storage { return storage }
        let view = makeWebView()
        storage = view
        return view
    }

    /// `load: false` is for a page-opened tab, whose request WebKit loads itself.
    /// `quiet: true` makes no web view until `wake()`.
    init(url: URL, title: String = "", configuration: WKWebViewConfiguration, isPrivate: Bool = false,
         quiet: Bool = false, load: Bool = true) {
        self.isPrivate = isPrivate
        self.currentURL = url
        self.addressText = url.absoluteString
        self.pageTitle = title
        self.configuration = configuration
        self.isQuiet = quiet
        self.navigationDelegate = TabNavigationDelegate()
        navigationDelegate.tab = self
        if !quiet {
            _ = webView
            if load { navigationDelegate.load(url, in: webView) }
        }
    }

    /// Loads a quiet tab's page; nothing for a tab that is already live.
    func wake() {
        guard isQuiet else { return }
        isQuiet = false
        navigationDelegate.load(currentURL, in: webView)
    }

    private func makeWebView() -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.isFindInteractionEnabled = true
        webView.navigationDelegate = navigationDelegate
        webView.uiDelegate = uiDelegate
        // pushState/replaceState and fragment changes do not consistently
        // produce a finished navigation. Invalidate stale reader snapshots
        // from WebKit's actual document URL as well as delegate callbacks.
        readerURLObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            Task { @MainActor [weak self, weak webView] in
                guard let self, let url = webView?.url else { return }
                self.navigationDelegate.applyURL(url, to: self)
            }
        }
        return webView
    }

    /// Convenience initializer for tests and previews — uses a bare web-view
    /// configuration (no `blanc://` scheme handler or bridge). Production tabs
    /// are built by `TabsManager.createTab`, which threads the configured
    /// setup through `WebViewConfiguration.make`.
    convenience init(url: URL) {
        self.init(url: url, configuration: WKWebViewConfiguration())
    }

    func submitAddress(using normalizer: AddressNormalizer) {
        exitReader()
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
        guard let webView = storage, let window = webView.window, allowCovered || window.rootViewController?.presentedViewController == nil,
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
        guard let webView = storage else { return }
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

    func goBack() { storage?.goBack() }
    func goForward() { storage?.goForward() }
    func reload() { storage?.reload() }
    func stop() { storage?.stopLoading() }
}
