import SwiftUI
import UIKit

/// The page menu on the Island, as a plain UIKit button that shows its menu
/// on tap. On iOS 26 a SwiftUI `Menu` gives its button a glass platter that
/// stays behind the mark after the menu closes; a plain `UIButton` has none.
/// The menu is rebuilt each time it opens, so it always shows the page's
/// current state.
struct IslandMarkButton: UIViewRepresentable {
    enum Glyph: Equatable { case sunrise, favicon(UIImage), globe }

    let glyph: Glyph
    let tint: Color
    let accessibilityValue: String?
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
        button.accessibilityValue = accessibilityValue
        if context.coordinator.glyph != glyph {
            button.configuration?.image = Self.image(for: glyph)
            context.coordinator.glyph = glyph
        }
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
        var glyph: Glyph?
        var menu: () -> [UIMenuElement]
        init(menu: @escaping () -> [UIMenuElement]) { self.menu = menu }
    }

    private static let sunriseMark = Bundle.main
        .path(forResource: "sunrise-mark", ofType: "png", inDirectory: "pages")
        .flatMap(UIImage.init(contentsOfFile:))

    private static func image(for glyph: Glyph) -> UIImage? {
        switch glyph {
        case .sunrise:
            return sunriseMark.map { draw($0, side: 20, radius: 0) }
        case .favicon(let image):
            return draw(image, side: 16, radius: 4)
        case .globe:
            return UIImage(systemName: "globe", withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold))?
                .withRenderingMode(.alwaysTemplate)
        }
    }

    private static func draw(_ image: UIImage, side: CGFloat, radius: CGFloat) -> UIImage {
        let rect = CGRect(x: 0, y: 0, width: side, height: side)
        return UIGraphicsImageRenderer(size: rect.size).image { _ in
            UIBezierPath(roundedRect: rect, cornerRadius: radius).addClip()
            image.draw(in: rect)
        }.withRenderingMode(.alwaysOriginal)
    }
}
