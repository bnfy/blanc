import Foundation

/// Links another app hands Blanc (M18 §6, the default-browser prerequisite):
/// each http(s) link opens in a new, ordinary tab. On a cold launch a link can
/// arrive before `BlancApp` has made its `TabsManager`, so it waits here and
/// opens once the manager exists. Other schemes are ignored. The desktop's
/// pairing QR (`https://blanc.day/pair#CODE`, design 2026-10-28 §7.3) is never
/// opened: its code waits for Blanc to ask the person first.
struct IncomingLinks {
    private(set) var pending: [URL] = []
    private(set) var pairCode: String?

    static func accepts(_ url: URL) -> Bool {
        SharedLink.isWebURL(url)
    }

    mutating func receive(_ url: URL, into manager: TabsManager?) {
        guard Self.accepts(url) else { return }
        if let code = PairLink.code(from: url) { pairCode = code; return }
        if let manager { manager.openIncomingLink(url) } else { pending.append(url) }
    }

    /// The pairing code a link carried, once.
    mutating func takePairCode() -> String? {
        defer { pairCode = nil }
        return pairCode
    }

    /// Opens what arrived before the manager existed, in arrival order.
    mutating func flush(into manager: TabsManager) {
        for url in pending { manager.openIncomingLink(url) }
        pending = []
    }
}
