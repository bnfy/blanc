import UIKit
import WebKit

/// Hold the Start Page to customize it, as on the iPhone Lock Screen (owner,
/// 2026-10-25). The page's own floating Customize button is hidden on the
/// phone; a half-second hold on empty space (not a link, button or field)
/// opens Settings at the Start Page, where its layout, wallpaper and clock are.
///
/// The hold is a native long press on the web view, not page touch listeners:
/// a page with touch listeners makes WebKit add touch-deferring gesture
/// recognizers, and with those UIKit aborted on iOS 26 (SDK 26) when the
/// Start Page was touched.
final class StartPageHold: NSObject, UIGestureRecognizerDelegate {
    /// Hides the page's Customize button and the system's link callout.
    static let userScriptSource = #"""
    (() => {
      if (location.protocol !== 'blanc:' || location.host !== 'newtab') return;
      document.getElementById('customizeButton')?.style.setProperty('display', 'none', 'important');
      document.body?.style.setProperty('-webkit-touch-callout', 'none');
    })();
    """#

    /// True when the page point (CSS pixels, document coordinates) is empty
    /// space rather than something the person can use.
    static func emptySpaceScript(x: CGFloat, y: CGFloat) -> String {
        #"""
        (() => {
          const e = document.elementFromPoint(\#(x) - scrollX, \#(y) - scrollY);
          return !(e && e.closest('a, button, input, select, textarea, label, [contenteditable], [popover], dialog'));
        })()
        """#
    }

    private weak var manager: TabsManager?

    init(manager: TabsManager) {
        self.manager = manager
        super.init()
    }

    func attach(to webView: WKWebView) {
        let press = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
        press.minimumPressDuration = 0.5
        press.allowableMovement = 10
        press.delegate = self
        webView.addGestureRecognizer(press)
    }

    @objc private func held(_ press: UILongPressGestureRecognizer) {
        guard press.state == .began, let webView = press.view as? WKWebView, let manager,
              let tab = manager.tabs.first(where: { $0.webView === webView }),
              tab.currentURL.scheme == "blanc", tab.currentURL.host == "newtab" else { return }
        let scrollView = webView.scrollView
        let point = scrollView.convert(press.location(in: webView), from: webView)
        let zoom = max(scrollView.zoomScale, 0.01)
        webView.evaluateJavaScript(Self.emptySpaceScript(x: point.x / zoom, y: point.y / zoom)) { [weak manager] result, _ in
            guard result as? Bool == true else { return }
            manager?.startPageHeld(tab)
        }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}
