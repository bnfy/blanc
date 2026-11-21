import SwiftUI

enum IslandScheme {
    static func resolve(isPrivate: Bool, pageScheme: ColorScheme?, appScheme: ColorScheme, glass: Bool) -> ColorScheme {
        if isPrivate { return .dark }
        if glass, let pageScheme { return pageScheme }
        return appScheme
    }
}
