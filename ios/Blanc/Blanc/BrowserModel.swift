import Observation
import Foundation
import WebKit

@Observable
final class BrowserModel {
    var addressText: String
    var currentURL: URL
    var canGoBack = false
    var canGoForward = false
    var isLoading = false
    var pageTitle = ""

    @ObservationIgnored weak var webView: WKWebView?

    private let normalizer = AddressNormalizer(searchEngine: BlancSettingsDefaults.searchEngine)

    init(start: URL) {
        self.currentURL = start
        self.addressText = start.absoluteString
    }

    func submitAddress() {
        if OSHandoff.isHandoff(addressText) {
            OSHandoff.open(addressText)
            return
        }
        let dest = normalizer.normalize(addressText)
        currentURL = dest
        addressText = dest.absoluteString
    }

    func goBack()    { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload()    { webView?.reload() }
    func stop()      { webView?.stopLoading() }
}
