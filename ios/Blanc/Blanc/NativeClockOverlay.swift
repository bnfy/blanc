import SwiftUI
import WebKit
import CoreText

/// The web page supplies typography and position; iOS owns the material.
@MainActor
final class NativeClockOverlay {
    private var host: UIHostingController<AnyView>?
    var isVisible: Bool { host?.view.superview != nil }

    func hide() { host?.view.removeFromSuperview(); host = nil }

    @discardableResult
    func render(_ data: [String: Any]?, in webView: WKWebView) -> Bool {
        guard #available(iOS 26.0, *), !UIAccessibility.isReduceTransparencyEnabled,
              let data, let text = data["text"] as? String, text.count <= 16,
              text.allSatisfy({ $0.isNumber || ": .".contains($0) }),
              let fontID = data["font"] as? String,
              let x = data["x"] as? Double, let y = data["y"] as? Double,
              let width = data["width"] as? Double, let height = data["height"] as? Double,
              let size = data["size"] as? Double, let weight = data["weight"] as? Double,
              let stretch = data["stretch"] as? Double,
              [x,y,width,height,size,weight,stretch].allSatisfy({ $0.isFinite }),
              (1...1000).contains(width), (1...1000).contains(height), (1...500).contains(size),
              let path = Self.glyphPath(text: text, fontID: fontID, size: size, weight: weight,
                                        stretch: stretch, spacing: data["spacing"] as? Double ?? 0) else {
            hide(); return false
        }
        let shape = ClockGlyphShape(outline: path)
        let rgb = data["rgb"] as? [Double] ?? []
        // Auto is untinted glass, not a translucent copy of the page's text ink.
        // A dark ink tint makes even a bright wallpaper look like gray plastic.
        let tint: Color? = data["tinted"] as? Bool == true && rgb.count >= 3
            ? Color(red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255).opacity(0.18)
            : nil
        // The regular system material adapts its edges for narrow glyph
        // counters; clear glass produces harsh dark refractions there.
        let content = AnyView(Color.clear.glassEffect(.regular.tint(tint), in: shape)
            .shadow(color: .black.opacity(0.32), radius: max(2, size * 0.025), x: 0, y: max(1, size * 0.012))
            .shadow(color: .black.opacity(0.18), radius: max(5, size * 0.07), x: 0, y: max(2, size * 0.025))
            .accessibilityHidden(true).allowsHitTesting(false))
        if host == nil {
            host = UIHostingController(rootView: content)
            host?.view.backgroundColor = .clear
            host?.view.isUserInteractionEnabled = false
        } else { host?.rootView = content }
        guard let view = host?.view else { return false }
        view.frame = CGRect(x: x, y: y, width: width, height: height)
        if view.superview !== webView { webView.addSubview(view) }
        webView.bringSubviewToFront(view)
        return true
    }

    static func glyphPath(text: String, fontID: String, size: Double, weight: Double, stretch: Double, spacing: Double) -> CGPath? {
        let file: String
        switch fontID {
        case "instrument", "condensed": file = "ClockInstrument"
        case "inter": file = "ClockInter"
        case "flex": file = "ClockFlex"
        default: return nil
        }
        guard let url = Bundle.main.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts") ?? Bundle.main.url(forResource: file, withExtension: "ttf"),
              let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let descriptor = descriptors.first else { return nil }
        let axes: [NSNumber: NSNumber] = [0x77676874: NSNumber(value: weight), 0x77647468: NSNumber(value: stretch)]
        let final = CTFontDescriptorCreateCopyWithAttributes(descriptor, [kCTFontVariationAttribute: axes] as CFDictionary)
        let font = CTFontCreateWithFontDescriptor(final, CGFloat(size), nil)
        let string = NSAttributedString(string: text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTKernAttributeName as String): spacing,
        ])
        let line = CTLineCreateWithAttributedString(string)
        let result = CGMutablePath()
        for run in CTLineGetGlyphRuns(line) as! [CTRun] {
            let count = CTRunGetGlyphCount(run)
            var glyphs = [CGGlyph](repeating: 0, count: count)
            var positions = [CGPoint](repeating: .zero, count: count)
            CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
            CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
            for i in 0..<count {
                if let outline = CTFontCreatePathForGlyph(font, glyphs[i], nil) {
                    result.addPath(outline, transform: CGAffineTransform(translationX: positions[i].x, y: positions[i].y))
                }
            }
        }
        return result.isEmpty ? nil : result
    }
}

private struct ClockGlyphShape: Shape {
    let outline: CGPath
    func path(in rect: CGRect) -> Path {
        let bounds = outline.boundingBoxOfPath
        let scale = min(1, rect.width / bounds.width, rect.height / bounds.height)
        var transform = CGAffineTransform(a: scale, b: 0, c: 0, d: -scale,
            tx: rect.midX - bounds.midX * scale, ty: rect.midY + bounds.midY * scale)
        return Path(outline.copy(using: &transform) ?? outline)
    }
}
