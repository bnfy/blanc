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

    /// The Start Page is the desktop fork's (`chromium/blanc/android/pages/start`,
    /// bundled as `start/`), as on Android. These files of the iPhone's sit
    /// beside it at the bundle's root: the phone layer and the fork page's
    /// `../whats-new.js` (a URL can't climb above its host, so it arrives here).
    static let startRootFiles: Set<String> = ["ios-start.js", "ios-start.css", "whats-new.js"]
    /// Written per request rather than bundled: the language the fork's
    /// all-language catalog shows, the phone layer's state, and the photo a
    /// person chose before the fork's page, read once to carry it over.
    static let startGeneratedFiles: Set<String> = ["ui-language.js", "ios-start-state.js", "ios-wallpaper.jpg"]

    /// The bundle folder a resolved file comes from: `start` for the Start
    /// Page's own files, nil for the bundle's root, `pages` for every other page.
    static func subdirectory(host: String, filename: String) -> String? {
        guard host == "newtab" else { return "pages" }
        return startRootFiles.contains(filename) ? nil : "start"
    }

    /// The fork page's `<head>` with the phone layer first, as Android's WebUI
    /// serves it: the state, then the script, then the stylesheet.
    static func startPageHTML(_ html: String) -> String? {
        guard let head = html.range(of: "<head>") else { return nil }
        var page = html
        page.insert(contentsOf: "<script src=\"ios-start-state.js\"></script><script src=\"ios-start.js\"></script>"
            + "<link rel=\"stylesheet\" href=\"ios-start.css\">", at: head.upperBound)
        return page
    }

    /// `ui-language.js`: the fork catalog's pinned language, the one the
    /// iPhone's other pages are in.
    static func uiLanguageScript(preferred: [String]) -> String {
        "window.__blancUiLanguage=\"\(resolvedLocale(preferred: preferred))\";\n"
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
    /// `ios-start-state.js`'s source (`StartPageBridge.stateScript`), set once
    /// the stores it reads exist.
    /// Its argument says whether the page is private.
    var startState: (Bool) -> String = { _ in "" }

    /// `wallpaperURL` is the photo chosen before the fork's page; it is served
    /// only to the Start Page, only at its current version, until it's carried over.
    init(wallpaperURL: URL? = nil, wallpaperVersion: @escaping () -> String? = { nil }) {
        self.wallpaperURL = wallpaperURL
        self.wallpaperVersion = wallpaperVersion
        super.init()
    }

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
        // The fork's Start Page brings its own all-language catalog (start/strings.js).
        let isStrings = requested == "strings.js" && host != "newtab"
        let preferred = Locale.preferredLanguages
        let filename = isStrings ? BlancPageResolver.stringsFilename(preferred: preferred) : requested
        let isPrivate = !webView.configuration.websiteDataStore.isPersistent
        guard var data = contents(filename: filename, host: host, preferred: preferred, isPrivate: isPrivate) else {
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

    private func contents(filename: String, host: String, preferred: [String], isPrivate: Bool) -> Data? {
        if host == "newtab", BlancPageResolver.startGeneratedFiles.contains(filename) {
            switch filename {
            case "ui-language.js": return Data(BlancPageResolver.uiLanguageScript(preferred: preferred).utf8)
            case "ios-start-state.js": return Data(startState(isPrivate).utf8)
            default: return wallpaperURL.flatMap { try? Data(contentsOf: $0) }
            }
        }
        guard let url = Bundle.main.url(forResource: (filename as NSString).deletingPathExtension,
                                        withExtension: (filename as NSString).pathExtension,
                                        subdirectory: BlancPageResolver.subdirectory(host: host, filename: filename)),
              let data = try? Data(contentsOf: url) else { return nil }
        // The fork's page loads only as the Start Page, with the phone layer first.
        if host == "newtab", filename.hasSuffix(".html") {
            guard filename == "newtab.html", let html = String(data: data, encoding: .utf8),
                  let page = BlancPageResolver.startPageHTML(html) else { return nil }
            return Data(page.utf8)
        }
        return data
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No async work to cancel — serving is synchronous.
    }
}
