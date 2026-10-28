import Foundation

/// The desktop pairing sheet's QR link, `https://blanc.day/pair#CODE`
/// (design 2026-10-28 §7.3). The code rides in the fragment, which no server
/// sees; Blanc reads it here and never loads the link. Only this exact shape
/// is accepted, matching desktop's `pairLinkCode` case for case (the shared
/// `pairLinks` vectors), so a near miss is never mistaken for a code.
nonisolated enum PairLink {
    private static let prefix = "https://blanc.day/pair#"

    static func link(for code: String) -> URL? {
        guard SyncPairing.normalize(code) == code else { return nil }
        return URL(string: prefix + code)
    }

    static func code(from url: URL) -> String? { code(from: url.absoluteString) }

    static func code(from string: String) -> String? {
        // Some parsers drop whitespace and control characters silently; refuse them.
        guard !string.unicodeScalars.contains(where: {
            $0.value <= 0x20 || $0.value == 0x7f || CharacterSet.whitespacesAndNewlines.contains($0)
        }) else { return nil }
        guard let parts = URLComponents(string: string),
              parts.scheme?.lowercased() == "https",
              parts.percentEncodedHost?.lowercased() == "blanc.day",
              parts.port == nil, parts.user == nil, parts.password == nil,
              parts.percentEncodedPath == "/pair",
              parts.percentEncodedQuery == nil,
              let fragment = parts.percentEncodedFragment, !fragment.isEmpty
        else { return nil }
        return SyncPairing.normalize(fragment)
    }
}
