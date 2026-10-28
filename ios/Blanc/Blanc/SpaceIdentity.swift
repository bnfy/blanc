import SwiftUI

/// A Space's colour and symbol, as desktop's `src/renderer/space-identity.js`
/// draws them. The presets and symbol geometry are generated from that file
/// (`SpaceIdentity.generated.swift`); this file holds the rules.
enum SpaceIdentity {
    struct SVGElement {
        let tag: String
        let attributes: [String: String]
    }

    struct Paint: Equatable {
        /// The stored colour, never adjusted.
        let fill: String
        /// The symbol and name on it: `#ffffff` or `#000000`, whichever reads.
        let on: String
        /// Whether the fill needs a hairline edge against a surface it sits on.
        let edge: Bool
    }

    static let minContrast = 4.5
    static let edgeContrast = 3.0

    /// `#rrggbb` in lower case from `#RRGGBB`, `rrggbb` or padded input; else nil.
    static func normalizeHex(_ value: String) -> String? {
        let trimmed = SyncCrypto.trim(value).lowercased()
        let hex = trimmed.hasPrefix("#") ? trimmed : "#" + trimmed
        guard hex.count == 7, hex.dropFirst().allSatisfy({ "0123456789abcdef".contains($0) }) else { return nil }
        return hex
    }

    static func isSymbol(_ value: String) -> Bool { symbols[value] != nil }

    private static func channels(_ hex: String) -> [Double] {
        [1, 3, 5].map { i in
            let start = hex.index(hex.startIndex, offsetBy: i)
            return Double(Int(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)!) / 255
        }
    }

    private static func luminance(_ hex: String) -> Double {
        let linear = channels(hex).map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }

    static func contrast(_ a: String, _ b: String) -> Double {
        let x = luminance(a), y = luminance(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    /// How a stored colour is drawn on a theme (`light`, `dark` or `private`).
    static func paint(_ hex: String, theme: String = "light") -> Paint? {
        guard let fill = normalizeHex(hex), let backgrounds = surfaces[theme] else { return nil }
        let on = contrast(fill, "#ffffff") >= contrast(fill, "#000000") ? "#ffffff" : "#000000"
        return Paint(fill: fill, on: on, edge: backgrounds.contains { contrast(fill, $0) < edgeContrast })
    }

    /// The first preset colour and symbol not yet used, cycling once all are.
    static func defaults(existing: [(color: String, symbol: String)]) -> (color: String, symbol: String) {
        let usedColors = Set(existing.compactMap { normalizeHex($0.color) })
        let usedSymbols = Set(existing.map(\.symbol).filter(isSymbol))
        let color = presets.first { !usedColors.contains($0.hex) }?.hex ?? presets[existing.count % presets.count].hex
        let symbol = symbolIds.first { !usedSymbols.contains($0) } ?? symbolIds[existing.count % symbolIds.count]
        return (color, symbol)
    }

    // MARK: Drawing

    /// A symbol on Lucide's 24×24 grid, scaled into `rect`, for stroking.
    static func symbolPath(_ id: String, in rect: CGRect) -> Path {
        path(symbols[id] ?? [], in: rect)
    }

    /// The Spaces glyph (a ringed planet) for the quiet mark.
    static func glyphPath(in rect: CGRect) -> Path { path(spacesGlyph, in: rect) }

    static func path(_ elements: [SVGElement], in rect: CGRect) -> Path {
        var path = Path()
        for element in elements {
            let a = element.attributes
            func n(_ key: String) -> CGFloat { CGFloat(Double(a[key] ?? "") ?? 0) }
            switch element.tag {
            case "rect":
                path.addRoundedRect(in: CGRect(x: n("x"), y: n("y"), width: n("width"), height: n("height")),
                                    cornerSize: CGSize(width: n("rx"), height: a["ry"] == nil ? n("rx") : n("ry")))
            case "circle":
                path.addEllipse(in: CGRect(x: n("cx") - n("r"), y: n("cy") - n("r"), width: 2 * n("r"), height: 2 * n("r")))
            case "path":
                path.addPath(SVGPath.parse(a["d"] ?? ""))
            default:
                break
            }
        }
        let scale = min(rect.width, rect.height) / 24
        return path.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: scale, y: scale))
    }
}

/// A minimal SVG path-data parser: the commands Lucide's symbols use (M, L,
/// H, V, C, A, Z in both cases), with implicit repeats.
enum SVGPath {
    static func parse(_ d: String) -> Path {
        var tokens = tokenize(d)
        var path = Path()
        var current = CGPoint.zero, start = CGPoint.zero
        var command: Character = "M"
        func number() -> CGFloat {
            guard case .number(let value)? = tokens.first else { return 0 }
            tokens.removeFirst()
            return value
        }
        func point(_ relative: Bool) -> CGPoint {
            let x = number(), y = number()
            return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
        }
        while !tokens.isEmpty {
            if case .command(let c) = tokens.first! { command = c; tokens.removeFirst() }
            let relative = command.isLowercase
            switch command.uppercased().first! {
            case "M":
                current = point(relative); start = current
                path.move(to: current)
                command = relative ? "l" : "L"
            case "L":
                current = point(relative); path.addLine(to: current)
            case "H":
                let x = number(); current.x = relative ? current.x + x : x; path.addLine(to: current)
            case "V":
                let y = number(); current.y = relative ? current.y + y : y; path.addLine(to: current)
            case "C":
                let c1 = point(relative), c2 = point(relative), end = point(relative)
                path.addCurve(to: end, control1: c1, control2: c2); current = end
            case "A":
                let rx = number(), ry = number(), rotation = number(), large = number() != 0, sweep = number() != 0
                let end = point(relative)
                addArc(&path, from: current, to: end, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep)
                current = end
            case "Z":
                path.closeSubpath(); current = start
                if case .number? = tokens.first { command = relative ? "l" : "L" }
            default:
                tokens.removeFirst()
            }
        }
        return path
    }

    private enum Token { case command(Character), number(CGFloat) }

    private static func tokenize(_ d: String) -> [Token] {
        var tokens: [Token] = []
        var buffer = ""
        func flush() { if let value = Double(buffer) { tokens.append(.number(CGFloat(value))) }; buffer = "" }
        for ch in d {
            if ch.isLetter && ch != "e" && ch != "E" { flush(); tokens.append(.command(ch)) }
            else if ch == "," || ch == " " || ch == "\n" || ch == "\t" { flush() }
            else if ch == "-" && !buffer.isEmpty && !buffer.hasSuffix("e") { flush(); buffer = "-" }
            else if ch == "." && buffer.contains(".") { flush(); buffer = "." }
            else { buffer.append(ch) }
        }
        flush()
        return tokens
    }

    /// An SVG elliptical arc as cubic Béziers (SVG 1.1 implementation notes, F.6).
    private static func addArc(_ path: inout Path, from p0: CGPoint, to p1: CGPoint, rx rxIn: CGFloat, ry ryIn: CGFloat,
                               rotation: CGFloat, large: Bool, sweep: Bool) {
        var rx = abs(rxIn), ry = abs(ryIn)
        guard rx > 0, ry > 0, p0 != p1 else { path.addLine(to: p1); return }
        let phi = rotation * .pi / 180, cosPhi = cos(phi), sinPhi = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1 = cosPhi * dx + sinPhi * dy, y1 = -sinPhi * dx + cosPhi * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= sqrt(lambda); ry *= sqrt(lambda) }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var coef = sqrt(max(0, num / den))
        if large == sweep { coef = -coef }
        let cx1 = coef * rx * y1 / ry, cy1 = -coef * ry * x1 / rx
        let cx = cosPhi * cx1 - sinPhi * cy1 + (p0.x + p1.x) / 2
        let cy = sinPhi * cx1 + cosPhi * cy1 + (p0.y + p1.y) / 2
        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let sign: CGFloat = ux * vy - uy * vx < 0 ? -1 : 1
            let dot = (ux * vx + uy * vy) / (hypot(ux, uy) * hypot(vx, vy))
            return sign * acos(min(1, max(-1, dot)))
        }
        let theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
        var delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
        if !sweep && delta > 0 { delta -= 2 * .pi } else if sweep && delta < 0 { delta += 2 * .pi }
        let segments = Int(ceil(abs(delta) / (.pi / 2)))
        let step = delta / CGFloat(segments)
        let t = 4 / 3 * tan(step / 4)
        func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: cosPhi * rx * x - sinPhi * ry * y + cx, y: sinPhi * rx * x + cosPhi * ry * y + cy)
        }
        var theta = theta1
        for _ in 0..<segments {
            let next = theta + step
            let c1 = map(cos(theta) - t * sin(theta), sin(theta) + t * cos(theta))
            let c2 = map(cos(next) + t * sin(next), sin(next) - t * cos(next))
            path.addCurve(to: map(cos(next), sin(next)), control1: c1, control2: c2)
            theta = next
        }
    }
}
