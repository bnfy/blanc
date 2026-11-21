import XCTest
import UIKit
@testable import Blanc

@MainActor
final class SiteIconsTests: XCTestCase {
    func testKeyFoldsWWWAndTakesWebPagesOnly() {
        XCTAssertEqual(SiteIcons.key(URL(string: "https://WWW.GitHub.com/x")), "github.com")
        XCTAssertNil(SiteIcons.key(URL(string: "blanc://newtab/")))
        XCTAssertNil(SiteIcons.key(nil))
    }

    func testCandidatesPreferTouchIconsThenSizeAndSkipSVG() {
        let page = URL(string: "https://example.com/a/b")!
        let links: [[String: String]] = [
            ["href": "https://example.com/small.png", "rel": "icon", "sizes": "16x16"],
            ["href": "https://example.com/vector.svg", "rel": "icon", "type": "image/svg+xml"],
            ["href": "https://example.com/big.png", "rel": "icon", "sizes": "32x32 192x192"],
            ["href": "https://example.com/touch.png", "rel": "apple-touch-icon"],
            ["href": "javascript:alert(1)", "rel": "icon"],
        ]
        XCTAssertEqual(SiteIcons.candidates(links, page: page).map(\.absoluteString), [
            "https://example.com/touch.png", "https://example.com/big.png", "https://example.com/small.png",
            "https://example.com/favicon.ico",
        ])
        XCTAssertEqual(SiteIcons.candidates([], page: URL(string: "http://127.0.0.1:8765/slow")!).map(\.absoluteString),
                       ["http://127.0.0.1:8765/favicon.ico"])
    }

    func testDataURLIsASquarePNGAndRefusesNonImages() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { context in
            UIColor.orange.setFill(); context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        }
        let icon = try XCTUnwrap(SiteIcons.dataURL(from: try XCTUnwrap(image.pngData())))
        XCTAssertTrue(icon.hasPrefix("data:image/png;base64,"))
        let decoded = try XCTUnwrap(UIImage(data: try XCTUnwrap(Data(base64Encoded: String(icon.dropFirst("data:image/png;base64,".count))))))
        XCTAssertEqual(decoded.size, CGSize(width: SiteIcons.side, height: SiteIcons.side))
        XCTAssertNil(SiteIcons.dataURL(from: Data("<html>not an icon</html>".utf8)))
    }

    func testLinksReadFromAPagesHTML() {
        let html = """
        <html><head><LINK REL="icon" href="/a.png" sizes=32x32><link rel='apple-touch-icon' href='/t.png?x=1&amp;y=2'>
        <link rel="stylesheet" href="/s.css"><link href="/b.ico" rel="shortcut icon" type="image/x-icon"></head></html>
        """
        XCTAssertEqual(SiteIcons.links(inHTML: html).map { $0["href"] ?? "" }, ["/a.png", "/t.png?x=1&y=2", "/b.ico"])
        let page = URL(string: "https://example.com/news/")!
        XCTAssertEqual(SiteIcons.candidates(SiteIcons.links(inHTML: html), page: page).first?.absoluteString,
                       "https://example.com/t.png?x=1&y=2")
    }

    func testImageDecodesTheKeptIconForTheSite() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let png = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16), format: format).pngData { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
        }
        let icon = try XCTUnwrap(SiteIcons.dataURL(from: png, side: 16))
        let saved = ["example.com": ["icon": icon, "at": 0] as [String: Any]]
        try JSONSerialization.data(withJSONObject: saved).write(to: directory.appendingPathComponent("site-icons.json"))
        let store = SiteIcons(directory: directory)
        let url = URL(string: "https://www.example.com/a")!
        let image = try XCTUnwrap(store.image(for: url))
        XCTAssertEqual(image.size.width * image.scale, 16)
        XCTAssertTrue(image === store.image(for: url))
        XCTAssertNil(store.image(for: URL(string: "https://other.example/")!))
        store.clear()
        XCTAssertNil(store.image(for: url))
    }

    func testEmptyStoreHasNoIcons() {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        XCTAssertNil(SiteIcons(directory: dir).icon(for: "https://github.com/"))
    }

    /// WebKit changes the address as soon as a load starts; the Start Page keeps
    /// its edge-to-edge layout until the next page commits, so it doesn't jump
    /// while a tapped shortcut loads.
    func testTheStartPageStaysUntilTheNextPageCommits() {
        let tab = TabModel(url: TabsManager.newTabURL)
        XCTAssertTrue(tab.showsStartPage)
        tab.navigationDelegate.applyURL(URL(string: "https://example.com/")!, to: tab)
        XCTAssertEqual(tab.currentURL.host, "example.com")
        XCTAssertTrue(tab.showsStartPage, "Still the Start Page on screen while the site loads")
        XCTAssertFalse(TabModel(url: URL(string: "https://example.com/")!).showsStartPage)
    }
}
