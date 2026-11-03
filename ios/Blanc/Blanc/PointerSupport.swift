import SwiftUI
import UIKit

/// iPad pointer and trackpad (D7's iPad allowance). Touch devices see none of
/// this: hover effects show only under a pointer, and the trackpad swipe
/// takes no touches.
extension View {
    /// The system highlight under the pointer, shaped like the control.
    func pointerHighlight(cornerRadius: CGFloat = 10) -> some View {
        contentShape(.hoverEffect, RoundedRectangle(cornerRadius: cornerRadius))
            .hoverEffect(.highlight)
    }

    /// The pointer lifts a card it rests on, as Safari's tab overview does.
    func pointerLift(cornerRadius: CGFloat) -> some View {
        contentShape(.hoverEffect, RoundedRectangle(cornerRadius: cornerRadius))
            .hoverEffect(.lift)
    }
}

/// A two-finger swipe on a trackpad, reported like a drag: the distance so
/// far, then where it would have come to rest. Only scrolling reaches it;
/// a finger on the screen is left to the view's own gestures.
struct TrackpadSwipe: UIGestureRecognizerRepresentable {
    var changed: (CGSize) -> Void
    var ended: (_ translation: CGSize, _ predicted: CGSize) -> Void
    var cancelled: () -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let recognizer = UIPanGestureRecognizer()
        recognizer.allowedScrollTypesMask = .continuous
        recognizer.allowedTouchTypes = []
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let point = recognizer.translation(in: recognizer.view)
        let translation = CGSize(width: point.x, height: point.y)
        switch recognizer.state {
        case .began, .changed:
            changed(translation)
        case .ended:
            // About where a flick would carry on to, as a drag predicts it.
            let velocity = recognizer.velocity(in: recognizer.view)
            ended(translation, CGSize(width: point.x + velocity.x * 0.2, height: point.y + velocity.y * 0.2))
        case .cancelled, .failed:
            cancelled()
        default:
            break
        }
    }
}
