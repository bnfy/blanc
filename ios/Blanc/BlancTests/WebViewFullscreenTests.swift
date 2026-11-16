import WebKit
import XCTest
@testable import Blanc

/// A page can only put a video or another element full screen when the web
/// view's configuration allows it; WebKit leaves it off by default, and then
/// a site's own full screen button does nothing (or is hidden) on iPad.
final class WebViewFullscreenTests: XCTestCase {
    @MainActor private func makeConfiguration() -> WKWebViewConfiguration {
        let manager = TabsManager(
            settingsDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
            sessionDirectory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        return WebViewConfiguration.make(
            schemeHandler: BlancSchemeHandler(), bridge: PagesBridge(manager: manager),
            dataStore: .nonPersistent())
    }

    @MainActor func testTabsAllowElementFullscreen() {
        XCTAssertTrue(makeConfiguration().preferences.isElementFullscreenEnabled)
    }

    /// What a site checks before it offers its full screen button.
    @MainActor func testPagesSeeFullscreenAsAvailableOnIPad() async throws {
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "Element full screen is an iPad feature")
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: makeConfiguration())
        let loaded = expectation(description: "page loaded")
        let delegate = LoadDelegate { loaded.fulfill() }
        webView.navigationDelegate = delegate
        webView.loadHTMLString("<video></video>", baseURL: URL(string: "https://example.com/"))
        await fulfillment(of: [loaded], timeout: 30)
        let enabled = try await webView.evaluateJavaScript("document.fullscreenEnabled") as? Bool
        XCTAssertEqual(enabled, true)
    }
}

private final class LoadDelegate: NSObject, WKNavigationDelegate {
    private let done: () -> Void
    init(done: @escaping () -> Void) { self.done = done }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done() }
}
