import SwiftUI

/// Light or dark for the Island, its notices and the open panel, so the
/// panel never changes color as the Island grows into it. A private tab's are
/// always dark. On glass (iOS 26) they follow the page's own background, as
/// the system's bars do; before that, and on a page with no solid
/// background, they follow Blanc's theme.
enum IslandScheme {
    static func resolve(isPrivate: Bool, pageScheme: ColorScheme?, appScheme: ColorScheme, glass: Bool) -> ColorScheme {
        if isPrivate { return .dark }
        if glass, let pageScheme { return pageScheme }
        return appScheme
    }
}
