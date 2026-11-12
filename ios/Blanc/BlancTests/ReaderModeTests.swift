import XCTest
import WebKit
import UIKit
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
        source.loadHTMLString("<html><head><title>Reader fixture</title></head><body><article style='display:contents'><h1>Reader fixture</h1>\(paragraphs)<div style='display:contents;opacity:0'>VISIBLE_CONTENTS_TEXT Visible text in a boxless container.</div><div style='display:contents;visibility:hidden'>HIDDEN_SECRET</div><p hidden>HIDDEN_SECRET</p><p style='display:none'>HIDDEN_SECRET</p><a href='javascript:alert(1)'>unsafe</a><a href='data:text/html,unsafe'>data link text</a><a href='vbscript:unsafe'>vbscript link text</a><table><tr><th>Example</th><td>Value</td></tr><tr><td>Second</td><td>Another useful value</td></tr></table></article></body></html>", baseURL: URL(string: "https://reader.example/article"))
        for _ in 0..<100 {
            if (try? await source.evaluateJavaScript("document.querySelectorAll('article p').length > 10")) as? Bool == true { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        let script = try XCTUnwrap(ReaderController.script("reader-extract.generated"))
        let result = try await source.evaluateJavaScript(script, in: nil, contentWorld: .world(name: "reader-test"))
        let article = try XCTUnwrap(result as? [String: Any])
        XCTAssertEqual(article["title"] as? String, "Reader fixture")
        let content = try XCTUnwrap(article["content"] as? String)
        XCTAssertTrue(content.contains("VISIBLE_CONTENTS_TEXT"))
        XCTAssertFalse(content.contains("HIDDEN_SECRET"))
        XCTAssertFalse(content.contains("javascript:"))
        XCTAssertFalse(content.contains("data:"))
        XCTAssertFalse(content.contains("vbscript:"))
        XCTAssertTrue(content.contains("<table>"))
        var openedLinks: [(URL, String)] = []
        let reader = ReaderController(article: article, sourceURL: URL(string: "https://reader.example/article")!,
            appearance: ReaderAppearance(), saveAppearance: { _ in }, onExit: {}, openLink: { openedLinks.append(($0, $1)) })
        defer { reader.dispose(); source.stopLoading() }
        XCTAssertTrue(reader.webView.isFindInteractionEnabled, "the Island Find action searches the displayed reader")
        var text = ""
        for _ in 0..<100 {
            text = (try? await reader.webView.evaluateJavaScript("document.getElementById('article')?.textContent || ''")) as? String ?? ""
            if text.count > 200 { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(text.contains("Reader fixture"))
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 300)
        let controller = UIViewController()
        controller.view = reader.webView
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        reader.webView.frame = window.bounds
        for _ in 0..<50 {
            if (try? await reader.webView.evaluateJavaScript("innerHeight > 0 && innerHeight <= 300")) as? Bool == true { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        let shortMenu = try await reader.webView.callAsyncJavaScript("""
        if (document.getElementById('appearance').hidden) document.getElementById('appearanceToggle').click();
        document.getElementById('fontToggle').click();
        const menu = document.getElementById('fontOptions');
        const bounds = menu.getBoundingClientRect();
        menu.scrollTop = menu.scrollHeight;
        const last = document.querySelector('.font-option input[value=mono]').getBoundingClientRect();
        return {top: bounds.top, bottom: bounds.bottom, height: innerHeight, last: last.top + last.height / 2};
        """, arguments: [:], in: nil, contentWorld: .page)
        let menu = try XCTUnwrap(shortMenu as? [String: NSNumber])
        XCTAssertGreaterThan(try XCTUnwrap(menu["height"]).doubleValue, 0)
        XCTAssertLessThanOrEqual(try XCTUnwrap(menu["height"]).doubleValue, 300)
        XCTAssertGreaterThanOrEqual(try XCTUnwrap(menu["top"]).doubleValue, 0)
        XCTAssertLessThanOrEqual(try XCTUnwrap(menu["bottom"]).doubleValue, try XCTUnwrap(menu["height"]).doubleValue)
        XCTAssertLessThan(try XCTUnwrap(menu["last"]).doubleValue, try XCTUnwrap(menu["height"]).doubleValue)
        _ = try await reader.webView.evaluateJavaScript("document.getElementById('fontToggle').click()")

        for (font, family) in [("inter", "Inter"), ("mono", "JetBrains Mono")] {
            let result = try await reader.webView.callAsyncJavaScript("""
            if (document.getElementById('appearance').hidden) document.getElementById('appearanceToggle').click();
            document.getElementById('fontToggle').click();
            document.querySelector('.font-option input[value=' + font + ']').click();
            await document.fonts.load('20px "' + family + '"');
            return { family: getComputedStyle(document.getElementById('reading')).fontFamily,
                     loaded: document.fonts.check('20px "' + family + '"'),
                     selectedFamily: getComputedStyle(document.getElementById('fontSelected')).fontFamily,
                     closed: document.getElementById('fontOptions').hidden };
            """, arguments: ["font": font, "family": family], in: nil, contentWorld: .page)
            let rendered = try XCTUnwrap(result as? [String: Any])
            XCTAssertTrue((rendered["family"] as? String)?.contains(family) == true)
            XCTAssertEqual(rendered["loaded"] as? Bool, true)
            XCTAssertTrue((rendered["selectedFamily"] as? String)?.contains(family) == true)
            XCTAssertEqual(rendered["closed"] as? Bool, true)
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


extension ReaderModeTests {
    func testReaderBackSwipeExitsWithoutNavigatingSource() throws {
        var exits = 0
        let reader = ReaderController(article: ["title": "Article", "content": "<p>Article text</p>", "images": []],
            sourceURL: URL(string: "https://reader.example/article")!, appearance: ReaderAppearance(),
            saveAppearance: { _ in }, onExit: { exits += 1 }, openLink: { _, _ in XCTFail("Back must not open a URL") })
        reader.webView.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        let swipe = try XCTUnwrap(reader.webView.gestureRecognizers?.first { $0.name == "blanc.reader.back" } as? UIScreenEdgePanGestureRecognizer)
        XCTAssertTrue(swipe.isEnabled)
        XCTAssertTrue(swipe.delegate === reader)
        let direction: CGFloat = swipe.edges == .right ? -1 : 1
        reader.completeBackSwipe(translation: CGPoint(x: -200 * direction, y: 0), velocity: .zero)
        reader.completeBackSwipe(translation: CGPoint(x: 10 * direction, y: 0), velocity: .zero)
        XCTAssertEqual(exits, 0, "reverse and incomplete swipes leave Reader Mode open")
        reader.completeBackSwipe(translation: CGPoint(x: 100 * direction, y: 0), velocity: .zero)
        XCTAssertEqual(exits, 1)
        reader.completeBackSwipe(translation: CGPoint(x: 20 * direction, y: 0), velocity: CGPoint(x: 700 * direction, y: 0))
        XCTAssertEqual(exits, 2, "a deliberate fast edge swipe also exits")
        reader.dispose()
        XCTAssertFalse(reader.webView.gestureRecognizers?.contains(swipe) == true)
        reader.completeBackSwipe(translation: CGPoint(x: 100 * direction, y: 0), velocity: .zero)
        XCTAssertEqual(exits, 2, "disposed readers cannot exit again")
    }
}
