import Foundation

/// Sites where Blanc Blocker is switched off, the same list and rules as
/// desktop's `adblockExceptions` (`settings.js`, `adblock-exceptions.js`):
/// lowercase hostnames with `www.` dropped, matched exactly against the page.
enum AdblockExceptions {
    static func normalize(_ value: String) -> String? {
        let input = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty,
              let host = URL(string: input.contains("://") ? input : "https://\(input)")?.host?.lowercased()
        else { return nil }
        let bare = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        return bare.isEmpty ? nil : bare
    }

    /// The site a page belongs to, for web pages only.
    static func host(for url: URL) -> String? {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return normalize(url.absoluteString)
    }

    static func isExcepted(_ url: URL, in exceptions: [String]) -> Bool {
        guard let host = host(for: url) else { return false }
        return exceptions.contains(host)
    }
}
