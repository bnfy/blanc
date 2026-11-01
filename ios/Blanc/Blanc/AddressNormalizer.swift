import Foundation

struct AddressNormalizer {
    var searchEngine: BlancSearchEngine

    private static let queryAllowed: CharacterSet = {
        var s = CharacterSet()
        s.insert(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
        return s
    }()

    func searchURL(for query: String) -> URL {
        let q = query.addingPercentEncoding(withAllowedCharacters: Self.queryAllowed) ?? query
        let base: String
        switch searchEngine {
        case .duckduckgo: base = "https://duckduckgo.com/?q=\(q)"
        case .google:     base = "https://www.google.com/search?q=\(q)"
        case .bing:       base = "https://www.bing.com/search?q=\(q)"
        case .brave:      base = "https://search.brave.com/search?q=\(q)"
        case .kagi:       base = "https://kagi.com/search?q=\(q)"
        // iOS doesn't offer a custom address yet (no `searchEngineTemplate`
        // field), so a stored `custom` searches the default engine.
        case .custom:     base = "https://duckduckgo.com/?q=\(q)"
        }
        return URL(string: base)!
    }

    /// Whether `normalize` would treat the input as an address rather than a
    /// search, or hand it to the system (desktop's `looksLikeAddress`).
    static func looksLikeAddress(_ input: String) -> Bool {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        if OSHandoff.isHandoff(trimmed) { return true }
        if let r = trimmed.range(of: "://") {
            let scheme = String(trimmed[trimmed.startIndex..<r.lowerBound]).lowercased()
            if scheme.range(of: #"^[a-z][a-z0-9+.\-]*$"#, options: .regularExpression) != nil {
                return !["javascript", "data", "vbscript"].contains(scheme)
            }
        }
        return [#"^localhost(:\d+)?(/|$)"#, #"^(\d{1,3}\.){3}\d{1,3}(:\d+)?(/|$)"#, #"^[^\s]+\.[a-zA-Z]{2,}(/[^\s]*)?$"#]
            .contains { trimmed.range(of: $0, options: .regularExpression) != nil }
    }

    func normalize(_ input: String) -> URL {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)

        if let scheme = schemePrefix(of: trimmed) {
            if ["javascript", "data", "vbscript"].contains(scheme) {
                return searchURL(for: trimmed)
            }
            return URL(string: trimmed) ?? searchURL(for: trimmed)
        }
        if matches(trimmed, #"^localhost(:\d+)?(/|$)"#) {
            return URL(string: "http://\(trimmed)") ?? searchURL(for: trimmed)
        }
        if matches(trimmed, #"^(\d{1,3}\.){3}\d{1,3}(:\d+)?(/|$)"#) {
            return URL(string: "http://\(trimmed)") ?? searchURL(for: trimmed)
        }
        if matches(trimmed, #"^[^\s]+\.[a-zA-Z]{2,}(/[^\s]*)?$"#) {
            return URL(string: "https://\(trimmed)") ?? searchURL(for: trimmed)
        }
        return searchURL(for: trimmed)
    }

    private func schemePrefix(of s: String) -> String? {
        guard let r = s.range(of: "://") else { return nil }
        let prefix = String(s[s.startIndex..<r.lowerBound])
        guard matches(prefix, #"^[a-zA-Z][a-zA-Z0-9+.\-]*$"#) else { return nil }
        return prefix.lowercased()
    }

    private func matches(_ s: String, _ pattern: String) -> Bool {
        s.range(of: pattern, options: .regularExpression) != nil
    }
}
