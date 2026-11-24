import SwiftUI

/// What the Island and the notices over it are made of: Liquid Glass on iOS 26
/// and later, which draws its own edge and depth, and the theme's raised
/// surface with a hairline and soft shadow before that. Only the material
/// changes; the shape is the caller's.
struct IslandSurface<S: InsettableShape>: ViewModifier {
    let style: BrowserStyle
    let shape: S
    var shadow = true
    @Environment(\.islandGlassTint) private var tint

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(tint.map { Glass.regular.tint($0) } ?? .regular, in: shape)
        } else {
            content
                .background(style.raised, in: shape)
                .overlay(shape.strokeBorder(style.border.opacity(0.7), lineWidth: 0.5))
                .shadow(color: .black.opacity(shadow ? (style.scheme == .dark ? 0.25 : 0.10) : 0), radius: 10, y: 4)
        }
    }
}

extension View {
    func islandSurface<S: InsettableShape>(_ style: BrowserStyle, in shape: S, shadow: Bool = true) -> some View {
        modifier(IslandSurface(style: style, shape: shape, shadow: shadow))
    }
}

extension EnvironmentValues {
    /// A color laid into the Island's glass (iOS 26). A private tab's Island
    /// is dark, but dark glass over a light page still shows the page through
    /// it as mid-gray, so the private Island and its notices tint their glass
    /// with the dark surface. Nil leaves the glass clear, following the page.
    @Entry var islandGlassTint: Color? = nil
}

extension BrowserStyle {
    /// The private Island's glass tint: the dark raised surface, nearly opaque.
    static let privateGlassTint = BrowserStyle(scheme: .dark).raised.opacity(0.85)
}
