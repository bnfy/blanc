import Foundation

/// Search suggestions in the palette (F5), as desktop's
/// `src/main/search-suggestions.js`: a typed prefix goes to the chosen search
/// provider only when the person has turned suggestions on, never from a
/// private tab, and never when the text looks like an address, a path or a
/// secret. Nothing here keeps what was typed.
nonisolated enum SearchSuggestions {
    static let maxQueryLength = 200
    static let maxSuggestionLength = 200
    static let maxSuggestions = 5
    static let maxResponseBytes = 64 * 1024

    /// Desktop's `isSuggestionEligible`, pattern for pattern. Each one keeps
    /// a kind of text on the phone; Go still works for all of them.
    private static let localPatterns: [String] = [
        #"[\r\n]"#,
        // Any scheme: an address, `mailto:`, a `javascript:` snippet.
        #"(?i)^[a-z][a-z0-9+.\-]*:"#,
        // Paths.
        #"^\\"#,
        #"(?i)^(?:\.{1,2}[\\/]|~[\\/]|[a-z]:[\\/])"#,
        #"(?i)\.(?:x?html?)(?:[?#].*)?$"#,
        // Hosts: localhost, IPv4, bracketed and bare IPv6, anything dotted.
        #"(?i)^localhost(?::\d+)?(?:[/?#]|$)"#,
        #"^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)"#,
        #"(?i)^\[[0-9a-z:.%_\-]+\](?::\d+)?(?:[/?#]|$)"#,
        #"(?i)^[0-9a-f]*:[0-9a-f:]+(?:[/?#]|$)"#,
        #"^(?!\.)[^\s./?#:]+(?:\.[^\s./?#:]+)+(?::\d+)?(?:[/?#][^\s]*)?$"#,
        // A card number, and the starts of passwords and keys.
        #"(?:\d[\s\-]?){13,19}"#,
        #"(?i)\b(?:password|passwd|token|secret|api[_ \-]?key)\s*[:=]"#,
        #"(?i)\bsk-"#,
        #"(?i)\bgh[pousr]_"#,
        #"\bAKIA"#,
    ]

    static func normalize(_ input: String) -> String? {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.count < 2 || query.count > maxQueryLength ? nil : query
    }

    static func isEligible(_ input: String) -> Bool {
        guard let query = normalize(input), !query.hasPrefix("/") else { return false }
        return !localPatterns.contains { query.range(of: $0, options: .regularExpression) != nil }
    }

    /// Whether an edit to the palette's text is one a person typing makes: at
    /// most one new character, in place of whatever it replaced. Anything
    /// longer arriving at once was pasted, dictated or filled in, and such
    /// text stays on the phone.
    static func isTypedEdit(from old: String, to new: String) -> Bool {
        let a = Array(old), b = Array(new)
        let shorter = min(a.count, b.count)
        var prefix = 0
        while prefix < shorter, a[prefix] == b[prefix] { prefix += 1 }
        var suffix = 0
        while suffix < shorter - prefix, a[a.count - 1 - suffix] == b[b.count - 1 - suffix] { suffix += 1 }
        return b.count - prefix - suffix <= 1
    }

    /// The provider's suggestion address for `query`, or nil for an engine
    /// with none (a custom address) and for text that isn't a query.
    static func requestURL(engine: BlancSearchEngine, query: String) -> URL? {
        guard let query = normalize(query) else { return nil }
        var parts: URLComponents?
        switch engine {
        case .duckduckgo:
            parts = URLComponents(string: "https://duckduckgo.com/ac/")
            parts?.queryItems = [URLQueryItem(name: "q", value: query), URLQueryItem(name: "type", value: "list")]
        case .google:
            parts = URLComponents(string: "https://www.google.com/complete/search")
            parts?.queryItems = [URLQueryItem(name: "output", value: "chrome"), URLQueryItem(name: "ie", value: "utf-8"),
                                 URLQueryItem(name: "oe", value: "utf-8"), URLQueryItem(name: "q", value: query)]
        case .bing:
            parts = URLComponents(string: "https://api.bing.com/osjson.aspx")
            parts?.queryItems = [URLQueryItem(name: "query", value: query)]
        case .brave:
            parts = URLComponents(string: "https://search.brave.com/api/suggest")
            parts?.queryItems = [URLQueryItem(name: "q", value: query)]
        case .kagi:
            parts = URLComponents(string: "https://kagi.com/api/autosuggest")
            parts?.queryItems = [URLQueryItem(name: "q", value: query)]
        case .custom:
            return nil
        }
        // URLComponents leaves "+" as it is, and a provider reads it as a space.
        parts?.percentEncodedQuery = parts?.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return parts?.url
    }

    /// The suggestions in a provider's answer, which every provider gives in
    /// the OpenSearch shape `[echoedQuery, [suggestion, …]]`: trimmed, each
    /// once, and no more than the palette shows.
    static func parse(_ data: Data) -> [String] {
        guard data.count <= maxResponseBytes,
              let payload = try? JSONSerialization.jsonObject(with: data) as? [Any],
              payload.count > 1, let values = payload[1] as? [Any] else { return [] }
        var suggestions: [String] = []
        var seen = Set<String>()
        for case let value as String in values {
            let text = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            guard !text.isEmpty, text.count <= maxSuggestionLength, seen.insert(text.lowercased()).inserted else { continue }
            suggestions.append(text)
            if suggestions.count == maxSuggestions { break }
        }
        return suggestions
    }

    /// Asks the provider. Any failure is an empty list: suggestions never
    /// hold up the palette or show an error in it.
    static func fetch(engine: BlancSearchEngine, query: String) async -> [String] {
        guard isEligible(query), let url = requestURL(engine: engine, query: query) else { return [] }
        var request = URLRequest(url: url)
        request.setValue("application/json, application/x-suggestions+json;q=0.9, */*;q=0.1", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await session.data(for: request, delegate: NoRedirects()),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return [] }
        return parse(data)
    }

    /// A session of its own that keeps nothing: no cookies sent or stored, no
    /// cache, no credentials, and a short wait.
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 2.5
        configuration.timeoutIntervalForResource = 2.5
        return URLSession(configuration: configuration)
    }()

    /// A provider that redirects gets no second request (desktop's `redirect: 'error'`).
    private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest) async -> URLRequest? { nil }
    }
}
