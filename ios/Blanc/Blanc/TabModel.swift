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
    /// Whether the web view has committed a page yet. Until then it would show
    /// WebKit's blank white, so the page area keeps the theme's background.
    var hasCommitted = false
    var pageTitle = ""
    /// Never saved, synced or recorded in History; its web data lives only in
    /// memory (`TabsManager.privateDataStore`).
    let isPrivate: Bool
    var thumbnail: UIImage?
    /// The whole page, for growing out of its card. Kept apart from `thumbnail`
    /// so a new picture never redraws the grid.
    @ObservationIgnored var pagePicture: UIImage?
    /// How far down the page's content began in that picture: off screen, a
    /// web view has no safe area to clear.
    @ObservationIgnored var pagePictureTop: CGFloat = 0
    /// The group this tab belongs to (M17), nil when ungrouped.
    var groupId: String?
    var pinned = false
    /// The shared record's id while this tab is in a shared Space (M17c).
    var sharedTabId: String?
    var reader: ReaderController? {
        didSet {
            readerPinch = reader.map { PagePinchWatcher(webView: $0.webView) { [weak self] in self?.onPagePinch?($0) } }
        }
    }
    var readerAvailable = false
    var readerGeneration = 0
    var readerAllowed = true
    var readerBusy = false
    @ObservationIgnored private var readerURLObservation: NSKeyValueObservation?
    @ObservationIgnored private var titleObservation: NSKeyValueObservation?
    @ObservationIgnored private var historyObservations: [NSKeyValueObservation] = []
    /// Off once the person clears their history or site data: a live web view
    /// can't forget its list, so it just never goes to disk.
    @ObservationIgnored var savesHistory = true
    /// Which saved Back and Forward list is this tab's; kept across a relaunch.
    @ObservationIgnored var historyId = UUID().uuidString
    /// A pinch in on the page, which moves it into the tab grid.
    @ObservationIgnored var onPagePinch: ((PagePinchUpdate) -> Void)?
    @ObservationIgnored private var pagePinch: PagePinchWatcher?
    @ObservationIgnored private var readerPinch: PagePinchWatcher?
    @ObservationIgnored private var pageColorObservation: NSKeyValueObservation?
    @ObservationIgnored private var scrollObservation: NSKeyValueObservation?
    /// Whether the Island has tucked away for this page's scrolling. Changed
    /// only when it flips, so scrolling doesn't redraw the browser each frame.
    private(set) var islandTucked = false
    @ObservationIgnored private var islandTuck = IslandTuck()

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
        syncPullToRefresh()
        return view
    }
    /// F56: pulling a page down reloads it, as Safari does. Made with the web
    /// view, so a quiet tab has none until it wakes.
    @ObservationIgnored private(set) var refreshControl: UIRefreshControl?

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

    /// Loads a quiet tab's page, with its saved Back and Forward list if it has
    /// one; nothing for a tab that is already live.
    func wake(history: Data? = nil) {
        guard isQuiet else { return }
        isQuiet = false
        navigationDelegate.wake(currentURL, in: webView, history: history)
    }

    private func makeWebView() -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.isFindInteractionEnabled = true
        webView.navigationDelegate = navigationDelegate
        webView.uiDelegate = uiDelegate
        pagePinch = PagePinchWatcher(webView: webView) { [weak self] in self?.onPagePinch?($0) }
        // pushState/replaceState and fragment changes do not consistently
        // produce a finished navigation. Invalidate stale reader snapshots
        // from WebKit's actual document URL as well as delegate callbacks.
        readerURLObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            Task { @MainActor [weak self, weak webView] in
                guard let self, let url = webView?.url else { return }
                self.navigationDelegate.applyURL(url, to: self)
            }
        }
        // Many pages set their real title after they finish loading.
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] webView, _ in
            Task { @MainActor [weak self, weak webView] in
                guard let self, let title = webView?.title else { return }
                self.navigationDelegate.applyTitle(title)
            }
        }
        // Sites that change pages with pushState finish no navigation, so Back
        // and Forward follow WebKit directly.
        historyObservations = [
            webView.observe(\.canGoBack, options: [.new]) { [weak self] webView, _ in
                Task { @MainActor [weak self, weak webView] in
                    if let webView { self?.canGoBack = webView.canGoBack }
                }
            },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] webView, _ in
                Task { @MainActor [weak self, weak webView] in
                    if let webView { self?.canGoForward = webView.canGoForward }
                }
            },
        ]
        // The pull's spinner and the Island take the style that shows against
        // the page.
        pageColorObservation = webView.observe(\.underPageBackgroundColor, options: [.new]) { [weak self] _, _ in
            Task { @MainActor [weak self] in self?.matchRefreshControlToPage() }
        }
        // KVO on the scroll view reports on the main thread, frame by frame;
        // the Island has to follow the scroll that same frame.
        scrollObservation = webView.scrollView.observe(\.contentOffset, options: [.old, .new]) { [weak self] scrollView, change in
            MainActor.assumeIsolated {
                guard let self, let old = change.oldValue, let new = change.newValue, old.y != new.y else { return }
                self.pageScrolled(scrollView, from: old.y, to: new.y)
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
    func captureThumbnail(allowCovered: Bool = false, afterScreenUpdates: Bool = true) {
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
            drawn = webView.drawHierarchy(in: webView.bounds, afterScreenUpdates: afterScreenUpdates)
        }
        guard drawn else { return }
        pagePicture = full
        pagePictureTop = webView.safeAreaInsets.top
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
        // 320 on the short side: a page wider than tall would otherwise be scaled up.
        let bounds = webView.bounds.size
        configuration.snapshotWidth = NSNumber(value: Double(320 * max(1, bounds.width / max(bounds.height, 1))))
        guard let full = try? await webView.takeSnapshot(configuration: configuration),
              currentURL == url, !Task.isCancelled, full.size.width > 0, full.size.height > 0 else { return }
        let side: CGFloat = 320
        let factor = side / min(full.size.width, full.size.height)
        let size = CGSize(width: full.size.width * factor, height: full.size.height * factor)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        pagePicture = UIGraphicsImageRenderer(size: full.size, format: format).image { _ in full.draw(at: .zero) }
        pagePictureTop = webView.safeAreaInsets.top
        format.scale = 1
        thumbnail = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            full.draw(in: CGRect(x: (side - size.width) / 2, y: 0, width: size.width, height: size.height))
        }
    }

    /// The Start Page keeps its Island: it's the page's own address bar.
    private func pageScrolled(_ scrollView: UIScrollView, from old: CGFloat, to new: CGFloat) {
        guard Self.allowsPullToRefresh(currentURL) else {
            showIsland()
            return
        }
        let inset = scrollView.adjustedContentInset
        islandTuck.scrolled(from: old,
                            to: IslandTuck.Position(offset: new,
                                                    contentHeight: scrollView.contentSize.height,
                                                    viewportHeight: scrollView.bounds.height,
                                                    topInset: inset.top,
                                                    bottomInset: inset.bottom),
                            byPerson: scrollView.isTracking || scrollView.isDecelerating)
        if islandTucked != islandTuck.isTucked { islandTucked = islandTuck.isTucked }
    }

    /// Brings the Island back: a new page, or this tab shown again.
    func showIsland() {
        islandTuck.show()
        if islandTucked { islandTucked = false }
    }

    func goBack() { storage?.goBack() }
    func goForward() { storage?.goForward() }
    func reload() { storage?.reload() }
    func stop() {
        storage?.stopLoading()
        endPullToRefresh()
    }

    /// The Start Page paints beneath the status bar and has nothing to fetch,
    /// so it never pulls to refresh; every other page does.
    static func allowsPullToRefresh(_ url: URL) -> Bool {
        !(url.scheme == "blanc" && url.host == "newtab")
    }

    /// Puts the refresh control on the page's scroll view, or takes it off,
    /// for the address now showing. UIKit only starts it from a drag at the
    /// top of the page, so a page scrolled down just scrolls back up.
    func syncPullToRefresh() {
        guard let scrollView = storage?.scrollView else { return }
        if Self.allowsPullToRefresh(currentURL) {
            let control = refreshControl ?? makeRefreshControl()
            refreshControl = control
            if scrollView.refreshControl !== control { scrollView.refreshControl = control }
            matchRefreshControlToPage()
        } else if scrollView.refreshControl != nil {
            endPullToRefresh()
            scrollView.refreshControl = nil
        }
    }

    /// Whether the page's own background is light or dark (`.unspecified`
    /// when it shows no solid color). The Island's glass takes it, so it reads
    /// as dark glass on a dark site whatever Blanc's theme.
    private(set) var pageStyle: UIUserInterfaceStyle = .unspecified

    /// The system spinner in its light or dark style, whichever shows against
    /// the page: in dark mode its light spinner vanishes on a white page.
    func matchRefreshControlToPage() {
        guard let webView = storage else { return }
        let page = webView.underPageBackgroundColor.resolvedColor(with: webView.traitCollection)
        let style = Self.spinnerStyle(on: page)
        if pageStyle != style { pageStyle = style }
        refreshControl?.overrideUserInterfaceStyle = style
    }

    /// `.unspecified` (the system's own) when the page shows no solid color.
    static func spinnerStyle(on background: UIColor) -> UIUserInterfaceStyle {
        var white: CGFloat = 0, alpha: CGFloat = 0
        guard background.getWhite(&white, alpha: &alpha), alpha > 0.5 else { return .unspecified }
        return white < 0.5 ? .dark : .light
    }

    private func makeRefreshControl() -> UIRefreshControl {
        let control = UIRefreshControl()
        control.accessibilityLabel = SyncCopy.text("ios.island.reload")
        control.addAction(UIAction { [weak self] _ in self?.pulledToRefresh() }, for: .valueChanged)
        return control
    }

    /// The Island's Reload, from a pull. Reader covers the page with its own
    /// web view, so a pull never reaches the page beneath it. With no page to
    /// reload the spinner stops at once: WebKit hands back a navigation even
    /// then, and nothing would ever finish it.
    func pulledToRefresh() {
        if reader != nil || storage?.url == nil || storage?.reload() == nil { endPullToRefresh() }
    }

    /// Called when a load finishes or fails (`TabNavigationDelegate`).
    func endPullToRefresh() {
        guard let refreshControl, refreshControl.isRefreshing else { return }
        refreshControl.endRefreshing()
    }
}
