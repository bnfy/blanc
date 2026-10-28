import UIKit
import WebKit

/// Hold the Start Page to customize it, as on the iPhone Lock Screen (owner,
/// 2026-10-25). The page's own floating Customize button is hidden on the
/// phone; a half-second hold on empty space (not a link, button or field)
/// opens Settings at the Start Page, where its layout, wallpaper and clock are.
final class StartPageHold: NSObject, WKScriptMessageHandler {
    static let messageHandlerName = "blancStartHold"

    static let userScriptSource = #"""
    (() => {
      if (location.protocol !== 'blanc:' || location.host !== 'newtab') return;
      document.getElementById('customizeButton')?.style.setProperty('display', 'none', 'important');
      document.body?.style.setProperty('-webkit-touch-callout', 'none');
      let timer = null, x = 0, y = 0;
      const cancel = () => { clearTimeout(timer); timer = null; };
      addEventListener('touchstart', (event) => {
        cancel();
        if (event.touches.length !== 1) return;
        if (event.target.closest?.('a, button, input, select, textarea, label, [contenteditable], [popover], dialog')) return;
        x = event.touches[0].clientX; y = event.touches[0].clientY;
        timer = setTimeout(() => {
          timer = null;
          window.webkit?.messageHandlers?.blancStartHold?.postMessage(true);
        }, 500);
      }, { passive: true });
      addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (touch && Math.hypot(touch.clientX - x, touch.clientY - y) > 10) cancel();
      }, { passive: true });
      addEventListener('touchend', cancel, { passive: true });
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
