import CoreText
import Foundation

enum InterFont {
    static func register() {
        for name in ["Inter-Regular", "Inter-Medium", "Inter-SemiBold"] {
            let url = Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts")
                ?? Bundle.main.url(forResource: name, withExtension: "ttf")
            guard let url else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}
