import SwiftUI
import CoreText

/// The native switch in `BrowserStyle.controlFill`, for a sheet whose `.tint` is
/// the text color. Set once on the sheet; pushed pages inherit it.
struct BrowserSwitchStyle: ToggleStyle {
    @Environment(\.colorScheme) private var scheme

    func makeBody(configuration: Configuration) -> some View {
        Toggle(configuration).toggleStyle(.switch).tint(BrowserStyle(scheme: scheme).controlFill)
    }
}

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
    /// `text` that resolves itself. A menu picker keeps the tint it was first
    /// drawn with, so a fixed color goes unreadable when the theme changes.
    static let adaptiveText = Color(uiColor: UIColor { traits in
        UIColor(BrowserStyle(scheme: traits.userInterfaceStyle == .dark ? .dark : .light).text)
    })
    /// The filled part of a switch or slider. Their knobs are always white, so
    /// `text` can't fill them in dark mode; dark uses the desktop's `--row-selected`.
    var controlFill: Color { color("0e0e0e", "536f8b") }

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
