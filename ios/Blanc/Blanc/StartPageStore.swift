import Foundation

/// The Start Page's widgets and pinned shortcuts, as the desktop fork and
/// Android keep them (Android's `StartWidgets` and the fork's
/// `start_page_pins.inc`), in `start-page.json`. Device-local, never synced:
/// the iPhone's Start Page choices stay on the phone.
final class StartPageStore {
    static let widgetNames = ["favorites", "devices", "shortcuts"]
    static let cards = ["favorites", "devices", "sent"]
    static let cardSizes = [240, 360, 480, 600, 720]
    static let maxPins = 8
    private static func sizable(_ card: String) -> Bool { card == "favorites" || card == "devices" }

    private var saved: [String: Any] = [:]
    private let fileURL: URL

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        fileURL = root.appendingPathComponent("start-page.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            self.saved = saved
        }
    }

    private func save(_ next: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: next, options: [.sortedKeys, .withoutEscapingSlashes]) else { return }
        // A choice is on disk at once: iOS may end the app without warning.
        try? data.write(to: fileURL, options: .atomic)
        saved = next
    }

    /// An integer, never a boolean or a fraction (the fork's `is_int()`).
    static func int(_ value: Any?) -> Int? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue == Double(n.intValue) else { return nil }
        return n.intValue
    }

    /// The regular Start Page's wallpaper record (the fork adapter's
    /// localStorage value, never the photo), handed to private Start Pages,
    /// whose own storage starts empty.
    var preferences: String? {
        get { saved["preferences"] as? String }
        set {
            guard newValue != preferences else { return }
            var all = saved
            all["preferences"] = newValue
            save(all)
        }
    }

    // MARK: Widgets

    /// Where each card sits: unknown or repeated names dropped, a missing card
    /// back on its default side.
    static func place(left: [Any]?, right: [Any]?) -> [String: [String]] {
        var seen = Set<String>(), l: [String] = [], r: [String] = []
        for (list, side) in [(left, 0), (right, 1)] {
            for case let name as String in list ?? [] where cards.contains(name) && seen.insert(name).inserted {
                if side == 0 { l.append(name) } else { r.append(name) }
            }
        }
        for name in cards where !seen.contains(name) {
            if sizable(name) { l.append(name) } else { r.append(name) }
        }
        return ["left": l, "right": r]
    }

    /// The fork's `widgetsRead` answer. A phone that never chose starts with none.
    var widgets: [String: Any] {
        let stored = saved["widgets"] as? [String: Any] ?? [:]
        var out: [String: Any] = [:]
        for name in Self.widgetNames { out[name] = stored[name] as? Bool ?? false }
        if let count = Self.int(stored["shortcutCount"]), (1...12).contains(count) {
            out["shortcutCount"] = count
        } else {
            out["shortcutCount"] = stored["shortcuts"] as? Bool == true ? 12 : 6
        }
        let place = stored["place"] as? [String: Any]
        out["place"] = Self.place(left: place?["left"] as? [Any], right: place?["right"] as? [Any])
        var sizes: [String: Int] = [:]
        for (card, value) in stored["sizes"] as? [String: Any] ?? [:] {
            if Self.sizable(card), let size = Self.int(value), Self.cardSizes.contains(size) { sizes[card] = size }
        }
        out["sizes"] = sizes
        return out
    }

    enum WidgetError: Error, Equatable { case invalid(String) }

    /// `widgetsWrite(name, on)`, `widgetsShortcuts(count)`, `widgetsSize(card, size)`
    /// and `widgetsPlace(left, right)`, with Android's validation.
    @discardableResult
    func changeWidgets(_ method: String, args: [Any]) throws -> [String: Any] {
        var next = saved["widgets"] as? [String: Any] ?? [:]
        switch method {
        case "widgetsRead":
            guard args.isEmpty else { throw WidgetError.invalid("not-yet") }
            return widgets
        case "widgetsWrite":
            guard args.count == 2, let name = args[0] as? String, Self.widgetNames.contains(name),
                  let on = args[1] as? NSNumber, CFGetTypeID(on) == CFBooleanGetTypeID() else {
                throw WidgetError.invalid("Unknown Start Page widget")
            }
            next[name] = on.boolValue
            // The old 6-or-12 switch sets the count it stood for.
            if name == "shortcuts" { next["shortcutCount"] = on.boolValue ? 12 : 6 }
        case "widgetsShortcuts":
            guard args.count == 1, let count = Self.int(args[0]), (1...12).contains(count) else {
                throw WidgetError.invalid("Shortcuts are 1 to 12")
            }
            next["shortcutCount"] = count
            next["shortcuts"] = count == 12
        case "widgetsSize":
            guard args.count == 2, let card = args[0] as? String, Self.sizable(card), let size = Self.int(args[1]),
                  size == 0 || Self.cardSizes.contains(size) else {
                throw WidgetError.invalid("Unknown card size")
            }
            var sizes = next["sizes"] as? [String: Any] ?? [:]
            sizes[card] = size == 0 ? nil : size
            next["sizes"] = sizes
        case "widgetsPlace":
            guard args.count == 2, let left = args[0] as? [Any], let right = args[1] as? [Any] else {
                throw WidgetError.invalid("Unknown card place")
            }
            next["place"] = Self.place(left: left, right: right)
        default:
            throw WidgetError.invalid("not-yet")
        }
        var all = saved
        all["widgets"] = next
        save(all)
        return widgets
    }

    // MARK: Pins

    /// The fork's `SanitizeStartPin`: http(s) only, at most 4096 characters, a
    /// trimmed title of at most 200 characters, else the host without `www.`.
    static func sanitizePin(url raw: String, title: String?) -> [String: String]? {
        guard raw.count <= 4096, var parts = URLComponents(string: raw),
              let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = parts.host, !host.isEmpty else { return nil }
        parts.scheme = scheme
        parts.host = host.lowercased()
        if parts.path.isEmpty { parts.path = "/" }
        guard let url = parts.url?.absoluteString, url.count <= 4096 else { return nil }
        var name = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.count > 200 { name = String(name.prefix(200)) }
        if name.isEmpty { name = host.lowercased().hasPrefix("www.") ? String(host.lowercased().dropFirst(4)) : host.lowercased() }
        return ["url": url, "title": name]
    }

    var pins: [[String: String]] {
        var seen = Set<String>(), out: [[String: String]] = []
        for case let entry as [String: Any] in saved["pins"] as? [Any] ?? [] {
            guard let url = entry["url"] as? String, let pin = Self.sanitizePin(url: url, title: entry["title"] as? String),
                  seen.insert(pin["url"]!).inserted else { continue }
            out.append(pin)
            if out.count == Self.maxPins { break }
        }
        return out
    }

    /// `pinsList`'s answer.
    var pinsList: [String: Any] { ["max": Self.maxPins, "pins": pins] }

    /// The fork's `ChangeStartPin`: pin answers `{ok}` or `{ok: false, reason}`,
    /// unpin whether the address was pinned. A new pin leads the row.
    func changePin(pin: Bool, url: String, title: String) -> Any {
        guard let target = Self.sanitizePin(url: url, title: pin ? title : nil) else {
            return pin ? ["ok": false, "reason": "invalid"] as [String: Any] : false
        }
        let current = pins
        let found = current.contains { $0["url"] == target["url"] }
        if pin, !found, current.count >= Self.maxPins { return ["ok": false, "reason": "full"] as [String: Any] }
        if pin != found {
            let remaining = current.filter { $0["url"] != target["url"] }
            var all = saved
            all["pins"] = pin ? [target] + remaining : remaining
            save(all)
        }
        return pin ? ["ok": true] as [String: Any] : found
    }

    // MARK: Ranked shortcuts

    /// Billboard's ranked shortcuts, as Android ranks them (`OnRecentPages`):
    /// the last 90 days of history, every visit counted, one site per host with
    /// `www.` folded, http(s) only, each shown as its page visited last under
    /// that page's title; search engines' results pages don't count. `entries`
    /// are newest first, one per visit, as `HistoryStore` keeps them.
    static func topSites(_ entries: [HistoryEntry], now: Int64, offset: Int = 0, limit: Int = 48,
                         isSearchResults: (URL) -> Bool = StartPageStore.isSearchResults) -> [[String: String]] {
        let since = now - 90 * 24 * 60 * 60 * 1000
        struct Site { let key: String; let url: String; let title: String; var visits: Int }
        var sites: [Site] = [], index: [String: Int] = [:]
        for entry in entries where entry.visitedAt >= since {
            guard let url = URL(string: entry.url), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.user == nil, url.password == nil, var key = url.host?.lowercased(), !key.isEmpty,
                  !isSearchResults(url) else { continue }
            if key.hasPrefix("www.") { key.removeFirst(4) }
            if let i = index[key] { sites[i].visits += 1; continue }
            index[key] = sites.count
            sites.append(Site(key: key, url: entry.url, title: entry.title, visits: 1))
        }
        // Stable: among equals, the site visited most recently leads.
        let ranked = sites.enumerated().sorted { a, b in
            a.element.visits != b.element.visits ? a.element.visits > b.element.visits : a.offset < b.offset
        }.map(\.element)
        return ranked.dropFirst(offset).prefix(limit).map { ["url": $0.url, "key": $0.key, "title": $0.title] }
    }

    private static func fold(_ host: String?) -> String? {
        host.map { $0.lowercased().hasPrefix("www.") ? String($0.lowercased().dropFirst(4)) : $0.lowercased() }
    }
    /// Each engine's results page: its host (without `www.`) and path.
    private static let resultsPages: [(host: String?, path: String)] = BlancSearchEngine.allCases.map {
        let results = AddressNormalizer(searchEngine: $0).searchURL(for: "x")
        return (fold(results.host), results.path)
    }

    /// A results page of a search engine Blanc offers: its host, its path, and a query.
    static func isSearchResults(_ url: URL) -> Bool {
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard query.contains(where: { $0.name == "q" }) else { return false }
        let host = fold(url.host)
        return resultsPages.contains { $0.host == host && $0.path == url.path }
    }
}
