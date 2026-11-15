import Foundation
import UIKit
import WebKit

/// The sites' own icons for the Start Page's shortcuts, pins and Favorites, as
/// Android takes them from Chromium's favicon database. WebKit keeps no such
/// store, so this does: when a regular (never a private) page finishes loading,
/// its declared icon is fetched once, without cookies, and kept as a small PNG
/// data URL per site (`www.` folded) in `site-icons.json`. Device-local, never
/// synced, bounded, and cleared with History.
@MainActor
final class SiteIcons {
    static let maxSites = 300
    /// A site's icon is fetched again after this long.
    static let refreshAfter: TimeInterval = 7 * 24 * 60 * 60
    /// Pixels on a side: a 48-point tile at 3x.
    static let side: CGFloat = 144
    static let maxBytes = 512 * 1024

    private struct Entry: Codable { var icon: String; var at: Double }
    private var entries: [String: Entry] = [:]
    private let fileURL: URL
    private var inFlight = Set<String>()
    private let session: URLSession
    /// A new icon arrived (the Start Page draws it).
    var onChange: (() -> Void)?

    init(directory: URL? = nil) {
        let root = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        fileURL = root.appendingPathComponent("site-icons.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([String: Entry].self, from: data) {
            entries = saved
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = 10
        session = URLSession(configuration: configuration)
    }

    /// The site's key: its host, lowercased, without `www.`.
    nonisolated static func key(_ url: URL?) -> String? {
        guard let url, ["http", "https"].contains(url.scheme?.lowercased() ?? ""), var host = url.host?.lowercased(),
              !host.isEmpty else { return nil }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        return host
    }

    /// The icon kept for `url`'s site, a PNG data URL.
    func icon(for url: String) -> String? {
        Self.key(URL(string: url)).flatMap { entries[$0]?.icon }
    }

    func clear() {
        entries = [:]
        try? FileManager.default.removeItem(at: fileURL)
        onChange?()
    }

    /// The page's declared icons, best first: a touch icon (sharp on a tile),
    /// then the largest `icon`, then any icon, then `/favicon.ico`. SVG icons are
    /// skipped (UIKit can't draw them).
    nonisolated static func candidates(_ links: [[String: String]], page: URL) -> [URL] {
        func size(_ value: String?) -> Int {
            (value ?? "").split(separator: " ").compactMap { Int($0.lowercased().split(separator: "x").first ?? "") }.max() ?? 0
        }
        let usable = links.compactMap { link -> (url: URL, rank: Int)? in
            guard let href = link["href"], let url = URL(string: href, relativeTo: page)?.absoluteURL,
                  ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  link["type"]?.lowercased().contains("svg") != true, !url.path.lowercased().hasSuffix(".svg") else { return nil }
            let rel = (link["rel"] ?? "").lowercased()
            let touch = rel.contains("apple-touch-icon")
            return (url, (touch ? 10_000 : 0) + size(link["sizes"]))
        }
        var seen = Set<URL>()
        var ordered = usable.sorted { $0.rank > $1.rank }.map(\.url).filter { seen.insert($0).inserted }
        if let host = page.host, let scheme = page.scheme,
           let fallback = URL(string: "\(scheme)://\(host)\(page.port.map { ":\($0)" } ?? "")/favicon.ico"),
           !seen.contains(fallback) {
            ordered.append(fallback)
        }
        return ordered
    }

    /// A downloaded image as the stored PNG data URL, or nil if it isn't one UIKit can draw.
    nonisolated static func dataURL(from data: Data) -> String? {
        guard data.count <= maxBytes, let image = UIImage(data: data), image.size.width >= 8, image.size.height >= 8 else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let png = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).pngData { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
        return "data:image/png;base64," + png.base64EncodedString()
    }

    /// After a regular page finishes loading: fetch its site's icon unless one is fresh.
    func capture(from webView: WKWebView) {
        guard let page = webView.url, let key = Self.key(page), !inFlight.contains(key) else { return }
        if let entry = entries[key], Date().timeIntervalSince1970 - entry.at < Self.refreshAfter { return }
        inFlight.insert(key)
        let script = """
          return [...document.querySelectorAll('link[rel~="icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]')]
            .slice(0, 20).map(l => ({ href: l.href || '', rel: l.rel || '', sizes: l.getAttribute('sizes') || '', type: l.type || '' }));
          """
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .defaultClient) { [weak self] result in
            let links = (try? result.get()) as? [[String: String]] ?? []
            Task { @MainActor [weak self] in
                guard let self else { return }
                defer { self.inFlight.remove(key) }
                for url in Self.candidates(links, page: page) {
                    guard let (data, response) = try? await self.session.data(from: url),
                          (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false,
                          let icon = Self.dataURL(from: data) else { continue }
                    self.store(icon, for: key)
                    return
                }
            }
        }
    }

    private func store(_ icon: String, for key: String) {
        entries[key] = Entry(icon: icon, at: Date().timeIntervalSince1970)
        if entries.count > Self.maxSites {
            for old in entries.sorted(by: { $0.value.at < $1.value.at }).prefix(entries.count - Self.maxSites) {
                entries.removeValue(forKey: old.key)
            }
        }
        if let data = try? JSONEncoder().encode(entries) { try? data.write(to: fileURL, options: .atomic) }
        onChange?()
    }
}
