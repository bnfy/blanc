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
}
