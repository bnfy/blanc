import SwiftUI

/// A Space's mark: its symbol, in the ink desktop's readability rule picks,
/// on a rounded tile of its colour. The colour is drawn exactly as stored.
struct SpaceTile: View {
    let color: String
    let symbol: String
    var size: CGFloat = 28
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let paint = SpaceIdentity.paint(color, theme: scheme == .dark ? "dark" : "light")
        RoundedRectangle(cornerRadius: size * 0.3)
            .fill(Color(blancHex: String((paint?.fill ?? "#576471").dropFirst())) ?? .gray)
            .overlay {
                if paint?.edge == true {
                    RoundedRectangle(cornerRadius: size * 0.3).strokeBorder(Color.primary.opacity(0.25), lineWidth: 0.5)
                }
            }
            .overlay {
                SpaceSymbol(id: symbol)
                    .stroke(Color(blancHex: String((paint?.on ?? "#ffffff").dropFirst())) ?? .white,
                            style: StrokeStyle(lineWidth: max(1, size * 0.56 / 12), lineCap: .round, lineJoin: .round))
                    .frame(width: size * 0.56, height: size * 0.56)
            }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A symbol from the shared set, drawn as a stroke on Lucide's 24-unit grid.
struct SpaceSymbol: Shape {
    let id: String
    func path(in rect: CGRect) -> Path { SpaceIdentity.symbolPath(id, in: rect) }
}

/// The ringed-planet glyph that stands for Spaces when no Space is shown.
struct SpacesGlyph: Shape {
    func path(in rect: CGRect) -> Path { SpaceIdentity.glyphPath(in: rect) }
}
