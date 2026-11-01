import XCTest
@testable import Blanc

/// Per-site allows follow desktop's `normalizeAdblockHostname` and
/// `blockableHostname`: lowercase, `www.` dropped, web pages only.
final class AdblockExceptionsTests: XCTestCase {
    func testNormalizesLikeDesktop() {
        XCTAssertEqual(AdblockExceptions.normalize("WWW.Example.COM"), "example.com")
        XCTAssertEqual(AdblockExceptions.normalize("https://news.example.com/a?b=1"), "news.example.com")
        XCTAssertEqual(AdblockExceptions.normalize("  shop.example.org "), "shop.example.org")
        XCTAssertNil(AdblockExceptions.normalize(""))
        XCTAssertNil(AdblockExceptions.normalize("   "))
    }

    func testHostIsForWebPagesOnly() {
        XCTAssertEqual(AdblockExceptions.host(for: URL(string: "https://www.example.com/x")!), "example.com")
        XCTAssertEqual(AdblockExceptions.host(for: URL(string: "http://example.org")!), "example.org")
        XCTAssertNil(AdblockExceptions.host(for: URL(string: "blanc://newtab/")!))
        XCTAssertNil(AdblockExceptions.host(for: URL(string: "about:blank")!))
    }

    func testExactSiteOnlyAsOnDesktop() {
        let list = ["example.com"]
        XCTAssertTrue(AdblockExceptions.isExcepted(URL(string: "https://www.example.com/")!, in: list))
        XCTAssertTrue(AdblockExceptions.isExcepted(URL(string: "https://example.com/page")!, in: list))
        XCTAssertFalse(AdblockExceptions.isExcepted(URL(string: "https://news.example.com/")!, in: list))
        XCTAssertFalse(AdblockExceptions.isExcepted(URL(string: "https://example.org/")!, in: list))
    }
}
