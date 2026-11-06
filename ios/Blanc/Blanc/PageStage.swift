import SwiftUI
import UIKit

/// Stand-ins for the pages while they travel to and from the tab grid, as
/// Safari's: still pictures in plain views. Core Animation runs their springs
/// outside the app, so nothing on the main thread can make them stutter, and a
/// finger moves them directly without SwiftUI redrawing the window.
final class PageStageView: UIView {
    /// Where a page's picture sits, in window points.
    struct Spot {
        var clip: CGRect
        var scale: CGFloat
        var radius: CGFloat
    }

    private struct Page {
        let clip: UIView
        let content: UIView
        let size: CGSize
        let centered: Bool
    }

    /// Hides the grid behind the page, fading as the grid comes into view.
    private let cover = UIView()
    private var pages: [UUID: Page] = [:]
    /// Bumped by each new motion, so an older one's ending is ignored.
    private var pass = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isHidden = true
        accessibilityElementsHidden = true
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.frame = bounds
        addSubview(cover)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a storyboard") }

    func setCover(_ color: UIColor) { cover.backgroundColor = color }

    func hasPage(_ id: UUID, size: CGSize) -> Bool { pages[id]?.size == size }

    /// Drops every page but `ids`.
    func keepPages(_ ids: Set<UUID>) {
        for (id, page) in pages where !ids.contains(id) {
            page.clip.removeFromSuperview()
            pages[id] = nil
        }
    }

    func addPage(_ id: UUID, content: UIView, size: CGSize, centered: Bool) {
        pages[id]?.clip.removeFromSuperview()
        let clip = UIView()
        clip.clipsToBounds = true
        clip.layer.cornerCurve = .continuous
        content.layer.anchorPoint = .zero
        content.bounds = CGRect(origin: .zero, size: size)
        clip.addSubview(content)
        addSubview(clip)
        pages[id] = Page(clip: clip, content: content, size: size, centered: centered)
    }

    private func apply(_ spots: [UUID: Spot], coverAlpha: CGFloat) {
        cover.alpha = coverAlpha
        for (id, spot) in spots {
            guard let page = pages[id] else { continue }
            page.clip.frame = convert(spot.clip, from: nil)
            page.clip.layer.cornerRadius = spot.radius
            page.content.transform = CGAffineTransform(scaleX: spot.scale, y: spot.scale)
            page.content.center = CGPoint(
                x: (spot.clip.width - page.size.width * spot.scale) / 2,
                y: page.centered ? (spot.clip.height - page.size.height * spot.scale) / 2 : 0)
        }
    }

    /// With no animation: under a finger, or before a motion begins.
    func place(_ spots: [UUID: Spot], coverAlpha: CGFloat) {
        pass += 1
        isHidden = false
        alpha = 1
        UIView.performWithoutAnimation { apply(spots, coverAlpha: coverAlpha) }
    }

    func animate(to spots: [UUID: Spot], coverAlpha: CGFloat, completion: @escaping () -> Void) {
        pass += 1
        let current = pass
        isHidden = false
        alpha = 1
        UIView.animate(springDuration: 0.42, bounce: 0.12, initialSpringVelocity: 0, delay: 0,
                       options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.apply(spots, coverAlpha: coverAlpha)
        } completion: { [weak self] _ in
            if self?.pass == current { completion() }
        }
    }

    /// Hands over to what's beneath. Pages stay for the way back unless
    /// `removing`, hidden with the stage.
    func fadeOut(removing: Bool = false) {
        pass += 1
        let current = pass
        UIView.animate(withDuration: 0.08, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.alpha = 0
        } completion: { [weak self] _ in
            guard let self, self.pass == current else { return }
            self.isHidden = true
            self.alpha = 1
            if removing { self.keepPages([]) }
        }
    }
}

struct PageStageHost: UIViewRepresentable {
    let stage: PageStageView
    func makeUIView(context: Context) -> PageStageView { stage }
    func updateUIView(_ view: PageStageView, context: Context) {}
}
