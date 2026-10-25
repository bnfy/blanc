import Foundation
import WebKit

/// Builds a `WKWebViewConfiguration` that serves `blanc://` from the bundle
/// and injects the `window.bowserPages` bridge. The handler and bridge are
/// shared (stateless / keyed off `message.webView`), so the same instances
/// are installed on every tab's configuration.
enum WebViewConfiguration {
    static func make(
        schemeHandler: BlancSchemeHandler, bridge: PagesBridge,
        dataStore: WKWebsiteDataStore = .default()
    ) -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = dataStore
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "blanc")

        if let url = Bundle.main.url(forResource: "ios-start-rules", withExtension: "js", subdirectory: "pages"),
           let rules = try? String(contentsOf: url, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(
                source: "if (location.protocol === 'blanc:') {\n" + rules + "\n}",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let userScript = WKUserScript(
            source: PagesBridge.userScriptSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
        config.userContentController.addUserScript(userScript)
        config.userContentController.add(bridge, name: PagesBridge.messageHandlerName)
        return config
    }
}
