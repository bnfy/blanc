import SwiftUI
import WebKit

/// What a pinch in on a page tells the window, which moves the page itself.
enum PagePinchUpdate: Equatable {
    case started
    case moved(scale: CGFloat, translation: CGSize)
    case ended(opens: Bool)
}

/// The page shrinking into the tab grid, as Safari's does: a rounded card that
/// follows the fingers around the screen's center over a grid coming into
/// focus, then springs to its place. Pure, so its numbers can be tested.
enum TabGridMotion {
    /// How far the fingers must close for a lift to open the grid.
    static let opensBelowScale: CGFloat = 0.8
    private static let smallestScale: CGFloat = 0.3
    /// The scale that counts as all the way, for the grid's focus.
    private static let fullProgressScale: CGFloat = 0.5
    private static let cardRadius: CGFloat = 18

    enum Page: Equatable {
        case full
        case pinching(scale: CGFloat, translation: CGSize)
        case card
    }

    struct Transform: Equatable {
        var scale: CGFloat = 1
        var offset: CGSize = .zero
        /// In the page's own size, before `scale`.
        var cornerRadius: CGFloat = 0
        /// 0 with the page full, 1 with it in its card.
        var progress: CGFloat = 0
    }

    /// A quick close counts even when short; opening the fingers again never does.
    static func opens(scale: CGFloat, velocity: CGFloat) -> Bool {
        if velocity > 0.3 { return false }
        return scale < opensBelowScale || velocity < -0.6
    }

    /// How far a drag on the Island has gone into the page, up from a bottom
    /// Island or down from a top one.
    static func liftTravel(_ translation: CGSize, islandAtTop: Bool) -> CGFloat {
        islandAtTop ? translation.height : -translation.height
    }

    /// A drag counts once it's clearly into the page rather than sideways.
    static func isLift(_ translation: CGSize, islandAtTop: Bool) -> Bool {
        let travel = liftTravel(translation, islandAtTop: islandAtTop)
        return travel >= 12 && travel > abs(translation.width)
    }

    /// The page on a drag of the Island: it shrinks as it goes, down to the
    /// smallest a pinch allows, and the edge by the Island stays under the finger.
    static func lifted(_ translation: CGSize, islandAtTop: Bool, height: CGFloat) -> (scale: CGFloat, translation: CGSize) {
        let travel = max(0, liftTravel(translation, islandAtTop: islandAtTop))
        let scale = max(smallestScale, 1 - travel / max(height, 1))
        let rise = travel - (1 - scale) * height / 2
        return (scale, CGSize(width: translation.width, height: islandAtTop ? rise : -rise))
    }

    /// Far enough to open, unless the finger is heading back; a quick flick
    /// counts even when short.
    static func liftOpens(travel: CGFloat, predicted: CGFloat) -> Bool {
        predicted > 40 && (travel > 40 || predicted > 120)
    }

    static func transform(_ page: Page, in frame: CGRect, card: CGRect?) -> Transform {
        switch page {
        case .full:
            return Transform()
        case .pinching(let raw, let translation):
            let scale = min(1, max(smallestScale, raw))
            let progress = min(1, (1 - scale) / (1 - fullProgressScale))
            return Transform(scale: scale, offset: translation,
                             cornerRadius: cardRadius * min(1, progress * 3) / scale, progress: progress)
        case .card:
            guard let card, frame.width > 0 else {
                return Transform(scale: fullProgressScale, cornerRadius: cardRadius / fullProgressScale, progress: 1)
            }
            let scale = card.width / frame.width
            // The page's top meets the card's; the rest fades as it lands.
            let offset = CGSize(width: card.midX - frame.midX,
                                height: card.minY + frame.height * scale / 2 - frame.midY)
            return Transform(scale: scale, offset: offset, cornerRadius: cardRadius / scale, progress: 1)
        }
    }
}

/// Watches a web view's pinches alongside its own, never instead of them. A
/// pinch in on a fully zoomed-out page counts, on every page; a zoomed-in page
/// zooms back out first, as in Safari.
final class PagePinchWatcher: NSObject, UIGestureRecognizerDelegate {
    /// Where WebKit's own pinch would shrink the page too, past this it's ours.
    private static let startsBelowScale: CGFloat = 0.97

    private let onUpdate: (PagePinchUpdate) -> Void
    private weak var webView: WKWebView?
    private var startedZoomedOut = false
    private var tracking = false
    private var startPoint = CGPoint.zero

    init(webView: WKWebView, onUpdate: @escaping (PagePinchUpdate) -> Void) {
        self.onUpdate = onUpdate
        self.webView = webView
        super.init()
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinched))
        pinch.delegate = self
        pinch.cancelsTouchesInView = false
        pinch.delaysTouchesEnded = false
        webView.addGestureRecognizer(pinch)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    @objc private func pinched(_ pinch: UIPinchGestureRecognizer) {
        guard let webView else { return }
        let scrollView = webView.scrollView
        switch pinch.state {
        case .began:
            startedZoomedOut = scrollView.zoomScale <= scrollView.minimumZoomScale + 0.01
            tracking = false
            startPoint = pinch.location(in: nil)
        case .changed:
            if !tracking, startedZoomedOut, pinch.scale < Self.startsBelowScale {
                tracking = true
                scrollView.bouncesZoom = false
                onUpdate(.started)
            }
            guard tracking else { return }
            let point = pinch.location(in: nil)
            onUpdate(.moved(scale: pinch.scale,
                            translation: CGSize(width: point.x - startPoint.x, height: point.y - startPoint.y)))
        case .ended, .cancelled, .failed:
            guard tracking else { return }
            tracking = false
            scrollView.bouncesZoom = true
            onUpdate(.ended(opens: pinch.state == .ended
                            && TabGridMotion.opens(scale: pinch.scale, velocity: pinch.velocity)))
        default: break
        }
    }
}
