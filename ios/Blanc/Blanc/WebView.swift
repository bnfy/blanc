import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let tab: TabModel
    /// Split View (F53): a touch on an unfocused pane focuses it. The page
    /// still gets the touch; nothing is delayed or cancelled.
    var onTouchDown: (() -> Void)?
    /// A split's pane rounds its page. On the web view's own layer: WebKit's
    /// content doesn't draw under a SwiftUI clip mask.
    var cornerRadius: CGFloat = 0

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        configureInsets(tab.webView)
        context.coordinator.onTouchDown = onTouchDown
        tab.webView.addGestureRecognizer(context.coordinator.recognizer)
        return tab.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        configureInsets(webView)
        context.coordinator.onTouchDown = onTouchDown
    }

    /// The web view outlives this view (a tab keeps it), so take back the
    /// recognizer this view put on it. Its corners are left alone: the view
    /// it moves to (a pane, the Glance card, the whole page) may already have
    /// set them, and sets them itself when it's made.
    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.removeGestureRecognizer(coordinator.recognizer)
    }

    private func configureInsets(_ webView: WKWebView) {
        webView.layer.cornerRadius = cornerRadius
        webView.layer.cornerCurve = .continuous
        webView.clipsToBounds = cornerRadius > 0
        let startPage = tab.currentURL.scheme == "blanc" && tab.currentURL.host == "newtab"
        // The Start Page paints beneath the system bars and floating Island;
        // its stylesheet reserves space for the controls. Websites keep their
        // normal safe-area adjustment and separate bottom toolbar.
        webView.scrollView.contentInsetAdjustmentBehavior = startPage ? .never : .automatic
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onTouchDown: (() -> Void)?
        lazy var recognizer: UILongPressGestureRecognizer = {
            let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(touched(_:)))
            recognizer.minimumPressDuration = 0
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delaysTouchesEnded = false
            recognizer.delegate = self
            return recognizer
        }()

        @objc private func touched(_ recognizer: UILongPressGestureRecognizer) {
            if recognizer.state == .began { onTouchDown?() }
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

        /// Only while a pane is waiting for focus; otherwise it stays out of the way.
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool { onTouchDown != nil }
    }
}
