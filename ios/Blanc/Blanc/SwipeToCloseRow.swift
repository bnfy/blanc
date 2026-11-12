import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// A list row that slides left to show a trash button, drawn by Blanc rather
/// than by `swipeActions`: the system's swipe paints a plain strip behind its
/// buttons, which showed as a white block inside a tinted tab group. Here the
/// row's own background (a group's tint) stays put under the sliding content.
/// A full swipe closes without a tap, with a light tap of haptics as it
/// passes the point of no return, as Mail's does.
struct SwipeToCloseRow<Content: View>: View {
    /// The row whose trash is showing, so opening one closes any other.
    @Binding var openRow: UUID?
    let id: UUID
    let accessibilityLabel: String
    let onClose: () -> Void
    @ViewBuilder let content: Content

    @State private var drag: CGFloat = 0
    @State private var dragging = false
    @State private var width: CGFloat = 0
    @State private var pastFullSwipe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The trash button's width once the row rests open.
    static var actionWidth: CGFloat { 76 }

    private var isOpen: Bool { openRow == id }
    private var restingOffset: CGFloat { isOpen ? -Self.actionWidth : 0 }
    private var offset: CGFloat { dragging ? drag : restingOffset }
    /// Past this share of the row's width a release closes the tab.
    private var fullSwipeDistance: CGFloat { max(Self.actionWidth * 1.6, width * 0.55) }

    var body: some View {
        ZStack(alignment: .trailing) {
            content
                // A tap on an open row only closes the trash, as in Mail.
                // Before the offset, so it slides with the row and leaves
                // the trash uncovered.
                .overlay {
                    if isOpen && !dragging {
                        Color.clear.contentShape(Rectangle())
                            .onTapGesture { settle(open: false) }
                    }
                }
                .offset(x: offset)
            // Only while a swipe shows it, so it is never a stray button.
            // In front of the row: it only ever fills the strip the row has
            // slid away from, so it looks the same, and it takes the tap. On
            // iOS 26 the row's button still takes touches where it was before
            // the swipe, over the trash, when the trash sits behind it.
            if offset < -1 { trash }
        }
        .clipped()
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .gesture(HorizontalRowPan(
            canOpen: { !isOpen },
            changed: { dx in
                dragging = true
                let raw = restingOffset + dx
                // Resists past the full swipe and to the right of closed.
                drag = raw > 0 ? raw / 4 : max(raw, -width)
                let past = -drag > fullSwipeDistance
                if past != pastFullSwipe {
                    pastFullSwipe = past
                    if past { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
                }
            },
            ended: { dx, predicted in
                dragging = false
                // Only a drag past the line closes; a quick flick just opens
                // the trash, so a tab never goes by accident.
                let landing = restingOffset + predicted
                if -(restingOffset + dx) > fullSwipeDistance {
                    closeTab()
                } else {
                    settle(open: landing < -Self.actionWidth / 2)
                }
                pastFullSwipe = false
            },
            cancelled: {
                dragging = false
                pastFullSwipe = false
                settle(open: isOpen)
            }))
        .onChange(of: openRow) { _, _ in if !isOpen { drag = 0 } }
    }

    private var trash: some View {
        Button(action: closeTab) {
            Image(systemName: "trash")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: Self.actionWidth - 12, height: 40)
                .background(Color(.systemGray), in: Capsule())
                .frame(width: max(Self.actionWidth, -offset), alignment: .center)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier("palette.tab.close")
    }

    private func settle(open: Bool) {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.3, dampingFraction: 0.86)) {
            openRow = open ? id : (isOpen ? nil : openRow)
            drag = 0
        }
    }

    private func closeTab() {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { drag = -width }
        if isOpen { openRow = nil }
        onClose()
    }
}

/// A one-finger pan that begins only for a sideways drag (to the left from
/// rest, either way once the row is open), so the list still scrolls and the
/// row still takes taps.
private struct HorizontalRowPan: UIGestureRecognizerRepresentable {
    var canOpen: () -> Bool
    var changed: (CGFloat) -> Void
    var ended: (_ translation: CGFloat, _ predicted: CGFloat) -> Void
    var cancelled: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> SidewaysPan {
        let recognizer = SidewaysPan()
        recognizer.maximumNumberOfTouches = 1
        recognizer.delegate = context.coordinator
        context.coordinator.canOpen = canOpen
        return recognizer
    }

    func updateUIGestureRecognizer(_ recognizer: SidewaysPan, context: Context) {
        context.coordinator.canOpen = canOpen
    }

    func handleUIGestureRecognizerAction(_ recognizer: SidewaysPan, context: Context) {
        let x = recognizer.translation(in: recognizer.view).x
        switch recognizer.state {
        case .began, .changed:
            changed(x)
        case .ended:
            ended(x, x + recognizer.velocity(in: recognizer.view).x * 0.2)
        case .cancelled, .failed:
            cancelled()
        default:
            break
        }
    }

    /// Gives up after a moment without movement. The list's scrolling waits
    /// for this pan to fail, and a hold's context menu waits for the
    /// scrolling, so a pan under a still finger would keep the menu shut.
    final class SidewaysPan: UIPanGestureRecognizer {
        private var stillTimer: Timer?

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
            super.touchesBegan(touches, with: event)
            stillTimer?.invalidate()
            stillTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: false) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self, self.state == .possible else { return }
                    self.state = .failed
                }
            }
        }

        override func reset() {
            super.reset()
            stillTimer?.invalidate()
            stillTimer = nil
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var canOpen: () -> Bool = { true }

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            guard abs(velocity.x) > abs(velocity.y) * 1.2 else { return false }
            return velocity.x < 0 || !canOpen()
        }

        /// The list's scrolling waits to see whether this is a sideways swipe.
        func gestureRecognizer(_ recognizer: UIGestureRecognizer,
                               shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other.view is UIScrollView
        }
    }
}
