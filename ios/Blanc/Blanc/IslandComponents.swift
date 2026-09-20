import SwiftUI

/// The same 16-unit path geometry used by the desktop Island.
struct BlancIslandGlyph: View {
    enum Kind { case back, plus, shield, search }
    let kind: Kind
    var color: Color = .primary

    var body: some View {
        GeometryReader { geometry in
            path
                .applying(CGAffineTransform(
                    scaleX: geometry.size.width / 16,
                    y: geometry.size.height / 16
                ))
                .stroke(color, style: StrokeStyle(
                    lineWidth: 1.4 * geometry.size.width / 16,
                    lineCap: .round,
                    lineJoin: .round
                ))
        }
        .accessibilityHidden(true)
    }

    private var path: Path {
        var path = Path()
        switch kind {
        case .back:
            path.move(to: CGPoint(x: 9.75, y: 3.5))
            path.addLine(to: CGPoint(x: 5.25, y: 8))
            path.addLine(to: CGPoint(x: 9.75, y: 12.5))
        case .plus:
            path.move(to: CGPoint(x: 8, y: 3))
            path.addLine(to: CGPoint(x: 8, y: 13))
            path.move(to: CGPoint(x: 3, y: 8))
            path.addLine(to: CGPoint(x: 13, y: 8))
        case .shield:
            path.move(to: CGPoint(x: 8, y: 1.8))
            path.addLine(to: CGPoint(x: 13, y: 3.7))
            path.addLine(to: CGPoint(x: 13, y: 7.5))
            path.addCurve(to: CGPoint(x: 8, y: 14.2),
                          control1: CGPoint(x: 13, y: 10.6),
                          control2: CGPoint(x: 10.9, y: 12.8))
            path.addCurve(to: CGPoint(x: 3, y: 7.5),
                          control1: CGPoint(x: 5.1, y: 12.8),
                          control2: CGPoint(x: 3, y: 10.6))
            path.addLine(to: CGPoint(x: 3, y: 3.7))
            path.closeSubpath()
            path.move(to: CGPoint(x: 4.4, y: 11.47))
            path.addLine(to: CGPoint(x: 12.61, y: 3.55))
        case .search:
            path.addEllipse(in: CGRect(x: 2.75, y: 2.75, width: 8.5, height: 8.5))
            path.move(to: CGPoint(x: 10.25, y: 10.25))
            path.addLine(to: CGPoint(x: 13.25, y: 13.25))
        }
        return path
    }
}

struct BlancFavicon: View {
    let tab: TabModel
    var size: CGFloat = 22

    var body: some View {
        Group {
            if let data = tab.faviconData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else if tab.currentURL.scheme == "blanc" {
                Image(systemName: "house")
                    .font(.system(size: size * 0.7, weight: .medium))
            } else {
                Text(String((tab.currentURL.host ?? "?").prefix(1)).uppercased())
                    .font(.custom("Inter-SemiBold", size: size * 0.62))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(Color(white: 0.15), in: RoundedRectangle(cornerRadius: size * 0.24))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
