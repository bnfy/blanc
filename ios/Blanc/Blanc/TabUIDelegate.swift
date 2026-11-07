import UIKit
import WebKit

/// Opens a page's new windows (`target=_blank`, `window.open`) as tabs. WebKit
/// passes a copy of the opener's configuration, so a private tab's children
/// share its in-memory web session; the returned view must be built from it.
final class TabUIDelegate: NSObject, WKUIDelegate {
    var onOpenChild: ((WKWebViewConfiguration, URL?) -> WKWebView?)?
    /// Glance (F34): Open Link in Glance in a link's menu, while the
    /// manager says the layout allows it.
    var canGlance: (() -> Bool)?
    var onGlance: ((URL) -> Void)?

    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        onOpenChild?(configuration, navigationAction.request.url)
    }

    /// The link's own menu, with Open Link in Glance after its first entry
    /// (desktop puts it after Open Link in New Tab).
    func webView(_ webView: WKWebView, contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
                 completionHandler: @escaping (UIContextMenuConfiguration?) -> Void) {
        // Always a configuration: nil would take the menu away altogether.
        let url = elementInfo.linkURL.flatMap { Self.glanceable($0) && canGlance?() == true ? $0 : nil }
        completionHandler(UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] suggested in
            guard let url else { return UIMenu(children: suggested) }
            let glance = UIAction(title: SyncCopy.text("contextMenu.openLinkInGlance"),
                                  image: UIImage(systemName: "rectangle.on.rectangle")) { _ in self?.onGlance?(url) }
            var children = suggested
            children.insert(glance, at: min(1, children.count))
            return UIMenu(children: children)
        })
    }

    /// Only web pages open in Glance; mail, phone and other links keep WebKit's menu.
    static func glanceable(_ url: URL) -> Bool { url.scheme == "https" || url.scheme == "http" }
}
