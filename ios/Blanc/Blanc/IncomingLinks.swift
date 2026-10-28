import Foundation

/// Links another app hands Blanc (M18 §6, the default-browser prerequisite):
/// each http(s) link opens in a new, ordinary tab. On a cold launch a link can
/// arrive before `BlancApp` has made its `TabsManager`, so it waits here and
/// opens once the manager exists. Other schemes are ignored.
struct IncomingLinks {
    private(set) var pending: [URL] = []

    static func accepts(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "") && !(url.host ?? "").isEmpty
    }

    mutating func receive(_ url: URL, into manager: TabsManager?) {
        guard Self.accepts(url) else { return }
        if let manager { manager.openIncomingLink(url) } else { pending.append(url) }
    }

    /// Opens what arrived before the manager existed, in arrival order.
    mutating func flush(into manager: TabsManager) {
        for url in pending { manager.openIncomingLink(url) }
        pending = []
    }
}
