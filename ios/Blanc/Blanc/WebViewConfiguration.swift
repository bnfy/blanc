import Foundation
import WebKit

/// Builds a `WKWebViewConfiguration` that serves `blanc://` from the bundle
/// and injects the `window.bowserPages` bridge. The handler and bridge are
/// shared (stateless / keyed off `message.webView`), so the same instances
/// are installed on every tab's configuration.
enum WebViewConfiguration {
    static func make(
        schemeHandler: BlancSchemeHandler, bridge: PagesBridge,
        dataStore: WKWebsiteDataStore = .default(),
        startPageHold: StartPageHold? = nil,
        startPageBridge: StartPageBridge? = nil
    ) -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = dataStore
        config.setURLSchemeHandler(schemeHandler, forURLScheme: "blanc")
        // WebKit hides the Fullscreen API from pages unless asked, and then a
        // site's own full screen button does nothing on iPad.
        config.preferences.isElementFullscreenEnabled = true

        let userScript = WKUserScript(
            source: PagesBridge.userScriptSource,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
        config.userContentController.addUserScript(userScript)
        config.userContentController.add(bridge, name: PagesBridge.messageHandlerName)
        // The Start Page is the desktop fork's, which asks native code over
        // its own channel (`chrome.send`), as on Android.
        if let startPageBridge {
            config.userContentController.addUserScript(WKUserScript(
                source: StartPageBridge.userScriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            config.userContentController.add(startPageBridge, name: StartPageBridge.messageHandlerName)
        }
        if let startPageHold {
            config.userContentController.addUserScript(WKUserScript(
                source: StartPageHold.userScriptSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            config.userContentController.add(startPageHold, name: StartPageHold.messageHandlerName)
        }
        return config
    }
}
