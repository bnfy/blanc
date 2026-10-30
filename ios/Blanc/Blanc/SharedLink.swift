import Foundation

/// What the share sheet hands Blanc (M18 design §8): it opens only when it is
/// exactly one web link, from one URL item or one text that is nothing but
/// that link. Compiled into the app and the share extension, so it stays free
/// of anything app-only; `IncomingLinks` uses the same check.
nonisolated enum SharedLink {
    /// An http(s) URL with a host.
    static func isWebURL(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "") && !(url.host ?? "").isEmpty
    }

    static func url(fromItems urls: [URL], texts: [String]) -> URL? {
        var candidates: [URL] = []
        for url in urls { candidates.append(url) }
        for text in texts {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            guard !trimmed.contains(where: \.isWhitespace), let url = URL(string: trimmed) else { return nil }
            candidates.append(url)
        }
        var unique: [URL] = []
        for url in candidates where !unique.contains(url) { unique.append(url) }
        guard unique.count == 1, let url = unique.first, isWebURL(url) else { return nil }
        return url
    }

    /// The share extension can't open its app by API, so it opens this link
    /// instead (design §8 (b)), carrying what it read: `u` for each URL item,
    /// `t` for each text.
    static let shareScheme = "blanc-share"

    static func shareURL(items urls: [URL], texts: [String]) -> URL? {
        var parts = URLComponents()
        parts.scheme = shareScheme
        parts.host = "open"
        parts.queryItems = urls.map { URLQueryItem(name: "u", value: $0.absoluteString) }
            + texts.map { URLQueryItem(name: "t", value: $0) }
        return parts.url
    }

    /// The one web link a `blanc-share:` link carries, checked again here:
    /// any app or page can open such a link.
    static func fromShareURL(_ url: URL) -> URL? {
        guard url.scheme?.lowercased() == shareScheme, url.host == "open",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { return nil }
        let urls = items.filter { $0.name == "u" }.compactMap { $0.value.flatMap(URL.init(string:)) }
        let texts = items.filter { $0.name == "t" }.compactMap(\.value)
        return Self.url(fromItems: urls, texts: texts)
    }
}
