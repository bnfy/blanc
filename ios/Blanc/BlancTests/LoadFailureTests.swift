import XCTest
import UIKit
import WebKit
@testable import Blanc

/// A load that fails before its page shows: a tab with nothing to show says
/// so in the page's place, and a tab that has a page keeps it.
@MainActor final class LoadFailureTests: XCTestCase {
    private let address = URL(string: "https://blanc.invalid/page")!

    private func error(_ code: Int, domain: String = NSURLErrorDomain, names url: URL? = nil) -> NSError {
        var info: [String: Any] = [NSLocalizedDescriptionKey: "It didn’t load."]
        if let url { info[NSURLErrorFailingURLErrorKey] = url }
        return NSError(domain: domain, code: code, userInfo: info)
    }

    private func blankTab() -> TabModel {
        TabModel(url: URL(string: "https://blanc.invalid/")!, configuration: WKWebViewConfiguration(), load: false)
    }

    func testAStoppedOrHandledLoadIsNoFailure() {
        XCTAssertNil(LoadFailure.from(error(NSURLErrorCancelled)))
        XCTAssertNil(LoadFailure.from(error(102, domain: "WebKitErrorDomain")), "a load Blanc cancelled itself")
        XCTAssertNil(LoadFailure.from(error(204, domain: "WebKitErrorDomain")), "a video playing in the page's place")
    }

    func testAFailureNamesItsAddressAndReason() {
        let failure = LoadFailure.from(error(NSURLErrorNotConnectedToInternet, names: address))
        XCTAssertEqual(failure, LoadFailure(url: address, reason: "It didn’t load.", isUnsupportedAddress: false))
        XCTAssertEqual(LoadFailure.from(error(NSURLErrorTimedOut), requested: address)?.url, address,
                       "the address asked for, when the error names none")
        XCTAssertEqual(LoadFailure.from(error(NSURLErrorUnsupportedURL))?.isUnsupportedAddress, true)
    }

    func testATabWithNoPageShowsTheFailure() {
        let tab = blankTab()
        var told: [LoadFailure] = []
        tab.navigationDelegate.onLoadFailure = { told.append($0) }
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address))
        XCTAssertEqual(tab.loadFailure?.url, address)
        XCTAssertFalse(tab.hasCommitted, "the empty web view stays covered")
        XCTAssertTrue(told.isEmpty)
    }

    func testATabWithAPageKeepsItAndSaysWhy() {
        let tab = blankTab()
        tab.hasCommitted = true
        var told: [LoadFailure] = []
        tab.navigationDelegate.onLoadFailure = { told.append($0) }
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address))
        XCTAssertNil(tab.loadFailure)
        XCTAssertEqual(told.map(\.reason), ["It didn’t load."])
    }

    func testAnAddressTypedOnTheStartPageShowsTheFailure() {
        let tab = blankTab()
        tab.hasCommitted = true
        var told: [LoadFailure] = []
        tab.navigationDelegate.onLoadFailure = { told.append($0) }
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address),
                                                  showing: URL(string: "blanc://newtab/")!)
        XCTAssertEqual(tab.loadFailure?.url, address, "the Start Page is no page to keep")
        XCTAssertTrue(told.isEmpty)
    }

    func testAnAppLinkBehindAPageSaysNothing() {
        let tab = blankTab()
        tab.hasCommitted = true
        var told: [LoadFailure] = []
        tab.navigationDelegate.onLoadFailure = { told.append($0) }
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorUnsupportedURL))
        XCTAssertTrue(told.isEmpty)
        XCTAssertNil(tab.loadFailure)
    }

    func testAStoppedLoadUncoversTheTab() {
        let tab = blankTab()
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorCancelled))
        XCTAssertNil(tab.loadFailure)
        XCTAssertTrue(tab.hasCommitted)
    }

    func testANewLoadTakesTheFailureAway() {
        let tab = blankTab()
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address))
        tab.navigationDelegate.webView(tab.webView, didStartProvisionalNavigation: nil)
        XCTAssertNil(tab.loadFailure)
    }

    func testReloadTriesTheFailedAddressAgain() {
        let tab = blankTab()
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address))
        XCTAssertFalse(tab.webView.isLoading)
        tab.reload()
        XCTAssertTrue(tab.webView.isLoading, "a web view with no page has nothing to reload")
    }

    func testAFailedTabKeepsNoPicture() {
        let tab = blankTab()
        tab.thumbnail = UIImage()
        tab.navigationDelegate.failedBeforeCommit(error(NSURLErrorNotConnectedToInternet, names: address))
        tab.captureThumbnail()
        XCTAssertNil(tab.thumbnail, "its card names the site instead of showing an empty page")
    }
}
