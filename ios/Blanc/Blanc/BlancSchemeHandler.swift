import Foundation
import WebKit

/// Pure path→file decision logic for the `blanc://` scheme, mirroring the
/// desktop `pages.js` model: a known-host allowlist, `path.basename`
/// reduction, a charset allowlist, and a flat serving directory. No I/O —
/// unit-testable without a bundle or a web view.
enum BlancPageResolver {
    /// Hosts that map to a bundled `<host>.html`. `auth` is intentionally
    /// excluded (basic-auth is native on iOS, M12).
    static let knownPages: Set<String> = [
        "newtab", "bookmarks", "history", "downloads", "settings", "error", "shortcuts", "mahjong",
    ]

    /// Interface languages with a complete catalog, in `src/main/i18n-locales.json`
    /// order (status `selectable`). `test/unit/ios-i18n-locales.test.js` fails if
    /// the two drift apart.
    static let selectableLocales = ["en", "de", "es", "fr", "it", "pt-BR"]

    /// The catalog for the system's preferred languages, as desktop's
    /// `resolveLocale` picks it for `uiLanguage: system`: for each preferred tag
    /// in order, its exact catalog (pt-BR), its language (de for de-AT), else the
    /// same language's regional catalog (pt-BR for pt-PT); English otherwise.
    static func resolvedLocale(preferred: [String]) -> String {
        func primary(_ code: String) -> String {
            String(code.lowercased().split(separator: "-").first ?? "")
        }
        for tag in preferred {
            let wanted = tag.replacingOccurrences(of: "_", with: "-").lowercased()
            let match = selectableLocales.first { $0.lowercased() == wanted }
                ?? selectableLocales.first { $0 == primary(wanted) }
                ?? selectableLocales.first { primary($0) == primary(wanted) }
            if let match { return match }
        }
        return "en"
    }

    /// The bundled file behind the virtual `strings.js` (desktop answers it in
    /// `pages-assets.js` with the active catalog; there is no such file on disk).
    static func stringsFilename(preferred: [String]) -> String {
        "strings.\(resolvedLocale(preferred: preferred)).js"
    }

    /// The source appended to the catalog, as desktop's `stringsScriptFor`
    /// does: the formatting locale (the interface language with the device's
    /// region) and non-strict missing-key handling.
    static func stringsSuffix(locale: String, region: String?) -> String {
        var formatLocale = locale
        if let region, region.range(of: "^([A-Za-z]{2}|[0-9]{3})$", options: .regularExpression) != nil {
            formatLocale = "\(locale.split(separator: "-")[0])-\(region.uppercased())"
        }
        return "\nself.blancStrings.formatLocale=\"\(formatLocale)\";self.blancStrings.strict=false;\n"
    }

    private static let filenamePattern = try! NSRegularExpression(pattern: "^[\\w.-]+$")

    /// The flat filename to serve within the bundled `pages/` folder, or
    /// `nil` to reject the request. Traversal is defeated by taking the
    /// basename: `../../etc/passwd` collapses to `passwd`, which then simply
    /// isn't a bundled asset and 404s at serve time.
    static func resolvedFilename(host: String, path: String) -> String? {
        guard knownPages.contains(host) else { return nil }
        if path.isEmpty || path == "/" { return "\(host).html" }
        let basename = (path as NSString).lastPathComponent
        guard !basename.isEmpty else { return nil }
        let range = NSRange(basename.startIndex..., in: basename)
        guard filenamePattern.firstMatch(in: basename, range: range) != nil else { return nil }
        return basename
    }

    /// MIME type by extension, defaulting to octet-stream for anything the
    /// bundle doesn't use.
    static func mimeType(forFilename filename: String) -> String {
        switch (filename as NSString).pathExtension.lowercased() {
        case "html": return "text/html"
        case "css": return "text/css"
        case "js": return "text/javascript"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "json": return "application/json"
        case "ttf": return "font/ttf"
        case "webp": return "image/webp"
        case "txt": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}

/// Serves the shared web bundle over `blanc://`. Stateless — one instance is
/// safe to install on every tab's configuration.
final class BlancSchemeHandler: NSObject, WKURLSchemeHandler {
    private let wallpaperURL: URL?
    private let wallpaperVersion: () -> String?

    init(wallpaperURL: URL? = nil, wallpaperVersion: @escaping () -> String? = { nil }) {
        self.wallpaperURL = wallpaperURL
        self.wallpaperVersion = wallpaperVersion
        super.init()
    }

    /// The bundled folder-reference name (`src/renderer/pages` copies in as `pages`).
    private static let bundleSubdirectory = "pages"

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let request = urlSchemeTask.request
        if request.url?.lastPathComponent == "ios-wallpaper.jpg" {
            let version = request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?
                .queryItems?.first { $0.name == "v" }?.value
            guard let version, version == wallpaperVersion() else {
                urlSchemeTask.didFailWithError(URLError(.noPermissionsToReadFile))
                return
            }
        }
        guard let url = request.url,
              let host = url.host,
              let requested = BlancPageResolver.resolvedFilename(host: host, path: url.path)
        else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let isStrings = requested == "strings.js"
        let preferred = Locale.preferredLanguages
        let filename = isStrings ? BlancPageResolver.stringsFilename(preferred: preferred) : requested
        guard let fileURL = assetURL(filename: filename, host: host),
              var data = try? Data(contentsOf: fileURL)
        else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        if isStrings {
            let suffix = BlancPageResolver.stringsSuffix(
                locale: BlancPageResolver.resolvedLocale(preferred: preferred),
                region: Locale.current.region?.identifier)
            data.append(Data(suffix.utf8))
        }

        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": BlancPageResolver.mimeType(forFilename: filename)])!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    private func assetURL(filename: String, host: String) -> URL? {
        if filename == "ios-wallpaper.jpg" {
            return host == "newtab" ? wallpaperURL : nil
        }
        return Bundle.main.url(forResource: (filename as NSString).deletingPathExtension,
                               withExtension: (filename as NSString).pathExtension,
                               subdirectory: Self.bundleSubdirectory)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No async work to cancel — serving is synchronous.
    }
}
