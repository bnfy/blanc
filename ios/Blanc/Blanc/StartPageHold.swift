import UIKit
import WebKit

/// Hold the Start Page to customize it, as on the iPhone Lock Screen (owner,
/// 2026-10-25): a half-second hold on empty space (not a link, button or
/// field) opens the page's Customize, beside its own Customize button. The
/// page's text can't be selected, or that hold would also bring up the text menu.
final class StartPageHold: NSObject, WKScriptMessageHandler {
    static let messageHandlerName = "blancStartHold"

    static let userScriptSource = #"""
    (() => {
      if (location.protocol !== 'blanc:' || location.host !== 'newtab') return;
      document.body?.style.setProperty('-webkit-touch-callout', 'none');
      document.body?.style.setProperty('-webkit-user-select', 'none');
      let timer = null, held = false, x = 0, y = 0;
      const cancel = () => { clearTimeout(timer); timer = null; };
      addEventListener('touchstart', (event) => {
        cancel();
        held = false;
        if (event.touches.length !== 1) return;
        if (event.target.closest?.('a, button, input, select, textarea, label, [contenteditable], [popover], dialog')) return;
        x = event.touches[0].clientX; y = event.touches[0].clientY;
        timer = setTimeout(() => {
          timer = null;
          held = true;
          window.webkit?.messageHandlers?.blancStartHold?.postMessage(true);
        }, 500);
      }, { passive: true });
      addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (touch && Math.hypot(touch.clientX - x, touch.clientY - y) > 10) cancel();
      }, { passive: true });
      // The lift that ends a hold is not also a tap (on Customize, now under the finger).
      addEventListener('touchend', (event) => {
        cancel();
        if (held) { held = false; event.preventDefault(); }
      });
      addEventListener('touchcancel', cancel, { passive: true });
    })();
    """#

    private weak var manager: TabsManager?

    init(manager: TabsManager) {
        self.manager = manager
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let webView = message.webView, let manager,
              let tab = manager.tabs.first(where: { $0.existingWebView === webView }) else { return }
        manager.startPageHeld(tab)
    }
}
