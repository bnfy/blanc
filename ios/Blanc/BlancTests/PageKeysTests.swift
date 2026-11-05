import XCTest
import WebKit
@testable import Blanc

/// D7: a focused page gets a shortcut first. Offscreen web views never have
/// focus, so these give the page one.
@MainActor
final class PageKeysTests: XCTestCase {
    private func page(_ html: String) async throws -> WKWebView {
        let webView = WKWebView()
        let loaded = expectation(description: "loaded")
        let delegate = Loaded { loaded.fulfill() }
        webView.navigationDelegate = delegate
        webView.loadHTMLString(html, baseURL: URL(string: "https://example.com/"))
        await fulfillment(of: [loaded], timeout: 10)
        _ = delegate
        _ = try await webView.evaluateJavaScript("document.hasFocus = () => true; 0")
        return webView
    }

    private func offer(_ key: String, to webView: WKWebView, shift: Bool = false) async throws -> Bool {
        try await webView.evaluateJavaScript(PageKeys.script(key: key, shift: shift, option: false)) as? Bool ?? false
    }

    private final class Loaded: NSObject, WKNavigationDelegate {
        let done: () -> Void
        init(_ done: @escaping () -> Void) { self.done = done }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { done() }
    }

    func testAPageKeepsOnlyTheKeysItCancels() async throws {
        let webView = try await page("""
        <script>addEventListener('keydown', e => { if (e.metaKey && e.key === 'f') e.preventDefault() })</script>
        """)
        let kept = try await offer("f", to: webView)
        XCTAssertTrue(kept, "a page with its own ⌘F keeps it")
        let passed = try await offer("r", to: webView)
        XCTAssertFalse(passed, "⌘R is Blanc's")
    }

    func testModifiersReachThePage() async throws {
        let webView = try await page("""
        <script>addEventListener('keydown', e => { if (e.metaKey && e.shiftKey && e.key === ']') e.preventDefault() })</script>
        """)
        let plain = try await offer("]", to: webView)
        XCTAssertFalse(plain)
        let shifted = try await offer("]", to: webView, shift: true)
        XCTAssertTrue(shifted)
    }

    func testAnUnfocusedPageIsNeverAsked() async throws {
        let webView = try await page("<script>addEventListener('keydown', e => e.preventDefault())</script>")
        _ = try await webView.evaluateJavaScript("document.hasFocus = () => false; 0")
        let kept = try await offer("f", to: webView)
        XCTAssertFalse(kept)
    }

    func testAQuoteInAKeyStaysInsideItsString() {
        XCTAssertTrue(PageKeys.script(key: "'", shift: false, option: false).contains(#"key: "'""#))
        XCTAssertTrue(PageKeys.script(key: "\"", shift: false, option: false).contains(#"key: "\"""#))
    }
}
