import XCTest
@testable import Blanc

final class BlancSchemeHandlerTests: XCTestCase {
    // Root path serves <host>.html for a known host.
    func testKnownHostRootServesPageHtml() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/"), "newtab.html")
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "settings", path: ""), "settings.html")
    }

    // Unknown host is rejected outright.
    func testUnknownHostRejected() {
        XCTAssertNil(BlancPageResolver.resolvedFilename(host: "evil", path: "/"))
        XCTAssertNil(BlancPageResolver.resolvedFilename(host: "", path: "/"))
    }

    // A flat asset path resolves to that filename.
    func testFlatAssetResolves() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/pages.css"), "pages.css")
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/newtab.js"), "newtab.js")
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/icon.svg"), "icon.svg")
    }

    // Directory components collapse to the basename (desktop path.basename parity).
    func testDirectoryComponentsCollapseToBasename() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/sub/pages.css"), "pages.css")
    }

    // Traversal is defeated by basename: it strips to a filename confined to the
    // flat dir (which then 404s at serve time because it isn't a bundled asset).
    func testTraversalCollapsesToBasename() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/../../etc/passwd"), "passwd")
    }

    // A basename failing the charset allowlist is rejected.
    func testInvalidCharsetRejected() {
        XCTAssertNil(BlancPageResolver.resolvedFilename(host: "newtab", path: "/bad name.css"))
        XCTAssertNil(BlancPageResolver.resolvedFilename(host: "newtab", path: "/weird%00.css"))
    }

    // MIME types for the extensions the bundle uses.
    func testMimeTypes() {
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "newtab.html"), "text/html")
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "pages.css"), "text/css")
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "newtab.js"), "text/javascript")
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "icon.svg"), "image/svg+xml")
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "icon.png"), "image/png")
    }

    func testVirtualStringsUsesBundledCatalog() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/strings.js"), "strings.js")
        XCTAssertEqual(BlancPageResolver.stringsFilename(preferred: ["fr-FR"]), "strings.fr.js")
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "instrument-sans.woff2"), "font/woff2")
    }

    // An unmapped/absent extension falls back to octet-stream.
    func testUnknownExtensionMime() {
        XCTAssertEqual(BlancPageResolver.mimeType(forFilename: "passwd"), "application/octet-stream")
    }

    // The virtual strings.js maps to the catalog desktop would pick for the
    // same system languages (resolveLocale with uiLanguage: system).
    func testStringsCatalogFollowsPreferredLanguages() {
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["de-AT", "en-US"]), "de")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["pt-BR"]), "pt-BR")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["pt-PT"]), "pt-BR")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["ja-JP", "fr-CA"]), "fr")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: ["ja-JP"]), "en")
        XCTAssertEqual(BlancPageResolver.resolvedLocale(preferred: []), "en")
        XCTAssertEqual(BlancPageResolver.stringsFilename(preferred: ["it-IT"]), "strings.it.js")
    }

    // strings.js still resolves through the host allowlist like any asset.
    func testStringsScriptResolves() {
        XCTAssertEqual(BlancPageResolver.resolvedFilename(host: "newtab", path: "/strings.js"), "strings.js")
        XCTAssertNil(BlancPageResolver.resolvedFilename(host: "evil", path: "/strings.js"))
    }

    // Every catalog the resolver can pick is bundled with the pages.
    func testEveryCatalogIsBundled() {
        for locale in BlancPageResolver.selectableLocales {
            XCTAssertNotNil(
                Bundle.main.url(forResource: "strings.\(locale)", withExtension: "js", subdirectory: "pages"),
                "missing strings.\(locale).js")
        }
    }

    // The appended source sets the formatting locale with the device region,
    // and ignores a malformed region.
    func testStringsSuffix() {
        XCTAssertEqual(BlancPageResolver.stringsSuffix(locale: "pt-BR", region: "US"),
                       "\nself.blancStrings.formatLocale=\"pt-US\";self.blancStrings.strict=false;\n")
        XCTAssertEqual(BlancPageResolver.stringsSuffix(locale: "de", region: nil),
                       "\nself.blancStrings.formatLocale=\"de\";self.blancStrings.strict=false;\n")
        XCTAssertEqual(BlancPageResolver.stringsSuffix(locale: "de", region: "\";alert(1)//"),
                       "\nself.blancStrings.formatLocale=\"de\";self.blancStrings.strict=false;\n")
    }
}
