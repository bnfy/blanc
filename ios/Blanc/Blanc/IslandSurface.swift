import SwiftUI

/// What the Island and the notices over it are made of: Liquid Glass on iOS 26
/// and later, which draws its own edge and depth, and the theme's raised
/// surface with a hairline and soft shadow before that. Only the material
/// changes; the shape is the caller's.
struct IslandSurface<S: InsettableShape>: ViewModifier {
    let style: BrowserStyle
    let shape: S
    var shadow = true

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular, in: shape)
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
