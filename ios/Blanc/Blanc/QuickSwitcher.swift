import Foundation

struct SwitcherResult {
    let tab: TabModel
    let score: Double
    let index: Int
    let title: String
    let subtitle: String
}

enum QuickSwitcher {
    static let strongMatchScore: Double = 2.0

    static func search(query: String, tabs: [TabModel]) -> [SwitcherResult] {
        let q = query.lowercased()
        guard !q.isEmpty else { return [] }

        var results: [SwitcherResult] = []
        var seen = Set<UUID>()

        for (index, tab) in tabs.enumerated() {
            guard !seen.contains(tab.id) else { continue }
            let text = matchableText(title: tab.pageTitle, url: tab.currentURL)
            let s = matchScore(query: q, text: text)
            guard s > 0 else { continue }
            seen.insert(tab.id)
            results.append(SwitcherResult(
                tab: tab,
                score: s + 0.2,
                index: index,
                title: tab.pageTitle.isEmpty ? "New Tab" : tab.pageTitle,
                subtitle: tab.currentURL.host ?? tab.currentURL.absoluteString
            ))
        }

        return Array(results
            .sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
            .prefix(6))
    }

    private static func matchScore(query: String, text: String) -> Double {
        let t = text.lowercased()
        if t.contains(query) { return 2 }
        var qi = query.startIndex
        for ch in t {
            if ch == query[qi] {
                qi = query.index(after: qi)
                if qi == query.endIndex { return 1 }
            }
        }
        return 0
    }

    private static func matchableText(title: String, url: URL) -> String {
        let host = url.host ?? ""
        let path = String(url.path.prefix(64))
        return "\(title) \(host)\(path)"
    }
}

struct SyncedSwitcherResult: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let score: Double
    let strength: Double
    let localTabID: UUID?
    let url: URL?
}

extension QuickSwitcher {
    /// Open tabs, then Favorites, then other devices' tabs, then History, each
    /// address shown once.
    static func search(query: String, tabs: [TabModel], remote: [RemoteDevice], favorites: [Favorite], history: [HistoryEntry] = []) -> [SyncedSwitcherResult] {
        let local = search(query: query, tabs: tabs).map { result in
            SyncedSwitcherResult(id: "local:" + result.tab.id.uuidString, title: result.title, subtitle: result.subtitle,
                                 score: result.score + 4, strength: matchScore(query: query.lowercased(), text: matchableText(title: result.tab.pageTitle, url: result.tab.currentURL)), localTabID: result.tab.id, url: nil)
        }
        let q = query.lowercased()
        guard !q.isEmpty else { return [] }
        var seen = Set(tabs.map { $0.currentURL.absoluteString })
        var saved: [SyncedSwitcherResult] = []
        for item in favorites {
            guard let url = URL(string: item.url), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !seen.contains(item.url) else { continue }
            let score = matchScore(query: q, text: item.title + " " + item.url)
            guard score > 0 else { continue }
            seen.insert(item.url)
            saved.append(SyncedSwitcherResult(id: "favorite:" + item.id, title: item.title, subtitle: item.url, score: score + 2, strength: score, localTabID: nil, url: url))
        }
        var others: [SyncedSwitcherResult] = []
        for device in remote {
            for (index, item) in device.tabs.enumerated() {
                guard let url = URL(string: item.url), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !seen.contains(item.url) else { continue }
                let score = matchScore(query: q, text: item.title + " " + item.url)
                guard score > 0 else { continue }
                seen.insert(item.url)
                others.append(SyncedSwitcherResult(id: "remote:" + device.id + ":" + String(index), title: item.title, subtitle: device.name + " · " + item.url, score: score, strength: score, localTabID: nil, url: url))
            }
        }
        var visited: [SyncedSwitcherResult] = []
        for entry in history {
            guard let url = URL(string: entry.url), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !seen.contains(entry.url) else { continue }
            let score = matchScore(query: q, text: entry.title + " " + entry.url)
            guard score > 0 else { continue }
            seen.insert(entry.url)
            visited.append(SyncedSwitcherResult(id: "history:" + entry.url, title: entry.title, subtitle: entry.url, score: score, strength: score, localTabID: nil, url: url))
        }
        return Array((local + saved.sorted { $0.score > $1.score } + others.sorted { $0.score > $1.score } + visited.sorted { $0.score > $1.score }).prefix(12))
    }

    /// What Go opens instead of the typed text: a strong match, and never when
    /// the text is itself an address (as desktop's `looksLikeAddress`).
    static func goTarget(query: String, results: [SyncedSwitcherResult]) -> SyncedSwitcherResult? {
        guard !AddressNormalizer.looksLikeAddress(query),
              let top = results.first, top.strength >= strongMatchScore else { return nil }
        return top
    }
}
