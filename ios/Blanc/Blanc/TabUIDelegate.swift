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
        if StartPageBridge.isStartPage(webView.url), let link = elementInfo.linkURL, Self.glanceable(link) {
            return startPageMenu(webView, link: link, completionHandler: completionHandler)
        }
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

    /// Opens a link in a new tab (the Start Page shortcut menu's entry).
    var onOpenInNewTab: ((URL) -> Void)?

    /// A Start Page shortcut or favorite, long-pressed: iOS's own menu (and its
    /// haptic) with the page's choices first. The page (ios-start.js) says what
    /// the tile allows and presses its own pin and hide buttons, so these work
    /// exactly as the fork's page does them; iOS's Copy Link and Share follow.
    private func startPageMenu(_ webView: WKWebView, link: URL,
                               completionHandler: @escaping (UIContextMenuConfiguration?) -> Void) {
        let href = JSONValue.string(link.absoluteString).serialized
        webView.evaluateJavaScript(PagesBridge.guardedScript(
            "return JSON.stringify(window.blancIosShortcut?.state(\(href)) ?? null);", host: "newtab")) { [weak self, weak webView] result, _ in
            let state = (result as? String).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String: Any] }
            completionHandler(UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { suggested in
                guard let self, let state else { return UIMenu(children: suggested) }
                let run = { (call: String) in
                    webView?.evaluateJavaScript(PagesBridge.guardedScript("window.blancIosShortcut?.\(call)(\(href));", host: "newtab"))
                }
                var actions: [UIMenuElement] = []
                if state["canPin"] as? Bool == true {
                    let pinned = state["pinned"] as? Bool == true
                    actions.append(UIAction(title: SyncCopy.text(pinned ? "tabMenu.unpinStartPage" : "tabMenu.pinStartPage"),
                                            image: UIImage(systemName: pinned ? "pin.slash" : "pin")) { _ in run("pin") })
                }
                actions.append(UIAction(title: SyncCopy.text("contextMenu.openLinkInNewTab"),
                                        image: UIImage(systemName: "plus.square.on.square")) { _ in self.onOpenInNewTab?(link) })
                if self.canGlance?() == true {
                    actions.append(UIAction(title: SyncCopy.text("contextMenu.openLinkInGlance"),
                                            image: UIImage(systemName: "rectangle.on.rectangle")) { _ in self.onGlance?(link) })
                }
                if state["canHide"] as? Bool == true {
                    let title = state["title"] as? String ?? ""
                    actions.append(UIAction(title: SyncCopy.text("newtab.billboard.hideTitle", ["title": title]),
                                            image: UIImage(systemName: "eye.slash"), attributes: .destructive) { _ in run("hide") })
                }
                return UIMenu(children: [UIMenu(options: .displayInline, children: actions),
                                         UIMenu(options: .displayInline, children: suggested)])
            })
        }
    }

    /// Only web pages open in Glance; mail, phone and other links keep WebKit's menu.
    static func glanceable(_ url: URL) -> Bool { url.scheme == "https" || url.scheme == "http" }

    // MARK: A page closing itself

    /// `window.close()`: set only for a tab a page opened (a sign-in popup
    /// closes itself when it's done), never for one the person opened.
    var onClose: (() -> Void)?

    func webViewDidClose(_ webView: WKWebView) { onClose?() }

    // MARK: Camera and microphone

    /// Websites get neither. Blanc asks iOS for the camera only to scan a
    /// pairing code, and iOS's prompt says so; until Blanc has its own
    /// permission prompts (F13), a page's request is refused rather than
    /// shown under that sentence.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    // MARK: JavaScript dialogs

    // Without these WebKit answers for the person: `alert` shows nothing,
    // `confirm` is always false and `prompt` always null, so a page's "Delete
    // this?" or "Leave without saving?" quietly never goes ahead.

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        // An alert has nothing to answer: it only has to hear that it closed.
        let answer = DialogAnswer(unanswered: true) { _ in completionHandler() }
        guard let presenter = PageDialog.presenter(for: webView) else { return answer(true) }
        let alert = PageDialog.make(message, from: frame, in: webView)
        alert.addAction(UIAlertAction(title: SyncCopy.text("dialog.ok"), style: .default) { _ in answer(true) })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let answer = DialogAnswer(unanswered: false, completionHandler)
        guard let presenter = PageDialog.presenter(for: webView) else { return answer(false) }
        let alert = PageDialog.make(message, from: frame, in: webView)
        alert.addAction(UIAlertAction(title: SyncCopy.text("common.cancel"), style: .cancel) { _ in answer(false) })
        alert.addAction(UIAlertAction(title: SyncCopy.text("dialog.ok"), style: .default) { _ in answer(true) })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let answer = DialogAnswer(unanswered: nil, completionHandler)
        guard let presenter = PageDialog.presenter(for: webView) else { return answer(nil) }
        let alert = PageDialog.make(prompt, from: frame, in: webView)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: SyncCopy.text("common.cancel"), style: .cancel) { _ in answer(nil) })
        alert.addAction(UIAlertAction(title: SyncCopy.text("dialog.ok"), style: .default) { [weak alert] _ in
            answer(alert?.textFields?.first?.text ?? "")
        })
        presenter.present(alert, animated: true)
    }
}

/// A page's `alert`, `confirm` or `prompt` as a system alert, titled with the
/// site that asked so a page can't pass its words off as Blanc's.
enum PageDialog {
    static func make(_ message: String, from frame: WKFrameInfo, in webView: WKWebView) -> UIAlertController {
        let host = frame.securityOrigin.host
        let site = host.isEmpty ? webView.url?.host ?? "" : host
        return UIAlertController(title: site.isEmpty ? nil : site, message: message, preferredStyle: .alert)
    }

    /// What a dialog from `webView`'s page is shown over: the top of whatever
    /// covers the page. Nil when it can't be shown, and the page gets a
    /// dismissal instead: its tab isn't on screen, or another dialog is
    /// already up (a split's other pane).
    static func presenter(for webView: WKWebView) -> UIViewController? {
        guard var presenter = webView.window?.rootViewController else { return nil }
        while let presented = presenter.presentedViewController {
            if presented is UIAlertController || presented.isBeingDismissed { return nil }
            presenter = presented
        }
        return presenter
    }
}

/// Answers a page's dialog once and only once. WebKit raises an exception if
/// a dialog's completion handler is dropped without being called, which is
/// what happens when the alert goes away with a sheet it was shown over; the
/// dialog then gets the answer of a person who dismissed it.
final class DialogAnswer<Value> {
    private var send: ((Value) -> Void)?
    private let unanswered: Value

    init(unanswered: Value, _ send: @escaping (Value) -> Void) {
        self.unanswered = unanswered
        self.send = send
    }

    func callAsFunction(_ value: Value) {
        guard let send else { return }
        self.send = nil
        send(value)
    }

    deinit { send?(unanswered) }
}
