import XCTest
import WebKit
@testable import Blanc

final class TabModelTests: XCTestCase {
    func testInitSetsURL() {
        let tab = TabModel(url: URL(string: "https://example.com")!)
        XCTAssertEqual(tab.currentURL.absoluteString, "https://example.com")
        XCTAssertEqual(tab.addressText, "https://example.com")
    }

    func testInitCreatesWebViewAndDelegate() {
        let tab = TabModel(url: URL(string: "https://example.com")!)
        XCTAssertNotNil(tab.webView)
        XCTAssertNotNil(tab.navigationDelegate)
        XCTAssertTrue(tab.webView.navigationDelegate === tab.navigationDelegate)
    }

    func testSubmitAddressNormalizesQuery() {
        let tab = TabModel(url: URL(string: "https://example.com")!)
        let normalizer = AddressNormalizer(searchEngine: .duckduckgo)
        tab.addressText = "hello world"
        tab.submitAddress(using: normalizer)
        XCTAssertEqual(tab.currentURL.absoluteString,
                       "https://duckduckgo.com/?q=hello%20world")
    }

    func testSubmitAddressNormalizesDomain() {
        let tab = TabModel(url: URL(string: "https://example.com")!)
        let normalizer = AddressNormalizer(searchEngine: .duckduckgo)
        tab.addressText = "apple.com"
        tab.submitAddress(using: normalizer)
        XCTAssertEqual(tab.currentURL.absoluteString, "https://apple.com")
    }

    func testSubmitAddressHandoffDoesNotNavigate() {
        let tab = TabModel(url: URL(string: "https://example.com")!)
        let normalizer = AddressNormalizer(searchEngine: .duckduckgo)
        tab.addressText = "mailto:test@example.com"
        tab.submitAddress(using: normalizer)
        XCTAssertEqual(tab.currentURL.absoluteString, "https://example.com")
    }

    func testUniqueIds() {
        let a = TabModel(url: URL(string: "https://a.test")!)
        let b = TabModel(url: URL(string: "https://b.test")!)
        XCTAssertNotEqual(a.id, b.id)
    }

    // MARK: Pull to refresh (F56)

    /// A refresh control only spins on screen: shows the tab's web view in a
    /// window and starts its spinner, as a pull does.
    private func pulling(_ tab: TabModel) throws -> (UIRefreshControl, UIWindow) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        tab.webView.frame = window.bounds
        window.addSubview(tab.webView)
        window.isHidden = false
        let control = try XCTUnwrap(tab.refreshControl)
        control.beginRefreshing()
        XCTAssertTrue(control.isRefreshing)
        return (control, window)
    }

    func testWebPageGetsTheRefreshControl() throws {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), load: false)
        let control = try XCTUnwrap(tab.refreshControl)
        XCTAssertTrue(tab.webView.scrollView.refreshControl === control)
        XCTAssertEqual(control.accessibilityLabel, SyncCopy.text("ios.island.reload"))
    }

    func testStartPageNeverPullsToRefresh() {
        let tab = TabModel(url: TabsManager.newTabURL, configuration: WKWebViewConfiguration(), load: false)
        XCTAssertNil(tab.webView.scrollView.refreshControl)
        XCTAssertFalse(TabModel.allowsPullToRefresh(TabsManager.newTabURL))
        XCTAssertTrue(TabModel.allowsPullToRefresh(URL(string: "blanc://history/")!))
    }

    func testControlFollowsTheAddress() {
        let tab = TabModel(url: TabsManager.newTabURL, configuration: WKWebViewConfiguration(), load: false)
        tab.navigationDelegate.applyURL(URL(string: "https://example.com/")!, to: tab)
        XCTAssertNotNil(tab.webView.scrollView.refreshControl)
        tab.navigationDelegate.applyURL(TabsManager.newTabURL, to: tab)
        XCTAssertNil(tab.webView.scrollView.refreshControl)
    }

    func testTypedAddressGetsTheControlWhenItsPageCommits() {
        let tab = TabModel(url: TabsManager.newTabURL, configuration: WKWebViewConfiguration(), load: false)
        let url = URL(string: "https://example.com/")!
        tab.currentURL = url // what submitAddress does before the load
        tab.navigationDelegate.applyURL(url, to: tab)
        XCTAssertNotNil(tab.webView.scrollView.refreshControl)
    }

    func testQuietTabHasNoControlUntilItWakes() {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), quiet: true)
        XCTAssertNil(tab.existingWebView)
        XCTAssertNil(tab.refreshControl)
        tab.wake()
        XCTAssertNotNil(tab.refreshControl)
        XCTAssertTrue(tab.existingWebView?.scrollView.refreshControl === tab.refreshControl)
    }

    func testPullWithNothingToReloadStopsTheSpinner() throws {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), load: false)
        let (control, window) = try pulling(tab)
        defer { window.isHidden = true }
        control.sendActions(for: .valueChanged)
        XCTAssertFalse(control.isRefreshing)
    }

    func testPullReloadsThePageAndStopsWhenItFinishes() throws {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), load: false)
        let webView = tab.webView
        webView.loadHTMLString("<p>Page</p>", baseURL: nil)
        wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !webView.isLoading && webView.url != nil }, object: nil)], timeout: 10)
        let (control, window) = try pulling(tab)
        defer { window.isHidden = true }
        control.sendActions(for: .valueChanged)
        XCTAssertTrue(webView.isLoading, "the pull reloads the page")
        XCTAssertTrue(control.isRefreshing, "the spinner waits for the reload")
        wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !control.isRefreshing }, object: nil)], timeout: 10)
    }

    func testFailedLoadStopsTheSpinner() throws {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), load: false)
        let (control, window) = try pulling(tab)
        defer { window.isHidden = true }
        tab.navigationDelegate.webView(tab.webView, didFailProvisionalNavigation: nil, withError: URLError(.notConnectedToInternet))
        XCTAssertFalse(control.isRefreshing)
    }

    func testStopEndsTheSpinner() throws {
        let tab = TabModel(url: URL(string: "https://example.com")!, configuration: WKWebViewConfiguration(), load: false)
        let (control, window) = try pulling(tab)
        defer { window.isHidden = true }
        tab.stop()
        XCTAssertFalse(control.isRefreshing)
    }
}
