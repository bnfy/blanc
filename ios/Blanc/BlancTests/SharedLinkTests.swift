import XCTest

@testable import Blanc

/// M18 PR 5 (design §8): what the share sheet hands Blanc opens only when it
/// is exactly one http(s) link.
final class SharedLinkTests: XCTestCase {
    func u(_ s: String) -> URL { URL(string: s)! }

    func testOneWebURLItemIsAccepted() {
        XCTAssertEqual(SharedLink.url(fromItems: [u("https://example.com/a?b=1")], texts: []), u("https://example.com/a?b=1"))
        XCTAssertEqual(SharedLink.url(fromItems: [u("http://example.com/")], texts: []), u("http://example.com/"))
    }

    func testOtherSchemesAreRefused() {
        for s in ["file:///x", "javascript:alert(1)", "blanc://settings", "mailto:a@b.c", "https:///nohost"] {
            XCTAssertNil(SharedLink.url(fromItems: [u(s)], texts: []), s)
            XCTAssertNil(SharedLink.url(fromItems: [], texts: [s]), s)
        }
    }

    func testTextThatIsExactlyOneLinkIsAccepted() {
        XCTAssertEqual(SharedLink.url(fromItems: [], texts: ["  https://example.com/x \n"]), u("https://example.com/x"))
    }

    func testTextWithMoreThanALinkIsRefused() {
        XCTAssertNil(SharedLink.url(fromItems: [], texts: ["see https://a.com"]))
        XCTAssertNil(SharedLink.url(fromItems: [], texts: ["https://a.com https://b.com"]))
    }

    func testMoreThanOneCandidateIsRefused() {
        XCTAssertNil(SharedLink.url(fromItems: [u("https://a.com"), u("https://b.com")], texts: []))
        XCTAssertNil(SharedLink.url(fromItems: [u("https://a.com")], texts: ["https://b.com"]))
        XCTAssertNil(SharedLink.url(fromItems: [], texts: []))
    }

    func testTheSameLinkAsItemAndTextCountsOnce() {
        // Safari shares a page as its URL and, for some targets, its URL as text.
        XCTAssertEqual(SharedLink.url(fromItems: [u("https://a.com/")], texts: ["https://a.com/"]), u("https://a.com/"))
    }

    func testAPairLinkPassesThroughForIncomingLinksToConfirm() {
        let pair = u("https://blanc.day/pair#K7MR4PX2")
        XCTAssertEqual(SharedLink.url(fromItems: [pair], texts: []), pair)
        var links = IncomingLinks()
        links.receive(pair, into: nil)
        XCTAssertTrue(links.pending.isEmpty, "a pair link never opens as a tab")
        XCTAssertNotNil(links.takePairCode())
    }

    // The share extension hands what it read to the app as one blanc-share:
    // link, and the app decides (design §8 (b)).
    func testAShareLinkCarriesItsItemsToTheApp() throws {
        let share = try XCTUnwrap(SharedLink.shareURL(items: [u("https://example.com/a?b=1&c=2#x")], texts: []))
        XCTAssertEqual(share.scheme, "blanc-share")
        XCTAssertEqual(SharedLink.fromShareURL(share), u("https://example.com/a?b=1&c=2#x"))
        let text = try XCTUnwrap(SharedLink.shareURL(items: [], texts: [" https://example.com/t "]))
        XCTAssertEqual(SharedLink.fromShareURL(text), u("https://example.com/t"))
    }

    func testAShareLinkIsCheckedAgainInTheApp() throws {
        // Anyone can open a blanc-share: link, so the app never trusts it.
        let two = try XCTUnwrap(SharedLink.shareURL(items: [u("https://a.com"), u("https://b.com")], texts: []))
        XCTAssertNil(SharedLink.fromShareURL(two))
        let file = try XCTUnwrap(SharedLink.shareURL(items: [u("file:///etc/hosts")], texts: []))
        XCTAssertNil(SharedLink.fromShareURL(file))
        XCTAssertNil(SharedLink.fromShareURL(u("blanc-share://open?u=javascript:alert(1)")))
        XCTAssertNil(SharedLink.fromShareURL(u("blanc-share://other?u=https://a.com")))
        XCTAssertNil(SharedLink.fromShareURL(u("https://a.com")), "only blanc-share: links")
    }

    func testIncomingLinksOpensAShareLinkAsItsWebLink() {
        var links = IncomingLinks()
        links.receive(SharedLink.shareURL(items: [u("https://example.com/")], texts: [])!, into: nil)
        XCTAssertEqual(links.pending, [u("https://example.com/")])
        links.receive(SharedLink.shareURL(items: [u("https://blanc.day/pair#K7MR4PX2")], texts: [])!, into: nil)
        XCTAssertEqual(links.pending, [u("https://example.com/")], "a shared pair link still asks first")
        XCTAssertNotNil(links.takePairCode())
        links.receive(u("blanc-share://open?u=file:///x"), into: nil)
        XCTAssertEqual(links.pending.count, 1)
    }

    func testIncomingLinksUsesTheSameCheck() {
        XCTAssertTrue(IncomingLinks.accepts(u("https://a.com")))
        XCTAssertFalse(IncomingLinks.accepts(u("https:///nohost")))
        XCTAssertFalse(IncomingLinks.accepts(u("ftp://a.com")))
    }
}
