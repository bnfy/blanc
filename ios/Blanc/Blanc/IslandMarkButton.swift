import SwiftUI
import UIKit

/// The Sunrise mark on the Island, as a plain UIKit button that shows its menu
/// on tap. On iOS 26 a SwiftUI `Menu` gives its button a glass platter that
/// stays behind the mark after the menu closes; a plain `UIButton` has none.
/// The menu is rebuilt each time it opens, so it always shows the page's
/// current state.
struct IslandMarkButton: UIViewRepresentable {
    let image: UIImage?
    let tint: Color
    let menu: () -> [UIMenuElement]

    func makeCoordinator() -> Coordinator { Coordinator(menu: menu) }

    func makeUIView(context: Context) -> UIButton {
        var configuration = UIButton.Configuration.plain()
        configuration.contentInsets = .zero
        configuration.background = .clear()
        let button = MarkPreviewButton(configuration: configuration)
        button.showsMenuAsPrimaryAction = true
        // The pointer highlights it like the Island's other buttons (iPad).
        button.isPointerInteractionEnabled = true
        button.accessibilityLabel = SyncCopy.text("ios.island.pageActions")
        button.accessibilityIdentifier = "island.menu"
        let coordinator = context.coordinator
        button.menu = UIMenu(children: [UIDeferredMenuElement.uncached { completion in
            completion(coordinator.menu())
        }])
        updateUIView(button, context: context)
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        context.coordinator.menu = menu
        button.configuration?.image = image.map(Self.sized)
        button.tintColor = UIColor(tint)
    }

    /// While the menu opens and folds back, iOS lifts the button on a platter
    /// that reads as a box (or a disc) around the mark, even with a clear
    /// background. The preview here is an empty point at the mark's center,
    /// so the menu grows from and folds into the mark while the mark itself
    /// stays where it is in the Island.
    final class MarkPreviewButton: UIButton {
        private func markPreview() -> UITargetedPreview {
            let point = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
            point.backgroundColor = .clear
            let parameters = UIPreviewParameters()
            parameters.backgroundColor = .clear
            parameters.shadowPath = UIBezierPath()
            let center = CGPoint(x: bounds.midX, y: bounds.midY)
            return UITargetedPreview(view: point, parameters: parameters,
                                     target: UIPreviewTarget(container: self, center: center))
        }

        override func contextMenuInteraction(
            _ interaction: UIContextMenuInteraction,
            configuration: UIContextMenuConfiguration,
            highlightPreviewForItemWithIdentifier identifier: any NSCopying
        ) -> UITargetedPreview? { markPreview() }

        override func contextMenuInteraction(
            _ interaction: UIContextMenuInteraction,
            configuration: UIContextMenuConfiguration,
            dismissalPreviewForItemWithIdentifier identifier: any NSCopying
        ) -> UITargetedPreview? { markPreview() }

        /// A light tap as the menu opens, like the system's own menu buttons.
        /// A tap-opened menu gets none by itself; it does nothing where the
        /// device has no haptics or the person turned them off.
        override func contextMenuInteraction(
            _ interaction: UIContextMenuInteraction,
            willDisplayMenuFor configuration: UIContextMenuConfiguration,
            animator: (any UIContextMenuInteractionAnimating)?
        ) {
            super.contextMenuInteraction(interaction, willDisplayMenuFor: configuration, animator: animator)
            UIImpactFeedbackGenerator(style: .light, view: self).impactOccurred()
        }
    }

    final class Coordinator {
        var menu: () -> [UIMenuElement]
        init(menu: @escaping () -> [UIMenuElement]) { self.menu = menu }
    }

    /// The mark at 22 pt in its own gold, as the Start Page shows it, rather
    /// than in the Island's ink (owner, 2026-11-11).
    private static func sized(_ image: UIImage) -> UIImage {
        let side: CGFloat = 22
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }.withRenderingMode(.alwaysOriginal)
    }
}
