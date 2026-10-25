import SwiftUI
import CoreText

/// Native chrome mirrors the desktop's neutral Island palette. Keep separate
/// from the older generated tokens until the shared token source is migrated.
struct BrowserStyle {
    let scheme: ColorScheme
    var background: Color { color("ffffff", "0e0e0e") }
    var surface: Color { color("f7f7f7", "171717") }
    var raised: Color { color("ffffff", "1f1f1f") }
    var border: Color { color("dedede", "2e2e2e") }
    var text: Color { color("0e0e0e", "f5f5f5") }
    var secondary: Color { color("6b6b6b", "9c9c9c") }
    var selection: Color { text.opacity(scheme == .dark ? 0.12 : 0.06) }

    private func color(_ light: String, _ dark: String) -> Color {
        Color(blancHex: scheme == .dark ? dark : light)!
    }

    static func font(_ size: CGFloat, semibold: Bool = false,
                     relativeTo style: Font.TextStyle = .body) -> Font {
        _ = registeredFonts
        return .custom("BlancInstrumentSans-\(semibold ? "SemiBold" : "Regular")",
                       size: size, relativeTo: style)
    }

    private static let registeredFonts: Void = {
        for weight in ["Regular", "SemiBold"] {
            // Xcode's synchronized resource group copies these to the bundle root.
            if let url = Bundle.main.url(forResource: "InstrumentSans-\(weight)", withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }()
}
