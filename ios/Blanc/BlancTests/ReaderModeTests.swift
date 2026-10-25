import XCTest
import WebKit
@testable import Blanc

@MainActor
final class ReaderModeTests: XCTestCase {
    func testAppearanceValidationAndPrivateWrites() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let preferences = ReaderPreferences(directory: directory)
        let selected = ReaderAppearance(["theme": "sepia", "font": "sans", "size": 28, "width": "wide"])
        preferences.set(selected, isPrivate: true)
        XCTAssertEqual(preferences.value(isPrivate: true), selected)
        XCTAssertEqual(preferences.value(isPrivate: false), ReaderAppearance())
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("reader-appearance.json").path))
        preferences.set(selected, isPrivate: false)
        XCTAssertEqual(ReaderPreferences(directory: directory).value(isPrivate: false), selected)
        for font in ["serif", "sans", "inter", "mono"] {
            let value = ReaderAppearance(["font": font])
            preferences.set(value, isPrivate: false)
            XCTAssertEqual(ReaderPreferences(directory: directory).value(isPrivate: false).font, font)
        }
        preferences.set(selected, isPrivate: false)
        preferences.clearPrivate()
        XCTAssertEqual(preferences.value(isPrivate: true), selected)
        XCTAssertEqual(ReaderAppearance(["size": true, "theme": "remote", "font": "url(x)", "width": "huge"]), ReaderAppearance())
        XCTAssertEqual(ReaderAppearance(["size": 17]), ReaderAppearance())
    }

    func testReaderRejectsPrivilegedAndCredentialedLinks() {
        for raw in ["file:///tmp/x", "blanc://settings/", "javascript:alert(1)", "https://u:p@example.com/"] {
            XCTAssertFalse(ReaderController.isWebURL(URL(string: raw)!))
        }
        XCTAssertTrue(ReaderController.isWebURL(URL(string: "https://example.com/article")!))
        XCTAssertTrue(SlashCommand.available.contains { $0.command == "/reader" })
    }

    func testBundledExtractorAndReaderDocumentInWebKit() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let source = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        let paragraphs = (0..<20).map { "<p>Reader fixture \($0). " + String(repeating: "An article with useful context and clear writing. ", count: 8) + "</p>" }.joined()
        source.loadHTMLString("<html><head><title>Reader fixture</title></head><body><article><h1>Reader fixture</h1>\(paragraphs)<p hidden>HIDDEN_SECRET</p><p style='display:none'>HIDDEN_SECRET</p><a href='javascript:alert(1)'>unsafe</a><a href='data:text/html,unsafe'>data link text</a><a href='vbscript:unsafe'>vbscript link text</a><table><tr><th>Example</th><td>Value</td></tr><tr><td>Second</td><td>Another useful value</td></tr></table></article></body></html>", baseURL: URL(string: "https://reader.example/article"))
        for _ in 0..<100 {
            if (try? await source.evaluateJavaScript("document.querySelectorAll('article p').length > 10")) as? Bool == true { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        let script = try XCTUnwrap(ReaderController.script("reader-extract.generated"))
        let result = try await source.evaluateJavaScript(script, in: nil, contentWorld: .world(name: "reader-test"))
        let article = try XCTUnwrap(result as? [String: Any])
        XCTAssertEqual(article["title"] as? String, "Reader fixture")
        let content = try XCTUnwrap(article["content"] as? String)
        XCTAssertFalse(content.contains("HIDDEN_SECRET"))
        XCTAssertFalse(content.contains("javascript:"))
        XCTAssertFalse(content.contains("data:"))
        XCTAssertFalse(content.contains("vbscript:"))
        XCTAssertTrue(content.contains("<table>"))
        var openedLinks: [(URL, String)] = []
        let reader = ReaderController(article: article, sourceURL: URL(string: "https://reader.example/article")!,
            appearance: ReaderAppearance(), saveAppearance: { _ in }, onExit: {}, openLink: { openedLinks.append(($0, $1)) })
        defer { reader.dispose(); source.stopLoading() }
        var text = ""
        for _ in 0..<100 {
            text = (try? await reader.webView.evaluateJavaScript("document.getElementById('article')?.textContent || ''")) as? String ?? ""
            if text.count > 200 { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(text.contains("Reader fixture"))
        for (font, family) in [("inter", "Inter"), ("mono", "JetBrains Mono")] {
            let result = try await reader.webView.callAsyncJavaScript("""
            const control = document.getElementById('font');
            control.value = font;
            control.dispatchEvent(new Event('change'));
            await document.fonts.load('20px "' + family + '"');
            return { family: getComputedStyle(document.getElementById('reading')).fontFamily,
                     loaded: document.fonts.check('20px "' + family + '"') };
            """, arguments: ["font": font, "family": family], in: nil, contentWorld: .page)
            let rendered = try XCTUnwrap(result as? [String: Any])
            XCTAssertTrue((rendered["family"] as? String)?.contains(family) == true)
            XCTAssertEqual(rendered["loaded"] as? Bool, true)
        }
        for disposition in ["current-tab", "background-tab", "foreground-tab", "new-window"] {
            _ = try await reader.webView.callAsyncJavaScript("await window.readerAPI.openLink('https://reader.example/next', disposition);", arguments: ["disposition": disposition], in: nil, contentWorld: .page)
            XCTAssertEqual(openedLinks.last?.1, disposition)
        }
        _ = try await reader.webView.callAsyncJavaScript("await window.readerAPI.openLink('https://reader.example/next', true);", arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(openedLinks.count, 4, "forged navigation dispositions are rejected")
        let bridge = try await reader.webView.evaluateJavaScript("typeof window.bowserPages")
        XCTAssertEqual(bridge as? String, "undefined")
    }
}
